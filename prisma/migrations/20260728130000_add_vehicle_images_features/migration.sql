-- ---------------------------------------------------------------------------
-- vehicle_images + vehicle_features (Phase 3, §9.3 / §9.5)
--
-- Gallery ảnh (sắp theo sort_order) + tiện ích xe (unique theo vehicle+feature_key).
-- Cả hai cascade khi xoá xe.
-- ---------------------------------------------------------------------------

CREATE TABLE "vehicle_images" (
    "id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_type" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_images_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vehicle_images_vehicle_id_sort_order_idx"
    ON "vehicle_images"("vehicle_id", "sort_order");
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "vehicle_features" (
    "id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "feature_key" VARCHAR(80) NOT NULL,
    CONSTRAINT "vehicle_features_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicle_features_vehicle_id_feature_key_key"
    ON "vehicle_features"("vehicle_id", "feature_key");
ALTER TABLE "vehicle_features" ADD CONSTRAINT "vehicle_features_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
