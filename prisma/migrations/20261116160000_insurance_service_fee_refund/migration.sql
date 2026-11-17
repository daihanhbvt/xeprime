-- ADR 0091 điều 3 và 7 (16/11/2026) — phí thu hộ bảo hiểm của nền tảng + tự hoàn khi quá giờ trả mà
-- hợp đồng chưa cấp được.
--
-- Mọi cột mới DEFAULT 0 / false / NULL: hold, hợp đồng và sản phẩm cũ giữ nguyên nghĩa (không có phí
-- thu hộ, chưa hoàn), nên các ràng buộc tổng dựng lại dưới đây đúng với mọi dòng đang có.

-- ── 1. Cấu hình trên sản phẩm bảo hiểm ───────────────────────────────────────────────────────
ALTER TABLE "public"."insurance_products"
    ADD COLUMN "service_fee_enabled" BOOLEAN       NOT NULL DEFAULT false,
    ADD COLUMN "service_fee_percent" NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE "public"."insurance_products"
    ADD CONSTRAINT "insurance_products_service_fee_percent_check"
        CHECK ("service_fee_percent" >= 0 AND "service_fee_percent" <= 50),
    -- Chỉ bảo hiểm vật chất xe mới có phí thu hộ; bật mà % = 0 là một công tắc không làm gì.
    ADD CONSTRAINT "insurance_products_service_fee_scope_check"
        CHECK (
            NOT "service_fee_enabled"
            OR ("kind" = 'vehicle_trip' AND "service_fee_percent" > 0)
        );

-- ── 2. Cột riêng trên khoản giữ chỗ (ADR 0033 điều 4: tách quỹ đọc từ cột) ─────────────────────
ALTER TABLE "public"."booking_holds"
    ADD COLUMN "insurance_service_fee_amount" NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_money_lines_non_negative_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_money_lines_non_negative_check"
    CHECK (
        "deposit_amount" >= 0
    AND "service_fee_amount" >= 0
    AND "vehicle_insurance_amount" >= 0
    AND "personal_insurance_amount" >= 0
    AND "insurance_service_fee_amount" >= 0
    );

-- Tổng các dòng trừ tài trợ = tiền mặt của hold, nay gồm phí thu hộ `X`.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_money_lines_sum_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_money_lines_sum_check"
    CHECK (
        "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
      + "vehicle_insurance_amount" + "personal_insurance_amount"
      + "insurance_service_fee_amount"
      - "promo_discount_amount" = "amount"
    );

-- `booking_holds_promo_within_sponsorable_check` giữ nguyên: mã khuyến mãi KHÔNG trừ vào phí thu hộ
-- (trần tài trợ vẫn `D + S + H`).

ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_settled_allocation_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_settled_allocation_check"
    CHECK (
        "outcome" IS NULL
        OR "outcome" NOT IN ('refunded', 'split_late_cancel', 'settled')
        OR "paid_amount" = 0
        OR (
            "settled_customer_amount" + "settled_owner_amount" + "settled_platform_amount"
          + "settled_insurer_amount"  + "settled_tax_amount"
          = "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
          + "vehicle_insurance_amount" + "personal_insurance_amount"
          + "insurance_service_fee_amount"
          - "promo_discount_amount"
        )
    );

-- Kết cục LEGACY chỉ hợp lệ khi MỌI dòng tiền đều 0 — cùng khuôn NOT VALID + VALIDATE có điều kiện.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_legacy_outcome_without_lines_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_legacy_outcome_without_lines_check" CHECK (
        "outcome" IS NULL
        OR "outcome" NOT IN ('kept', 'forfeited', 'released_to_shop')
        OR (
            "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
          + "vehicle_insurance_amount" + "personal_insurance_amount"
          + "insurance_service_fee_amount"
        ) = 0
    ) NOT VALID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "public"."booking_holds"
         WHERE "outcome" IN ('kept', 'forfeited', 'released_to_shop')
           AND (
                "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
              + "vehicle_insurance_amount" + "personal_insurance_amount"
              + "insurance_service_fee_amount"
           ) > 0
    ) THEN
        ALTER TABLE "public"."booking_holds" VALIDATE CONSTRAINT "booking_holds_legacy_outcome_without_lines_check";
    ELSE
        RAISE NOTICE 'booking_holds_legacy_outcome_without_lines_check: còn dòng cũ vi phạm — ràng buộc canh lượt ghi mới, CHƯA validate toàn bảng';
    END IF;
END $$;

-- ── 3. Hợp đồng: phí thu hộ đã thu + mốc tự hoàn ─────────────────────────────────────────────
ALTER TABLE "public"."booking_insurance_policies"
    ADD COLUMN "service_fee_amount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "refunded_at"        TIMESTAMPTZ(3);
ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_service_fee_check"
        CHECK ("service_fee_amount" >= 0),
    -- Chỉ hợp đồng đã huỷ mới có mốc hoàn — không có đường nào hoàn một hợp đồng còn hiệu lực.
    ADD CONSTRAINT "booking_insurance_policies_refunded_check"
        CHECK ("refunded_at" IS NULL OR "status" = 'cancelled');

-- Vòng tự hoàn quét hợp đồng còn chờ cấp — dùng lại index báo khẩn (cùng điều kiện trạng thái).

-- ── 4. Sổ ví: một loại bút toán + một nguồn mới ──────────────────────────────────────────────
ALTER TABLE "public"."wallet_entries" DROP CONSTRAINT "wallet_entries_kind_check";
ALTER TABLE "public"."wallet_entries" ADD CONSTRAINT "wallet_entries_kind_check"
    CHECK ("kind" IN (
        'hold_forfeit', 'hold_release', 'hold_refund', 'hold_overpay', 'withdrawal',
        'withdrawal_reversal', 'adjustment', 'extension_release', 'extension_refund',
        'late_payment_refund', 'subscription_overpay', 'insurance_refund'
    ));
ALTER TABLE "public"."wallet_entries" DROP CONSTRAINT "wallet_entries_source_type_check";
ALTER TABLE "public"."wallet_entries" ADD CONSTRAINT "wallet_entries_source_type_check"
    CHECK ("source_type" IN (
        'booking_hold', 'withdrawal_request', 'manual', 'booking_extension', 'bank_transaction',
        'booking_insurance_policy'
    ));
