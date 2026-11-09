-- ═══════════════════════════════════════════════════════════════════════════
-- Nhân viên & phân quyền theo design Partner-XePrime (ADR 0086, 09/11/2026).
--
-- 1. `web_sessions.last_seen_at` — mốc phiên web được DÙNG lần cuối, ghi tối đa mỗi 2,5 phút
--    (`SessionService`). Nuôi cột "Hoạt động gần nhất" / "Đang trực tuyến" của màn Nhân sự. NULL =
--    phiên tạo trước cột này, hoặc chưa dùng lần nào sau lượt đăng nhập (mốc đăng nhập đã có ở
--    `users.last_login_at`).
-- 2. `tenant_invites.display_name` — "Tên gợi nhớ" người mời đặt cho lời mời. Hiện thay tên khi
--    lời mời còn chờ; nhận lời mời thì chép sang `tenant_memberships.display_name_in_tenant`.
-- 3. Quyền mặc định mới của vai HỆ THỐNG (dùng chung mọi gian hàng — nên áp ở đây, không chờ seed):
--      shop_staff  + booking_requests.approve, subscription.view
--      shop_viewer + finance.view
--    Nguồn khai báo là `DEFAULT_TENANT_ROLE_PERMISSIONS` ở `@xeprime/types`; seed `system` đồng bộ
--    lại cùng tập. Không thu hồi quyền nào.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."web_sessions" ADD COLUMN "last_seen_at" TIMESTAMPTZ(3);

ALTER TABLE "public"."tenant_invites" ADD COLUMN "display_name" VARCHAR(60);

-- Màn Nhân sự đọc "hoạt động cuối" của một nhóm user: tra theo user, lấy mốc lớn nhất.
CREATE INDEX "web_sessions_user_last_seen_idx"
  ON "public"."web_sessions" ("user_id", "last_seen_at" DESC);

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM (
    VALUES
        ('shop_staff',  'booking_requests.approve'),
        ('shop_staff',  'subscription.view'),
        ('shop_viewer', 'finance.view')
) AS grant_row ("role_key", "permission_key")
JOIN "public"."roles" r
  ON r."scope" = 'tenant'
 AND r."key" = grant_row."role_key"
 AND r."tenant_id" IS NULL
 AND r."is_system" = true
JOIN "public"."permissions" p
  ON p."key" = grant_row."permission_key"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
