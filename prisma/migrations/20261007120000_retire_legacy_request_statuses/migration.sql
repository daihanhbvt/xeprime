-- ═══════════════════════════════════════════════════════════════════════════
-- GỠ HAI TRẠNG THÁI YÊU CẦU ĐÃ CHẾT (ADR 0055, 07/10/2026)
--
-- `booking_requests.status` chưa từng có CHECK (xem migration init) — giá trị hợp lệ chỉ sống ở
-- `@xeprime/types`. Migration này đặt ràng buộc đó, với ĐÚNG chín giá trị luồng hiện hành còn
-- ghi, và loại hai giá trị đã chết:
--
--   · `hold_paid` — "khách đã trả đủ, chờ gian hàng nhận" của luồng thu-trước-duyệt ADR 0039,
--     bị ADR 0044 thay. Mọi nhánh xử lý của nó ở API + worker bị gỡ cùng đợt này; luồng hiện hành
--     đi thẳng `awaiting_hold → converted_to_booking` trong transaction đối soát tiền về.
--   · `approved_by_host` — chưa từng có writer (ADR 0047 điều 7 đã xác minh).
--
-- Kèm một bất biến thứ hai, chính là thứ làm cho việc gỡ nhánh legacy AN TOÀN:
--
--   `awaiting_hold` ⇒ `decided_at IS NOT NULL`
--
-- Ở ADR 0044, một yêu cầu chỉ tới `awaiting_hold` qua lượt NHẬN chuyến, và lượt đó ghi
-- `decided_*` trong CÙNG câu UPDATE với `status`. Bản ghi `awaiting_hold` thiếu `decided_at` chỉ
-- có thể là dữ liệu của thời ADR 0039 — đúng cái nhánh code vừa bị gỡ. Ràng buộc này bảo đảm tiền
-- về không bao giờ mở đơn cho một chuyến chưa ai nhận.
--
-- `booking_cancellations.stage = 'hold_paid'` KHÔNG bị đụng: bảng đó là sổ lịch sử trách nhiệm,
-- một lượt huỷ đã xảy ra ở chặng ấy vẫn phải đọc được như nó đã xảy ra. Chỉ là không còn writer.
--
-- ───────────────────────────────────────────────────────────────────────────
-- KHÔNG đoán khi gặp dữ liệu sống của luồng cũ — dừng hẳn và nêu id:
--   · `hold_paid` là TIỀN THẬT của khách đang nằm ở XePrime chờ một quyết định. Không có phép SQL
--     nào chốt đúng nó (nhận ⇒ phải tạo đơn; từ chối ⇒ phải hoàn qua sổ ví) — xử lý xong bằng bản
--     API trước đợt này rồi mới chạy lại migration.
--   · `awaiting_hold` thiếu `decided_at` là một hold ADR 0039 chưa hết hạn; worker
--     `booking-hold-expiry` đóng nó sau tối đa 120 phút.
--
-- ⚠️ CHẠY LẠI ĐƯỢC: khối kiểm không đổi dữ liệu, và mỗi ràng buộc được DROP IF EXISTS trước khi
-- thêm.
--
-- ⚠️ ROLLBACK: image TRƯỚC mốc này ghi `hold_paid` như một bước tạm mỗi lần tiền giữ chỗ về đủ, nên
-- `booking_requests_status_valid` làm lượt đối soát của nó hỏng (và bị nuốt thành `match_failed`).
-- Rollback chỉ đổi image, không lùi migration ⇒ trước khi rollback qua mốc này phải
-- `ALTER TABLE booking_requests DROP CONSTRAINT booking_requests_status_valid;` — xem
-- `docs/deployment.md` §9.1. Khe ngắn giữa migrate và restart app lúc deploy có cùng rủi ro; chấp
-- nhận được khi chưa nhận tiền khách thật (roadmap R1).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    retired_count INT;
    retired_ids   TEXT;
    undecided_count INT;
    undecided_ids   TEXT;
BEGIN
    SELECT COUNT(*), STRING_AGG(r."id" || ' (' || r."status" || ')', ', ')
    INTO retired_count, retired_ids
    FROM "public"."booking_requests" r
    WHERE r."status" IN ('hold_paid', 'approved_by_host');

    IF retired_count > 0 THEN
        RAISE EXCEPTION
            'ADR 0055: % yêu cầu còn ở trạng thái đã gỡ — xử lý xong (nhận/từ chối/hoàn) bằng bản API '
            'trước rồi chạy lại. KHÔNG tự chuyển trạng thái: hold_paid đang giữ tiền thật của khách. Id: %',
            retired_count, retired_ids;
    END IF;

    SELECT COUNT(*), STRING_AGG(r."id", ', ')
    INTO undecided_count, undecided_ids
    FROM "public"."booking_requests" r
    WHERE r."status" = 'awaiting_hold'
      AND r."decided_at" IS NULL;

    IF undecided_count > 0 THEN
        RAISE EXCEPTION
            'ADR 0055: % yêu cầu awaiting_hold thiếu decided_at (hold của luồng ADR 0039 chưa đóng) — '
            'chờ worker booking-hold-expiry đóng chúng rồi chạy lại. Id: %',
            undecided_count, undecided_ids;
    END IF;
END $$;

ALTER TABLE "public"."booking_requests" DROP CONSTRAINT IF EXISTS "booking_requests_status_valid";
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_status_valid" CHECK (
    "status" IN (
        'pending_host_approval',
        'awaiting_hold',
        'converted_to_booking',
        'rejected_by_host',
        'cancelled_by_customer',
        'cancelled_by_host',
        'expired',
        'hold_expired',
        'slot_taken'
    )
);

ALTER TABLE "public"."booking_requests" DROP CONSTRAINT IF EXISTS "booking_requests_awaiting_hold_decided";
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_awaiting_hold_decided" CHECK (
    "status" <> 'awaiting_hold' OR "decided_at" IS NOT NULL
);
