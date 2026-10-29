import type { Prisma } from '@xeprime/prisma';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_SOURCE,
  driverIncidentState,
  toLocalVnPhone,
} from '@xeprime/types';
import type {
  BookingDriverIncidentDto,
  BookingDriverSummaryDto,
  TripDriverIncidentDto,
} from './dto/driver.dto';

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

/**
 * Cột SỰ CỐ TÀI XẾ của một đơn (ADR 0074) — tài xế đã nhận rồi rút, chưa ai nhận lại. Bản cho KHÁCH
 * chỉ cần chừng này (không danh tính người rút).
 */
export const BOOKING_DRIVER_INCIDENT_SELECT = {
  status: true,
  pickupAt: true,
  driverAssignmentStatus: true,
  driverDroppedAt: true,
  driverReassignBy: true,
} satisfies Prisma.BookingSelect;

/**
 * Bản cho BÊN THUÊ thêm lượt rút GẦN NHẤT (ai, vì sao). Lượt rút và cột sự cố ghi CÙNG một mốc
 * (`DriversService.dropTrip`), nên khớp `endedAt` với `driverDroppedAt` là biết lượt đó có phải
 * nguồn của sự cố đang mở hay là một lượt cũ hơn (sự cố hiện tại đến từ "trả lại" — không lý do).
 */
export const BOOKING_DRIVER_INCIDENT_HOST_SELECT = {
  ...BOOKING_DRIVER_INCIDENT_SELECT,
  driverAssignments: {
    where: { outcome: DRIVER_ASSIGNMENT_OUTCOME.DROPPED },
    orderBy: { endedAt: 'desc' },
    take: 1,
    select: {
      endedAt: true,
      dropReasonCategory: true,
      dropReason: true,
      dropZone: true,
      driver: { select: { name: true } },
    },
  },
} satisfies Prisma.BookingSelect;

type IncidentRow = Prisma.BookingGetPayload<{ select: typeof BOOKING_DRIVER_INCIDENT_SELECT }>;
type IncidentHostRow = Prisma.BookingGetPayload<{
  select: typeof BOOKING_DRIVER_INCIDENT_HOST_SELECT;
}>;

/** Sự cố tài xế nhìn từ KHÁCH — mức hiển thị + được huỷ hoàn 100% hay chưa. */
export function toRenterDriverIncident(
  b: IncidentRow,
  now: Date = new Date(),
): TripDriverIncidentDto | null {
  const state = driverIncidentState(b, now);
  return state ? { level: state.level, freeCancel: state.freeCancel } : null;
}

/** Sự cố tài xế nhìn từ BÊN THUÊ — kèm hạn điều phối, người rút, lý do. */
export function toBookingDriverIncident(
  b: IncidentHostRow,
  now: Date = new Date(),
): BookingDriverIncidentDto | null {
  const state = driverIncidentState(b, now);
  if (!state || !b.driverDroppedAt) return null;
  const drop = b.driverAssignments[0];
  const sameEvent = drop?.endedAt?.getTime() === b.driverDroppedAt.getTime();
  return {
    droppedAt: b.driverDroppedAt.toISOString(),
    reassignBy: state.reassignBy.toISOString(),
    level: state.level,
    customerCanCancelFree: state.freeCancel,
    driverName: sameEvent ? (drop?.driver.name ?? null) : null,
    reasonCategory: sameEvent ? (drop?.dropReasonCategory ?? null) : null,
    reason: sameEvent ? (drop?.dropReason ?? null) : null,
    zone: sameEvent ? (drop?.dropZone ?? null) : null,
  };
}
