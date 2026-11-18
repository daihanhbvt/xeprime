-- ADR 0097 (17/11/2026) — phí bảo hiểm vật chất xe của từng hợp đồng lấy từ MIC lúc DUYỆT, công thức
-- bậc chỉ là dự phòng; % hoa hồng đại lý cấu hình trên sản phẩm.
--
-- Mọi cột mới NULL / DEFAULT 0: hợp đồng cũ (chốt phí bằng công thức trước ADR này) giữ nguyên nghĩa,
-- nguồn phí của chúng để trống — giao diện hiện "không ghi nhận", không đoán.

-- ── 1. Nguồn phí của từng hợp đồng ───────────────────────────────────────────────────────────
ALTER TABLE "public"."booking_insurance_policies"
    ADD COLUMN "premium_source"                VARCHAR(20),
    ADD COLUMN "formula_premium_amount"        NUMERIC(14, 2),
    ADD COLUMN "premium_quote_fallback_reason" VARCHAR(30);

ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_premium_source_check"
        CHECK ("premium_source" IS NULL OR "premium_source" IN ('partner', 'formula')),
    ADD CONSTRAINT "booking_insurance_policies_premium_fallback_reason_check"
        CHECK (
            "premium_quote_fallback_reason" IS NULL
            OR (
                "premium_source" = 'formula'
                AND "premium_quote_fallback_reason" IN
                    ('timeout', 'unavailable', 'rejected', 'out_of_range', 'not_supported')
            )
        ),
    ADD CONSTRAINT "booking_insurance_policies_formula_premium_check"
        CHECK ("formula_premium_amount" IS NULL OR "formula_premium_amount" >= 0);

-- ── 2. Hoa hồng đại lý theo hợp đồng đại lý với hãng ─────────────────────────────────────────
-- Giá trị mặc định cho bảng kê tháng (admin vẫn sửa được ở từng bảng kê). Trần trùng
-- `INSURANCE_REMITTANCE_LIMITS.commissionPercentMax` và CHECK của bảng kê.
ALTER TABLE "public"."insurance_products"
    ADD COLUMN "agency_commission_percent" NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE "public"."insurance_products"
    ADD CONSTRAINT "insurance_products_agency_commission_percent_check"
        CHECK ("agency_commission_percent" >= 0 AND "agency_commission_percent" <= 50);
