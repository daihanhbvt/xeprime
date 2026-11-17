-- Đợt rà Admin 16/11/2026 (prompt 7): Ví điểm chỉ đọc cho admin, khoá tài khoản khách, rút tiền.
--
--   • `users.locked_at` + `users.locked_reason`: lượt khoá tài khoản KHÁCH của nền tảng ghi mốc và
--     lý do (người khoá nằm ở audit `customer.lock`). Tài khoản nhân viên do gian hàng cấp bị vô hiệu
--     hoá (ADR 0087) vẫn khoá không lý do — nên KHÔNG có CHECK đòi lý do khi `status = locked`.
--   • Index `withdrawal_requests (paid_at)` một phần: bảng kê tháng các lệnh đã chuyển lọc theo mốc
--     chuyển (giờ VN) — chỉ lệnh đã chi (`paid`, hoặc `reversed` sau khi chi) có cột này.
--   • Quyền `platform.customers.lock` (platform_admin + support) và `platform.wallets.view`
--     (platform_admin + support + finance_admin). Production không chạy seed — cùng cách với
--     20261022110000_sales_follow_ups. id = seedId('permission:<key>').

ALTER TABLE "public"."users"
    ADD COLUMN "locked_at" TIMESTAMPTZ(3),
    ADD COLUMN "locked_reason" TEXT;

ALTER TABLE "public"."users"
    ADD CONSTRAINT "users_locked_reason_length_check"
    CHECK ("locked_reason" IS NULL OR char_length("locked_reason") <= 500);

CREATE INDEX "withdrawal_requests_paid_at_idx"
    ON "public"."withdrawal_requests" ("paid_at")
    WHERE "paid_at" IS NOT NULL;

INSERT INTO "public"."permissions" ("id", "key", "name", "module", "scope")
VALUES
    ('01M0GSW2006Y16JP1Q8HRTACR9', 'platform.customers.lock', 'platform.customers.lock', 'platform', 'platform'),
    ('01M0GSW2006VKG572039PM2V3G', 'platform.wallets.view', 'platform.wallets.view', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (
    VALUES
        ('platform_admin', 'platform.customers.lock'),
        ('support',        'platform.customers.lock'),
        ('platform_admin', 'platform.wallets.view'),
        ('support',        'platform.wallets.view'),
        ('finance_admin',  'platform.wallets.view')
) AS grant_row ("role_key", "permission_key")
JOIN "public"."roles" r
  ON r."scope" = 'platform'
 AND r."key" = grant_row."role_key"
 AND r."tenant_id" IS NULL
 AND r."is_system" = true
JOIN "public"."permissions" p
  ON p."key" = grant_row."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
