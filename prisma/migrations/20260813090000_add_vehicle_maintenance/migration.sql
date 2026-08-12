-- Wave 6 — Bảo dưỡng & KM (docs/design/12 §9).
--
-- 1. `vehicle_maintenance_profiles`: KM hiện tại + cấu hình chu kỳ, 1:1 với xe.
-- 2. `vehicle_odometer_readings`: lịch sử KM CHỈ-THÊM — nguồn sự thật của odometer.
-- 3. `vehicle_maintenance_records`: phiếu bảo dưỡng; lịch còn hiệu lực giữ chỗ trên
--    `vehicle_occupancies` (source_type='maintenance') nên đặt xe trùng bị DB chặn (ADR 0006).
-- 4. `vehicle_maintenance_attachments`: chứng từ riêng tư, tái dùng `vehicle_private_files`.
--
-- Bất biến do DB giữ (không dựa kỷ luật service):
--   - tenant↔xe khớp ở MỌI bảng (composite FK → vehicles(id, tenant_id) — cùng cơ chế Wave 4.1/5.1);
--   - KM không âm và trong trần vận hành; chu kỳ dương;
--   - chỉnh tay BẮT BUỘC có lý do;
--   - loại/trạng thái hợp lệ; `custom_type_name` chỉ cho loại `other`;
--   - lịch có mốc bắt đầu trước mốc kết thúc;
--   - một file riêng tư chỉ đính vào MỘT phiếu, và phải cùng tenant+xe với phiếu.

-- ── Kho file riêng tư nhận thêm mục đích chứng từ bảo dưỡng ─────────────────
ALTER TABLE "vehicle_private_files" DROP CONSTRAINT "vpf_purpose_valid";
ALTER TABLE "vehicle_private_files"
    ADD CONSTRAINT "vpf_purpose_valid"
        CHECK ("purpose" IN ('source_contract', 'vehicle_document', 'maintenance_record'));

-- ── Hồ sơ bảo dưỡng & KM ────────────────────────────────────────────────────
CREATE TABLE "vehicle_maintenance_profiles" (
    "vehicle_id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "current_odometer_km" INTEGER,
    "current_odometer_source" VARCHAR(30),
    "current_odometer_at" TIMESTAMPTZ(3),
    "current_odometer_reading_id" CHAR(26),
    "oil_change_interval_km" INTEGER,
    "last_service_km" INTEGER,
    "last_service_at" DATE,
    "notes" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_maintenance_profiles_pkey" PRIMARY KEY ("vehicle_id"),
    -- KM âm là dữ liệu hỏng; trần 2 triệu km chặn lỗi gõ thừa số 0 (ODOMETER_MAX_KM).
    CONSTRAINT "vmp_current_km_range"
        CHECK ("current_odometer_km" IS NULL
               OR ("current_odometer_km" >= 0 AND "current_odometer_km" <= 2000000)),
    CONSTRAINT "vmp_last_service_km_range"
        CHECK ("last_service_km" IS NULL
               OR ("last_service_km" >= 0 AND "last_service_km" <= 2000000)),
    -- Chu kỳ 0 làm mốc tiếp theo vô nghĩa (luôn quá hạn) — chặn từ DB.
    CONSTRAINT "vmp_interval_range"
        CHECK ("oil_change_interval_km" IS NULL
               OR ("oil_change_interval_km" > 0 AND "oil_change_interval_km" <= 1000000)),
    CONSTRAINT "vmp_source_valid"
        CHECK ("current_odometer_source" IS NULL
               OR "current_odometer_source" IN ('manual_correction', 'maintenance',
                                                'booking_pickup', 'booking_return', 'import'))
);

-- ── Lịch sử KM (chỉ-thêm) ───────────────────────────────────────────────────
CREATE TABLE "vehicle_odometer_readings" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "previous_km" INTEGER,
    "source" VARCHAR(30) NOT NULL,
    "source_ref_id" CHAR(26),
    "reason_code" VARCHAR(40),
    "reason" TEXT,
    "is_decrease" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_odometer_readings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vor_km_range" CHECK ("odometer_km" >= 0 AND "odometer_km" <= 2000000),
    CONSTRAINT "vor_previous_km_range"
        CHECK ("previous_km" IS NULL OR ("previous_km" >= 0 AND "previous_km" <= 2000000)),
    CONSTRAINT "vor_source_valid"
        CHECK ("source" IN ('manual_correction', 'maintenance',
                            'booking_pickup', 'booking_return', 'import')),
    -- Chỉnh tay KHÔNG có lý do là điều không được phép tồn tại, kể cả khi app có bug.
    CONSTRAINT "vor_manual_requires_reason"
        CHECK ("source" <> 'manual_correction'
               OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0))
);

-- ── Phiếu bảo dưỡng ─────────────────────────────────────────────────────────
CREATE TABLE "vehicle_maintenance_records" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "custom_type_name" VARCHAR(160),
    "title" VARCHAR(255),
    "status" VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    "planned_start_at" TIMESTAMPTZ(3),
    "planned_end_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "odometer_km" INTEGER,
    "provider_name" VARCHAR(255),
    "cost" DECIMAL(14,2),
    "receipt_code" VARCHAR(100),
    "notes" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_maintenance_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vmr_type_valid"
        CHECK ("type" IN ('oil_change', 'periodic_service', 'repair', 'tire', 'battery', 'other')),
    CONSTRAINT "vmr_status_valid"
        CHECK ("status" IN ('scheduled', 'in_progress', 'completed', 'canceled')),
    CONSTRAINT "vmr_custom_name_scoped"
        CHECK ("type" = 'other' OR "custom_type_name" IS NULL),
    CONSTRAINT "vmr_planned_order"
        CHECK ("planned_start_at" IS NULL OR "planned_end_at" IS NULL
               OR "planned_end_at" > "planned_start_at"),
    CONSTRAINT "vmr_km_range"
        CHECK ("odometer_km" IS NULL OR ("odometer_km" >= 0 AND "odometer_km" <= 2000000)),
    CONSTRAINT "vmr_cost_non_negative" CHECK ("cost" IS NULL OR "cost" >= 0)
);

-- ── Chứng từ đính kèm ───────────────────────────────────────────────────────
CREATE TABLE "vehicle_maintenance_attachments" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "record_id" CHAR(26) NOT NULL,
    "private_file_id" CHAR(26) NOT NULL,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_maintenance_attachments_pkey" PRIMARY KEY ("id")
);

-- ── FK & bất biến chéo bảng ────────────────────────────────────────────────
-- Mục tiêu cho composite FK "chứng từ thuộc đúng phiếu của đúng xe".
CREATE UNIQUE INDEX "vehicle_maintenance_records_id_vehicle_id_key"
    ON "vehicle_maintenance_records"("id", "vehicle_id");

ALTER TABLE "vehicle_maintenance_profiles"
    ADD CONSTRAINT "vehicle_maintenance_profiles_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_profiles_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_profiles_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_odometer_readings"
    ADD CONSTRAINT "vehicle_odometer_readings_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_odometer_readings_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_odometer_readings_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_maintenance_records"
    ADD CONSTRAINT "vehicle_maintenance_records_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_records_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_records_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_maintenance_attachments"
    ADD CONSTRAINT "vehicle_maintenance_attachments_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_attachments_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_attachments_record_id_fkey"
        FOREIGN KEY ("record_id") REFERENCES "vehicle_maintenance_records"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- Chứng từ phải thuộc phiếu CỦA ĐÚNG XE — không đính chéo sang xe khác.
    ADD CONSTRAINT "vehicle_maintenance_attachments_record_vehicle_fkey"
        FOREIGN KEY ("record_id", "vehicle_id")
        REFERENCES "vehicle_maintenance_records"("id", "vehicle_id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_maintenance_attachments_private_file_id_fkey"
        FOREIGN KEY ("private_file_id") REFERENCES "vehicle_private_files"("id")
        ON DELETE NO ACTION ON UPDATE CASCADE,
    -- File phải cùng tenant + cùng xe với phiếu (mục tiêu unique tạo ở Wave 5.1).
    ADD CONSTRAINT "vehicle_maintenance_attachments_file_owner_fkey"
        FOREIGN KEY ("private_file_id", "tenant_id", "vehicle_id")
        REFERENCES "vehicle_private_files"("id", "tenant_id", "vehicle_id")
        ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── Unique & index truy vấn ────────────────────────────────────────────────
-- Một file riêng tư chỉ đính vào MỘT phiếu bảo dưỡng.
CREATE UNIQUE INDEX "vehicle_maintenance_attachments_private_file_id_key"
    ON "vehicle_maintenance_attachments"("private_file_id");

CREATE INDEX "vehicle_maintenance_profiles_tenant_id_current_odometer_km_idx"
    ON "vehicle_maintenance_profiles"("tenant_id", "current_odometer_km");
-- Lịch sử KM đọc theo xe, mới nhất trước.
CREATE INDEX "vehicle_odometer_readings_tenant_id_vehicle_id_recorded_at_idx"
    ON "vehicle_odometer_readings"("tenant_id", "vehicle_id", "recorded_at");
-- Trung tâm bảo dưỡng: lọc theo trạng thái + sắp xếp theo lịch dự kiến.
CREATE INDEX "vehicle_maintenance_records_tenant_id_status_planned_start_at_idx"
    ON "vehicle_maintenance_records"("tenant_id", "status", "planned_start_at");
-- Lịch sử theo xe, mới nhất trước.
CREATE INDEX "vehicle_maintenance_records_tenant_id_vehicle_id_completed_at_idx"
    ON "vehicle_maintenance_records"("tenant_id", "vehicle_id", "completed_at");
CREATE INDEX "vehicle_maintenance_attachments_tenant_id_record_id_idx"
    ON "vehicle_maintenance_attachments"("tenant_id", "record_id");
