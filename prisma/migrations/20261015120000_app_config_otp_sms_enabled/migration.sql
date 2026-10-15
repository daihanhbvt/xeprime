-- Công tắc gửi SMS OTP do admin nền tảng bật/tắt (Cấu hình ứng dụng).
-- Mặc định TRUE = gửi SMS thật; FALSE chỉ có hiệu lực ở dev/staging (production luôn gửi thật —
-- chốt ở PhoneVerificationService, không phụ thuộc giá trị cột này).
ALTER TABLE "platform_app_configs"
  ADD COLUMN "otp_sms_enabled" BOOLEAN NOT NULL DEFAULT true;
