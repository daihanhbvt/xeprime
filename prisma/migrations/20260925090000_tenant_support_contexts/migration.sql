-- ════════════════════════════════════════════════════════════════════════════════════════════
-- KHÔNG GIAN HỖ TRỢ GIAN HÀNG — ADR 0050
--
-- Nhân sự nền tảng mở một PHIÊN HỖ TRỢ cho một gian hàng: xem khu làm việc của họ và (chế độ
-- `assist`) sửa hộ thông tin/ảnh xe, phiếu bảo dưỡng — KHÔNG đổi danh tính, KHÔNG membership tạm.
--
-- Hai thứ migration này dựng:
--   1. `tenant_support_contexts` — phiên: người mở + phiên đăng nhập + gian hàng + chế độ + lý do
--      + hạn + capability server cấp. Không bao giờ xoá.
--   2. Hai cột mới trên `audit_logs` — mọi dòng audit ghi TRONG một phiên mang id phiên và
--      capability đã dùng, để "ai sửa, vì sao, bằng quyền gì" đọc được từ một dòng.
--
-- Không backfill: mọi dòng audit cũ là thao tác thường (`support_context_id IS NULL`).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Phiên ─────────────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."tenant_support_contexts" (
    "id"             CHAR(26)       NOT NULL,
    "actor_user_id"  CHAR(26)       NOT NULL,
    "session_id"     VARCHAR(64)    NOT NULL,
    "tenant_id"      CHAR(26)       NOT NULL,
    "mode"           VARCHAR(20)    NOT NULL,
    "workspace"      VARCHAR(20)    NOT NULL,
    "reason"         TEXT           NOT NULL,
    "capabilities"   TEXT[]         NOT NULL DEFAULT '{}',
    "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"     TIMESTAMPTZ(3) NOT NULL,
    "revoked_at"     TIMESTAMPTZ(3),
    "revoked_by"     CHAR(26),
    "ip_address"     VARCHAR(80),
    "user_agent"     TEXT,

    CONSTRAINT "tenant_support_contexts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_support_contexts_mode_check"
        CHECK ("mode" IN ('view', 'assist')),
    CONSTRAINT "tenant_support_contexts_workspace_check"
        CHECK ("workspace" IN ('manage', 'owner_lite', 'onboarding')),
    -- Chỉ capability của Đợt 1. Thêm capability mới là một migration — có chủ đích: mở rộng thứ
    -- nhân sự nền tảng làm được trong khu của gian hàng phải để lại dấu ở lịch sử schema.
    CONSTRAINT "tenant_support_contexts_capabilities_check"
        CHECK ("capabilities" <@ ARRAY[
            'workspace.view', 'vehicle.info.edit', 'vehicle.media.manage',
            'maintenance.view', 'maintenance.manage'
        ]::TEXT[]),
    -- Chế độ xem không bao giờ mang capability ghi, dù code có lỗi.
    CONSTRAINT "tenant_support_contexts_view_readonly_check"
        CHECK ("mode" <> 'view' OR NOT ("capabilities" && ARRAY[
            'vehicle.info.edit', 'vehicle.media.manage', 'maintenance.manage'
        ]::TEXT[])),
    CONSTRAINT "tenant_support_contexts_reason_check"
        CHECK (char_length(btrim("reason")) BETWEEN 10 AND 500),
    CONSTRAINT "tenant_support_contexts_expiry_check"
        CHECK ("expires_at" > "created_at" AND "expires_at" <= "created_at" + INTERVAL '2 hours'),
    CONSTRAINT "tenant_support_contexts_revoke_pair_check"
        CHECK (("revoked_at" IS NULL) = ("revoked_by" IS NULL))
);

-- "Phiên của tôi" / lịch sử phiên của một người.
CREATE INDEX "tenant_support_contexts_actor_user_id_created_at_idx"
    ON "public"."tenant_support_contexts" ("actor_user_id", "created_at");
-- Lịch sử hỗ trợ của một gian hàng.
CREATE INDEX "tenant_support_contexts_tenant_id_created_at_idx"
    ON "public"."tenant_support_contexts" ("tenant_id", "created_at");

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_revoked_by_fkey"
    FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. Audit mang phiên ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."audit_logs"
    ADD COLUMN "support_context_id" CHAR(26),
    ADD COLUMN "support_capability" VARCHAR(60);

-- Capability chỉ có nghĩa khi có phiên.
ALTER TABLE "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_support_capability_check"
    CHECK ("support_capability" IS NULL OR "support_context_id" IS NOT NULL);

CREATE INDEX "audit_logs_support_context_id_created_at_idx"
    ON "public"."audit_logs" ("support_context_id", "created_at");

ALTER TABLE "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_support_context_id_fkey"
    FOREIGN KEY ("support_context_id") REFERENCES "public"."tenant_support_contexts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
