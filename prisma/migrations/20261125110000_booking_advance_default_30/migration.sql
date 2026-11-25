-- ADR 0091 điều 4 (sửa 25/11/2026): mặc định đặt trước tối đa đổi 15 → 30 ngày.
--
-- Chỉ đổi DEFAULT của cột — áp cho bản chính sách phí TẠO MỚI không khai số này (và seed). Bản đang
-- hiệu lực KHÔNG bị viết lại: chính sách phí có phiên bản, đổi số đang áp là việc của admin (tạo bản
-- nháp mới rồi kích hoạt, có audit), không phải của migration.
ALTER TABLE "public"."fee_policies"
    ALTER COLUMN "max_advance_booking_days" SET DEFAULT 30;
