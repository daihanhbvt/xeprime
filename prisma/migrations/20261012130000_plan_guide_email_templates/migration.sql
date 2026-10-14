-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Bộ mẫu email "Hướng dẫn đăng ký và gia hạn gói" do admin nền tảng quản lý + loại thư thử
-- `plan_guide_test` trong `email_outbox` (docs/app-config-sse.md).
--
-- Một BỘ MẪU (`plan_guide_email_templates`) có ĐỦ bốn nội dung (`plan_guide_email_template_variants`:
-- welcome · expiring · expired · grace). Đúng MỘT bộ đang dùng; hệ thống chọn nội dung theo lý do
-- gửi (PLAN_GUIDE_REASON_VARIANT ở @xeprime/types). "Đủ bốn" do service + seed gác.
--
-- Năm bộ mẫu do seed hệ thống (`SEED_MODE=system`) nạp — chưa có bộ nào đang dùng thì dispatcher
-- giữ thư ở hàng đợi (không gửi một email trống), nên production phải chạy seed system sau
-- migration này.
-- ════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE "plan_guide_email_templates" (
    "id" CHAR(26) NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "plan_guide_email_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_guide_email_templates_version_check" CHECK ("version" >= 1),
    -- Bộ đã xoá mềm không được đang dùng.
    CONSTRAINT "plan_guide_email_templates_deleted_inactive_check"
        CHECK ("deleted_at" IS NULL OR "is_active" = false)
);

CREATE INDEX "plan_guide_email_templates_deleted_at_updated_at_idx"
    ON "plan_guide_email_templates"("deleted_at", "updated_at");

-- ĐÚNG MỘT bộ đang dùng — DB gác, không phải app (hai admin bấm "Dùng bộ này" cùng lúc).
CREATE UNIQUE INDEX "plan_guide_email_templates_single_active_key"
    ON "plan_guide_email_templates"("is_active") WHERE "is_active" = true;

-- Mã unique trong các bộ chưa xoá (xoá mềm xong dùng lại được mã).
CREATE UNIQUE INDEX "plan_guide_email_templates_code_key"
    ON "plan_guide_email_templates"("code") WHERE "deleted_at" IS NULL;

CREATE TABLE "plan_guide_email_template_variants" (
    "template_id" CHAR(26) NOT NULL,
    "variant" VARCHAR(20) NOT NULL,
    "subject_vi" VARCHAR(200) NOT NULL,
    "subject_en" VARCHAR(200) NOT NULL,
    "body_vi" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_guide_email_template_variants_pkey" PRIMARY KEY ("template_id", "variant"),
    CONSTRAINT "plan_guide_email_template_variants_variant_check"
        CHECK ("variant" IN ('welcome', 'expiring', 'expired', 'grace')),
    -- Bộ mẫu chỉ xoá mềm; CASCADE chỉ chạy khi xoá cứng (dọn test).
    CONSTRAINT "plan_guide_email_template_variants_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "plan_guide_email_templates"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "email_outbox" DROP CONSTRAINT IF EXISTS "email_outbox_kind_check";
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_kind_check"
    CHECK ("kind" IN ('plan_guide', 'plan_guide_test'));
