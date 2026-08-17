-- Hành trình chuyến CÓ TÀI XẾ đi tiếp từ yêu cầu sang ĐƠN (đợt hoàn thiện 17/08).
--
-- Trước đây duyệt yêu cầu chỉ copy service_type + tiền: lộ trình/địa chỉ đón/điểm đến ở lại
-- booking_requests, nên chi tiết đơn, phân công tài xế, chuyến của khách và hợp đồng đều mù
-- hành trình. Đơn giờ mang đủ ba trường — copy khi duyệt, nhập khi lập đơn tay.

ALTER TABLE "bookings"
    ADD COLUMN "route_type" VARCHAR(30),
    ADD COLUMN "pickup_address" TEXT,
    ADD COLUMN "destination" TEXT;

-- Backfill đơn đã sinh từ yêu cầu with_driver: kéo hành trình từ chính yêu cầu gốc.
-- Điều kiện theo service_type CỦA ĐƠN — các đơn cũ bị bug rơi về self_drive (đã sửa 17/08)
-- không nhận route để không vi phạm CHECK bên dưới.
UPDATE "bookings" b
SET "route_type"     = br."route_type",
    "pickup_address" = br."pickup_address",
    "destination"    = br."destination"
FROM "booking_requests" br
WHERE br."booking_id" = b."id"
  AND b."service_type" = 'with_driver';

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_route_type_check"
        CHECK ("route_type" IS NULL OR "route_type" IN ('in_city', 'inter_city', 'inter_city_one_way')),
    -- Hành trình là ngữ cảnh CÓ TÀI XẾ: dịch vụ khác bắt buộc để NULL cả ba trường —
    -- DB giữ luật, không dựa vào service nhớ normalize.
    ADD CONSTRAINT "bookings_route_context_service_check"
        CHECK (
            ("route_type" IS NULL AND "pickup_address" IS NULL AND "destination" IS NULL)
            OR "service_type" = 'with_driver'
        );
