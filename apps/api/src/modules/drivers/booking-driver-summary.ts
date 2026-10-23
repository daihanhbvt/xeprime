import type { Prisma } from '@xeprime/prisma';
import { DRIVER_ASSIGNMENT_STATUS, DRIVER_SOURCE, toLocalVnPhone } from '@xeprime/types';
import type { BookingDriverSummaryDto } from './dto/driver.dto';

/**
 * Tài xế gắn trên một đơn (ADR 0063 · ADR 0067) — MỘT phép chọn và MỘT mapper cho mọi danh sách
 * đơn của khu quản lý (danh sách đơn, lịch sử thuê của khách…) và trang chuyến, để cột "Tài xế" ở
 * mọi bảng đọc cùng một hình — dù người lái là tài xế LIÊN KẾT hay tài xế NGOÀI HỆ THỐNG.
 */
export const BOOKING_DRIVER_SELECT = {
  driver: { select: { id: true, name: true, phone: true } },
  driverAssignmentStatus: true,
  driverAssignedAt: true,
  driverRespondedAt: true,
  driverRespondBy: true,
  externalDriverName: true,
  externalDriverPhone: true,
} satisfies Prisma.BookingSelect;

type BookingDriverRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_DRIVER_SELECT }>;

/** Bản đủ cho BÊN THUÊ (khu quản lý, phía chủ xe của trang chuyến). */
export function toBookingDriverSummary(b: BookingDriverRow): BookingDriverSummaryDto | null {
  if (b.driver && b.driverAssignmentStatus && b.driverAssignedAt) {
    return {
      source: DRIVER_SOURCE.LINKED,
      id: b.driver.id,
      name: b.driver.name,
      phone: toLocalVnPhone(b.driver.phone),
      assignmentStatus: b.driverAssignmentStatus,
      assignedAt: b.driverAssignedAt.toISOString(),
      respondedAt: b.driverRespondedAt?.toISOString() ?? null,
      respondBy: b.driverRespondBy?.toISOString() ?? null,
    };
  }
  // Ngoài hệ thống: không có lượt chờ — coi là đã nhận ngay khi lưu (ADR 0067 điều 1). CHECK
  // nhất quán bảo đảm có `driver_assigned_at` khi có tên.
  if (b.externalDriverName && b.externalDriverPhone && b.driverAssignedAt) {
    return {
      source: DRIVER_SOURCE.EXTERNAL,
      id: null,
      name: b.externalDriverName,
      phone: toLocalVnPhone(b.externalDriverPhone),
      assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
      assignedAt: b.driverAssignedAt.toISOString(),
      respondedAt: null,
      respondBy: null,
    };
  }
  return null;
}

/**
 * Bản cho KHÁCH của chính đơn — người sẽ đến đón (ADR 0067 điều 1: "cùng một chỗ, cùng một hình"
 * cho hai nguồn). Chỉ người ĐÃ chốt: tài xế liên kết còn chờ nhận thì chưa phải người sẽ đến, nên
 * khách thấy "Đang sắp xếp tài xế" (`null`). Không lộ id liên kết hay hạn trả lời nội bộ.
 */
export function toRenterDriverSummary(b: BookingDriverRow): BookingDriverSummaryDto | null {
  const full = toBookingDriverSummary(b);
  if (!full || full.assignmentStatus !== DRIVER_ASSIGNMENT_STATUS.ACCEPTED) return null;
  return { ...full, id: null, respondedAt: null, respondBy: null };
}
