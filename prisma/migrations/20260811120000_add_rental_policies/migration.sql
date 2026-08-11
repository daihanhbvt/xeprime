-- Wave 2 — B2 Pricing & Rental Policies.
--
-- 1. `rental_policies`: MỘT bảng cho cả mặc định gian hàng (vehicle_id NULL, duy nhất mỗi
--    tenant qua PARTIAL UNIQUE — Prisma không mô tả được nên viết tay) lẫn bản ghi đè theo xe
--    (unique vehicle_id). CHECK chốt các bất biến vô hướng ở DB; cấu trúc tiers (jsonb) hợp lệ
--    hoá ở DTO (skill database-change: constraint cho thứ không bao giờ được sai).
-- 2. `bookings.price_snapshot_json`: snapshot giá bất biến chốt lúc tạo đơn.
-- 3. `booking_requests`: khách yêu cầu giao tận nơi + báo giá giao nhận của shop.

CREATE TABLE "rental_policies" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26),
    "deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_max_radius_km" DECIMAL(6,1),
    "delivery_tiers_json" JSONB NOT NULL DEFAULT '[]',
    "overtime_fee_per_hour" DECIMAL(14,2),
    "overtime_grace_minutes" INTEGER,
    "overtime_rounding_minutes" INTEGER,
    "discount_enabled" BOOLEAN NOT NULL DEFAULT false,
    "discount_tiers_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rental_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_policies_deposit_nonnegative" CHECK ("deposit_amount" >= 0),
    CONSTRAINT "rental_policies_radius_positive"
        CHECK ("delivery_max_radius_km" IS NULL OR "delivery_max_radius_km" > 0),
    CONSTRAINT "rental_policies_overtime_fee_nonnegative"
        CHECK ("overtime_fee_per_hour" IS NULL OR "overtime_fee_per_hour" >= 0),
    CONSTRAINT "rental_policies_grace_nonnegative"
        CHECK ("overtime_grace_minutes" IS NULL OR "overtime_grace_minutes" >= 0),
    CONSTRAINT "rental_policies_rounding_positive"
        CHECK ("overtime_rounding_minutes" IS NULL OR "overtime_rounding_minutes" > 0)
);

ALTER TABLE "rental_policies"
    ADD CONSTRAINT "rental_policies_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "rental_policies_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Bản ghi đè: mỗi xe tối đa một row.
CREATE UNIQUE INDEX "rental_policies_vehicle_id_key" ON "rental_policies"("vehicle_id");

-- Mặc định gian hàng: mỗi tenant tối đa một row vehicle_id NULL — partial unique, hai request
-- cùng "tạo mặc định" chỉ một cái thắng, không cần app-level check.
CREATE UNIQUE INDEX "rental_policies_shop_default_key"
    ON "rental_policies"("tenant_id") WHERE "vehicle_id" IS NULL;

CREATE INDEX "rental_policies_tenant_id_idx" ON "rental_policies"("tenant_id");

-- Snapshot giá bất biến của đơn thuê — chỉ ghi lúc create, không UPDATE về sau.
ALTER TABLE "bookings" ADD COLUMN "price_snapshot_json" JSONB;

-- Yêu cầu đặt xe: giao tận nơi + báo giá giao nhận.
ALTER TABLE "booking_requests"
    ADD COLUMN "delivery_requested" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "delivery_address" TEXT,
    ADD COLUMN "delivery_quote_json" JSONB;

-- Hộp thư shop lọc "cần báo giá giao nhận" (đang chờ + có yêu cầu giao + chưa có báo giá):
-- partial index giữ hot-path nhỏ — phần lớn yêu cầu không cần báo giá thủ công.
CREATE INDEX "booking_requests_delivery_quote_pending_idx"
    ON "booking_requests"("tenant_id", "created_at")
    WHERE "delivery_requested" = true AND "delivery_quote_json" IS NULL;
