-- ════════════════════════════════════════════════════════════════════════════════════════════
-- LỆNH RÚT ĐÃ ĐẢO (chuyển hụt / sai tài khoản) — trạng thái cuối `reversed` (01/10/2026)
--
-- Trước migration này, đảo một lệnh đã chuyển chỉ ghi DÒNG ĐẢO vào sổ ví (đúng ADR 0025 điều 7)
-- mà giữ nguyên `status = 'paid'`. Hệ quả có thật:
--   • chủ ví vẫn thấy "Đã chuyển" cho một khoản tiền đã quay về ví — trong khi ADR yêu cầu báo
--     họ tạo lệnh mới với tài khoản đúng;
--   • hàng đợi admin vẫn mời "đảo" thêm lần nữa, và lần bấm thứ hai vỡ thành một lỗi CONFLICT
--     chung chung ("bút toán này đã được đảo rồi").
--
-- Cả hai SỰ KIỆN vẫn được giữ nguyên: `paid_at`/`paid_by`/`bank_reference` của lần chi không bị
-- xoá, và sổ ví vẫn có cả dòng chi lẫn dòng đảo. Trạng thái chỉ nói lệnh đang ở ĐÂU.
--
-- Ba cột mới ghi ai đảo, lúc nào, vì sao — CHECK đòi đủ cả ba cùng bằng chứng lần chi trước đó.
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."withdrawal_requests"
    ADD COLUMN "reversed_at"    TIMESTAMPTZ(3),
    ADD COLUMN "reversed_by"    CHAR(26),
    ADD COLUMN "reverse_reason" TEXT;

ALTER TABLE "public"."withdrawal_requests"
    DROP CONSTRAINT "withdrawal_requests_status_check";

ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_status_check"
    CHECK ("status" IN ('pending', 'approved', 'paid', 'rejected', 'cancelled', 'reversed'));

-- ── Sửa dữ liệu ĐÃ đảo bằng code cũ ───────────────────────────────────────────────────────────
-- Một lệnh `paid` có dòng chi đã bị đảo chính là một lệnh `reversed` chưa được gọi đúng tên. Lấy
-- người/lúc/lý do từ CHÍNH dòng đảo trên sổ ví — nguồn duy nhất còn giữ chúng.
UPDATE "public"."withdrawal_requests" AS w
   SET "status"         = 'reversed',
       "reversed_at"    = r."created_at",
       "reversed_by"    = r."created_by_user_id",
       "reverse_reason" = COALESCE(r."note", 'Đảo lệnh đã chuyển'),
       "row_version"    = w."row_version" + 1
  FROM "public"."wallet_entries" AS paid_entry
  JOIN "public"."wallet_entries" AS r ON r."reversal_of_entry_id" = paid_entry."id"
 WHERE paid_entry."kind" = 'withdrawal'
   AND paid_entry."source_ref_id" = w."id"
   AND w."status" = 'paid';

-- Lệnh đã đảo phải là lệnh ĐÃ TỪNG CHI (có bằng chứng chuyển) và mang đủ dấu vết lần đảo.
ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_reversed_evidence_check"
    CHECK (
        "status" <> 'reversed'
        OR ("paid_at" IS NOT NULL AND "bank_reference" IS NOT NULL
            AND "reversed_at" IS NOT NULL AND "reverse_reason" IS NOT NULL)
    );
