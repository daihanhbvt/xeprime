-- ═══════════════════════════════════════════════════════════════════════════
-- Thẻ CHUYẾN trên tin nhắn (06/11/2026).
--
-- Khách nhắn từ "Chuyến của tôi" / gian hàng nhắn từ "Đơn thuê xe" thì câu đầu tiên mang theo
-- chuyến đó (`booking_request_id` — định danh chuyến từ lúc gửi yêu cầu). Bấm thẻ mở đúng chuyến
-- ở site của người xem: khách → `/trips/:id`, gian hàng → đơn / yêu cầu tương ứng. Trước đây tin
-- chỉ mang xe, và thẻ xe dẫn gian hàng sang `/listings/:id` — trang không có ở site partner (404).
--
-- Cột NULL được, không backfill: tin cũ không biết đang nói về chuyến nào. Yêu cầu bị xoá thì tin
-- ở lại, chỉ mất thẻ (cùng kỷ luật với `vehicle_id`).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."messages"
    ADD COLUMN "booking_request_id" CHAR(26);

ALTER TABLE "public"."messages"
    ADD CONSTRAINT "messages_booking_request_id_fkey"
    FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "messages_booking_request_id_idx" ON "public"."messages" ("booking_request_id");
