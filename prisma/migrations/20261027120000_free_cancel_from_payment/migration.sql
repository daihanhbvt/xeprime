-- ADR 0072 — Cửa sổ huỷ miễn phí tính từ lúc tiền giữ chỗ về ĐỦ, không từ lúc chủ xe nhận chuyến.
--
-- `free_cancel_until` không còn được ghi lúc tạo khoản giữ chỗ: trước khi khách trả, chưa có đơn
-- nào để huỷ và khách chưa mất đồng nào (không trả thì hết hạn là tự huỷ — ADR 0044 điều 3). Mốc
-- được tính và ghi MỘT lần trong chính câu UPDATE lật hold sang `paid` (cùng lúc ghi `paid_at`).
--
-- Hàng cũ giữ nguyên giá trị: hold đã trả giữ mốc đã hứa với khách (ADR 0032 điều 5 — không viết
-- lại quyền đã có); hold còn chờ tiền sẽ được ghi đè bằng mốc mới khi tiền về.
ALTER TABLE "booking_holds" ALTER COLUMN "free_cancel_until" DROP NOT NULL;

-- Bất biến: hold đã trả đủ (có `paid_at`) luôn có mốc huỷ miễn phí — lượt chốt kết cục huỷ
-- (`decideOutcome`) đọc nó để chia tiền, nên thiếu nó là chia sai tiền.
ALTER TABLE "booking_holds"
  ADD CONSTRAINT "booking_holds_paid_has_free_cancel"
  CHECK ("paid_at" IS NULL OR "free_cancel_until" IS NOT NULL);
