-- Nút "Nhắc khách" của gian hàng (05/11/2026): lượt bấm gần nhất trên một khoản giữ chỗ.
-- Cột CLAIM cùng kỷ luật `payment_reminded_at` / `final_payment_reminded_at`: điều kiện khoảng
-- lặng nằm trong câu UPDATE của `BookingRequestsService.remindPayment`, không cần index (đọc/ghi
-- theo khoá chính của hold).
ALTER TABLE "public"."booking_holds" ADD COLUMN "host_reminded_at" TIMESTAMPTZ(3);
