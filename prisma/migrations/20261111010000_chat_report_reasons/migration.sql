-- Lý do báo cáo hội thoại do nền tảng cấu hình (thay cho 5 mã cố định trong code).
-- Báo cáo trỏ tới lý do (RESTRICT — lý do đã dùng chỉ tắt được) và CHỤP nhãn lúc gửi.

CREATE TABLE "chat_report_reasons" (
    "id" CHAR(26) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_report_reasons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_report_reasons_label_not_blank" CHECK (length(btrim("label")) > 0)
);

CREATE INDEX "chat_report_reasons_is_active_sort_order_idx"
    ON "chat_report_reasons"("is_active", "sort_order");

-- Bảng báo cáo chưa từng lên môi trường nào ngoài máy dev: dữ liệu thử bỏ đi, không di chuyển.
DELETE FROM "chat_reports";

ALTER TABLE "chat_reports" DROP COLUMN "reason";
ALTER TABLE "chat_reports" ADD COLUMN "reason_id" CHAR(26) NOT NULL;
ALTER TABLE "chat_reports" ADD COLUMN "reason_label" VARCHAR(120) NOT NULL;

CREATE INDEX "chat_reports_reason_id_idx" ON "chat_reports"("reason_id");

ALTER TABLE "chat_reports" ADD CONSTRAINT "chat_reports_reason_id_fkey"
    FOREIGN KEY ("reason_id") REFERENCES "chat_report_reasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
