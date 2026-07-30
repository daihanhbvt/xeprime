-- ---------------------------------------------------------------------------
-- contracts (Phase 6 §11.7) — hợp đồng/phiếu thuê snapshot từ booking
--
-- snapshot_json đông cứng khách/xe/thời gian/bảng giá/cọc lúc lập (booking sửa sau không đổi HĐ
-- đã in). Idempotent: mỗi booking đúng 1 HĐ. Số HĐ cố định trong phạm vi shop.
-- ---------------------------------------------------------------------------

CREATE TABLE "contracts" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "contract_no" VARCHAR(100) NOT NULL,
    "template_version" VARCHAR(50) NOT NULL DEFAULT 'v1',
    "snapshot_json" JSONB NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "file_url" TEXT,
    "signed_at" TIMESTAMPTZ(3),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- Mỗi booking đúng một hợp đồng (idempotent khi tạo lại).
CREATE UNIQUE INDEX "contracts_booking_id_key" ON "contracts"("booking_id");
-- Số HĐ cố định, không trùng trong một shop.
CREATE UNIQUE INDEX "contracts_tenant_id_contract_no_key" ON "contracts"("tenant_id", "contract_no");
CREATE INDEX "contracts_tenant_id_created_at_idx" ON "contracts"("tenant_id", "created_at");

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
