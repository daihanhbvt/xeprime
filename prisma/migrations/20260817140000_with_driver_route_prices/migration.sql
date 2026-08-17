-- Giá XE CÓ TÀI XẾ theo lộ trình (đợt hoàn thiện 17/08).
--
-- `with_driver_daily_price` giữ vai trò giá NỘI THÀNH/cơ bản (đã gồm tài xế). Hai cột mới là
-- giá ngày cho lộ trình liên tỉnh (khứ hồi) và liên tỉnh 1 chiều — NULL = chưa niêm yết, quote
-- rơi về giá cơ bản kèm ghi chú "phụ phí xác nhận khi duyệt" (không âm thầm coi đó là giá chốt).

ALTER TABLE "vehicles"
    ADD COLUMN "with_driver_inter_city_price" DECIMAL(14,2),
    ADD COLUMN "with_driver_one_way_price" DECIMAL(14,2);

ALTER TABLE "vehicles"
    ADD CONSTRAINT "vehicles_with_driver_inter_city_price_non_negative_check"
        CHECK ("with_driver_inter_city_price" IS NULL OR "with_driver_inter_city_price" >= 0),
    ADD CONSTRAINT "vehicles_with_driver_one_way_price_non_negative_check"
        CHECK ("with_driver_one_way_price" IS NULL OR "with_driver_one_way_price" >= 0);

-- Mirror sang snapshot công khai (ADR 0008 — chỉ ListingsService ghi) + đồng bộ ngay.
ALTER TABLE "public_listings"
    ADD COLUMN "with_driver_inter_city_price" DECIMAL(14,2),
    ADD COLUMN "with_driver_one_way_price" DECIMAL(14,2);

UPDATE "public_listings" pl
SET "with_driver_inter_city_price" = v."with_driver_inter_city_price",
    "with_driver_one_way_price"    = v."with_driver_one_way_price"
FROM "vehicles" v
WHERE v."id" = pl."vehicle_id";
