-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Cấu hình app bật/tắt từ xa (`isPlanPromotionEnabled` của app Partner) + hàng đợi email + loại case
-- `plan_consultation` + quyền `platform.app_config.manage` (docs/app-config-sse.md).
--
-- Production không chạy seed ⇒ dòng `partner` và quyền được nạp NGAY ở đây (id quyền =
-- seedId('permission:platform.app_config.manage'), CÙNG id seed hệ thống sinh).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. platform_app_configs ────────────────────────────────────────────────────────────────
CREATE TABLE "platform_app_configs" (
    "key" VARCHAR(50) NOT NULL,
    "is_plan_promotion_enabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "support_hotline" VARCHAR(30),
    "support_zalo" VARCHAR(30),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_app_configs_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "platform_app_configs_key_check" CHECK ("key" IN ('partner')),
    CONSTRAINT "platform_app_configs_version_check" CHECK ("version" >= 1)
);

ALTER TABLE "platform_app_configs" ADD CONSTRAINT "platform_app_configs_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "platform_app_configs" ("key", "is_plan_promotion_enabled", "version", "updated_at")
VALUES ('partner', false, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- ── 2. email_outbox ────────────────────────────────────────────────────────────────────────
CREATE TABLE "email_outbox" (
    "id" CHAR(26) NOT NULL,
    "kind" VARCHAR(50) NOT NULL,
    "to_email" VARCHAR(255) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'vi',
    "payload_json" JSONB NOT NULL,
    "dedupe_key" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_outbox_kind_check" CHECK ("kind" IN ('plan_guide')),
    CONSTRAINT "email_outbox_locale_check" CHECK ("locale" IN ('vi', 'en')),
    CONSTRAINT "email_outbox_status_check" CHECK ("status" IN ('pending', 'sending', 'sent', 'failed'))
);

-- Chống trùng mốc do DB gác (một mốc của một thuê bao ⇒ một thư).
CREATE UNIQUE INDEX "email_outbox_dedupe_key_key" ON "email_outbox"("dedupe_key");
CREATE INDEX "email_outbox_status_next_attempt_at_idx" ON "email_outbox"("status", "next_attempt_at");

-- ── 3. Loại case `plan_consultation` ───────────────────────────────────────────────────────
ALTER TABLE "public"."support_cases"
    DROP CONSTRAINT IF EXISTS "support_cases_category_check";

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_category_check"
    CHECK ("category" IN ('dispute', 'incident', 'payment', 'account', 'account_deletion', 'plan_consultation', 'other'));

-- ── 4. Quyền quản trị cấu hình app ─────────────────────────────────────────────────────────
INSERT INTO "public"."permissions" ("id", "key", "name", "module", "scope")
VALUES
    ('01M0GSW200BJJPMAC6XTXXCBA7', 'platform.app_config.manage', 'platform.app_config.manage', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "public"."role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "public"."roles" r
JOIN "public"."permissions" p ON p."key" = 'platform.app_config.manage'
WHERE r."scope" = 'platform'
  AND r."key" = 'platform_admin'
  AND r."tenant_id" IS NULL
  AND r."is_system" = true
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- ── tenant_subscriptions.grace_guide_notified_at ─────────────────────────────────────────────
-- Cột CLAIM mốc email "đang ân hạn" (job subscription-lifecycle) — như expiry_notified_at: đánh dấu
-- cả khi cờ quảng bá gói tắt, nên bật cờ về sau không gửi bù.
ALTER TABLE "tenant_subscriptions" ADD COLUMN "grace_guide_notified_at" TIMESTAMPTZ(3);
