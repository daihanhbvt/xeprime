-- ADR 0090 — Dữ liệu xe chuẩn: mỗi dòng là MỘT xe (hãng · dòng · phiên bản · đời) mang đủ thông số,
-- tiện ích, giá bán tham khảo và giá thuê tham khảo; chủ xe đăng xe chưa có ⇒ hệ thống tự ghi nhận
-- một dòng "chờ duyệt" từ chính chiếc xe đó; lượt nhập file qua bản xem trước.
--
-- Viết tay (không `migrate dev`): xem cảnh báo FK tổ hợp ở header baseline. Unique một phần + CHECK
-- dưới đây Prisma không mô tả được.

-- ── 1. Dòng xe: trạng thái duyệt + người tạo (dòng xe mới chủ xe gõ ở form) ─────────────────
ALTER TABLE "public"."vehicle_catalog_models"
    ADD COLUMN "review_status"         VARCHAR(20) NOT NULL DEFAULT 'approved',
    ADD COLUMN "origin"                VARCHAR(20) NOT NULL DEFAULT 'seed',
    ADD COLUMN "proposed_by_tenant_id" CHAR(26),
    ADD COLUMN "proposed_by_user_id"   CHAR(26),
    ADD COLUMN "reviewed_at"           TIMESTAMPTZ(3),
    ADD COLUMN "reviewed_by"           CHAR(26),
    ADD COLUMN "review_note"           VARCHAR(500);

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_review_status_check"
        CHECK ("review_status" IN ('approved', 'pending', 'rejected')),
    ADD CONSTRAINT "vehicle_catalog_models_origin_check"
        CHECK ("origin" IN ('seed', 'admin', 'import', 'owner')),
    -- Từ chối luôn kèm xoá mềm: dòng bị từ chối không bao giờ còn chọn được.
    ADD CONSTRAINT "vehicle_catalog_models_rejected_deleted_check"
        CHECK ("review_status" <> 'rejected' OR "deleted_at" IS NOT NULL);

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_proposed_by_tenant_id_fkey"
    FOREIGN KEY ("proposed_by_tenant_id") REFERENCES "public"."tenants" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. Xe chuẩn ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "public"."vehicle_catalog_variants" (
    "id"                        CHAR(26)       NOT NULL,
    "model_id"                  CHAR(26)       NOT NULL,
    -- Phiên bản: '' = không phân biệt phiên bản (xe chỉ có một bản, hoặc chủ xe không khai).
    "key"                       VARCHAR(80)    NOT NULL DEFAULT '',
    "label"                     VARCHAR(120)   NOT NULL DEFAULT '',
    "year_from"                 INTEGER,
    "year_to"                   INTEGER,
    "seat_count"                INTEGER,
    "fuel_type"                 VARCHAR(20),
    "transmission"              VARCHAR(30),
    "body_type"                 VARCHAR(50),
    "engine_displacement_cc"    INTEGER,
    "horsepower_hp"             INTEGER,
    "length_mm"                 INTEGER,
    "width_mm"                  INTEGER,
    "height_mm"                 INTEGER,
    "curb_weight_kg"            INTEGER,
    "fuel_consumption_combined" DECIMAL(6, 2),
    "electric_range_km"         INTEGER,
    "battery_capacity_kwh"      DECIMAL(6, 2),
    "feature_keys"              VARCHAR(80)[]  NOT NULL DEFAULT ARRAY[]::VARCHAR(80)[],
    "list_price"                DECIMAL(14, 2),
    "hourly_price"              DECIMAL(14, 2),
    "weekday_price"             DECIMAL(14, 2),
    "weekend_price"             DECIMAL(14, 2),
    "monthly_price"             DECIMAL(14, 2),
    "with_driver_daily_price"   DECIMAL(14, 2),
    "active"                    BOOLEAN        NOT NULL DEFAULT true,
    "review_status"             VARCHAR(20)    NOT NULL DEFAULT 'approved',
    "origin"                    VARCHAR(20)    NOT NULL DEFAULT 'admin',
    "proposed_by_tenant_id"     CHAR(26),
    "proposed_by_user_id"       CHAR(26),
    "source_vehicle_id"         CHAR(26),
    "reviewed_at"               TIMESTAMPTZ(3),
    "reviewed_by"               CHAR(26),
    "review_note"               VARCHAR(500),
    "created_by"                CHAR(26),
    "updated_by"                CHAR(26),
    "created_at"                TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMPTZ(3) NOT NULL,
    "deleted_at"                TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_catalog_variants_pkey" PRIMARY KEY ("id"),
    -- Khoá rỗng ⇔ tên rỗng: không có "phiên bản" chỉ toàn dấu cách.
    CONSTRAINT "vehicle_catalog_variants_label_key_check"
        CHECK (("key" = '') = (btrim("label") = '')),
    CONSTRAINT "vehicle_catalog_variants_review_status_check"
        CHECK ("review_status" IN ('approved', 'pending', 'rejected')),
    CONSTRAINT "vehicle_catalog_variants_origin_check"
        CHECK ("origin" IN ('admin', 'import', 'owner')),
    CONSTRAINT "vehicle_catalog_variants_rejected_deleted_check"
        CHECK ("review_status" <> 'rejected' OR "deleted_at" IS NOT NULL),
    CONSTRAINT "vehicle_catalog_variants_years_check" CHECK (
        ("year_from" IS NULL OR "year_from" BETWEEN 1950 AND 2200) AND
        ("year_to" IS NULL OR "year_to" BETWEEN 1950 AND 2200) AND
        ("year_from" IS NULL OR "year_to" IS NULL OR "year_to" >= "year_from")),
    CONSTRAINT "vehicle_catalog_variants_seat_count_check"
        CHECK ("seat_count" IS NULL OR "seat_count" BETWEEN 1 AND 64),
    CONSTRAINT "vehicle_catalog_variants_fuel_type_check"
        CHECK ("fuel_type" IS NULL OR "fuel_type" IN
               ('gasoline', 'diesel', 'electric', 'hybrid', 'plug_in_hybrid')),
    CONSTRAINT "vehicle_catalog_variants_positive_check" CHECK (
        ("engine_displacement_cc" IS NULL OR "engine_displacement_cc" > 0) AND
        ("horsepower_hp" IS NULL OR "horsepower_hp" > 0) AND
        ("length_mm" IS NULL OR "length_mm" > 0) AND
        ("width_mm" IS NULL OR "width_mm" > 0) AND
        ("height_mm" IS NULL OR "height_mm" > 0) AND
        ("curb_weight_kg" IS NULL OR "curb_weight_kg" > 0) AND
        ("fuel_consumption_combined" IS NULL OR "fuel_consumption_combined" > 0) AND
        ("electric_range_km" IS NULL OR "electric_range_km" > 0) AND
        ("battery_capacity_kwh" IS NULL OR "battery_capacity_kwh" > 0)),
    CONSTRAINT "vehicle_catalog_variants_prices_check" CHECK (
        ("list_price" IS NULL OR "list_price" > 0) AND
        ("hourly_price" IS NULL OR "hourly_price" > 0) AND
        ("weekday_price" IS NULL OR "weekday_price" > 0) AND
        ("weekend_price" IS NULL OR "weekend_price" > 0) AND
        ("monthly_price" IS NULL OR "monthly_price" > 0) AND
        ("with_driver_daily_price" IS NULL OR "with_driver_daily_price" > 0))
);

-- Một xe chuẩn = (dòng, phiên bản, năm bắt đầu) trong số dòng CÒN SỐNG; dòng đã xoá không chặn
-- tạo lại. Vios G CVT 2018-2022 và Vios G CVT 2023-nay là hai xe khác nhau (khác năm bắt đầu).
CREATE UNIQUE INDEX "vehicle_catalog_variants_identity_key"
    ON "public"."vehicle_catalog_variants" ("model_id", "key", (COALESCE("year_from", 0)))
    WHERE "deleted_at" IS NULL;
-- Ô "Phiên bản" của form chủ xe: xe chuẩn đang gợi ý của một dòng.
CREATE INDEX "vehicle_catalog_variants_model_id_active_idx"
    ON "public"."vehicle_catalog_variants" ("model_id", "active")
    WHERE "deleted_at" IS NULL;
-- Danh sách quản trị: lọc trạng thái, mặc định mới cập nhật trước.
CREATE INDEX "vehicle_catalog_variants_review_status_updated_at_idx"
    ON "public"."vehicle_catalog_variants" ("review_status", "updated_at")
    WHERE "deleted_at" IS NULL;
CREATE INDEX "vehicle_catalog_variants_source_vehicle_id_idx"
    ON "public"."vehicle_catalog_variants" ("source_vehicle_id")
    WHERE "source_vehicle_id" IS NOT NULL;

ALTER TABLE "public"."vehicle_catalog_variants"
    ADD CONSTRAINT "vehicle_catalog_variants_model_id_fkey"
    FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_catalog_models" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."vehicle_catalog_variants"
    ADD CONSTRAINT "vehicle_catalog_variants_proposed_by_tenant_id_fkey"
    FOREIGN KEY ("proposed_by_tenant_id") REFERENCES "public"."tenants" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."vehicle_catalog_variants"
    ADD CONSTRAINT "vehicle_catalog_variants_source_vehicle_id_fkey"
    FOREIGN KEY ("source_vehicle_id") REFERENCES "public"."vehicles" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Lượt nhập file ───────────────────────────────────────────────────────────────────────
CREATE TABLE "public"."vehicle_catalog_imports" (
    "id"           CHAR(26)       NOT NULL,
    "status"       VARCHAR(20)    NOT NULL DEFAULT 'previewed',
    "file_name"    VARCHAR(255)   NOT NULL,
    "row_count"    INTEGER        NOT NULL,
    "summary_json" JSONB          NOT NULL,
    "rows_json"    JSONB          NOT NULL,
    "created_by"   CHAR(26)       NOT NULL,
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at"   TIMESTAMPTZ(3),
    "applied_by"   CHAR(26),
    "discarded_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_catalog_imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicle_catalog_imports_status_check"
        CHECK ("status" IN ('previewed', 'applied', 'discarded')),
    CONSTRAINT "vehicle_catalog_imports_applied_check"
        CHECK ("status" <> 'applied' OR ("applied_at" IS NOT NULL AND "applied_by" IS NOT NULL)),
    CONSTRAINT "vehicle_catalog_imports_discarded_check"
        CHECK ("status" <> 'discarded' OR "discarded_at" IS NOT NULL)
);

CREATE INDEX "vehicle_catalog_imports_created_at_idx"
    ON "public"."vehicle_catalog_imports" ("created_at");

-- ── 4. Xe ↔ xe chuẩn ────────────────────────────────────────────────────────────────────────
ALTER TABLE "public"."vehicles" ADD COLUMN "vehicle_catalog_variant_id" CHAR(26);

ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_vehicle_catalog_variant_id_fkey"
    FOREIGN KEY ("vehicle_catalog_variant_id") REFERENCES "public"."vehicle_catalog_variants" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Chỉ mục PHẦN, cùng lý do với `vehicles_vehicle_catalog_model_id_idx`: đa số xe không gắn xe chuẩn.
-- Phục vụ đếm xe đang dùng + giá thực tế ở màn quản trị, gộp/từ chối.
CREATE INDEX "vehicles_vehicle_catalog_variant_id_idx"
    ON "public"."vehicles" ("vehicle_catalog_variant_id")
    WHERE "vehicle_catalog_variant_id" IS NOT NULL;
