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

-- 2. Báo cáo. Lý do là MÃ của bộ từ vựng đóng `CHAT_REPORT_REASON` (@xeprime/types), nhãn vi/en
--    ở `Chat.reportReasons.<mã>` của packages/domain/messages — ADR 0012: mã là dữ liệu, chỉ nhãn
--    mới dịch. Thêm một lý do = thêm mã ở @xeprime/types + nới CHECK này bằng migration mới.
CREATE TABLE "chat_reports" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "reporter_user_id" CHAR(26),
    "reporter_side" VARCHAR(20) NOT NULL,
    "reason" VARCHAR(40) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_reports_reporter_side_check" CHECK ("reporter_side" IN ('customer', 'shop')),
    CONSTRAINT "chat_reports_reason_check" CHECK (
        "reason" IN ('spam', 'harassment', 'scam', 'inappropriate_content', 'other')
    )
);

CREATE INDEX "chat_reports_created_at_idx" ON "chat_reports"("created_at");
CREATE INDEX "chat_reports_conversation_id_idx" ON "chat_reports"("conversation_id");

ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reporter_user_id_fkey"
    FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
