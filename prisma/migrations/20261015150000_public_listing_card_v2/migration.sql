-- Thẻ xe chợ theo design v2 (ADR 0062): bốn trường hiển thị mirror vào snapshot `public_listings`
-- để thẻ kết quả không phải join sang `vehicles` mỗi lượt xem (ADR 0008).
--   · ward_name                  — xã/phường của chi nhánh giữ xe (cùng nguồn với province_name)
--   · image_count                — tổng số ảnh của xe ("+N" trên thẻ)
--   · transmission               — mirror vehicles.transmission
--   · instant_book_service_types — dịch vụ đang bật tự động nhận chuyến ("Không cần xác nhận")
-- Writer runtime duy nhất vẫn là ListingsService; phép tính dùng chung `readListingCardExtras`.

ALTER TABLE "public_listings"
  ADD COLUMN "ward_name" VARCHAR(150),
  ADD COLUMN "image_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "transmission" VARCHAR(30),
  ADD COLUMN "instant_book_service_types" VARCHAR(50)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(50)[];

ALTER TABLE "public_listings"
  ADD CONSTRAINT "public_listings_image_count_non_negative" CHECK ("image_count" >= 0);

-- Backfill: dựng lại đúng giá trị `readListingCardExtras` sẽ ghi, cho mọi snapshot đang có —
-- không đợi lần sửa xe kế tiếp mới đúng.
UPDATE "public_listings" pl
SET "image_count" = img.cnt
FROM (
  SELECT "vehicle_id", COUNT(*)::INTEGER AS cnt
  FROM "vehicle_images"
  GROUP BY "vehicle_id"
) img
WHERE img."vehicle_id" = pl."vehicle_id";

UPDATE "public_listings" pl
SET "transmission" = v."transmission"
FROM "vehicles" v
WHERE v."id" = pl."vehicle_id";

-- Chỉ giữ dịch vụ xe đang nhận (`service_types` của snapshot) — cùng luật lọc với hàm dùng chung.
UPDATE "public_listings" pl
SET "instant_book_service_types" = ib.types
FROM (
  SELECT s."vehicle_id",
         ARRAY_AGG(s."service_type"::VARCHAR(50) ORDER BY s."service_type") AS types
  FROM "vehicle_service_settings" s
  JOIN "public_listings" p ON p."vehicle_id" = s."vehicle_id"
  WHERE s."auto_accept_enabled" = TRUE
    AND s."service_type" = ANY (p."service_types")
  GROUP BY s."vehicle_id"
) ib
WHERE ib."vehicle_id" = pl."vehicle_id";

UPDATE "public_listings" pl
SET "ward_name" = w."name"
FROM "tenant_branches" b
JOIN "wards" w ON w."code" = b."ward_code"
WHERE b."id" = pl."branch_id";

-- "Khách hàng nói gì về Xe Prime" ở trang chủ: đánh giá published mới nhất TOÀN SÀN
-- (GET /public/reviews/featured). Không có index này thì câu đó quét cả bảng reviews rồi sắp.
CREATE INDEX "reviews_status_created_at_idx" ON "reviews" ("status", "created_at" DESC);
