-- Biên bản họp demo 19/11/2026 — việc #16 (ADR 0108) và #17/#18 (ADR 0109).
--
-- 1. Danh bạ tài xế NỘI BỘ của bên thuê (không tài khoản) + cột gán trên đơn, chống trùng lịch ở DB.
-- 2. Phụ phí theo dòng của đơn gian hàng tự lập — cột phẳng Σ phụ phí (từng dòng nằm trong snapshot giá).
-- 3. Tài sản thế chấp ghi theo từng đơn.
--
-- Chỉ THÊM bảng/cột — dữ liệu đang có giữ nguyên, `extra_charges_amount` mặc định 0 nên tổng của mọi
-- đơn cũ không đổi.

-- ── 1. Danh bạ tài xế nội bộ ─────────────────────────────────────────────────────────────────────
CREATE TABLE "tenant_internal_drivers" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    -- Di động VN dạng lưu `0xxxxxxxxx` (ADR 0082, `@PhoneInput()`), cùng dạng mọi cột SĐT khác.
    "phone" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_internal_drivers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_internal_drivers_name_length_check"
      CHECK (char_length(btrim("name")) BETWEEN 2 AND 120),
    CONSTRAINT "tenant_internal_drivers_phone_format_check" CHECK ("phone" ~ '^0[0-9]{9}$')
);

-- Mục tiêu cho FK tổ hợp từ `bookings` — DB chặn gán tài xế của bên thuê khác.
CREATE UNIQUE INDEX "tenant_internal_drivers_id_tenant_id_key"
  ON "tenant_internal_drivers"("id", "tenant_id");
-- Một SĐT một dòng ĐANG DÙNG trong một bên thuê; dòng đã lưu trữ không giữ chỗ SĐT.
CREATE UNIQUE INDEX "tenant_internal_drivers_tenant_phone_active_key"
  ON "tenant_internal_drivers"("tenant_id", "phone") WHERE "archived_at" IS NULL;
-- Danh sách của bên thuê: lọc đang dùng / đã lưu trữ, sắp theo tên.
CREATE INDEX "tenant_internal_drivers_tenant_id_archived_at_name_idx"
  ON "tenant_internal_drivers"("tenant_id", "archived_at", "name");

ALTER TABLE "tenant_internal_drivers"
  ADD CONSTRAINT "tenant_internal_drivers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_internal_drivers"
  ADD CONSTRAINT "tenant_internal_drivers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Gán vào đơn ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "bookings" ADD COLUMN "internal_driver_id" CHAR(26);

-- NO ACTION: dòng danh bạ đã gán vào đơn không xoá cứng được (giao diện chỉ lưu trữ).
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_internal_driver_fkey"
  FOREIGN KEY ("internal_driver_id", "tenant_id")
  REFERENCES "tenant_internal_drivers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Gán từ danh bạ ⇒ tên + SĐT đã CHỤP lên hai cột tài xế ngoài hệ thống (ADR 0108 điều 2). Các CHECK
-- sẵn có (loại trừ `driver_id`, chỉ `with_driver`, có mốc gán) tự phủ cột mới qua hai cột ảnh chụp.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_internal_driver_snapshot_check"
    CHECK ("internal_driver_id" IS NULL
        OR ("external_driver_name" IS NOT NULL AND "external_driver_phone" IS NOT NULL));

-- Chống trùng lịch theo tài xế NỘI BỘ — cùng khuôn `bookings_driver_user_schedule_excl` (ADR 0063).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_internal_driver_schedule_excl"
    EXCLUDE USING gist ("internal_driver_id" WITH =, tstzrange("pickup_at", "return_at") WITH &&)
    WHERE ("internal_driver_id" IS NOT NULL AND "status" IN ('reserved', 'active') AND "deleted_at" IS NULL);

-- Tab "Chuyến" của một tài xế nội bộ — lọc theo người, sắp theo giờ nhận.
CREATE INDEX "bookings_internal_driver_id_pickup_at_idx"
  ON "bookings"("internal_driver_id", "pickup_at") WHERE "internal_driver_id" IS NOT NULL;

-- ── 2. Phụ phí theo dòng (đơn tự lập) ────────────────────────────────────────────────────────────
ALTER TABLE "bookings" ADD COLUMN "extra_charges_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_extra_charges_amount_check"
    CHECK ("extra_charges_amount" >= 0);

-- ── 3. Tài sản thế chấp theo đơn ─────────────────────────────────────────────────────────────────
CREATE TABLE "booking_collaterals" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    -- @xeprime/types → BookingCollateralType
    "collateral_type" VARCHAR(30) NOT NULL,
    "description" VARCHAR(255),
    "returned_at" TIMESTAMPTZ(3),
    "returned_by" CHAR(26),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_collaterals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_collaterals_type_check" CHECK ("collateral_type" IN
      ('citizen_id', 'driver_licence', 'passport', 'motorbike', 'vehicle_registration', 'other')),
    -- "Khác" không có nghĩa gì nếu không nói là món gì.
    CONSTRAINT "booking_collaterals_other_description_check"
      CHECK ("collateral_type" <> 'other' OR char_length(btrim(coalesce("description", ''))) > 0),
    -- Đã trả ⇔ có người trả (người đó có thể đã bị xoá ⇒ SET NULL, nên chỉ chiều mốc → người khi ghi).
    CONSTRAINT "booking_collaterals_returned_check"
      CHECK ("returned_at" IS NOT NULL OR "returned_by" IS NULL)
);

CREATE INDEX "booking_collaterals_booking_id_created_at_idx"
  ON "booking_collaterals"("booking_id", "created_at");
-- "Đang giữ tài sản gì" của cả gian hàng — chỉ những món chưa trả.
CREATE INDEX "booking_collaterals_tenant_id_held_idx"
  ON "booking_collaterals"("tenant_id", "created_at") WHERE "returned_at" IS NULL;

ALTER TABLE "booking_collaterals"
  ADD CONSTRAINT "booking_collaterals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_collaterals"
  ADD CONSTRAINT "booking_collaterals_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_collaterals"
  ADD CONSTRAINT "booking_collaterals_returned_by_fkey"
  FOREIGN KEY ("returned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking_collaterals"
  ADD CONSTRAINT "booking_collaterals_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
