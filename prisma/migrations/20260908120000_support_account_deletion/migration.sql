-- ═══════════════════════════════════════════════════════════════════════════
-- Support case: loại `account_deletion` + tối đa MỘT yêu cầu xoá tài khoản còn mở mỗi người
-- (08/09/2026 — khu tài khoản /account, mục "Yêu cầu xoá tài khoản")
--
-- Xoá tài khoản là một YÊU CẦU do chính chủ tài khoản mở và nền tảng xử lý tay — không phải một
-- cú xoá cứng: người dùng còn đơn thuê, hoá đơn, phiếu thu và audit mà chưa có chính sách lưu
-- trữ/ẩn danh hoá để xoá. Tái dùng bảng `support_cases` để yêu cầu có mã, có SLA, có dòng thời
-- gian như mọi case khác.
--
-- VIẾT TAY vì Prisma không mô tả được partial unique index. `schema.prisma` có ghi chú ở model
-- `SupportCase`; `migrate dev` sẽ đề nghị DROP index này — đừng nhận.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. CHECK loại case: thêm 'account_deletion' ─────────────────────────────
-- Giá trị cũ giữ nguyên, chỉ THÊM một giá trị hợp lệ; cả migration chạy trong một transaction
-- nên không có hàng nào lọt vào giữa DROP và ADD.

ALTER TABLE "public"."support_cases"
    DROP CONSTRAINT IF EXISTS "support_cases_category_check";

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_category_check"
    CHECK ("category" IN ('dispute', 'incident', 'payment', 'account', 'account_deletion', 'other'));

-- ── 2. Mỗi người tối đa MỘT yêu cầu xoá tài khoản CÒN MỞ ────────────────────
-- Partial unique: chỉ hàng còn mở mới đếm, nên rút yêu cầu rồi gửi lại vẫn được (hàng cũ đã
-- `closed`). Đây là người gác thật; service bắt P2002 và trả về case đang mở thay vì tạo trùng.
-- Tập trạng thái "còn mở" khớp `SUPPORT_CASE_STATUS_OPEN` ở @xeprime/types.

CREATE UNIQUE INDEX "support_cases_open_account_deletion_key"
    ON "public"."support_cases" ("opened_by_user_id")
    WHERE "category" = 'account_deletion'
      AND "status" IN ('open', 'in_progress', 'waiting_party');
