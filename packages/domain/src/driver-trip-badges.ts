import {
  BOOKING_STATUS,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_LINK_STATUS,
} from '@xeprime/types';

/**
 * Nhãn trạng thái của một chuyến nhìn từ TÀI XẾ — Figma "Trung tâm Tài xế" (`21768:51021`).
 *
 * Ở `@xeprime/domain` vì web và app native vẽ CÙNG một bộ nhãn từ cùng một chuyến; mỗi nơi chỉ
 * dịch `key` (namespace `Driving.tripBadge`) và tô theo `tone`.
 *
 * "Bạn đã hủy chuyến" = lượt khép `declined` MÀ đã từng nhận (`respondedAt`) — tài xế trả lại chuyến
 * (sửa ADR 0063 điều 6). Từ chối khi chưa nhận vẫn là "Bạn đã từ chối".
 */
export type DriverTripBadgeKey =
  | 'pending'
  | 'accepted'
  | 'awaitingHandover'
  | 'inProgress'
  | 'completed'
  | 'released'
  | 'dropped'
  | 'declined'
  | 'expired'
  | 'unassigned'
  | 'cancelled'
  | 'no_show';

export type DriverTripBadgeTone = 'warning' | 'success' | 'info' | 'danger' | 'purple' | 'neutral';

export interface DriverTripBadge {
  key: DriverTripBadgeKey;
  tone: DriverTripBadgeTone;
}

export function driverTripBadges(trip: {
  outcome: string;
  assignmentStatus: string;
  status: string;
  respondedAt: string | null;
}): DriverTripBadge[] {
  switch (trip.outcome) {
    case DRIVER_ASSIGNMENT_OUTCOME.OPEN: {
      if (trip.assignmentStatus !== DRIVER_ASSIGNMENT_STATUS.ACCEPTED) {
        return [{ key: 'pending', tone: 'warning' }];
      }
      const stage: DriverTripBadge =
        trip.status === BOOKING_STATUS.ACTIVE
          ? { key: 'inProgress', tone: 'info' }
          : { key: 'awaitingHandover', tone: 'info' };
      return [{ key: 'accepted', tone: 'success' }, stage];
    }
    case DRIVER_ASSIGNMENT_OUTCOME.COMPLETED:
      return [{ key: 'completed', tone: 'success' }];
    case DRIVER_ASSIGNMENT_OUTCOME.DECLINED:
      return [{ key: trip.respondedAt ? 'released' : 'declined', tone: 'danger' }];
    case DRIVER_ASSIGNMENT_OUTCOME.DROPPED:
      // Rút khỏi chuyến đã nhận vì sự cố (ADR 0074).
      return [{ key: 'dropped', tone: 'danger' }];
    case DRIVER_ASSIGNMENT_OUTCOME.EXPIRED:
      return [{ key: 'expired', tone: 'purple' }];
    case DRIVER_ASSIGNMENT_OUTCOME.CANCELLED:
      return [{ key: 'cancelled', tone: 'neutral' }];
    case DRIVER_ASSIGNMENT_OUTCOME.NO_SHOW:
      return [{ key: 'no_show', tone: 'neutral' }];
    default:
      return [{ key: 'unassigned', tone: 'neutral' }];
  }
}

/** Nhãn hợp tác nhìn từ tài xế — cùng sắc với Figma (cam / xanh dương / đỏ). */
export function driverLinkTone(linkStatus: string): DriverTripBadgeTone {
  switch (linkStatus) {
    case DRIVER_LINK_STATUS.INVITED:
      return 'warning';
    case DRIVER_LINK_STATUS.ACTIVE:
      return 'info';
    case DRIVER_LINK_STATUS.SUSPENDED:
      return 'neutral';
    default:
      return 'danger';
  }
}
