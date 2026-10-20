import type { Prisma } from '@xeprime/prisma';
import { toLocalVnPhone } from '@xeprime/types';
import type { BookingDriverSummaryDto } from './dto/driver.dto';

/**
 * Tài xế gắn trên một đơn (ADR 0063) — MỘT phép chọn và MỘT mapper cho mọi danh sách đơn của khu
 * quản lý (danh sách đơn, lịch sử thuê của khách…), để cột "Tài xế" ở mọi bảng đọc cùng một hình.
 */
export const BOOKING_DRIVER_SELECT = {
  driver: { select: { id: true, name: true, phone: true } },
  driverAssignmentStatus: true,
  driverAssignedAt: true,
  driverRespondedAt: true,
} satisfies Prisma.BookingSelect;

type BookingDriverRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_DRIVER_SELECT }>;

export function toBookingDriverSummary(b: BookingDriverRow): BookingDriverSummaryDto | null {
  return b.driver && b.driverAssignmentStatus && b.driverAssignedAt
    ? {
        id: b.driver.id,
        name: b.driver.name,
        phone: toLocalVnPhone(b.driver.phone),
        assignmentStatus: b.driverAssignmentStatus,
        assignedAt: b.driverAssignedAt.toISOString(),
        respondedAt: b.driverRespondedAt?.toISOString() ?? null,
      }
    : null;
}
