-- ═══════════════════════════════════════════════════════════════════════════
-- Tài khoản nhân viên do chủ gian hàng cấp (ADR 0087, 09/11/2026).
--
-- 1. `users.username` — tên đăng nhập của tài khoản nhân viên: chữ thường, bắt đầu bằng chữ cái,
--    4–32 ký tự a-z 0-9 . _ ; unique TRONG realm (ADR 0053). NULL với mọi tài khoản tự đăng ký.
--    Bắt đầu bằng chữ cái là chủ đích: một tên toàn chữ số trông như SĐT và làm ô đăng nhập
--    không biết đang tra cột nào.
-- 2. `users.managed_by_tenant_id` — gian hàng đã tạo tài khoản. Chủ đặt lại mật khẩu cho tài khoản
--    loại này; gỡ khỏi gian hàng là vô hiệu hoá nó. SET NULL khi gian hàng bị xoá cứng (chỉ có ở
--    dọn dữ liệu test) — tài khoản còn lại không thuộc ai và không đăng nhập vào đâu được.
-- 3. `tenant_memberships.contact_phone` — SĐT liên hệ chủ ghi cho nhân viên; không xác minh, không
--    phải định danh đăng nhập (ADR 0060 vẫn đúng: chỉ SĐT ĐÃ XÁC MINH mới là định danh).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."users" ADD COLUMN "username" VARCHAR(32);
ALTER TABLE "public"."users" ADD COLUMN "managed_by_tenant_id" CHAR(26);

ALTER TABLE "public"."users" ADD CONSTRAINT "users_username_format_check"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z][a-z0-9._]{2,30}[a-z0-9]$');

CREATE UNIQUE INDEX "users_realm_username_key" ON "public"."users" ("realm", "username");
CREATE INDEX "users_managed_by_tenant_id_idx" ON "public"."users" ("managed_by_tenant_id");

ALTER TABLE "public"."users" ADD CONSTRAINT "users_managed_by_tenant_id_fkey"
  FOREIGN KEY ("managed_by_tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."tenant_memberships" ADD COLUMN "contact_phone" VARCHAR(30);
