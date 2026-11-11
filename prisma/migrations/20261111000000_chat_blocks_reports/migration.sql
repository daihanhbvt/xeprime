-- Chặn + báo cáo hội thoại (App Store Guideline 1.2).

-- 1. Chặn: theo hội thoại (mỗi cặp khách - gian hàng có đúng một hội thoại), hai phía độc lập.
CREATE TABLE "chat_blocks" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "blocked_by" VARCHAR(20) NOT NULL,
    "created_by_user_id" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_blocks_blocked_by_check" CHECK ("blocked_by" IN ('customer', 'shop'))
);

CREATE UNIQUE INDEX "chat_blocks_conversation_id_blocked_by_key"
    ON "chat_blocks"("conversation_id", "blocked_by");

ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Lý do báo cáo: dữ liệu của nền tảng, nhãn tiếng Việt + tiếng Anh (label_en NULL ⇒ client
--    dùng nhãn tiếng Việt). Không xoá được lý do đã dùng — chỉ tắt (is_active = false).
CREATE TABLE "chat_report_reasons" (
    "id" CHAR(26) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "label_en" VARCHAR(120),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_report_reasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_report_reasons_label_not_blank" CHECK (length(btrim("label")) > 0)
);

CREATE INDEX "chat_report_reasons_is_active_sort_order_idx"
    ON "chat_report_reasons"("is_active", "sort_order");

-- Năm lý do mặc định. Id cố định để chạy lại an toàn và để mọi môi trường có cùng id.
INSERT INTO "chat_report_reasons" ("id", "label", "label_en", "is_active", "sort_order", "created_at", "updated_at") VALUES
    ('01JCHATRSN0000000000000001', 'Spam, quảng cáo', 'Spam or advertising', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000002', 'Quấy rối, xúc phạm', 'Harassment or abuse', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000003', 'Lừa đảo', 'Scam or fraud', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000004', 'Nội dung không phù hợp', 'Inappropriate content', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('01JCHATRSN0000000000000005', 'Khác', 'Other', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 3. Báo cáo: trỏ tới lý do (RESTRICT) và chụp nhãn lý do lúc gửi.
CREATE TABLE "chat_reports" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "reporter_user_id" CHAR(26),
    "reporter_side" VARCHAR(20) NOT NULL,
    "reason_id" CHAR(26) NOT NULL,
    "reason_label" VARCHAR(120) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_reports_reporter_side_check" CHECK ("reporter_side" IN ('customer', 'shop'))
);

CREATE INDEX "chat_reports_created_at_idx" ON "chat_reports"("created_at");
CREATE INDEX "chat_reports_conversation_id_idx" ON "chat_reports"("conversation_id");
CREATE INDEX "chat_reports_reason_id_idx" ON "chat_reports"("reason_id");

ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_user_id_fkey"
    FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reason_id_fkey"
    FOREIGN KEY ("reason_id") REFERENCES "chat_report_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
