import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS_VALUES,
  isBookingFinal,
} from '@xeprime/types';

/** Đơn chưa kết thúc — suy từ bảng chuyển trạng thái, không liệt kê tay. */
const OPEN_BOOKING_STATUSES = BOOKING_STATUS_VALUES.filter((status) => !isBookingFinal(status));

/** Yêu cầu còn đang chờ một quyết định/khoản tiền (kể cả chặng legacy `approved_by_host`). */
const OPEN_REQUEST_STATUSES: readonly string[] = [
  BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
  BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
  BOOKING_REQUEST_STATUS.AWAITING_HOLD,
  BOOKING_REQUEST_STATUS.HOLD_PAID,
];

/**
 * Phiên hỗ trợ KHÔNG làm hỏng một chuyến đang sống (ADR 0050 §13): chuyển chi nhánh, đổi địa chỉ
 * chi nhánh (đổi nơi giao xe) hay bỏ một dịch vụ mà khách đang hỏi/đang thuê là âm thầm đổi nghĩa
 * của cam kết đó. Bản đầu TỪ CHỐI, không tự sửa điểm giao nhận của đơn.
 *
 * Phạm vi: một xe (`vehicleId`) hoặc mọi xe của một chi nhánh (`branchId`). `serviceTypes` vắng =
 * mọi dịch vụ.
 */
export async function assertNoOpenTrips(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    vehicleId?: string;
    branchId?: string;
    serviceTypes?: readonly string[];
  },
): Promise<void> {
  const vehicle = input.vehicleId
    ? { vehicleId: input.vehicleId }
    : { vehicle: { branchId: input.branchId } };
  const service = input.serviceTypes ? { serviceType: { in: [...input.serviceTypes] } } : {};
  const [bookings, requests] = await Promise.all([
    tx.booking.count({
      where: {
        tenantId: input.tenantId,
        ...vehicle,
        status: { in: [...OPEN_BOOKING_STATUSES] },
        ...service,
      },
    }),
    tx.bookingRequest.count({
      where: {
        tenantId: input.tenantId,
        ...vehicle,
        status: { in: [...OPEN_REQUEST_STATUSES] },
        ...service,
      },
    }),
  ]);
  if (bookings + requests > 0) {
    throw new ConflictException({
      code: API_ERROR_CODE.SUPPORT_OPEN_TRIPS,
      message: 'Có chuyến chưa kết thúc — phiên hỗ trợ không thay đổi điều này',
      details: { openBookings: bookings, openRequests: requests },
    });
  }
}
