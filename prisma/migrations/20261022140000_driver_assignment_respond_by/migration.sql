-- ═══════════════════════════════════════════════════════════════════════════
-- Hạn tài xế trả lời lượt gán — ADR 0066 (ghi đè "Lượt chờ KHÔNG hết hạn" của ADR 0063 điều 6)
--
-- `bookings.driver_respond_by` = mốc tài xế phải Nhận/Từ chối, server tính lúc gán bằng
-- `driverRespondByFor` (@xeprime/types): clamp(round(10% × (pickup − gán)), 15′, 60′). Quá mốc mà
-- lượt vẫn `pending` ⇒ worker trả lượt về bên thuê (bốn cột tài xế + mốc này về NULL), khép dòng
-- sổ `booking_driver_assignments` bằng kết cục MỚI `expired`, báo khẩn bên thuê. Đơn của khách
-- KHÔNG bị huỷ.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): CHECK
--   `bookings_driver_respond_by_check`, index một phần `bookings_driver_respond_by_pending_idx`,
--   CHECK `booking_driver_assignments_outcome_check` (thay bản của 20261019120000).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "bookings" ADD COLUMN "driver_respond_by" TIMESTAMPTZ(3);

-- Nạp lại lượt đang chờ: chúng được gán dưới luật CŨ (không hạn) và tài xế chưa từng thấy một mốc
-- nào — nên mốc = gán + 60′ (trần của luật mới), nhưng KHÔNG sớm hơn 15′ sau lúc migrate. Không có
-- sàn đó, mọi lượt gán quá một giờ sẽ hết hạn ngay ở nhịp quét đầu tiên sau deploy, trước khi tài
-- xế kịp mở thông báo.
UPDATE "bookings"
SET "driver_respond_by" = GREATEST(
        "driver_assigned_at" + INTERVAL '60 minutes',
        CURRENT_TIMESTAMP + INTERVAL '15 minutes'
    )
WHERE "driver_assignment_status" = 'pending';

-- Có hạn ⇔ lượt đang chờ. Nhận chuyến hay gỡ lượt thì mốc về NULL cùng lúc; COALESCE vì
-- `NULL = 'pending'` là NULL và CHECK coi NULL là đạt.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_respond_by_check"
    CHECK (COALESCE("driver_assignment_status" = 'pending', false) = ("driver_respond_by" IS NOT NULL));

-- Phép quét của worker: lượt chờ đã quá hạn, sớm nhất trước. Một phần — 99% đơn không có lượt chờ.
CREATE INDEX "bookings_driver_respond_by_pending_idx"
    ON "bookings" ("driver_respond_by")
    WHERE "driver_assignment_status" = 'pending' AND "deleted_at" IS NULL;

-- Kết cục mới của sổ lượt gán.
ALTER TABLE "booking_driver_assignments" DROP CONSTRAINT "booking_driver_assignments_outcome_check";
ALTER TABLE "booking_driver_assignments" ADD CONSTRAINT "booking_driver_assignments_outcome_check"
    CHECK ("outcome" IN ('open', 'declined', 'unassigned', 'cancelled', 'no_show', 'completed', 'expired'));
