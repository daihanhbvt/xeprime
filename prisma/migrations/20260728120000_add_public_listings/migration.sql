-- ---------------------------------------------------------------------------
-- public_listings (Phase 3, ADR 0008)
--
-- Snapshot public của xe đã duyệt để Marketplace query nhanh. Ghi qua DUY NHẤT
-- ListingsService.syncFromVehicle. Trạng thái tenant KHÔNG denormalize (ADR 0008 §3):
-- marketplace luôn join tenants lọc status='active'. Partial index cho hot path 'active'.
-- ---------------------------------------------------------------------------

CREATE TABLE "public_listings" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "shop_slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "vehicle_type" VARCHAR(50) NOT NULL,
    "service_type" VARCHAR(50) NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "seat_count" INTEGER,
    "fuel_type" VARCHAR(50),
    "province_name" VARCHAR(100),
    "main_image_url" TEXT,
    "weekday_price" DECIMAL(14,2),
    "weekend_price" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "public_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_listings_vehicle_id_key" ON "public_listings"("vehicle_id");
CREATE INDEX "public_listings_status_vehicle_type_service_type_idx"
    ON "public_listings"("status", "vehicle_type", "service_type");
CREATE INDEX "public_listings_province_name_idx" ON "public_listings"("province_name");
CREATE INDEX "public_listings_tenant_id_status_idx" ON "public_listings"("tenant_id", "status");
CREATE INDEX "public_listings_weekday_price_idx" ON "public_listings"("weekday_price");
-- Hot path marketplace: chỉ listing đang hiển thị. Partial index giữ cây nhỏ.
CREATE INDEX "public_listings_active_idx" ON "public_listings"("vehicle_type", "province_name")
    WHERE "status" = 'active';

ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
