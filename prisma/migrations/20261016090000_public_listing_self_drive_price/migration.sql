-- public_listings.self_drive_daily_price — giá tự lái/ngày SAU khuyến mãi trực tiếp của chủ xe.
--
-- "Chỉ từ …" của thẻ địa điểm trang chủ (ADR 0062 điều 8) gộp MIN trên cột này bằng Prisma, ngay
-- trong `publicListingScope()` — thay vì một câu SQL thô chép tay phạm vi công khai. Writer duy nhất
-- vẫn là ListingsService (ADR 0008); backfill dưới đây dùng ĐÚNG phép tính của
-- `selfDriveDailyPrice` (prisma/src/listing-card.ts): làm tròn về đồng, nửa lên — khớp con số thẻ
-- xe hiện. Xe không nhận tự lái hoặc chưa có giá ngày ⇒ NULL.

ALTER TABLE "public_listings"
  ADD COLUMN "self_drive_daily_price" DECIMAL(14, 2);

UPDATE "public_listings"
SET "self_drive_daily_price" = ROUND(
      "weekday_price" * (100 - CASE
        WHEN "discount_percent" > 0 AND "discount_percent" <= 100 THEN "discount_percent"
        ELSE 0
      END) / 100
    )
WHERE "weekday_price" IS NOT NULL
  AND 'self_drive' = ANY ("service_types");

-- "Chỉ từ …" gộp MIN theo tỉnh trên các listing công khai.
CREATE INDEX "public_listings_province_code_self_drive_daily_price_idx"
  ON "public_listings" ("province_code", "self_drive_daily_price");
