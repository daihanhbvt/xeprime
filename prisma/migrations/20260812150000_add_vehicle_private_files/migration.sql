-- Wave 4.1 — Vehicle Source Finance Security Closure.
--
-- 1. `vehicle_private_files`: sổ metadata do SERVER sở hữu cho tài liệu riêng tư gắn với xe
--    (hợp đồng nguồn xe; Wave 5 tái dùng cho giấy tờ). Nhị phân ở bucket R2 RIÊNG TƯ —
--    client không bao giờ nộp URL/object key.
-- 2. UNIQUE (id, tenant_id) trên `vehicles` + composite FK từ hai bảng con nhạy cảm:
--    DB tự chặn bản ghi "tenant A trỏ xe của tenant B" — không dựa vào kỷ luật service
--    (Prisma không mô tả được một cột trong hai quan hệ nên FK viết tay ở đây).

-- ── Mục tiêu composite FK ───────────────────────────────────────────────────
CREATE UNIQUE INDEX "vehicles_id_tenant_id_key" ON "vehicles"("id", "tenant_id");

-- ── Sổ tài liệu riêng tư ────────────────────────────────────────────────────
CREATE TABLE "vehicle_private_files" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_private_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vpf_purpose_valid" CHECK ("purpose" IN ('source_contract')),
    CONSTRAINT "vpf_status_valid" CHECK ("status" IN ('pending', 'ready', 'deleted')),
    -- Trần 10MB khớp DOCUMENT_UPLOAD_MAX_BYTES — DB là chốt cuối, không chỉ DTO.
    CONSTRAINT "vpf_size_range" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
    CONSTRAINT "vpf_mime_valid"
        CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);

ALTER TABLE "vehicle_private_files"
    ADD CONSTRAINT "vehicle_private_files_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_private_files_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Bất biến tenant↔xe: cặp (vehicle_id, tenant_id) phải là một xe THẬT của đúng tenant đó.
    ADD CONSTRAINT "vehicle_private_files_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "vehicle_private_files_object_key_key" ON "vehicle_private_files"("object_key");

-- Đọc theo hồ sơ: file của một xe theo mục đích + trạng thái (attach/list/verify).
CREATE INDEX "vehicle_private_files_tenant_id_vehicle_id_purpose_status_idx"
    ON "vehicle_private_files"("tenant_id", "vehicle_id", "purpose", "status");

-- ── Siết bảng hồ sơ nguồn hiện có cùng bất biến tenant↔xe ──────────────────
ALTER TABLE "vehicle_source_details"
    ADD CONSTRAINT "vehicle_source_details_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;
