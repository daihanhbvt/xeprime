import { ConflictException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_STATUS_META,
  isBookingClosedWithoutTrip,
  type BookingStatus,
} from '@xeprime/types';

/**
 * Chặn GHI TIỀN MỚI lên đơn đã huỷ / khách không đến: thu tiền thuê, thu cọc, ghi hoặc sửa phát
 * sinh (09/11/2026).
 *
 * Đơn đang chạy không huỷ được (ADR 0045 điều 1), nên hai trạng thái này là chuyến chưa từng giao
 * xe. Một phiếu thu tiền thuê ở đó là doanh thu của một chuyến không có thật — nó vào sổ Thu-Chi và
 * báo cáo, trong khi công nợ (`SQL_DEBT_SCOPE`) đã loại chính đơn đó. Phát sinh và cọc thế chấp
 * thì không có lý do tồn tại khi xe chưa lăn bánh.
 *
 * Hoàn lại phần ĐÃ thu (huỷ giao dịch, ghi hoàn cọc, gỡ phát sinh lỡ ghi) KHÔNG đi qua đây: đơn huỷ
 * chính là nơi cần những đường đó nhất.
 *
 * Khoá dòng đơn `FOR UPDATE` TRONG transaction của người gọi: lượt huỷ chạy song song phải chờ lượt
 * ghi này xong (hoặc ngược lại), nên không có khe nào để một phiếu thu lọt vào đơn vừa huỷ.
 */
export async function assertBookingMoneyOpenWithinTx(
  tx: Prisma.TransactionClient,
  bookingId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM bookings WHERE id = ${bookingId} FOR UPDATE`;
  const status = rows[0]?.status as BookingStatus | undefined;
  if (status === undefined || !isBookingClosedWithoutTrip(status)) return;
  throw new ConflictException({
    code: API_ERROR_CODE.BOOKING_MONEY_CLOSED,
    message: `Đơn đã ở trạng thái "${BOOKING_STATUS_META[status].label}" nên không ghi thu tiền, thu cọc hay phát sinh mới được nữa`,
  });
}
