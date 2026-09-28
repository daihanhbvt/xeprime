-- ════════════════════════════════════════════════════════════════════════════════════════════
-- `audit_logs.support_capability` ĐỦ CHỖ CHO CAPABILITY NÂNG GIỮA REQUEST — ADR 0050 §13
--
-- Từ Đợt 2B một lệnh sửa xe có thể nâng capability giữa request (đổi chi nhánh + đổi dịch vụ +
-- sửa thông tin/ảnh), và cột lưu chuỗi nối bằng dấu phẩy: `vehicle.info.edit,vehicle.media.manage,
-- vehicle.branch.reassign` đã dài 62 ký tự. VARCHAR(60) làm câu INSERT audit nổ và CẢ lệnh sửa bị
-- rollback thành 500. 500 ký tự đủ cho mọi tổ hợp capability ghi hiện có (tổng < 300).
--
-- Chỉ nới độ dài — không đổi dữ liệu, CHECK "có capability thì phải có phiên" giữ nguyên.
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."audit_logs"
    ALTER COLUMN "support_capability" TYPE VARCHAR(500);
