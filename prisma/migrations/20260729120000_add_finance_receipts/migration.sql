-- ---------------------------------------------------------------------------
-- Tài chính Thu/Chi (Phase 6, database_design §12.1–12.3)
--
-- finance_categories (system dùng chung + tenant custom) · receipts (workflow duyệt) ·
-- receipt_attachments. CHECK constraint chốt type/status/amount ở DB (ADR 0005 phần bảng
-- ổn định), không chỉ dựa union TypeScript.
-- ---------------------------------------------------------------------------

-- finance_categories -------------------------------------------------------
CREATE TABLE "finance_categories" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "finance_categories_type_check" CHECK ("type" IN ('income', 'expense'))
);
CREATE INDEX "finance_categories_tenant_id_type_idx"
    ON "finance_categories"("tenant_id", "type");
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- receipts -----------------------------------------------------------------
CREATE TABLE "receipts" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "receipt_no" VARCHAR(100),
    "type" VARCHAR(20) NOT NULL,
    "category_id" CHAR(26),
    "booking_id" CHAR(26),
    "vehicle_id" CHAR(26),
    "tenant_customer_id" CHAR(26),
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL,
    "reference_code" VARCHAR(255),
    "description" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "requested_by" CHAR(26),
    "approved_by" CHAR(26),
    "approved_at" TIMESTAMPTZ(3),
    "cancelled_by" CHAR(26),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "receipts_type_check" CHECK ("type" IN ('income', 'expense')),
    CONSTRAINT "receipts_status_check"
        CHECK ("status" IN ('draft', 'pending_approval', 'approved', 'cancelled')),
    CONSTRAINT "receipts_amount_check" CHECK ("amount" >= 0)
);
CREATE INDEX "receipts_tenant_id_status_idx" ON "receipts"("tenant_id", "status");
CREATE INDEX "receipts_tenant_id_created_at_idx" ON "receipts"("tenant_id", "created_at");
CREATE INDEX "receipts_booking_id_idx" ON "receipts"("booking_id");
CREATE INDEX "receipts_category_id_idx" ON "receipts"("category_id");
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- receipt_attachments ------------------------------------------------------
CREATE TABLE "receipt_attachments" (
    "id" CHAR(26) NOT NULL,
    "receipt_id" CHAR(26) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" VARCHAR(50),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receipt_attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "receipt_attachments_receipt_id_idx" ON "receipt_attachments"("receipt_id");
ALTER TABLE "receipt_attachments" ADD CONSTRAINT "receipt_attachments_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
