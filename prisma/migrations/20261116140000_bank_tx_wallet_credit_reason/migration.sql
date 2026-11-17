-- ADR 0092 — tiền vào ngoại lệ: khớp tay vào khoản giữ chỗ / phụ lục còn hạn, ghi có Ví điểm
-- khách cho tiền về muộn, tự ghi có ví gian hàng phần gói chuyển thừa, và MÃ lý do thay cho câu
-- chữ server ghi vào `match_note`.

-- ── 1. Đích khớp mới: ghi có thẳng vào Ví điểm (`matched_ref_id` → wallet_entries.id) ──────────
ALTER TABLE "public"."bank_transactions" DROP CONSTRAINT "bank_transactions_matched_type_check";
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_type_check"
    CHECK ("matched_type" IS NULL OR "matched_type" IN (
        'subscription_invoice', 'booking_hold', 'withdrawal_request', 'booking_extension',
        'subscription_checkout', 'wallet_credit'
    ));

-- ── 2. Mã lý do hệ thống ghi (dịch ở giao diện — ADR 0012); `match_note` chỉ còn của NGƯỜI ────
ALTER TABLE "public"."bank_transactions"
    ADD COLUMN "match_reason_code"   VARCHAR(40),
    ADD COLUMN "match_reason_params" JSONB;
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_match_reason_code_check"
    CHECK ("match_reason_code" IS NULL OR "match_reason_code" IN (
        'hold_not_found', 'hold_closed', 'extension_not_found', 'extension_closed',
        'checkout_not_found', 'checkout_closed', 'invoice_not_found', 'invoice_closed', 'overpaid'
    ));
-- Lọc hàng đợi theo lý do (khoản về muộn, chuyển thừa) đi cùng trạng thái khớp.
CREATE INDEX "bank_transactions_match_status_reason_idx"
    ON "public"."bank_transactions" ("match_status", "match_reason_code");

-- Dòng cũ: máy từng ghi mã `overpaid` thẳng vào `match_note` — chuyển sang cột mã. Các ghi chú
-- câu chữ khác của máy giữ nguyên (giao diện vẫn hiện chúng như chữ cũ).
UPDATE "public"."bank_transactions"
   SET "match_reason_code" = 'overpaid', "match_note" = NULL
 WHERE "match_note" = 'overpaid';

-- ── 3. Sổ ví: hai loại bút toán + một nguồn mới ─────────────────────────────────────────────
ALTER TABLE "public"."wallet_entries" DROP CONSTRAINT "wallet_entries_kind_check";
ALTER TABLE "public"."wallet_entries" ADD CONSTRAINT "wallet_entries_kind_check"
    CHECK ("kind" IN (
        'hold_forfeit', 'hold_release', 'hold_refund', 'hold_overpay', 'withdrawal',
        'withdrawal_reversal', 'adjustment', 'extension_release', 'extension_refund',
        'late_payment_refund', 'subscription_overpay'
    ));
ALTER TABLE "public"."wallet_entries" DROP CONSTRAINT "wallet_entries_source_type_check";
ALTER TABLE "public"."wallet_entries" ADD CONSTRAINT "wallet_entries_source_type_check"
    CHECK ("source_type" IN (
        'booking_hold', 'withdrawal_request', 'manual', 'booking_extension', 'bank_transaction'
    ));
