-- ---------------------------------------------------------------------------
-- payments (Phase 6, database_design §12.4)
--
-- Bản ghi thanh toán gắn đơn — bookkeeping thủ công (XePrime không trung gian thu tiền).
-- PaymentsService là writer duy nhất của bookings.paid_amount (increment/decrement trong tx).
-- Không có bảng debts (công nợ tính động = total - paid).
-- ---------------------------------------------------------------------------

CREATE TABLE "payments" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "booking_id" CHAR(26),
    "subscription_id" CHAR(26),
    "receipt_id" CHAR(26),
    "payer_user_id" CHAR(26),
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "method" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'succeeded',
    "provider" VARCHAR(50),
    "provider_transaction_id" VARCHAR(255),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "payments_tenant_id_booking_id_idx" ON "payments"("tenant_id", "booking_id");
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
