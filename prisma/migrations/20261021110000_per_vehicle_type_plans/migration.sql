-- ═══════════════════════════════════════════════════════════════════════════
-- ADR 0065 — Gói gian hàng bán theo LOẠI XE (21/10/2026)
--
-- VIẾT TAY — cùng lý do đã ghi ở header `20260821000000_init/migration.sql`: function, trigger,
-- EXCLUDE và index có `WHERE` dưới đây Prisma không diễn đạt được. `prisma migrate dev` lần sau
-- sẽ sinh lệnh DROP cho chúng — đọc diff và giữ lại. (Áp migration bằng `pnpm db:deploy`.)
--
-- Quyết định sản phẩm: bảy bậc `moto_1/5/10` (phạm vi `motorbike`), `car_1/5/10` (phạm vi `car`)
-- và `enterprise_contact` (phạm vi `all`, không giới hạn, bán bằng tư vấn) thay ba bậc của
-- ADR 0041. Một gian hàng giữ TỐI ĐA một gói xe máy VÀ một gói ô tô cùng lúc; gói `all` loại trừ
-- cả hai. Hạn mức đếm THEO LOẠI XE trong phạm vi của gói.
--
-- Bảy việc, theo đúng thứ tự:
--   1. `plan_vehicle_scope_span()` — ánh xạ phạm vi → khoảng số nguyên để EXCLUDE so được.
--   2. `plans.vehicle_scope` + CHECK; bảy bậc mới (chỉ khi CHƯA có; sáu bậc giá giữ chỗ ở `draft`).
--   3. `tenant_subscriptions.vehicle_scope` (snapshot) + trigger "phải khớp phạm vi của bậc".
--   4. ÁNH XẠ thuê bao còn hạn trên ba bậc cũ sang bậc mới (dữ liệu khách đang trả tiền).
--   5. EXCLUDE chống hai kỳ gói chồng nhau ở phạm vi xung đột (chỉ kỳ chưa kết thúc lúc chạy).
--   6. `subscription_invoices.vehicle_scope` + đổi unique "một hoá đơn trả được" sang theo phạm vi.
--   7. Ngừng bán ba bậc cũ (không xoá — FK RESTRICT + mã nằm trên hoá đơn đã phát hành).
--
-- Idempotent: mọi bước dùng `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` / điều kiện trên mã bậc
-- CŨ, nên chạy lại trên một DB đã áp không đổi gì.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Phạm vi → khoảng ─────────────────────────────────────────────────────
--
-- Vì sao một khoảng số nguyên thay vì so chuỗi: luật là "cùng phạm vi thì loại trừ nhau, VÀ
-- `all` loại trừ mọi phạm vi". Một EXCLUDE `vehicle_scope WITH =` chỉ diễn đạt được vế đầu; vế
-- sau sẽ cần một trigger đọc-rồi-chặn — đúng loại kiểm tra hai transaction song song cùng qua
-- được. Ánh xạ mỗi phạm vi thành một khoảng trên trục số nguyên thì cả hai vế là MỘT phép `&&`:
--
--     motorbike → [1,2)      car → [2,3)      all → [1,3)
--
-- `[1,2) && [2,3)` sai (ô tô và xe máy chạy song song được); `[1,3)` chồng cả hai. Hàm IMMUTABLE
-- nên dùng được trong biểu thức của index/EXCLUDE. Thêm phạm vi mới thì sửa CẢ hàm này, CẢ các
-- CHECK bên dưới, CẢ `PLAN_VEHICLE_SCOPE` ở `@xeprime/types`.
CREATE OR REPLACE FUNCTION "public"."plan_vehicle_scope_span"(scope text)
RETURNS int4range
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT CASE scope
        WHEN 'motorbike' THEN int4range(1, 2)
        WHEN 'car'       THEN int4range(2, 3)
        ELSE                  int4range(1, 3)
    END
$$;

-- ── 2. `plans.vehicle_scope` ────────────────────────────────────────────────
--
-- Mọi bậc hiện có là `all`: trước ADR 0065 bậc nào cũng phủ cả hai loại xe với trần TỔNG.
ALTER TABLE "public"."plans"
    ADD COLUMN IF NOT EXISTS "vehicle_scope" VARCHAR(20) NOT NULL DEFAULT 'all';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_vehicle_scope_check') THEN
        ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_vehicle_scope_check"
            CHECK ("vehicle_scope" IN ('motorbike', 'car', 'all'));
    END IF;
    -- Ba trạng thái DANH MỤC (ADR 0005 — bảng ổn định thì có CHECK): `draft` = chưa mở bán (ADR 0065).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_status_check') THEN
        ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_status_check"
            CHECK ("status" IN ('draft', 'active', 'archived'));
    END IF;
    -- Tuyến hoa hồng không bán gì theo loại xe: trần Owner Lite là TỔNG (ADR 0038 điều 12).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plans_commission_scope_all') THEN
        ALTER TABLE "public"."plans" ADD CONSTRAINT "plans_commission_scope_all"
            CHECK ("billing_mode" <> 'commission' OR "vehicle_scope" = 'all');
    END IF;
END $$;

-- Bảy bậc mới — CHỈ chèn khi chưa có (`ON CONFLICT (code) DO NOTHING`).
--
-- Migration chèn chúng vì bước 4 cần `plan_id` để ánh xạ thuê bao đang chạy. Nội dung TRÙNG từng
-- chữ với `prisma/src/seed/system.ts` (cùng id `seedId('plan:<code>')`); seed chỉ TẠO khi chưa có
-- và KHÔNG ghi đè tên/giá/hạn mức/trạng thái lúc chạy lại — sau khi tạo, các trường đó là của ADMIN.
--
-- ⚠️ GIÁ LÀ SỐ GIỮ CHỖ ⇒ sáu bậc tự mua ra đời ở trạng thái `draft` (CHƯA MỞ BÁN): không hiện ở
-- bảng giá gian hàng, `purchase`/`assign` từ chối. Admin sửa giá thật rồi bấm Mở bán
-- (`POST /platform/plans/:id/activate`, draft → active). Thuê bao ĐANG CHẠY ánh xạ sang chúng ở
-- bước 4 vẫn chạy bình thường — `draft` nói về DANH MỤC, không về khách hàng. `enterprise_contact`
-- không có giá niêm yết (bán bằng tư vấn, giá đàm phán lúc gán) nên mở ngay (`active`).
INSERT INTO "public"."plans"
    ("id", "code", "name", "description", "currency", "billing_mode", "commission_percent",
     "vehicle_scope", "status", "sort_order", "limits_json", "created_at", "updated_at")
VALUES
    ('01M0GSW200EMDV1PPWZYFV6YNZ', 'moto_1', 'Xe máy · 1 xe', 'Gói xe máy cho chủ xe vừa bắt đầu — đăng 1 xe máy, đủ bộ quản lý gian hàng.', 'VND', 'package', NULL, 'motorbike', 'draft', 1,
     '{"maxVehicles":1,"maxBranches":null,"maxMembers":null,"termPrices":[{"months":1,"price":"49000"},{"months":3,"price":"139000"},{"months":6,"price":"269000"},{"months":12,"price":"499000"}],"salesOnly":false,"recommended":false,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01M0GSW200THQ402QCWPPXAXBQ', 'moto_5', 'Xe máy · 5 xe', 'Gói xe máy cho cửa hàng nhỏ — tối đa 5 xe máy.', 'VND', 'package', NULL, 'motorbike', 'draft', 2,
     '{"maxVehicles":5,"maxBranches":null,"maxMembers":null,"termPrices":[{"months":1,"price":"149000"},{"months":3,"price":"419000"},{"months":6,"price":"799000"},{"months":12,"price":"1490000"}],"salesOnly":false,"recommended":true,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01M0GSW2001Q4MP4W986CKD2J1', 'moto_10', 'Xe máy · 10 xe', 'Gói xe máy cho đội xe vừa — tối đa 10 xe máy.', 'VND', 'package', NULL, 'motorbike', 'draft', 3,
     '{"maxVehicles":10,"maxBranches":null,"maxMembers":null,"termPrices":[{"months":1,"price":"249000"},{"months":3,"price":"699000"},{"months":6,"price":"1339000"},{"months":12,"price":"2490000"}],"salesOnly":false,"recommended":false,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01M0GSW200AASKDV20APFGPBGQ', 'car_1', 'Ô tô · 1 xe', 'Gói ô tô cho chủ xe vừa bắt đầu — đăng 1 ô tô, đủ bộ quản lý gian hàng.', 'VND', 'package', NULL, 'car', 'draft', 4,
     '{"maxVehicles":1,"maxBranches":null,"maxMembers":null,"termPrices":[{"months":1,"price":"99000"},{"months":3,"price":"279000"},{"months":6,"price":"539000"},{"months":12,"price":"990000"}],"salesOnly":false,"recommended":false,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01M0GSW200G3AYQAR59Q6T6VDX', 'car_5', 'Ô tô · 5 xe', 'Gói ô tô cho cửa hàng nhỏ — tối đa 5 ô tô.', 'VND', 'package', NULL, 'car', 'draft', 5,
     '{"maxVehicles":5,"maxBranches":null,"maxMembers":null,"termPrices":[{"months":1,"price":"299000"},{"months":3,"price":"849000"},{"months":6,"price":"1619000"},{"months":12,"price":"2990000"}],"salesOnly":false,"recommended":true,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01M0GSW200A83SCFENBQB269KA', 'car_10', 'Ô tô · 10 xe', 'Gói ô tô cho đội xe vừa — tối đa 10 ô tô.', 'VND', 'package', NULL, 'car', 'draft', 6,
     '{"maxVehicles":10,"maxBranches":null,"maxMembers":null,"termPrices":[{"months":1,"price":"499000"},{"months":3,"price":"1419000"},{"months":6,"price":"2699000"},{"months":12,"price":"4990000"}],"salesOnly":false,"recommended":false,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01M0GSW200BBMEM30S8HCX000W', 'enterprise_contact', 'Doanh nghiệp', 'Không giới hạn ô tô, xe máy và chi nhánh. Liên hệ XePrime để được tư vấn và báo giá riêng.', 'VND', 'package', NULL, 'all', 'active', 7,
     '{"maxVehicles":null,"maxBranches":null,"maxMembers":null,"termPrices":[],"salesOnly":true,"recommended":false,"graceDays":7,"features":["finance","debts","maintenance","members","branches","drivers","contracts","escrow_hold"]}'::jsonb,
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- ── 3. `tenant_subscriptions.vehicle_scope` — SNAPSHOT phạm vi lúc gán ──────
--
-- Cùng kỷ luật với `billing_mode`/`quota_json` (ADR 0024 điều 2 · ADR 0041 điều 3): dòng thuê bao
-- tự nói nó phủ loại xe nào, không đọc xuyên qua `plans`. Mọi dòng hiện có là `all`.
ALTER TABLE "public"."tenant_subscriptions"
    ADD COLUMN IF NOT EXISTS "vehicle_scope" VARCHAR(20) NOT NULL DEFAULT 'all';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_subscriptions_vehicle_scope_check'
    ) THEN
        ALTER TABLE "public"."tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_vehicle_scope_check"
            CHECK ("vehicle_scope" IN ('motorbike', 'car', 'all'));
    END IF;
END $$;

-- Snapshot phải KHỚP phạm vi của bậc lúc ghi. `DEFAULT 'all'` tồn tại để các đường ghi cũ (fixture
-- test, dòng hoa hồng) không vỡ; trigger này biến một writer quên ghi phạm vi của bậc `car_5` thành
-- một lỗi ngay lúc INSERT, thay vì một dòng `all` lặng lẽ mở cả xe máy lẫn ô tô. Phạm vi của một
-- bậc không đổi sau khi tạo (BillingService không nhận trường đó ở đường sửa), nên khớp lúc ghi
-- là khớp mãi.
CREATE OR REPLACE FUNCTION "public"."tenant_subscriptions_vehicle_scope_matches_plan"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE plan_scope text;
BEGIN
    SELECT "vehicle_scope" INTO plan_scope FROM "public"."plans" WHERE "id" = NEW."plan_id";
    IF plan_scope IS NOT NULL AND plan_scope <> NEW."vehicle_scope" THEN
        RAISE EXCEPTION 'TENANT_SUBSCRIPTION_SCOPE_MISMATCH: tenant_subscriptions.vehicle_scope (%) phải khớp plans.vehicle_scope (%) của bậc %',
            NEW."vehicle_scope", plan_scope, NEW."plan_id"
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "tenant_subscriptions_vehicle_scope_matches_plan" ON "public"."tenant_subscriptions";
CREATE TRIGGER "tenant_subscriptions_vehicle_scope_matches_plan"
    BEFORE INSERT OR UPDATE OF "plan_id", "vehicle_scope" ON "public"."tenant_subscriptions"
    FOR EACH ROW EXECUTE FUNCTION "public"."tenant_subscriptions_vehicle_scope_matches_plan"();

-- ── 4. Ánh xạ thuê bao CÒN HẠN trên ba bậc cũ — ADR 0065 điều 7 ────────────
--
-- Chuyển ngay, MIỄN PHÍ, cùng ngày hết hạn. Chỉ dòng `active` còn hạn (`ends_at > now()` — đang
-- chạy HOẶC đã xếp lịch); dòng đã hết hạn là lịch sử và ở nguyên bậc cũ với phạm vi `all` (pha ân
-- hạn của chúng vẫn đọc đúng: `all` phủ cả hai loại, trần TỔNG).
--
--   shop-pro                         → enterprise_contact (all, không giới hạn)
--   shop-basic / shop-advanced:
--     ô tô > 10 hoặc xe máy > 10     → enterprise_contact — không bậc tự phục vụ nào chứa nổi
--     còn lại                         → MỘT CẶP car_* + moto_*: mỗi loại nhận bậc NHỎ NHẤT chứa
--                                       được số xe HIỆN CÓ của loại đó (0–1 → _1, 2–5 → _5,
--                                       6–10 → _10). Loại có 0 xe vẫn nhận `_1`: gian hàng trả tiền
--                                       cho "tối đa N xe bất kỳ loại nào", nên họ phải đăng được
--                                       loại kia mà không bị PLAN_SCOPE_REQUIRED giữa kỳ đã trả.
--
-- `price`, `starts_at`, `ends_at`, `term_months`, mốc claim của job vòng đời GIỮ NGUYÊN: gian hàng
-- đã trả tiền tới ngày nào thì dùng tới ngày đó. Dòng gốc (giữ `id`, nên hoá đơn đã trỏ tới nó vẫn
-- trỏ đúng) nhận gói ô tô và giữ GIÁ; dòng anh em xe máy mang giá 0 — tiền của kỳ chỉ được ghi MỘT
-- lần, không nhân đôi doanh thu trên sổ. Không sinh hoá đơn. Mỗi dòng đổi / dòng mới một dòng audit
-- `subscription.plan_migration` (actor `system`, `after.source = 'plan_migration'`).
--
-- Id dòng anh em / dòng audit suy TẤT ĐỊNH từ id gốc (10 ký tự thời gian của ULID gốc + 16 ký tự
-- hex của md5) — chạy lại không sinh dòng thứ hai (`ON CONFLICT (id) DO NOTHING`).
DROP TABLE IF EXISTS "_adr0065_map";
CREATE TEMP TABLE "_adr0065_map" AS
WITH live AS (
    SELECT ts."id", ts."tenant_id", p."code" AS old_code
      FROM "public"."tenant_subscriptions" ts
      JOIN "public"."plans" p ON p."id" = ts."plan_id"
     WHERE p."code" IN ('shop-basic', 'shop-advanced', 'shop-pro')
       AND ts."status" = 'active'
       AND ts."ends_at" > now()
), fleet AS (
    SELECT l."id",
           l."tenant_id",
           l.old_code,
           count(v."id") FILTER (WHERE v."vehicle_type" = 'car')       AS cars,
           count(v."id") FILTER (WHERE v."vehicle_type" = 'motorbike') AS motorbikes
      FROM live l
      LEFT JOIN "public"."vehicles" v
             ON v."tenant_id" = l."tenant_id" AND v."deleted_at" IS NULL
     GROUP BY l."id", l."tenant_id", l.old_code
), decided AS (
    SELECT f.*,
           (f.old_code = 'shop-pro' OR f.cars > 10 OR f.motorbikes > 10) AS to_enterprise
      FROM fleet f
)
SELECT d."id",
       d."tenant_id",
       d.old_code,
       d.cars,
       d.motorbikes,
       CASE
           WHEN d.to_enterprise THEN 'enterprise_contact'
           WHEN d.cars <= 1 THEN 'car_1'
           WHEN d.cars <= 5 THEN 'car_5'
           ELSE 'car_10'
       END AS primary_code,
       CASE
           WHEN d.to_enterprise THEN NULL
           WHEN d.motorbikes <= 1 THEN 'moto_1'
           WHEN d.motorbikes <= 5 THEN 'moto_5'
           ELSE 'moto_10'
       END AS sibling_code,
       substr(d."id", 1, 10) || upper(substr(md5(d."id" || ':adr0065:motorbike'), 1, 16)) AS sibling_id
  FROM decided d;

UPDATE "public"."tenant_subscriptions" ts
   SET "plan_id"       = np."id",
       "vehicle_scope" = np."vehicle_scope",
       "billing_mode"  = 'package',
       "quota_json"    = jsonb_build_object(
                             'maxVehicles', (np."limits_json" ->> 'maxVehicles')::int,
                             'maxBranches', (np."limits_json" ->> 'maxBranches')::int,
                             'maxMembers',  (np."limits_json" ->> 'maxMembers')::int)
  FROM "_adr0065_map" m
  JOIN "public"."plans" np ON np."code" = m.primary_code
 WHERE ts."id" = m."id";

-- Dòng anh em SAU khi dòng gốc đã sang `car` — để chạy lại trên một DB đã có EXCLUDE (bước 5)
-- thì dòng xe máy không chồng với dòng gốc còn ở phạm vi `all`. Các cột chép sang (kỳ, giá trị
-- claim) không bị lượt UPDATE trên đụng tới.
INSERT INTO "public"."tenant_subscriptions"
    ("id", "tenant_id", "plan_id", "status", "price", "starts_at", "ends_at", "note", "created_by",
     "created_at", "term_months", "billing_mode", "commission_percent", "renewal_reminded_at",
     "expiry_notified_at", "lapse_handled_at", "quota_json", "grace_guide_notified_at",
     "vehicle_scope")
SELECT m.sibling_id,
       ts."tenant_id", sp."id", ts."status", 0, ts."starts_at", ts."ends_at", ts."note",
       ts."created_by", ts."created_at", ts."term_months", 'package', NULL,
       ts."renewal_reminded_at", ts."expiry_notified_at", ts."lapse_handled_at",
       jsonb_build_object('maxVehicles', (sp."limits_json" ->> 'maxVehicles')::int,
                          'maxBranches', (sp."limits_json" ->> 'maxBranches')::int,
                          'maxMembers',  (sp."limits_json" ->> 'maxMembers')::int),
       ts."grace_guide_notified_at", sp."vehicle_scope"
  FROM "_adr0065_map" m
  JOIN "public"."tenant_subscriptions" ts ON ts."id" = m."id"
  JOIN "public"."plans" sp ON sp."code" = m.sibling_code
 WHERE m.sibling_code IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- Dấu vết đối soát: một dòng audit cho mỗi dòng thuê bao đổi bậc / sinh ra.
INSERT INTO "public"."audit_logs"
    ("id", "tenant_id", "actor_user_id", "actor_scope", "action", "target_type", "target_id",
     "before_json", "after_json", "created_at")
SELECT substr(x.target_id, 1, 10) || upper(substr(md5(x.target_id || ':adr0065:audit'), 1, 16)),
       x.tenant_id, NULL, 'system', 'subscription.plan_migration', 'tenant_subscription', x.target_id,
       jsonb_build_object('planCode', x.old_code),
       jsonb_build_object('source', 'plan_migration', 'adr', '0065', 'planCode', x.new_code,
                          'vehicleScope', x.scope, 'sourceSubscriptionId', x.source_id,
                          'fleet', jsonb_build_object('car', x.cars, 'motorbike', x.motorbikes)),
       CURRENT_TIMESTAMP
  FROM (
      SELECT m."id" AS target_id, m."id" AS source_id, m."tenant_id", m.old_code, m.cars,
             m.motorbikes, m.primary_code AS new_code, np."vehicle_scope" AS scope
        FROM "_adr0065_map" m JOIN "public"."plans" np ON np."code" = m.primary_code
      UNION ALL
      SELECT m.sibling_id, m."id", m."tenant_id", m.old_code, m.cars, m.motorbikes,
             m.sibling_code, 'motorbike'
        FROM "_adr0065_map" m
       WHERE m.sibling_code IS NOT NULL
  ) x
ON CONFLICT ("id") DO NOTHING;

-- Nói ra số dòng đã ánh xạ — đây là thay đổi HẠN MỨC của khách hàng đang trả tiền.
DO $$
DECLARE n_primary bigint; n_sibling bigint; n_enterprise bigint;
BEGIN
    SELECT count(*), count(sibling_code), count(*) FILTER (WHERE primary_code = 'enterprise_contact')
      INTO n_primary, n_sibling, n_enterprise
      FROM "_adr0065_map";
    RAISE NOTICE 'ADR 0065: ánh xạ % dòng thuê bao còn hạn (% sang enterprise_contact), thêm % dòng gói xe máy song song.',
        n_primary, n_enterprise, n_sibling;
END $$;

DROP TABLE IF EXISTS "_adr0065_map";

-- Dòng gói CÒN HẠN trên bậc KHÔNG thuộc bảy bậc mới và không được ánh xạ (bậc `per-vehicle` cũ,
-- bậc admin tự tạo…): chúng chạy tiếp với phạm vi `all` và trần TỔNG trên snapshot của chính
-- chúng — đúng, nhưng người chạy deploy phải THẤY con số này để quyết có cần ánh xạ tay không.
DO $$
DECLARE n_unmapped bigint; codes text;
BEGIN
    SELECT count(*), string_agg(DISTINCT p."code", ', ')
      INTO n_unmapped, codes
      FROM "public"."tenant_subscriptions" ts
      JOIN "public"."plans" p ON p."id" = ts."plan_id"
     WHERE ts."status" = 'active' AND ts."billing_mode" = 'package' AND ts."ends_at" > now()
       AND p."code" NOT IN ('moto_1', 'moto_5', 'moto_10', 'car_1', 'car_5', 'car_10', 'enterprise_contact');
    IF n_unmapped > 0 THEN
        RAISE WARNING 'ADR 0065: % dòng gói còn hạn nằm trên bậc ngoài danh mục mới (%): giữ phạm vi all + trần tổng của snapshot.', n_unmapped, codes;
    ELSE
        RAISE NOTICE 'ADR 0065: không còn dòng gói còn hạn nào ngoài bảy bậc mới.';
    END IF;
END $$;

-- ── 5. EXCLUDE: hai kỳ GÓI không chồng nhau ở phạm vi xung đột ──────────────
--
-- Bất biến: với mỗi tenant, tại mọi thời điểm có TỐI ĐA một kỳ gói đang `active` phủ mỗi loại xe.
-- Một ràng buộc duy nhất làm cả hai vế nhờ `plan_vehicle_scope_span` (bước 1):
--   • cùng phạm vi (`car` + `car`) ⇒ hai khoảng trùng nhau ⇒ bị từ chối;
--   • `all` + `car`/`motorbike`    ⇒ `[1,3)` chồng ⇒ bị từ chối;
--   • `car` + `motorbike`          ⇒ `[2,3)` và `[1,2)` rời nhau ⇒ được.
-- Khoảng thời gian `[starts_at, ends_at)` nửa mở: kỳ nối đuôi (`starts_at` = `ends_at` kỳ trước)
-- không chồng.
--
-- CHỈ dòng `billing_mode = 'package'` và `status = 'active'`: dòng hoa hồng 0đ là dòng HỆ THỐNG,
-- luôn bị lượt gán gói huỷ (`planSubscriptionChain`) và có thể tạm nằm cạnh một kỳ gói đã xếp
-- lịch; dòng đã huỷ là lịch sử.
--
-- ## Vì sao có MỐC CẮT `ends_at > <thời điểm chạy migration>` (an toàn khi deploy)
--
-- Lịch sử thuê bao là append-only và KHÔNG được viết lại (ADR 0010 — một kỳ đã thu tiền là chứng
-- từ). Dữ liệu cũ có thể mang hai kỳ gói ĐÃ HẾT HẠN chồng nhau (gán tay thời ADR 0015, dữ liệu
-- test cũ…). Nếu ràng buộc phủ cả chúng, `db:deploy` ở production DỪNG mà không ai sửa được nếu
-- không viết lại tiền đã thu. Nên ràng buộc chỉ phủ các kỳ CHƯA KẾT THÚC tại lúc migration chạy:
--
--   WHERE status = 'active' AND billing_mode = 'package' AND ends_at > '<now() lúc chạy>'
--
-- Mốc là một HẰNG được chèn vào định nghĩa ràng buộc lúc tạo (`EXECUTE format(... %L, now())`) —
-- biểu thức IMMUTABLE như GiST đòi; mọi dòng ghi SAU migration đều kết thúc sau mốc nên đều nằm
-- trong ràng buộc. Hệ quả có chủ đích: văn bản ràng buộc ở mỗi môi trường mang mốc của chính nó
-- (`pg_get_constraintdef` khác nhau ở đúng hằng đó); migration sau muốn sửa ràng buộc thì tìm theo
-- TÊN. Lịch sử trước mốc không được DB canh — nó vốn không còn đổi được nữa.
--
-- Hai kỳ CÒN HẠN chồng nhau thì KHÔNG cắt được bằng mốc — đó là dữ liệu sai đang có hiệu lực tiền
-- (hai gói cùng gác một loại xe). Bước kiểm dưới đây DỪNG migration kèm danh sách, để người chạy
-- quyết từng ca (thường giữ kỳ có hoá đơn), thay vì để lệnh ADD CONSTRAINT báo một lỗi khó đọc.
--
-- `btree_gist` đã bật từ baseline (để `tenant_id WITH =` dùng được trong GiST). `tstzrange` không
-- thể ném vì `ends_at <= starts_at` — CHECK `tenant_subscriptions_ends_after_starts` có từ baseline;
-- bước kiểm vẫn soát lại cho chắc.
DO $$
DECLARE
    cutoff timestamptz := now();
    n_bad_range bigint;
    n_covered bigint;
    n_history bigint;
    overlap_list text;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_subscriptions_package_scope_no_overlap'
    ) THEN
        RAISE NOTICE 'ADR 0065: tenant_subscriptions_package_scope_no_overlap đã có — bỏ qua.';
        RETURN;
    END IF;

    SELECT count(*) INTO n_bad_range
      FROM "public"."tenant_subscriptions"
     WHERE "ends_at" <= "starts_at";
    IF n_bad_range > 0 THEN
        RAISE EXCEPTION 'ADR 0065: % dòng tenant_subscriptions có ends_at <= starts_at — sửa dữ liệu trước (SELECT id FROM tenant_subscriptions WHERE ends_at <= starts_at).', n_bad_range;
    END IF;

    SELECT count(*) FILTER (WHERE "ends_at" > cutoff), count(*) FILTER (WHERE "ends_at" <= cutoff)
      INTO n_covered, n_history
      FROM "public"."tenant_subscriptions"
     WHERE "status" = 'active' AND "billing_mode" = 'package';
    RAISE NOTICE 'ADR 0065: EXCLUDE phủ % kỳ gói chưa kết thúc; % kỳ gói đã kết thúc trước mốc % nằm ngoài (lịch sử).',
        n_covered, n_history, cutoff;

    SELECT string_agg(format('tenant %s: %s ⟷ %s', a."tenant_id", a."id", b."id"), '; ')
      INTO overlap_list
      FROM "public"."tenant_subscriptions" a
      JOIN "public"."tenant_subscriptions" b
        ON a."tenant_id" = b."tenant_id" AND a."id" < b."id"
     WHERE a."status" = 'active' AND b."status" = 'active'
       AND a."billing_mode" = 'package' AND b."billing_mode" = 'package'
       AND a."ends_at" > cutoff AND b."ends_at" > cutoff
       AND "public"."plan_vehicle_scope_span"(a."vehicle_scope") && "public"."plan_vehicle_scope_span"(b."vehicle_scope")
       AND tstzrange(a."starts_at", a."ends_at", '[)') && tstzrange(b."starts_at", b."ends_at", '[)');
    IF overlap_list IS NOT NULL THEN
        RAISE EXCEPTION 'ADR 0065: có kỳ gói CÒN HẠN chồng nhau ở phạm vi xung đột — xử từng ca rồi chạy lại: %', overlap_list;
    END IF;

    EXECUTE format(
        'ALTER TABLE "public"."tenant_subscriptions"
             ADD CONSTRAINT "tenant_subscriptions_package_scope_no_overlap"
             EXCLUDE USING gist (
                 "tenant_id" WITH =,
                 "public"."plan_vehicle_scope_span"("vehicle_scope") WITH &&,
                 tstzrange("starts_at", "ends_at", %L) WITH &&
             )
             WHERE ("status" = %L AND "billing_mode" = %L AND "ends_at" > %L::timestamptz)',
        '[)', 'active', 'package', cutoff
    );
END $$;

-- ── 6. `subscription_invoices.vehicle_scope` + một hoá đơn trả được MỖI PHẠM VI ──
--
-- Hoá đơn mang phạm vi của bậc lúc phát hành (cũng nằm trong `lines_json.vehicleScope`). Hoá đơn
-- cũ: suy từ bậc qua `lines_json.planId` (bậc cũ đều là `all`), thiếu bậc thì `all`.
ALTER TABLE "public"."subscription_invoices"
    ADD COLUMN IF NOT EXISTS "vehicle_scope" VARCHAR(20) NOT NULL DEFAULT 'all';

UPDATE "public"."subscription_invoices" si
   SET "vehicle_scope" = p."vehicle_scope"
  FROM "public"."plans" p
 WHERE p."id" = si."lines_json" ->> 'planId'
   AND si."vehicle_scope" <> p."vehicle_scope";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'subscription_invoices_vehicle_scope_check'
    ) THEN
        ALTER TABLE "public"."subscription_invoices" ADD CONSTRAINT "subscription_invoices_vehicle_scope_check"
            CHECK ("vehicle_scope" IN ('motorbike', 'car', 'all'));
    END IF;
END $$;

-- Bất biến của `20260916150000_subscription_invoice_single_payable` nới đúng MỘT chiều: gian
-- hàng mua gói ô tô và gói xe máy là hai lượt mua độc lập, nên mỗi PHẠM VI giữ tối đa một hoá đơn
-- còn nhận được tiền. Hai mã cho CÙNG một phạm vi vẫn bị chặn (hai mã cùng kích hoạt một chuỗi kỳ).
-- Dữ liệu hiện có thoả sẵn: một-mỗi-tenant mạnh hơn một-mỗi-(tenant, phạm vi).
DROP INDEX IF EXISTS "public"."subscription_invoices_one_payable_per_tenant";
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_invoices_one_payable_per_tenant_scope"
    ON "public"."subscription_invoices" ("tenant_id", "vehicle_scope")
 WHERE "status" IN ('issued', 'partially_paid');

-- ── 7. Ngừng bán ba bậc của ADR 0041 ────────────────────────────────────────
--
-- ARCHIVE, không xoá: dòng thuê bao lịch sử trỏ tới chúng (`plan_id` RESTRICT) và mã của chúng
-- nằm trên hoá đơn đã phát hành. Hoá đơn `issued` của chúng vẫn KÍCH HOẠT được khi tiền về
-- (`activateFromInvoiceWithinTx` đọc bậc theo id, không đòi `status = active`) — ra một kỳ phạm vi
-- `all` với trần TỔNG ghi trên chính tờ hoá đơn, xếp sau mọi kỳ đang chạy.
UPDATE "public"."plans"
   SET "status" = 'archived', "updated_at" = CURRENT_TIMESTAMP
 WHERE "code" IN ('shop-basic', 'shop-advanced', 'shop-pro')
   AND "status" <> 'archived';
