-- Đa dịch vụ + tài xế (plan docs/plans/kind-noodling-marble.md, chốt 17/08).
--
-- Dịch vụ của XE thành MẢNG năng lực (`service_types`): một xe đăng nhiều dịch vụ đồng thời,
-- 'both' biến mất khỏi mô hình (nó là tổ hợp, không phải giá trị). Chuyến đi (`bookings`) và
-- yêu cầu đặt (`booking_requests`) vẫn thuộc ĐÚNG MỘT dịch vụ — cột đơn + CHECK 3 giá trị.
-- Dự án chưa production: backfill rồi DROP thẳng cột cũ, không cần expand/contract.

-- ===== 1. vehicles: service_type (đơn) -> service_types (mảng) + 2 giá tham chiếu =====
ALTER TABLE "vehicles"
    ADD COLUMN "service_types" VARCHAR(50)[] NOT NULL DEFAULT ARRAY['self_drive']::VARCHAR(50)[],
    ADD COLUMN "monthly_price" DECIMAL(14,2),
    ADD COLUMN "with_driver_daily_price" DECIMAL(14,2);

UPDATE "vehicles"
SET "service_types" = CASE
    WHEN "service_type" = 'both' THEN ARRAY['self_drive', 'with_driver']::VARCHAR(50)[]
    ELSE ARRAY["service_type"]::VARCHAR(50)[]
END;

-- ADR 0005: bộ giá trị thật giữ bằng CHECK — mảng là TẬP CON của 3 dịch vụ và không rỗng.
-- (CHECK không chặn phần tử trùng — DTO @ArrayUnique + canonicalize ở service lo việc đó.)
ALTER TABLE "vehicles"
    ADD CONSTRAINT "vehicles_service_types_subset_check"
        CHECK ("service_types" <@ ARRAY['self_drive', 'with_driver', 'long_term']::VARCHAR(50)[]),
    ADD CONSTRAINT "vehicles_service_types_not_empty_check"
        CHECK (cardinality("service_types") >= 1),
    ADD CONSTRAINT "vehicles_monthly_price_non_negative_check"
        CHECK ("monthly_price" IS NULL OR "monthly_price" >= 0),
    ADD CONSTRAINT "vehicles_with_driver_daily_price_non_negative_check"
        CHECK ("with_driver_daily_price" IS NULL OR "with_driver_daily_price" >= 0);

-- Index (vehicle_type, service_type) không dùng được với mảng: tách btree vehicle_type (màn
-- admin lọc loại xe xuyên tenant) + GIN cho lọc "phục vụ được dịch vụ X" (`has`).
DROP INDEX "vehicles_vehicle_type_service_type_idx";
ALTER TABLE "vehicles" DROP COLUMN "service_type";

CREATE INDEX "vehicles_vehicle_type_idx" ON "vehicles"("vehicle_type");
CREATE INDEX "vehicles_service_types_idx" ON "vehicles" USING GIN ("service_types");

-- ===== 2. public_listings: mirror snapshot (ADR 0008 — chỉ ListingsService ghi) =====
ALTER TABLE "public_listings"
    ADD COLUMN "service_types" VARCHAR(50)[] NOT NULL DEFAULT ARRAY['self_drive']::VARCHAR(50)[],
    ADD COLUMN "monthly_price" DECIMAL(14,2),
    ADD COLUMN "with_driver_daily_price" DECIMAL(14,2);

UPDATE "public_listings"
SET "service_types" = CASE
    WHEN "service_type" = 'both' THEN ARRAY['self_drive', 'with_driver']::VARCHAR(50)[]
    ELSE ARRAY["service_type"]::VARCHAR(50)[]
END;

-- Đồng bộ luôn 2 giá tham chiếu từ xe gốc — snapshot không chờ lần sync kế tiếp.
UPDATE "public_listings" pl
SET "monthly_price" = v."monthly_price",
    "with_driver_daily_price" = v."with_driver_daily_price"
FROM "vehicles" v
WHERE v."id" = pl."vehicle_id";

ALTER TABLE "public_listings"
    ADD CONSTRAINT "public_listings_service_types_subset_check"
        CHECK ("service_types" <@ ARRAY['self_drive', 'with_driver', 'long_term']::VARCHAR(50)[]),
    ADD CONSTRAINT "public_listings_service_types_not_empty_check"
        CHECK (cardinality("service_types") >= 1);

-- (status, vehicle_type, service_type) tách thành (status, vehicle_type) + GIN(service_types)
-- — planner BitmapAnd hai index khi lọc cả hai chiều (tiền lệ: `features` String[] + GIN).
DROP INDEX "public_listings_status_vehicle_type_service_type_idx";
ALTER TABLE "public_listings" DROP COLUMN "service_type";

CREATE INDEX "public_listings_status_vehicle_type_idx"
    ON "public_listings"("status", "vehicle_type");
CREATE INDEX "public_listings_service_types_idx"
    ON "public_listings" USING GIN ("service_types");

-- ===== 3. bookings: giữ cột ĐƠN, loại 'both' khỏi phạm vi hợp lệ =====
-- init chưa có CHECK nào cho service_type — thêm mới. Normalize dữ liệu dev cũ TRƯỚC khi siết.
UPDATE "bookings" SET "service_type" = 'self_drive' WHERE "service_type" = 'both';

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_service_type_check"
        CHECK ("service_type" IN ('self_drive', 'with_driver', 'long_term'));

-- ===== 4. booking_requests: dịch vụ của yêu cầu + ngữ cảnh xe có tài xế =====
ALTER TABLE "booking_requests"
    ADD COLUMN "service_type" VARCHAR(50) NOT NULL DEFAULT 'self_drive',
    ADD COLUMN "route_type" VARCHAR(30),
    ADD COLUMN "pickup_address" TEXT,
    ADD COLUMN "destination" TEXT;

ALTER TABLE "booking_requests"
    ADD CONSTRAINT "booking_requests_service_type_check"
        CHECK ("service_type" IN ('self_drive', 'with_driver', 'long_term')),
    ADD CONSTRAINT "booking_requests_route_type_check"
        CHECK ("route_type" IS NULL OR "route_type" IN ('in_city', 'inter_city', 'inter_city_one_way')),
    -- Lộ trình là ngữ cảnh CÓ TÀI XẾ — không gắn được vào yêu cầu tự lái/dài hạn.
    ADD CONSTRAINT "booking_requests_route_type_service_check"
        CHECK ("route_type" IS NULL OR "service_type" = 'with_driver');

-- ===== 5. drivers + gán tài xế vào đơn =====
CREATE TABLE "drivers" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "driver_type" VARCHAR(30) NOT NULL DEFAULT 'staff',
    "license_no" VARCHAR(50),
    "id_no" VARCHAR(50),
    "note" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "drivers_driver_type_check"
        CHECK ("driver_type" IN ('staff', 'collaborator', 'temporary')),
    CONSTRAINT "drivers_status_check"
        CHECK ("status" IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX "drivers_id_tenant_id_key" ON "drivers"("id", "tenant_id");
CREATE INDEX "drivers_tenant_id_status_idx" ON "drivers"("tenant_id", "status");
CREATE INDEX "drivers_tenant_id_deleted_at_idx" ON "drivers"("tenant_id", "deleted_at");

ALTER TABLE "drivers"
    ADD CONSTRAINT "drivers_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Composite FK (driver_id, tenant_id) — DB tự chặn gán tài xế của gian hàng khác (cùng cơ chế
-- vehicles.branch). NoAction: xoá cứng tài xế còn đơn tham chiếu bị chặn; xoá tenant vẫn
-- cascade trọn bộ vì NoAction kiểm ở cuối câu lệnh.
ALTER TABLE "bookings" ADD COLUMN "driver_id" CHAR(26);
ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_driver_id_tenant_id_fkey"
        FOREIGN KEY ("driver_id", "tenant_id") REFERENCES "drivers"("id", "tenant_id")
        ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "bookings_driver_id_idx" ON "bookings"("driver_id");
