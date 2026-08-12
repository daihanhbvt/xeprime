-- Wave 5 — Giấy tờ xe & OCR (docs/design/12 §8).
--
-- 1. `vehicle_documents`: hồ sơ giấy tờ theo loại (đăng ký/đăng kiểm/bảo hiểm/khác).
--    Giấy tờ TUỲ CHỌN, hết hạn chỉ cảnh báo — không cột nào ảnh hưởng trạng thái xe.
-- 2. `vehicle_document_versions`: mỗi lần thay file là một version, lịch sử giữ đủ.
-- 3. `vehicle_document_ocr_jobs`: job OCR — kết quả là BẢN NHÁP chờ đối soát.
-- 4. Mở rộng purpose của kho file riêng tư Wave 4.1 cho giấy tờ.
--
-- Bất biến do DB giữ (không dựa kỷ luật service):
--   - tenant↔xe khớp (composite FK về vehicles(id, tenant_id) — cùng cơ chế Wave 4.1)
--   - version thuộc đúng giấy tờ + đúng xe; bản active thuộc đúng giấy tờ
--   - mỗi xe tối đa MỘT giấy tờ đang hoạt động cho mỗi loại chuẩn (partial unique;
--     loại `other` được nhiều bản ghi)
--   - loại giấy tờ/status hợp lệ; ngày hết hạn không trước ngày cấp

-- ── Kho file riêng tư nhận thêm mục đích giấy tờ ────────────────────────────
ALTER TABLE "vehicle_private_files" DROP CONSTRAINT "vpf_purpose_valid";
ALTER TABLE "vehicle_private_files"
    ADD CONSTRAINT "vpf_purpose_valid"
        CHECK ("purpose" IN ('source_contract', 'vehicle_document'));

-- ── Giấy tờ ─────────────────────────────────────────────────────────────────
CREATE TABLE "vehicle_documents" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "custom_type_name" VARCHAR(160),
    "document_number" VARCHAR(120),
    "holder_name" VARCHAR(160),
    "holder_address" VARCHAR(255),
    "plate_number" VARCHAR(50),
    "chassis_number" VARCHAR(80),
    "engine_number" VARCHAR(80),
    "issued_at" DATE,
    "expires_at" DATE,
    "notes" TEXT,
    "active_version_id" CHAR(26),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vdoc_type_valid"
        CHECK ("type" IN ('registration', 'inspection', 'insurance', 'other')),
    -- Tên tuỳ chỉnh chỉ dành cho loại `other`; loại chuẩn dùng nhãn hệ thống.
    CONSTRAINT "vdoc_custom_name_scoped"
        CHECK ("type" = 'other' OR "custom_type_name" IS NULL),
    CONSTRAINT "vdoc_date_order"
        CHECK ("issued_at" IS NULL OR "expires_at" IS NULL OR "expires_at" >= "issued_at")
);

-- ── Phiên bản file ──────────────────────────────────────────────────────────
CREATE TABLE "vehicle_document_versions" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "document_id" CHAR(26) NOT NULL,
    "private_file_id" CHAR(26) NOT NULL,
    "version" INTEGER NOT NULL,
    "uploaded_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_document_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vdocver_version_positive" CHECK ("version" > 0)
);

-- ── Job OCR ─────────────────────────────────────────────────────────────────
CREATE TABLE "vehicle_document_ocr_jobs" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "document_id" CHAR(26) NOT NULL,
    "document_version_id" CHAR(26) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'processing',
    "provider" VARCHAR(60) NOT NULL,
    "extracted_fields_json" JSONB NOT NULL DEFAULT '{}',
    "confidence" INTEGER,
    "error_code" VARCHAR(60),
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_document_ocr_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vdocr_status_valid"
        CHECK ("status" IN ('processing', 'needs_review', 'unreadable', 'failed', 'reviewed')),
    CONSTRAINT "vdocr_confidence_range"
        CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 100))
);

-- ── FK & bất biến chéo bảng ────────────────────────────────────────────────
-- Mục tiêu cho composite FK "version thuộc đúng giấy tờ" và "active version đúng giấy tờ".
CREATE UNIQUE INDEX "vehicle_documents_id_vehicle_id_key" ON "vehicle_documents"("id", "vehicle_id");
CREATE UNIQUE INDEX "vehicle_document_versions_id_document_id_key"
    ON "vehicle_document_versions"("id", "document_id");

ALTER TABLE "vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_documents_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_document_versions"
    ADD CONSTRAINT "vehicle_document_versions_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_versions_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_versions_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_versions_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "vehicle_documents"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- Version phải thuộc đúng XE của giấy tờ — không gắn chéo giấy tờ xe khác.
    ADD CONSTRAINT "vehicle_document_versions_document_vehicle_fkey"
        FOREIGN KEY ("document_id", "vehicle_id") REFERENCES "vehicle_documents"("id", "vehicle_id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_versions_private_file_id_fkey"
        FOREIGN KEY ("private_file_id") REFERENCES "vehicle_private_files"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bản active phải là một version CỦA CHÍNH giấy tờ đó.
ALTER TABLE "vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_active_version_fkey"
        FOREIGN KEY ("active_version_id", "id")
        REFERENCES "vehicle_document_versions"("id", "document_id")
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_document_ocr_jobs"
    ADD CONSTRAINT "vehicle_document_ocr_jobs_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_ocr_jobs_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_ocr_jobs_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_ocr_jobs_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "vehicle_documents"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_document_ocr_jobs_version_document_fkey"
        FOREIGN KEY ("document_version_id", "document_id")
        REFERENCES "vehicle_document_versions"("id", "document_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Unique & index truy vấn ────────────────────────────────────────────────
CREATE UNIQUE INDEX "vehicle_documents_active_version_id_key"
    ON "vehicle_documents"("active_version_id");

-- Mỗi xe tối đa MỘT giấy tờ đang hoạt động cho mỗi loại chuẩn; `other` nhiều bản ghi.
CREATE UNIQUE INDEX "vehicle_documents_one_active_per_type_key"
    ON "vehicle_documents"("vehicle_id", "type")
    WHERE "archived_at" IS NULL AND "type" <> 'other';

CREATE UNIQUE INDEX "vehicle_document_versions_document_id_version_key"
    ON "vehicle_document_versions"("document_id", "version");

CREATE INDEX "vehicle_documents_tenant_id_vehicle_id_type_idx"
    ON "vehicle_documents"("tenant_id", "vehicle_id", "type");
CREATE INDEX "vehicle_document_versions_tenant_id_vehicle_id_idx"
    ON "vehicle_document_versions"("tenant_id", "vehicle_id");
CREATE INDEX "vehicle_document_ocr_jobs_tenant_id_vehicle_id_document_id_created_at_idx"
    ON "vehicle_document_ocr_jobs"("tenant_id", "vehicle_id", "document_id", "created_at");
