-- Quyền `platform.tenants.view_pii` (17/11/2026): bỏ che SĐT/email chủ gian hàng / chủ xe và liên hệ
-- công khai của gian hàng trên drawer đối tác của Platform Admin — mỗi lượt xem ghi audit
-- `tenant.contact_reveal`. Cấp cho platform_admin + support + finance_admin (khớp
-- DEFAULT_PLATFORM_ROLE_PERMISSIONS). Production không chạy seed — cùng cách với
-- 20261117090000_wallet_admin_customer_lock. id = seedId('permission:<key>').

INSERT INTO "public"."permissions" ("id", "key", "name", "module", "scope")
VALUES
    ('01M0GSW200ZE5MGGJ15CWKQPSN', 'platform.tenants.view_pii', 'platform.tenants.view_pii', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (
    VALUES
        ('platform_admin', 'platform.tenants.view_pii'),
        ('support',        'platform.tenants.view_pii'),
        ('finance_admin',  'platform.tenants.view_pii')
) AS grant_row ("role_key", "permission_key")
JOIN "public"."roles" r
  ON r."scope" = 'platform'
 AND r."key" = grant_row."role_key"
 AND r."tenant_id" IS NULL
 AND r."is_system" = true
JOIN "public"."permissions" p
  ON p."key" = grant_row."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
