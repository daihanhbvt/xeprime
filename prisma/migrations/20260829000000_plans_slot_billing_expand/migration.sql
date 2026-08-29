-- ═══════════════════════════════════════════════════════════════════════════
-- Gói phẳng (ADR 0010) → cước theo CHỖ XE, kỳ THÁNG LỊCH, hai chế độ thu phí
-- (29/08/2026, ADR 0015 điều 1–4 · ADR 0020 điều 1 · ADR 0024 điều 2)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`.
--
-- Đây là bước EXPAND của expand/contract: chỉ THÊM cột + backfill, TUYỆT ĐỐI không drop
-- cột cũ (`price`, `duration_days`, `max_vehicles`) — `tenant_subscriptions` có khoá ngoại
-- RESTRICT tới `plans`, và code đang chạy vẫn đọc các cột đó cho tới khi BillingService
-- đổi xong. Contract (drop + siết `term_months` NOT NULL) là một migration sau.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. `plans`: bậc gói mang chế độ thu phí ────────────────────────────────
ALTER TABLE "public"."plans"
    ADD COLUMN "base_price_monthly" DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "billing_mode" VARCHAR(30) NOT NULL DEFAULT 'commission',
    ADD COLUMN "commission_percent" DECIMAL(5,2),
    ADD COLUMN "assumed_monthly_gmv_json" JSONB;

-- ── 2. Backfill `plans` TRƯỚC khi thêm CHECK ───────────────────────────────
--
-- Cột mới default `commission` + `commission_percent` NULL — tổ hợp đó vi phạm CHECK ở
-- mục 3, nên mọi dòng hiện có phải được gán giá trị thật trước.
--
-- Phân tuyến theo `price` (không hardcode `code` — migration phải chạy đúng trên mọi
-- database, kể cả plan không ai seed):
--   price = 0  → tuyến hoa hồng, 10% — đúng con số ADR 0020 dùng làm ví dụ điểm hoà vốn
--                và là giá trị seed sẽ chốt cho gói `free` (gói mặc định lúc đăng ký).
--   price > 0  → tuyến gói; `base_price_monthly` tạm lấy giá phẳng cũ (duration_days của
--                mọi gói đã seed là 30 ≈ 1 tháng). Seed/admin chỉnh số thật sau —
--                giá là DỮ LIỆU, không phải thứ migration được quyết cứng.
UPDATE "public"."plans"
SET "billing_mode"       = CASE WHEN "price" = 0 THEN 'commission' ELSE 'package' END,
    "commission_percent" = CASE WHEN "price" = 0 THEN 10.00 ELSE NULL END,
    "base_price_monthly" = CASE WHEN "price" = 0 THEN 0 ELSE "price" END;

-- Reshape `limits_json` theo hình ADR 0015 điều 4. Cả ba gói đã seed đang để NULL và
-- chưa dòng code nào đọc, nhưng vẫn merge (`||`) thay vì ghi đè để không nuốt key lạ
-- nếu database nào đó đã có.
--   • maxCars suy từ `max_vehicles` cũ (NULL = không giới hạn, giữ nguyên ngữ nghĩa);
--     motorbike để NULL — mô hình cũ không phân loại xe.
--   • includedCars/includedMotorbikes = 0, perVehiclePrice NULL — gói phẳng cũ không có
--     khái niệm này; admin đặt số thật khi chuyển hẳn sang bán theo chỗ.
--   • terms = [{months: 1}] — tương đương chu kỳ 30 ngày cũ, không bịa ưu đãi kỳ hạn.
--   • features: ĐỦ 7 cờ đang dùng (trừ `escrow_hold` — ADR 0025 chưa thi công, và W3
--     cũng không backfill cờ đó). Mọi tenant hôm nay đang dùng không rào chắn; gói thiếu
--     cờ nghĩa là ngày cổng chặn bật (ADR 0027) họ MẤT quyền — thà rộng còn siết sau.
UPDATE "public"."plans"
SET "limits_json" = COALESCE("limits_json", '{}'::jsonb) || jsonb_build_object(
        'perVehiclePrice',    jsonb_build_object('car', NULL, 'motorbike', NULL),
        'includedCars',       0,
        'includedMotorbikes', 0,
        'maxCars',            "max_vehicles",
        'maxMotorbikes',      NULL,
        'maxMembers',         NULL,
        'maxBranches',        NULL,
        'terms',              jsonb_build_array(jsonb_build_object('months', 1, 'discountPercent', 0)),
        'graceDays',          7,
        'features',           to_jsonb(ARRAY['finance','debts','maintenance','members','branches','drivers','contracts'])
    );

-- ── 3. CHECK cho `plans` ───────────────────────────────────────────────────
-- ADR 0005 — status lưu String, DB canh bằng CHECK; thêm giá trị mới thì sửa CẢ HAI nơi
-- (BILLING_MODE ở packages/types/src/status/billing.ts và constraint này).
ALTER TABLE "public"."plans"
    ADD CONSTRAINT "plans_billing_mode_check"
    CHECK ("billing_mode" IN ('commission', 'package'));

-- Hai chế độ, hai hình dạng dữ liệu — không có trạng thái lai:
--   • gói `package` KHÔNG có % hoa hồng (tenant mua gói trả 0đ trên chuyến — ADR 0020);
--   • gói `commission` BẮT BUỘC có %, và 1–20 chặn cả hai đầu tay nhầm: 0% là tuyến phễu
--     miễn phí vĩnh viễn, >20% là đắt hơn đối thủ mà ADR 0020 sinh ra để thắng.
ALTER TABLE "public"."plans"
    ADD CONSTRAINT "plans_commission_percent_by_mode_check"
    CHECK (
        ("billing_mode" = 'package' AND "commission_percent" IS NULL)
        OR ("billing_mode" = 'commission' AND "commission_percent" BETWEEN 1 AND 20)
    );

-- ── 4. `tenant_subscriptions`: kỳ hạn tháng lịch + snapshot chế độ ─────────
-- Cả bốn cột NULLABLE có chủ đích: dòng lịch sử (append-only, ADR 0010) không bịa lại
-- được số chỗ đã mua. `term_months` siết NOT NULL ở đợt contract, sau khi backfill đứng.
ALTER TABLE "public"."tenant_subscriptions"
    ADD COLUMN "term_months" INTEGER,
    ADD COLUMN "slots_json" JSONB,
    ADD COLUMN "billing_mode" VARCHAR(30),
    ADD COLUMN "commission_percent" DECIMAL(5,2);

-- ── 5. Backfill `tenant_subscriptions` ─────────────────────────────────────
-- Ghi log plan có `duration_days` lạ TRƯỚC khi quy tất cả về 1 tháng — con số lạ là dấu
-- hiệu dữ liệu tay, người vận hành phải nhìn thấy nó trong output của `migrate deploy`.
DO $$
DECLARE odd RECORD;
BEGIN
    FOR odd IN
        SELECT DISTINCT p."id", p."code", p."duration_days"
        FROM "public"."plans" p
        JOIN "public"."tenant_subscriptions" ts ON ts."plan_id" = p."id"
        WHERE p."duration_days" NOT IN (30, 90, 180, 365)
    LOOP
        RAISE WARNING 'plans.duration_days lạ: plan % (%) có duration_days = % — term_months quy về 1',
            odd."code", odd."id", odd."duration_days";
    END LOOP;
END $$;

-- `term_months` suy từ chu kỳ ngày cũ; `billing_mode`/`commission_percent` chép từ plan
-- (đã backfill ở mục 2) — từ nay là SNAPSHOT, không đọc xuyên qua `plans` nữa (ADR 0024
-- điều 2). `slots_json` để NULL: mô hình cũ không bán theo chỗ, bịa số là dữ liệu giả.
UPDATE "public"."tenant_subscriptions" ts
SET "term_months" = CASE p."duration_days"
        WHEN 30 THEN 1 WHEN 90 THEN 3 WHEN 180 THEN 6 WHEN 365 THEN 12 ELSE 1 END,
    "billing_mode"       = p."billing_mode",
    "commission_percent" = p."commission_percent"
FROM "public"."plans" p
WHERE p."id" = ts."plan_id";

-- ── 6. CHECK cho `tenant_subscriptions` ────────────────────────────────────
-- ADR 0005 — status lưu String, DB canh bằng CHECK; thêm giá trị mới thì sửa CẢ HAI nơi
-- (longTermPackages/kỳ hạn hợp lệ ở @xeprime/types và constraint này).
ALTER TABLE "public"."tenant_subscriptions"
    ADD CONSTRAINT "tenant_subscriptions_term_months_check"
    CHECK ("term_months" IS NULL OR "term_months" IN (1, 3, 6, 12));
