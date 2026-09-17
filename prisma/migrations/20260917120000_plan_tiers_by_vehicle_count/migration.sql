-- ═══════════════════════════════════════════════════════════════════════════
-- ADR 0041 — Ba bậc gian hàng bán theo SỐ XE và KỲ HẠN
--
-- VIẾT TAY — cùng lý do đã ghi ở header `20260821000000_init/migration.sql`.
--
-- Bốn việc, theo đúng thứ tự:
--   1. Viết lại `plans.limits_json` về hình dạng mới (trần TỔNG xe + bảng giá cả kỳ).
--   2. Thêm `tenant_subscriptions.quota_json` và ÁNH XẠ thuê bao tuyến gói đang chạy sang hạn
--      mức theo bậc, theo TỔNG chỗ đã mua (ADR 0041 điều 8).
--   3. Chuyển `subscription_invoices.lines_json.slots` → `.quota` cho hoá đơn CHƯA kích hoạt —
--      một hoá đơn `issued` có thể đang chờ tiền ngay lúc deploy.
--   4. Gỡ `slots_json` và bốn cột legacy của `plans` (đợt CONTRACT mà ADR 0010/0015/0020 đã hẹn).
--
-- ⚠️ NỘI DUNG DANH MỤC KHÔNG NẰM Ở ĐÂY. Ba bậc `shop-basic` / `shop-advanced` / `shop-pro` do
-- SEED tạo (`SEED_MODE=system`), cùng tiền lệ với `20260830120000_backfill_default_plan`: một
-- bản khai danh mục thứ hai trong SQL là một bản sẽ trôi khỏi `prisma/src/seed/system.ts`, và
-- lúc đó không ai trả lời được bản nào đúng. Migration chỉ lo phần LƯỢC ĐỒ và DỮ LIỆU CŨ — mục
-- 2 ghi thẳng con số hạn mức, không join sang `plans`, nên nó không cần ba bậc đó tồn tại.
--
-- ⚠️ `plan_id` là ON DELETE RESTRICT và mã gói nằm trên hoá đơn đã phát hành: bậc `per-vehicle`
-- KHÔNG bị xoá ở đây, chỉ lật `archived`. Thuê bao đang trỏ tới nó chạy hết kỳ với đúng giá đã
-- snapshot (ADR 0038 điều 14); `retireLegacyPlans()` trong seed dọn nốt khi không còn ai trỏ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. `plans.limits_json` về hình dạng ADR 0041 ──────────────────────────
--
-- Bậc hoa hồng KHÔNG bán gì: `termPrices` rỗng, và `maxVehicles` để NULL vì trần của tuyến đó
-- là quy tắc SẢN PHẨM trong code (`OWNER_LITE_VEHICLE_LIMIT`), không phải dữ liệu của bậc —
-- `vehicleQuotaFor` không bao giờ đọc tới nó cho tuyến này.
UPDATE "public"."plans"
SET "limits_json" = jsonb_build_object(
        'maxVehicles',  NULL,
        'maxBranches',  NULL,
        'maxMembers',   NULL,
        'termPrices',   '[]'::jsonb,
        'salesOnly',    false,
        'recommended',  false,
        'graceDays',    COALESCE(("limits_json" ->> 'graceDays')::int, 7),
        -- Cờ năng lực GIỮ NGUYÊN: đợt này nói về GIÁ và TRẦN, không về năng lực.
        'features',     COALESCE("limits_json" -> 'features', '[]'::jsonb)
    )
WHERE "billing_mode" = 'commission';

-- Bậc `package` cũ (mô hình chỗ xe): trần TỔNG = tổng hai trần cũ khi CẢ HAI có giá trị; còn
-- một bên NULL thì trần cũ đã là "không giới hạn" ở loại đó, nên trần tổng cũng không giới hạn.
-- `termPrices` để RỖNG có chủ đích — không bịa giá cả kỳ từ đơn giá chỗ × số chỗ giả định. Bậc
-- rỗng bảng giá không mua được (`purchase` từ chối "không có khoản phải trả"), và những bậc này
-- đang trên đường ra khỏi danh mục.
UPDATE "public"."plans"
SET "limits_json" = jsonb_build_object(
        'maxVehicles',
            -- `->>` trả SQL NULL cho cả "thiếu khoá" lẫn "JSON null", và cả hai đều đọc là
            -- KHÔNG GIỚI HẠN ở loại đó ⇒ trần tổng cũng không giới hạn.
            CASE WHEN "limits_json" ->> 'maxCars' IS NULL
                   OR "limits_json" ->> 'maxMotorbikes' IS NULL
                 THEN NULL
                 ELSE ("limits_json" ->> 'maxCars')::int + ("limits_json" ->> 'maxMotorbikes')::int
            END,
        'maxBranches',  ("limits_json" ->> 'maxBranches')::int,
        'maxMembers',   ("limits_json" ->> 'maxMembers')::int,
        'termPrices',   '[]'::jsonb,
        'salesOnly',    false,
        'recommended',  false,
        'graceDays',    COALESCE(("limits_json" ->> 'graceDays')::int, 7),
        'features',     COALESCE("limits_json" -> 'features', '[]'::jsonb)
    )
WHERE "billing_mode" = 'package';

-- Bậc theo CHỖ của ADR 0029 ra khỏi danh mục BÁN — không xoá (xem header).
UPDATE "public"."plans" SET "status" = 'archived' WHERE "code" = 'per-vehicle';

-- ── 2. `tenant_subscriptions.quota_json` + ánh xạ thuê bao đang chạy ──────

ALTER TABLE "public"."tenant_subscriptions" ADD COLUMN "quota_json" JSONB;

-- Ánh xạ: TỔNG chỗ đã mua → bậc có trần nhỏ nhất còn chứa được.
--   ≤ 3 xe  → Cơ bản        (3 xe  / 1 chi nhánh)
--   ≤ 10 xe → Nâng cao      (10 xe / 3 chi nhánh)
--   > 10 xe → Chuyên nghiệp (không giới hạn)
--
-- `plan_id`, `price`, `starts_at`, `ends_at` GIỮ NGUYÊN có chủ đích: gian hàng đã trả tiền tới
-- ngày nào thì dùng tới ngày đó, và đổi `plan_id` ở đây sẽ làm hoá đơn ĐÃ PHÁT HÀNH trỏ tới một
-- bậc khác bậc ghi trên chính nó. Thứ đổi là trần đi kèm, không phải hợp đồng.
--
-- Dòng `slots_json IS NULL` (tuyến hoa hồng) KHÔNG được chạm: tuyến đó không mua hạn mức, trần
-- của nó là `OWNER_LITE_VEHICLE_LIMIT` trong code. Ghi `quota_json` cho nó là dựng một trần DỮ
-- LIỆU cạnh một trần QUY TẮC, và hai thứ đó sẽ trôi khỏi nhau.
UPDATE "public"."tenant_subscriptions" ts
SET "quota_json" = CASE
        WHEN src.total_slots <= 3  THEN jsonb_build_object('maxVehicles', 3,    'maxBranches', 1,    'maxMembers', NULL)
        WHEN src.total_slots <= 10 THEN jsonb_build_object('maxVehicles', 10,   'maxBranches', 3,    'maxMembers', NULL)
        ELSE                            jsonb_build_object('maxVehicles', NULL, 'maxBranches', NULL, 'maxMembers', NULL)
    END
FROM (
    SELECT "id",
           COALESCE(("slots_json" ->> 'car')::int, 0)
         + COALESCE(("slots_json" ->> 'motorbike')::int, 0) AS total_slots
    FROM "public"."tenant_subscriptions"
    WHERE "slots_json" IS NOT NULL
) src
WHERE src."id" = ts."id";

-- Nói ra số dòng đã ánh xạ: đây là thay đổi HẠN MỨC của khách hàng đang trả tiền, và người chạy
-- `migrate deploy` phải nhìn thấy nó trong output chứ không phải đi đếm sau.
DO $$
DECLARE n bigint; tiers bigint;
BEGIN
    SELECT count(*) INTO n FROM "public"."tenant_subscriptions" WHERE "quota_json" IS NOT NULL;
    RAISE NOTICE 'ADR 0041: đã ánh xạ % dòng thuê bao tuyến gói sang hạn mức theo bậc.', n;

    SELECT count(*) INTO tiers
    FROM "public"."plans"
    WHERE "status" = 'active' AND "billing_mode" = 'package'
      AND jsonb_array_length(COALESCE("limits_json" -> 'termPrices', '[]'::jsonb)) > 0;
    IF tiers = 0 THEN
        RAISE WARNING 'Danh mục chưa có bậc gian hàng nào BÁN ĐƯỢC — chạy `SEED_MODE=system` để tạo shop-basic / shop-advanced / shop-pro, nếu không màn chọn gói sẽ rỗng.';
    END IF;
END $$;

-- ── 3. Hoá đơn chưa kích hoạt: `lines_json.slots` → `.quota` ─────────────
--
-- CHỈ hoá đơn còn nhận được tiền (`issued` / `partially_paid`) — chúng là thứ
-- `activateFromInvoiceWithinTx` sẽ đọc sau khi deploy. Hoá đơn `paid`/`void` là CHỨNG TỪ: viết
-- lại `lines_json` của chúng là sửa một tờ hoá đơn đã phát hành. `parsePlanInvoiceSnapshot` đọc
-- được hình dạng cũ nên chúng vẫn hiển thị đúng.
UPDATE "public"."subscription_invoices"
SET "lines_json" = ("lines_json" - 'slots') || jsonb_build_object(
        'quota', jsonb_build_object(
            'maxVehicles', COALESCE(("lines_json" -> 'slots' ->> 'car')::int, 0)
                         + COALESCE(("lines_json" -> 'slots' ->> 'motorbike')::int, 0),
            'maxBranches', NULL,
            'maxMembers',  NULL))
WHERE "status" IN ('issued', 'partially_paid')
  AND "lines_json" ? 'slots';

-- ── 4. Đợt CONTRACT ──────────────────────────────────────────────────────
--
-- `slots_json`: mô hình chỗ xe không còn; hạn mức đọc từ `quota_json` (mục 2).
ALTER TABLE "public"."tenant_subscriptions" DROP COLUMN "slots_json";

-- Bốn cột `plans` mà ADR 0010/0015/0020 đã hẹn gỡ:
--   price / duration_days    → `limits_json.termPrices` (giá CẢ KỲ theo kỳ hạn)
--   max_vehicles             → `limits_json.maxVehicles` + `tenant_subscriptions.quota_json`
--   assumed_monthly_gmv_json → đầu vào DUY NHẤT của phép kiểm điểm giao mà ADR 0029 điều 4 đã
--                              cho nghỉ hưu; không endpoint nào còn đọc.
ALTER TABLE "public"."plans"
    DROP COLUMN "price",
    DROP COLUMN "duration_days",
    DROP COLUMN "max_vehicles",
    DROP COLUMN "assumed_monthly_gmv_json";
