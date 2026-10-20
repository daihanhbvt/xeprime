import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS_VALUES,
  isBookingFinal,
} from '@xeprime/types';

const OPEN_BOOKING_STATUSES = BOOKING_STATUS_VALUES.filter((status) => !isBookingFinal(status));
const OPEN_REQUEST_STATUSES: readonly string[] = [
  BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
  BOOKING_REQUEST_STATUS.AWAITING_HOLD,
];
/** Liệt kê tối đa ngần này chuyến vướng trong `details` — đủ để chủ xe biết mở đơn nào. */
const LIST_LIMIT = 20;

/**
 * Xe BỎ một loại dịch vụ mà vẫn còn chuyến ĐANG MỞ dùng loại đó (đơn chưa khép, yêu cầu còn chờ
 * duyệt / chờ tiền giữ chỗ) ⇒ từ chối, kèm danh sách chuyến vướng (quyết định sản phẩm
 * 19/10/2026). Khách đã đặt — có thể đã trả giữ chỗ — cho đúng loại đó; tắt dịch vụ mà chuyến vẫn
 * chạy để xe ở trạng thái nửa vời. Chuyến đã xong / huỷ là lịch sử, không cản.
 *
 * Áp cho MỌI người sửa xe; phiên hỗ trợ (ADR 0050) vẫn đi qua `assertNoOpenTrips` riêng của nó.
 */
export async function assertRemovedServicesNotInUse(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; vehicleId: string; removed: readonly string[] },
): Promise<void> {
  if (input.removed.length === 0) return;
  const serviceType = { in: [...input.removed] };
  const [bookings, requests] = await Promise.all([
    tx.booking.findMany({
      where: {
        tenantId: input.tenantId,
        vehicleId: input.vehicleId,
        deletedAt: null,
        status: { in: [...OPEN_BOOKING_STATUSES] },
        serviceType,
      },
      orderBy: { pickupAt: 'asc' },
      take: LIST_LIMIT,
      select: { id: true, code: true, serviceType: true, status: true, pickupAt: true },
    }),
    tx.bookingRequest.findMany({
      where: {
        tenantId: input.tenantId,
        vehicleId: input.vehicleId,
        status: { in: [...OPEN_REQUEST_STATUSES] },
        serviceType,
      },
      orderBy: { createdAt: 'asc' },
      take: LIST_LIMIT,
      select: { id: true, serviceType: true, status: true },
    }),
  ]);
  if (bookings.length + requests.length === 0) return;

  const codes = bookings.map((b) => b.code);
  throw new ConflictException({
    code: API_ERROR_CODE.VEHICLE_SERVICE_IN_USE,
    message:
      `Không bỏ được dịch vụ này: xe còn ${bookings.length} đơn và ${requests.length} yêu cầu ` +
      `chưa xong dùng dịch vụ đó${codes.length ? ` (${codes.join(', ')})` : ''}`,
    details: {
      serviceTypes: input.removed,
      bookings: bookings.map((b) => ({
        id: b.id,
        code: b.code,
        serviceType: b.serviceType,
        status: b.status,
        pickupAt: b.pickupAt.toISOString(),
      })),
      requests: requests.map((r) => ({ id: r.id, serviceType: r.serviceType, status: r.status })),
    },
  });
}
