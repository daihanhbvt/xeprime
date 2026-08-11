-- Wave 3 — dữ liệu lõi cho wizard tạo xe và workspace chỉnh sửa.
-- Chi tiết tài chính/giấy tờ/bảo dưỡng chưa nằm trong migration này; các wave sau sở hữu các bảng đó.

ALTER TABLE "vehicles"
    ADD COLUMN "source_type" VARCHAR(30) NOT NULL DEFAULT 'owned',
    ADD COLUMN "length_mm" INTEGER,
    ADD COLUMN "width_mm" INTEGER,
    ADD COLUMN "height_mm" INTEGER,
    ADD COLUMN "curb_weight_kg" INTEGER,
    ADD COLUMN "engine_displacement_cc" INTEGER,
    ADD COLUMN "horsepower_hp" INTEGER,
    ADD COLUMN "transmission" VARCHAR(30),
    ADD COLUMN "fuel_consumption_city" DECIMAL(6,2),
    ADD COLUMN "fuel_consumption_highway" DECIMAL(6,2),
    ADD COLUMN "fuel_consumption_combined" DECIMAL(6,2),
    ADD CONSTRAINT "vehicles_source_type_check"
      CHECK ("source_type" IN ('owned', 'financed', 'rented', 'partnership')),
    ADD CONSTRAINT "vehicles_transmission_check"
      CHECK ("transmission" IS NULL OR "transmission" IN ('automatic', 'manual', 'cvt', 'dct', 'other')),
    ADD CONSTRAINT "vehicles_dimensions_positive_check"
      CHECK (("length_mm" IS NULL OR "length_mm" > 0)
        AND ("width_mm" IS NULL OR "width_mm" > 0)
        AND ("height_mm" IS NULL OR "height_mm" > 0)
        AND ("curb_weight_kg" IS NULL OR "curb_weight_kg" > 0)),
    ADD CONSTRAINT "vehicles_engine_specs_positive_check"
      CHECK (("engine_displacement_cc" IS NULL OR "engine_displacement_cc" > 0)
        AND ("horsepower_hp" IS NULL OR "horsepower_hp" > 0)),
    ADD CONSTRAINT "vehicles_fuel_consumption_nonnegative_check"
      CHECK (("fuel_consumption_city" IS NULL OR "fuel_consumption_city" >= 0)
        AND ("fuel_consumption_highway" IS NULL OR "fuel_consumption_highway" >= 0)
        AND ("fuel_consumption_combined" IS NULL OR "fuel_consumption_combined" >= 0));

CREATE INDEX "vehicles_tenant_id_source_type_idx" ON "vehicles"("tenant_id", "source_type");
