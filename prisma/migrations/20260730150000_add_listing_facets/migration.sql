-- ---------------------------------------------------------------------------
-- Bộ lọc facet marketplace (Phase 3 mở rộng, database_design §9.6 / §9.9)
--
-- 1. vehicles: kiểu dáng (body_type) + giá giờ + tiện ích thuê (giao tận nơi /
--    miễn thế chấp / % giảm giá). KHÔNG tách bảng vehicle_pricing riêng — giá và
--    tiện ích nằm luôn trên vehicles, mirror sang public_listings để filter.
-- 2. public_listings: mirror 5 cột trên + denormalize features (text[], GIN) và
--    rating (rating_avg / rating_count) để filter/facet-count/sort "Gợi ý" chạy
--    trên một bảng phẳng. Ghi vẫn qua duy nhất ListingsService (ADR 0008).
-- 3. Backfill trong cùng migration từ vehicles / vehicle_features / reviews.
-- ---------------------------------------------------------------------------

-- 1. vehicles ---------------------------------------------------------------

ALTER TABLE "vehicles"
    ADD COLUMN "body_type" VARCHAR(50),
    ADD COLUMN "hourly_price" DECIMAL(14,2),
    ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "no_collateral" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "discount_percent" INTEGER;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_discount_percent_check"
    CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 100));

-- 2. public_listings --------------------------------------------------------

ALTER TABLE "public_listings"
    ADD COLUMN "body_type" VARCHAR(50),
    ADD COLUMN "hourly_price" DECIMAL(14,2),
    ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "no_collateral" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "discount_percent" INTEGER,
    ADD COLUMN "features" TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN "rating_avg" DECIMAL(3,2),
    ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0;

-- Filter tiện ích theo mảng (hasEvery) + đếm facet bằng unnest → GIN.
CREATE INDEX "public_listings_features_idx" ON "public_listings" USING GIN ("features");

CREATE INDEX "public_listings_status_body_type_idx" ON "public_listings"("status", "body_type");
CREATE INDEX "public_listings_status_fuel_type_idx" ON "public_listings"("status", "fuel_type");

-- Sort "Gợi ý" (rating desc NULLS LAST → rating_count desc → mới nhất) trên hàng
-- active — partial index khớp đúng shape ORDER BY (Prisma không tả được, chỉ SQL).
CREATE INDEX "public_listings_active_rating_idx"
    ON "public_listings"("rating_avg" DESC NULLS LAST, "rating_count" DESC, "created_at" DESC)
    WHERE "status" = 'active';

-- 3. Backfill ---------------------------------------------------------------

-- Mirror 5 cột từ vehicles (no-op với dữ liệu hiện tại vì cột mới toanh, nhưng giữ
-- migration đúng nếu replay trên DB đã có dữ liệu).
UPDATE "public_listings" pl SET
    "body_type"        = v."body_type",
    "hourly_price"     = v."hourly_price",
    "delivery_enabled" = v."delivery_enabled",
    "no_collateral"    = v."no_collateral",
    "discount_percent" = v."discount_percent"
FROM "vehicles" v
WHERE v."id" = pl."vehicle_id";

-- Denormalize features từ vehicle_features (sort key để mảng ổn định).
UPDATE "public_listings" pl SET "features" = f."arr"
FROM (
    SELECT "vehicle_id", array_agg("feature_key" ORDER BY "feature_key") AS "arr"
    FROM "vehicle_features"
    GROUP BY "vehicle_id"
) f
WHERE f."vehicle_id" = pl."vehicle_id";

-- Denormalize rating từ reviews đã published (chưa xoá).
UPDATE "public_listings" pl SET
    "rating_avg"   = r."avg",
    "rating_count" = r."cnt"
FROM (
    SELECT "vehicle_id",
           ROUND(AVG("rating")::numeric, 2) AS "avg",
           COUNT(*)::int                    AS "cnt"
    FROM "reviews"
    WHERE "status" = 'published' AND "deleted_at" IS NULL
    GROUP BY "vehicle_id"
) r
WHERE r."vehicle_id" = pl."vehicle_id";
