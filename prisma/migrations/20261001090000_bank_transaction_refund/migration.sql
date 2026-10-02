-- ════════════════════════════════════════════════════════════════════════════════════════════
-- GHI NHẬN ĐÃ TRẢ LẠI NGƯỜI GỬI cho giao dịch tiền vào bị BỎ QUA — màn Tài chính (01/10/2026)
--
-- "Bỏ qua" là kết luận "khoản này không thuộc luồng nào của nền tảng" (chuyển nhầm, tiền của việc
-- khác). Phần lớn những khoản đó phải được CHUYỂN TRẢ — và trước migration này lần chuyển trả chỉ
-- còn là một câu trong ghi chú, không có mã giao dịch nào để đối chiếu chiều RA.
--
-- Hai cột đi cặp, cả hai do CHECK canh:
--   1. có mã thì có thời điểm, và ngược lại — một nửa cặp là một lời khai không kiểm được;
--   2. chỉ dòng `ignored` mới mang chúng — tiền đã khớp vào hoá đơn/giữ chỗ thì không "trả lại".
--
-- Thuần cộng thêm: cột NULL, không backfill, không đổi dòng nào đang có.
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."bank_transactions"
    ADD COLUMN "refund_reference" VARCHAR(100),
    ADD COLUMN "refunded_at" TIMESTAMPTZ(3);

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_refund_pair_check"
    CHECK (("refund_reference" IS NULL) = ("refunded_at" IS NULL));

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_refund_ignored_only_check"
    CHECK ("refunded_at" IS NULL OR "match_status" = 'ignored');
