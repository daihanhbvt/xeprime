-- Rà soát màn Tài chính (01/10/2026) — hai thứ `schema.prisma` không diễn đạt được.

-- ── 1. Kết cục LEGACY không được chốt trên khoản có BỐN DÒNG TIỀN ───────────────────────────────
--
-- `kept` / `forfeited` / `released_to_shop` không phân bổ gì: chốt chúng trên một khoản có cọc
-- (của chủ xe), phí (của XePrime) và bảo hiểm (của hãng) là để nền tảng giữ trọn — hoặc đẩy trọn
-- về một phía — tiền của người khác. Đường tự động không bao giờ chọn chúng; chốt tay bị
-- `adminSettleOutcomes` chặn ở tầng app. Đây là lớp DB, để không đường ghi nào (script, worker
-- tương lai) lách được.
--
-- `NOT VALID` rồi mới `VALIDATE` có điều kiện: dữ liệu production đời cũ có thể đã mang một dòng
-- vi phạm (trước đợt này chốt tay chưa bị chặn). Có dòng như vậy thì ràng buộc vẫn canh mọi lượt
-- ghi MỚI, chỉ chưa được đánh dấu "đã kiểm toàn bảng" — và migration báo NOTICE để người vận hành
-- tra, thay vì làm hỏng cả lần deploy.
ALTER TABLE booking_holds
  ADD CONSTRAINT booking_holds_legacy_outcome_without_lines_check CHECK (
    outcome IS NULL
    OR outcome NOT IN ('kept', 'forfeited', 'released_to_shop')
    OR (deposit_amount + service_fee_amount + vehicle_insurance_amount + personal_insurance_amount) = 0
  ) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM booking_holds
    WHERE outcome IN ('kept', 'forfeited', 'released_to_shop')
      AND (deposit_amount + service_fee_amount + vehicle_insurance_amount + personal_insurance_amount) > 0
  ) THEN
    ALTER TABLE booking_holds VALIDATE CONSTRAINT booking_holds_legacy_outcome_without_lines_check;
  ELSE
    RAISE NOTICE 'booking_holds_legacy_outcome_without_lines_check: còn dòng cũ vi phạm — ràng buộc canh lượt ghi mới, CHƯA validate toàn bảng';
  END IF;
END $$;

-- ── 2. Index cho thẻ "Thuế chưa kê khai" ─────────────────────────────────────────────────────────
--
-- Thẻ đếm MỌI kỳ còn dòng `accrued` (+ kỳ cũ nhất), tự làm mới mỗi phút. Index sẵn có bắt đầu bằng
-- `period_key` nên không phục vụ được lọc chỉ theo trạng thái; partial index này chỉ chứa dòng chưa
-- kê khai — nhỏ, và nhỏ dần khi từng kỳ được kê khai.
CREATE INDEX tax_withholdings_accrued_period_idx
  ON tax_withholdings (period_key)
  WHERE status = 'accrued';
