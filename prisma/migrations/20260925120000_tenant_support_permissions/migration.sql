-- ════════════════════════════════════════════════════════════════════════════════════════════
-- QUYỀN CỦA KHÔNG GIAN HỖ TRỢ GIAN HÀNG — ADR 0050
--
-- Production chỉ chạy `prisma migrate deploy`, KHÔNG chạy seed. Quyền mới chỉ khai ở
-- `DEFAULT_PLATFORM_ROLE_PERMISSIONS` thì không bao giờ tới được DB production — và vì
-- `RbacService` đọc quyền của vai HỆ THỐNG từ `role_permissions`, nút "Mở không gian hỗ trợ" sẽ
-- không hiện với ai. Migration này đưa đúng những gì seed hệ thống sẽ đưa:
--
--   1. Ba dòng `permissions`, id = `seedId('permission:<key>')` — CÙNG id mà `seedPermissions`
--      sinh (sha256 tất định), nên chạy seed sau đó thấy dòng đã có và không tạo trùng.
--   2. Gán vào ba VAI HỆ THỐNG của nền tảng (tìm theo scope + key, `tenant_id IS NULL`,
--      `is_system`) — KHÔNG đụng vai tuỳ biến, KHÔNG xoá quyền nào đang có:
--        platform_admin  → cả ba
--        support         → cả ba
--        finance_admin   → platform.tenants.view (đi cặp với platform.tenants.manage đã có)
--
-- Idempotent: `ON CONFLICT DO NOTHING` ở cả hai bảng. DB chưa từng seed (không có vai hệ thống)
-- thì bước 2 không gán gì — đúng như seed sẽ làm lúc nó tạo vai.
-- ════════════════════════════════════════════════════════════════════════════════════════════

INSERT INTO "public"."permissions" ("id", "key", "name", "module", "scope")
VALUES
    ('01M0GSW200G3C3B98M499ESEWK', 'platform.tenants.view',          'platform.tenants.view',          'platform', 'platform'),
    ('01M0GSW200YXJCG5RY6S9E40T5', 'platform.tenant_support.view',   'platform.tenant_support.view',   'platform', 'platform'),
    ('01M0GSW200D48RR48RJ81ZJZTF', 'platform.tenant_support.assist', 'platform.tenant_support.assist', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (
    VALUES
        ('platform_admin', 'platform.tenants.view'),
        ('platform_admin', 'platform.tenant_support.view'),
        ('platform_admin', 'platform.tenant_support.assist'),
        ('support',        'platform.tenants.view'),
        ('support',        'platform.tenant_support.view'),
        ('support',        'platform.tenant_support.assist'),
        ('finance_admin',  'platform.tenants.view')
) AS grant_row ("role_key", "permission_key")
JOIN "public"."roles" r
  ON r."scope" = 'platform'
 AND r."key" = grant_row."role_key"
 AND r."tenant_id" IS NULL
 AND r."is_system" = true
-- Tra theo KEY, không theo id cứng: trên DB đã seed trước migration này, dòng quyền đã tồn tại
-- với đúng id đó; tra theo key vẫn đúng cả khi ai đó từng tạo nó bằng tay với id khác.
JOIN "public"."permissions" p
  ON p."key" = grant_row."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
