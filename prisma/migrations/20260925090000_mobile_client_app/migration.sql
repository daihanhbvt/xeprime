-- Tách app mobile thành XePrime (customer) và XePrime Partner (partner) — 25/09/2026.
--
-- Ba cột `client_app` mới, đều tương thích ngược với app hợp nhất cũ:
--   - native_auth_sessions.client_app  NOT NULL DEFAULT 'customer' (app cũ không gửi trường này)
--   - native_auth_codes.client_app     NOT NULL DEFAULT 'customer' (suy từ redirect_uri lúc begin)
--   - push_devices.client_app          NULL = bản cài app hợp nhất cũ, nhận MỌI audience
--
-- Giá trị hợp lệ giữ bằng CHECK (status là String — ADR 0005, kỷ luật như các cột state khác).

ALTER TABLE "native_auth_sessions"
  ADD COLUMN "client_app" VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE "native_auth_sessions"
  ADD CONSTRAINT "native_auth_sessions_client_app_check"
  CHECK ("client_app" IN ('customer', 'partner'));

ALTER TABLE "native_auth_codes"
  ADD COLUMN "client_app" VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE "native_auth_codes"
  ADD CONSTRAINT "native_auth_codes_client_app_check"
  CHECK ("client_app" IN ('customer', 'partner'));

ALTER TABLE "push_devices"
  ADD COLUMN "client_app" VARCHAR(20);
ALTER TABLE "push_devices"
  ADD CONSTRAINT "push_devices_client_app_check"
  CHECK ("client_app" IS NULL OR "client_app" IN ('customer', 'partner'));
