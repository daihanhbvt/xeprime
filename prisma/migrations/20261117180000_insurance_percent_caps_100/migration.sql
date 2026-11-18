-- 17/11/2026 — người dùng chốt: % phí thu hộ bảo hiểm và % hoa hồng đại lý tối đa 100% (trước là 50%).
-- Trần ở app đọc từ `INSURANCE_SERVICE_FEE_PERCENT_MAX` và `INSURANCE_REMITTANCE_LIMITS.commissionPercentMax`
-- (`@xeprime/types`); ba CHECK dưới đây là bản ở DB của cùng hai con số. Cột vẫn NUMERIC(5, 2).
-- Nới trần không làm dòng nào đang có trở thành sai.

-- ── 1. Phí thu hộ trên sản phẩm (ADR 0091 điều 3) ───────────────────────────────────────────
ALTER TABLE "public"."insurance_products"
    DROP CONSTRAINT "insurance_products_service_fee_percent_check",
    ADD CONSTRAINT "insurance_products_service_fee_percent_check"
        CHECK ("service_fee_percent" >= 0 AND "service_fee_percent" <= 100);

-- ── 2. Hoa hồng đại lý mặc định trên sản phẩm (ADR 0097) ────────────────────────────────────
ALTER TABLE "public"."insurance_products"
    DROP CONSTRAINT "insurance_products_agency_commission_percent_check",
    ADD CONSTRAINT "insurance_products_agency_commission_percent_check"
        CHECK ("agency_commission_percent" >= 0 AND "agency_commission_percent" <= 100);

-- ── 3. Hoa hồng của từng bảng kê — dựng lại nguyên ràng buộc tổng, chỉ đổi trần % ─────────────
ALTER TABLE "public"."insurance_premium_remittances"
    DROP CONSTRAINT "insurance_premium_remittances_amounts_check",
    ADD CONSTRAINT "insurance_premium_remittances_amounts_check" CHECK (
        "policy_count" >= 0
        AND "gross_premium" >= 0
        AND "commission_percent" BETWEEN 0 AND 100
        AND "commission_amount" >= 0
        AND "commission_amount" <= "gross_premium"
        AND "payable_amount" = "gross_premium" - "commission_amount"
    );
