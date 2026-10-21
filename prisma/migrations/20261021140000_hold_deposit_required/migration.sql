-- ═══════════════════════════════════════════════════════════════════════════
-- `booking_holds.deposit_required` — chuyến này có thu CỌC qua XePrime hay không, ĐÓNG BĂNG lúc
-- duyệt (21/10/2026 · ADR 0064 điều 5 · ADR 0025 ràng buộc 4 · ADR 0028 điều 9).
--
-- Vì sao cần cột: từ luồng tiền v2, một gian hàng tuyến gói TẮT công tắc thu cọc vẫn có hold —
-- khoản online lúc đó là `S + H + IV + IP + T` (mọi thứ không phải tiền của chủ xe), không có đồng
-- cọc nào. Lượt đối soát tiền về trước bản này luôn đóng băng `bookings.deposit_collection_mode =
-- 'platform'`, tức là nói với khách rằng XePrime đã giữ cọc của họ — sai: cọc do chủ xe thu trực
-- tiếp (`direct`). Có hold hay không KHÔNG trả lời được câu "XePrime có giữ cọc không", và
-- `price_snapshot_json` không mang quyết định đó (cọc = phần online trừ các dòng phí — một chuyến
-- có 30% đúng bằng sàn `S + H + IV + IP + T` là không phân biệt được). Nên quyết định phải được
-- ghi ra, ở chính lúc nó được dùng để tính khoản online.
--
-- BACKFILL = true cho MỌI dòng hiện có. Đã đối chiếu:
--   • `DEPOSIT_COLLECTION_PLATFORM_MANDATORY = true` từ 17/09/2026 (commit 862b3f87) và chưa từng
--     về `false` — mọi hold sinh từ ngày đó đều có `DepositPolicyResolution.required = true`.
--     Mọi hold còn đang chờ tiền lúc deploy (cửa sổ tối đa 120′) vì thế đúng là "có thu cọc".
--   • Mọi đơn đã sinh từ một hold đều đã đóng băng `platform` — backfill `true` nói ĐÚNG điều các
--     đơn đó đã ghi; cột chỉ được ĐỌC ở lượt tiền về, nên không đơn cũ nào bị viết lại.
--
-- KHÔNG có DEFAULT sau backfill: người ghi DUY NHẤT (`BookingHoldsService
-- .createForApprovedRequestWithinTx`) phải tự nói câu trả lời, không được thừa hưởng một mặc định
-- nói thay nó rằng XePrime đã giữ tiền cọc của khách.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."booking_holds" ADD COLUMN "deposit_required" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."booking_holds" ALTER COLUMN "deposit_required" DROP DEFAULT;
