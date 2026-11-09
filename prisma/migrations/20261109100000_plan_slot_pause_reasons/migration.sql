-- ═══════════════════════════════════════════════════════════════════════════
-- Lý do tạm ẩn / tạm khoá do HỆ THỐNG áp khi đổi tuyến hoặc đổi gói (ADR 0085, 09/11/2026).
--
-- 1. `vehicles.marketplace_paused_reason` — hệ thống tắt công tắc hiển thị của chủ xe (ADR 0048)
--    vì xe vượt suất gói (`plan_limit`). NULL = chủ xe tự tắt, hoặc đang bật. Mọi lượt BẬT (luôn do
--    chủ xe) xoá về NULL. Chỉ để thẻ xe nói đúng lý do; không quyết định tiền hay lịch.
-- 2. `tenant_memberships.locked_reason` — hệ thống khoá thành viên khi gian hàng hết ân hạn và về
--    tuyến hoa hồng (`plan_lapsed`). Gói kích hoạt lại chỉ mở đúng các dòng mang lý do đó; khoá tay
--    của chủ (NULL) giữ nguyên.
--
-- Cả hai là cột MỚI, NULL được, không backfill: không xe/thành viên nào đang bị hệ thống ẩn/khoá
-- trước ADR này (ADR 0085 điều 5 — không ẩn hồi tố).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."vehicles" ADD COLUMN "marketplace_paused_reason" VARCHAR(30);

-- Lý do chỉ tồn tại khi công tắc ĐANG TẮT — một xe đang hiện mà mang nhãn "tạm ẩn vì hết suất"
-- là hai cột nói hai điều ngược nhau.
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_marketplace_paused_reason_check"
  CHECK (
    "marketplace_paused_reason" IS NULL
    OR ("marketplace_paused_reason" IN ('plan_limit') AND "marketplace_enabled" = false)
  );

ALTER TABLE "public"."tenant_memberships" ADD COLUMN "locked_reason" VARCHAR(30);

ALTER TABLE "public"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_locked_reason_check"
  CHECK (
    "locked_reason" IS NULL
    OR ("locked_reason" IN ('plan_lapsed') AND "status" = 'locked')
  );

-- Job hết ân hạn / lượt kích hoạt lại tìm đúng các thành viên do hệ thống khoá của MỘT gian hàng.
CREATE INDEX "tenant_memberships_tenant_locked_reason_idx"
  ON "public"."tenant_memberships" ("tenant_id")
  WHERE "locked_reason" IS NOT NULL;
