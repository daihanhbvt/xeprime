-- ═══════════════════════════════════════════════════════════════════════════
-- Thời gian chết MẶC ĐỊNH của gian hàng theo loại xe (06/11/2026).
--
-- 1. `tenant_operation_defaults` — một dòng cho mỗi (gian hàng, loại xe). Trang "Chính sách thuê"
--    của gian hàng đặt số phút chuẩn bị giữa hai chuyến cho cả loại xe. Writer DUY NHẤT:
--    `VehicleSettingsService`.
-- 2. `vehicle_operation_settings.turnaround_buffer_minutes` thành NULLABLE: NULL = xe theo mặc định
--    gian hàng. Dòng đang có giữ nguyên số của nó — mỗi dòng sinh ra từ một lượt LƯU tay của chủ xe
--    (không có seed/đường nào tạo sẵn), nên đó là lựa chọn riêng của xe, kể cả số 0. Không backfill.
--
-- Như mọi thay đổi thời gian chết: chỉ áp cho lịch giữ MỚI / lịch được dời (ADR 0006), occupancy đã
-- có không bị tính lại.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Mặc định gian hàng ─────────────────────────────────────────────────────
CREATE TABLE "public"."tenant_operation_defaults" (
    "id"                        CHAR(26)       NOT NULL,
    "tenant_id"                 CHAR(26)       NOT NULL,
    "vehicle_type"              VARCHAR(50)    NOT NULL,
    "turnaround_buffer_minutes" INTEGER        NOT NULL,
    "updated_by"                CHAR(26),
    "created_at"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_operation_defaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_operation_defaults_tenant_id_vehicle_type_key"
    ON "public"."tenant_operation_defaults"("tenant_id", "vehicle_type");

ALTER TABLE "public"."tenant_operation_defaults"
    ADD CONSTRAINT "tenant_operation_defaults_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."tenant_operation_defaults"
    ADD CONSTRAINT "tenant_operation_defaults_vehicle_type_check"
    CHECK ("vehicle_type" IN ('car', 'motorbike'));

ALTER TABLE "public"."tenant_operation_defaults"
    ADD CONSTRAINT "tenant_operation_defaults_buffer_check"
    CHECK ("turnaround_buffer_minutes" >= 0 AND "turnaround_buffer_minutes" <= 1440);

-- ── 2. Xe theo mặc định gian hàng ─────────────────────────────────────────────
-- CHECK `vehicle_operation_settings_buffer_check` giữ nguyên: NULL qua được CHECK, số vẫn trong dải.
ALTER TABLE "public"."vehicle_operation_settings"
    ALTER COLUMN "turnaround_buffer_minutes" DROP NOT NULL,
    ALTER COLUMN "turnaround_buffer_minutes" DROP DEFAULT;
