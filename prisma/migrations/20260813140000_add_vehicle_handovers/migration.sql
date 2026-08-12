-- Wave 7 — Bàn giao xe & đồng bộ KM (docs/design/12 §9.1, design-briefs/05).
--
-- 1. `vehicle_handovers`: biên bản giao xe / nhận xe trả, có vòng đời nháp → xác nhận.
-- 2. `vehicle_handover_photos`: ảnh hiện trạng theo góc chụp cố định, tái dùng
--    `vehicle_private_files` (purpose `handover_photo`).
--
-- Bất biến do DB giữ (không dựa kỷ luật service):
--   - biên bản trỏ về đơn CÙNG tenant VÀ CÙNG xe (composite FK → bookings(id, tenant_id, vehicle_id));
--   - mỗi đơn tối đa MỘT biên bản còn hiệu lực mỗi chiều → double-click/retry không nhân bản;
--   - đã xác nhận thì phải có mốc thời gian và người xác nhận;
--   - "thiếu KM" chỉ tồn tại khi thật sự KHÔNG có số — không thể vừa có KM vừa gắn cờ thiếu;
--   - xăng và pin loại trừ lẫn nhau; KM trong trần vận hành; % pin 0–100;
--   - mỗi góc chụp đúng MỘT ảnh, và ảnh phải cùng tenant + cùng xe với biên bản.

-- ── Kho file riêng tư nhận thêm mục đích ảnh bàn giao ───────────────────────
ALTER TABLE "vehicle_private_files" DROP CONSTRAINT "vpf_purpose_valid";
ALTER TABLE "vehicle_private_files"
    ADD CONSTRAINT "vpf_purpose_valid"
        CHECK ("purpose" IN ('source_contract', 'vehicle_document',
                             'maintenance_record', 'handover_photo'));

-- ── Mục tiêu cho composite FK "biên bản thuộc đúng đơn của đúng xe" ─────────
CREATE UNIQUE INDEX "bookings_id_tenant_id_vehicle_id_key"
    ON "bookings"("id", "tenant_id", "vehicle_id");

-- ── Biên bản bàn giao ──────────────────────────────────────────────────────
CREATE TABLE "vehicle_handovers" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "odometer_km" INTEGER,
    "odometer_reading_id" CHAR(26),
    "odometer_missing" BOOLEAN NOT NULL DEFAULT false,
    "suspicious_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "fuel_level" VARCHAR(20),
    "battery_percent" INTEGER,
    "condition_note" TEXT,
    "damage_note" TEXT,
    "notes" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by" CHAR(26),
    "canceled_at" TIMESTAMPTZ(3),
    "canceled_by" CHAR(26),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_handovers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vh_type_valid" CHECK ("type" IN ('pickup', 'return')),
    CONSTRAINT "vh_status_valid"
        CHECK ("status" IN ('draft', 'ready', 'confirmed', 'canceled')),
    -- Cùng trần KM với `vehicle_odometer_readings` (ODOMETER_MAX_KM) — số vào đây rồi mới ra đó.
    CONSTRAINT "vh_km_range"
        CHECK ("odometer_km" IS NULL OR ("odometer_km" >= 0 AND "odometer_km" <= 2000000)),
    CONSTRAINT "vh_battery_range"
        CHECK ("battery_percent" IS NULL
               OR ("battery_percent" >= 0 AND "battery_percent" <= 100)),
    -- Xe chạy xăng hay chạy điện, không có xe vừa khai cả hai.
    CONSTRAINT "vh_energy_exclusive"
        CHECK ("fuel_level" IS NULL OR "battery_percent" IS NULL),
    CONSTRAINT "vh_fuel_level_valid"
        CHECK ("fuel_level" IS NULL
               OR "fuel_level" IN ('full', 'three_quarter', 'half', 'quarter', 'empty')),
    -- Đã xác nhận thì luôn truy được AI xác nhận LÚC NÀO — đây là biên bản pháp lý nội bộ.
    CONSTRAINT "vh_confirmed_has_actor"
        CHECK ("status" <> 'confirmed'
               OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL)),
    -- Cờ "thiếu KM" và số KM không thể cùng tồn tại: task chỉ sinh ra khi THẬT SỰ không có số.
    CONSTRAINT "vh_missing_km_has_no_km"
        CHECK ("odometer_missing" = false OR "odometer_km" IS NULL),
    -- Bản nháp chưa xác nhận thì chưa thể sinh bản ghi lịch sử KM.
    CONSTRAINT "vh_reading_requires_confirmed"
        CHECK ("odometer_reading_id" IS NULL OR "status" = 'confirmed')
);

-- ── Ảnh hiện trạng ─────────────────────────────────────────────────────────
CREATE TABLE "vehicle_handover_photos" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "handover_id" CHAR(26) NOT NULL,
    "private_file_id" CHAR(26) NOT NULL,
    "slot" VARCHAR(20) NOT NULL,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_handover_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vhp_slot_valid"
        CHECK ("slot" IN ('front', 'rear', 'left', 'right', 'odometer'))
);

-- ── FK & bất biến chéo bảng ────────────────────────────────────────────────
-- Mục tiêu cho composite FK của bảng ảnh (biên bản + tenant + xe khớp nhau).
CREATE UNIQUE INDEX "vehicle_handovers_id_tenant_id_vehicle_id_key"
    ON "vehicle_handovers"("id", "tenant_id", "vehicle_id");

ALTER TABLE "vehicle_handovers"
    ADD CONSTRAINT "vehicle_handovers_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_handovers_booking_id_fkey"
        FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_handovers_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- Một FK chặn cùng lúc ba kiểu lệch: đơn của tenant khác, xe của tenant khác,
    -- và biên bản gắn xe KHÔNG PHẢI xe của đơn.
    ADD CONSTRAINT "vehicle_handovers_booking_owner_fkey"
        FOREIGN KEY ("booking_id", "tenant_id", "vehicle_id")
        REFERENCES "bookings"("id", "tenant_id", "vehicle_id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_handovers_vehicle_tenant_fkey"
        FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "vehicles"("id", "tenant_id")
        ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_handover_photos"
    ADD CONSTRAINT "vehicle_handover_photos_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_handover_photos_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_handover_photos_handover_id_fkey"
        FOREIGN KEY ("handover_id") REFERENCES "vehicle_handovers"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    -- Ảnh phải thuộc biên bản CỦA ĐÚNG tenant + ĐÚNG xe.
    ADD CONSTRAINT "vehicle_handover_photos_handover_owner_fkey"
        FOREIGN KEY ("handover_id", "tenant_id", "vehicle_id")
        REFERENCES "vehicle_handovers"("id", "tenant_id", "vehicle_id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_handover_photos_private_file_id_fkey"
        FOREIGN KEY ("private_file_id") REFERENCES "vehicle_private_files"("id")
        ON DELETE NO ACTION ON UPDATE CASCADE,
    -- File phải cùng tenant + cùng xe với biên bản (mục tiêu unique tạo ở Wave 5.1).
    ADD CONSTRAINT "vehicle_handover_photos_file_owner_fkey"
        FOREIGN KEY ("private_file_id", "tenant_id", "vehicle_id")
        REFERENCES "vehicle_private_files"("id", "tenant_id", "vehicle_id")
        ON DELETE NO ACTION ON UPDATE CASCADE;

-- ── Unique & index truy vấn ────────────────────────────────────────────────
-- Mỗi đơn tối đa MỘT biên bản còn hiệu lực cho mỗi chiều. Bản đã hủy không chặn lập lại,
-- nên partial. Đây là lớp chống trùng THẬT: hai request song song, một cái phải thua.
CREATE UNIQUE INDEX "vehicle_handovers_one_active_per_type_key"
    ON "vehicle_handovers"("booking_id", "type")
    WHERE "status" <> 'canceled';

-- Một file riêng tư chỉ là ảnh của MỘT biên bản.
CREATE UNIQUE INDEX "vehicle_handover_photos_private_file_id_key"
    ON "vehicle_handover_photos"("private_file_id");
-- Mỗi góc chụp đúng một ảnh — tải lại là THAY, không chồng thêm.
CREATE UNIQUE INDEX "vehicle_handover_photos_handover_id_slot_key"
    ON "vehicle_handover_photos"("handover_id", "slot");

CREATE INDEX "vehicle_handovers_tenant_id_booking_id_idx"
    ON "vehicle_handovers"("tenant_id", "booking_id");
-- Truy vết KM theo xe (tab Bảo dưỡng & KM đọc lần bàn giao gần nhất).
CREATE INDEX "vehicle_handovers_tenant_id_vehicle_id_confirmed_at_idx"
    ON "vehicle_handovers"("tenant_id", "vehicle_id", "confirmed_at");
-- Hàng đợi "Thiếu KM trả": partial nên chỉ số bằng đúng số việc tồn đọng, không phải cả bảng.
CREATE INDEX "vehicle_handovers_missing_odometer_idx"
    ON "vehicle_handovers"("tenant_id", "confirmed_at")
    WHERE "odometer_missing" = true;
CREATE INDEX "vehicle_handover_photos_tenant_id_handover_id_idx"
    ON "vehicle_handover_photos"("tenant_id", "handover_id");
