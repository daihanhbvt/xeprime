-- ═══════════════════════════════════════════════════════════════════════════
-- ADR 0077 — PHỤ LỤC GIA HẠN đơn thuê dài hạn đang chạy.
--
-- Viết tay vì Prisma không diễn đạt được: FK tổ hợp (booking_id, tenant_id, vehicle_id), các
-- CHECK, và hai unique PARTIAL (một phụ lục đang chờ mỗi đơn · một nghĩa vụ thuế còn sống mỗi
-- phụ lục). `prisma migrate dev` sẽ đòi DROP những thứ này — áp bằng `db:deploy`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."booking_extensions" (
    "id"                        CHAR(26)       NOT NULL,
    "code"                      VARCHAR(20)    NOT NULL,
    "tenant_id"                 CHAR(26)       NOT NULL,
    "booking_id"                CHAR(26)       NOT NULL,
    "vehicle_id"                CHAR(26)       NOT NULL,
    "customer_user_id"          CHAR(26),
    "months"                    INTEGER        NOT NULL,
    "from_at"                   TIMESTAMPTZ(3) NOT NULL,
    "to_at"                     TIMESTAMPTZ(3) NOT NULL,
    "status"                    VARCHAR(20)    NOT NULL DEFAULT 'awaiting_payment',
    "billing_mode"              VARCHAR(20)    NOT NULL,
    "rental_amount"             DECIMAL(14,2)  NOT NULL,
    "tax_amount"                DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "deposit_amount"            DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "online_amount"             DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "pay_at_pickup_amount"      DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "paid_amount"               DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "fee_policy_id"             CHAR(26),
    "price_snapshot"            JSONB          NOT NULL,
    "expires_at"                TIMESTAMPTZ(3),
    "paid_at"                   TIMESTAMPTZ(3),
    "activated_at"              TIMESTAMPTZ(3),
    "closed_at"                 TIMESTAMPTZ(3),
    "settled_at"                TIMESTAMPTZ(3),
    "payment_reminded_at"       TIMESTAMPTZ(3),
    "final_payment_reminded_at" TIMESTAMPTZ(3),
    "created_by"                CHAR(26),
    "created_at"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_extensions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_extensions_code_key" ON "public"."booking_extensions" ("code");
CREATE INDEX "booking_extensions_booking_id_from_at_idx" ON "public"."booking_extensions" ("booking_id", "from_at");
CREATE INDEX "booking_extensions_tenant_id_created_at_idx" ON "public"."booking_extensions" ("tenant_id", "created_at");
CREATE INDEX "booking_extensions_customer_user_id_status_idx" ON "public"."booking_extensions" ("customer_user_id", "status");

-- Hàng đợi của worker (hết hạn + nhắc) — chỉ những phụ lục đang chờ tiền, phần nhỏ của bảng.
CREATE INDEX "booking_extensions_due_idx"
    ON "public"."booking_extensions" ("expires_at")
    WHERE "status" = 'awaiting_payment';

-- MỘT phụ lục đang chờ thanh toán mỗi đơn (ADR 0077 INV-06): hai người bấm "Gia hạn" cùng lúc
-- thì DB từ chối người thứ hai, không phải một câu SELECT rồi INSERT.
CREATE UNIQUE INDEX "booking_extensions_one_pending_key"
    ON "public"."booking_extensions" ("booking_id")
    WHERE "status" = 'awaiting_payment';

-- ── Khoá ngoại ──────────────────────────────────────────────────────────────
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_customer_user_id_fkey"
    FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_fee_policy_id_fkey"
    FOREIGN KEY ("fee_policy_id") REFERENCES "public"."fee_policies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
-- Phụ lục phải thuộc ĐÚNG đơn của CÙNG gian hàng và CÙNG xe — cùng khuôn `vehicle_handovers`.
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_booking_owner_fkey"
    FOREIGN KEY ("booking_id", "tenant_id", "vehicle_id")
    REFERENCES "public"."bookings"("id", "tenant_id", "vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Bất biến dữ liệu ────────────────────────────────────────────────────────
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_months_check"
    CHECK ("months" IN (1, 2, 3, 6, 9, 12));
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_range_check"
    CHECK ("to_at" > "from_at");
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_status_check"
    CHECK ("status" IN ('awaiting_payment', 'active', 'expired', 'cancelled'));
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_billing_mode_check"
    CHECK ("billing_mode" IN ('commission', 'package'));
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_amounts_check"
    CHECK (
        "rental_amount" > 0 AND "tax_amount" >= 0 AND "deposit_amount" >= 0
        AND "online_amount" >= 0 AND "pay_at_pickup_amount" >= 0 AND "paid_amount" >= 0
    );
-- Miễn phí nền tảng, không bảo hiểm (ADR 0077 điều 4): khách trả ĐÚNG tiền thuê, chia hai đường.
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_split_check"
    CHECK ("online_amount" + "pay_at_pickup_amount" = "rental_amount");
-- Khoản online chỉ là phần của chủ xe (D), và D luôn phủ được thuế — ví chủ xe không nhận số âm.
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_deposit_check"
    CHECK ("deposit_amount" = "online_amount" AND "deposit_amount" >= "tax_amount");
-- Trạng thái và mốc đi cùng nhau.
ALTER TABLE "public"."booking_extensions" ADD CONSTRAINT "booking_extensions_lifecycle_check"
    CHECK (
        ("status" <> 'awaiting_payment' OR ("expires_at" IS NOT NULL AND "activated_at" IS NULL))
        AND ("status" <> 'active' OR "activated_at" IS NOT NULL)
        AND ("status" NOT IN ('expired', 'cancelled') OR "closed_at" IS NOT NULL)
        AND ("settled_at" IS NULL OR "status" = 'active')
    );

-- ── Sổ thuế: một nghĩa vụ riêng cho mỗi phụ lục ─────────────────────────────
ALTER TABLE "public"."tax_withholdings" ADD COLUMN "booking_extension_id" CHAR(26);
ALTER TABLE "public"."tax_withholdings" ADD CONSTRAINT "tax_withholdings_booking_extension_id_fkey"
    FOREIGN KEY ("booking_extension_id") REFERENCES "public"."booking_extensions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- "Một nghĩa vụ còn sống mỗi đơn" nay chỉ nói về nghĩa vụ CỦA ĐƠN (phụ lục NULL); mỗi phụ lục có
-- chốt riêng — cùng ngữ nghĩa sửa-sai ba bước của migration 20260914170000.
DROP INDEX "public"."tax_withholdings_live_booking_key";
CREATE UNIQUE INDEX "tax_withholdings_live_booking_key"
    ON "public"."tax_withholdings" ("booking_id")
    WHERE "booking_extension_id" IS NULL AND "reversal_of_id" IS NULL AND "status" <> 'reversed';
CREATE UNIQUE INDEX "tax_withholdings_live_extension_key"
    ON "public"."tax_withholdings" ("booking_extension_id")
    WHERE "booking_extension_id" IS NOT NULL AND "reversal_of_id" IS NULL AND "status" <> 'reversed';

-- ── Ví điểm: hai loại bút toán + một nguồn mới ──────────────────────────────
ALTER TABLE "public"."wallet_entries" DROP CONSTRAINT "wallet_entries_kind_check";
ALTER TABLE "public"."wallet_entries" ADD CONSTRAINT "wallet_entries_kind_check"
    CHECK ("kind" IN (
        'hold_forfeit', 'hold_release', 'hold_refund', 'hold_overpay',
        'withdrawal', 'withdrawal_reversal', 'adjustment',
        'extension_release', 'extension_refund'
    ));
ALTER TABLE "public"."wallet_entries" DROP CONSTRAINT "wallet_entries_source_type_check";
ALTER TABLE "public"."wallet_entries" ADD CONSTRAINT "wallet_entries_source_type_check"
    CHECK ("source_type" IN ('booking_hold', 'withdrawal_request', 'manual', 'booking_extension'));

-- ── Đối soát ngân hàng: đích mới `booking_extension` (mã XPE…) ───────────────
ALTER TABLE "public"."bank_transactions" DROP CONSTRAINT IF EXISTS "bank_transactions_matched_type_check";
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_type_check"
    CHECK (
        "matched_type" IS NULL
        OR "matched_type" IN ('subscription_invoice', 'booking_hold', 'withdrawal_request', 'booking_extension')
    );
