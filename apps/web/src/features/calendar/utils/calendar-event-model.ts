import {
  OCCUPANCY_SOURCE_TYPE,
  SERVICE_TYPE,
  STATUS_COLOR,
  type StatusColor,
} from '@xeprime/types';
import {
  RENTAL_STAGE,
  rentalStageOfBookingStatus,
  rentalStageOfRequestStatus,
  type RentalStage,
} from '@/constants/rental-stages';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import type { CalendarEvent } from '../types/calendar.types';

/**
 * Cách lịch (thiết kế lại 25/11/2026, Figma Partner-XePrime `24200:99389`) ĐỌC một event — thuần,
 * không React, để thanh event, thẻ xem nhanh, chú giải và test cùng một nguồn.
 *
 * Hai trục độc lập, đúng như design:
 *  - SẮC của thẻ = DỊCH VỤ (thuê theo ngày · có tài xế · dài hạn); khoá xe và bảo dưỡng là thẻ xám.
 *  - CHIP trên thẻ = NHÓM của màn "Đơn thuê xe" (Cần xử lý · Chờ khách thanh toán · Chờ giao xe ·
 *    Đang thuê) — cùng nhãn, cùng sắc với màn đó (người dùng chốt 25/11/2026).
 */

/** Bốn hình dạng thẻ trên lưới. */
export type CalendarEventKind = 'booking' | 'request' | 'blocked' | 'maintenance';

export function eventKind(event: Pick<CalendarEvent, 'type'>): CalendarEventKind {
  switch (event.type) {
    case OCCUPANCY_SOURCE_TYPE.BOOKING:
      return 'booking';
    case OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST:
      return 'request';
    case OCCUPANCY_SOURCE_TYPE.MAINTENANCE:
      return 'maintenance';
    default:
      return 'blocked';
  }
}

/**
 * Event có CHIẾM lịch xe không. Yêu cầu chờ duyệt thì không (ADR 0044 điều 1) — server gửi
 * `occupying = false`; trường vắng (server cũ) nghĩa là chiếm.
 */
export function isOccupying(event: Pick<CalendarEvent, 'occupying'>): boolean {
  return event.occupying !== false;
}

/** Nhóm "Đơn thuê xe" của một event; khoá xe, bảo dưỡng, đơn đã kết thúc ⇒ `null`. */
export function eventStage(event: Pick<CalendarEvent, 'type' | 'status'>): RentalStage | null {
  const kind = eventKind(event);
  if (kind === 'booking') return rentalStageOfBookingStatus(event.status);
  if (kind === 'request') return rentalStageOfRequestStatus(event.status);
  return null;
}

/** Sắc chip của mỗi nhóm — cùng thứ tự đỏ · cam · xanh dương · xanh lá với màn "Đơn thuê xe". */
export const STAGE_STATUS_COLOR: Readonly<Record<RentalStage, StatusColor>> = {
  [RENTAL_STAGE.NEEDS_ACTION]: STATUS_COLOR.DANGER,
  [RENTAL_STAGE.AWAITING_PAYMENT]: STATUS_COLOR.WARNING,
  [RENTAL_STAGE.AWAITING_PICKUP]: STATUS_COLOR.INFO,
  [RENTAL_STAGE.RENTING]: STATUS_COLOR.SUCCESS,
};

/** Sắc thẻ theo dịch vụ. `neutral` = chưa biết dịch vụ (không có quyền xem yêu cầu). */
export type ServiceTone = 'selfDrive' | 'withDriver' | 'longTerm' | 'neutral';

export function serviceTone(serviceType: string | null | undefined): ServiceTone {
  switch (serviceType) {
    case SERVICE_TYPE.SELF_DRIVE:
      return 'selfDrive';
    case SERVICE_TYPE.WITH_DRIVER:
      return 'withDriver';
    case SERVICE_TYPE.LONG_TERM:
      return 'longTerm';
    default:
      return 'neutral';
  }
}

/** Mốc nửa mở `[from 00:00, to+1 00:00)` giờ Việt Nam của một khoảng NGÀY trên lưới. */
export function dayKeysToRange(fromKey: string, toKey: string): { startAt: Date; endAt: Date } {
  return {
    startAt: dayjs.tz(fromKey, APP_TIME_ZONE).startOf('day').toDate(),
    endAt: dayjs.tz(toKey, APP_TIME_ZONE).startOf('day').add(1, 'day').toDate(),
  };
}

/**
 * Khoảng ngày `[fromKey, toKey]` của một xe còn trống không — chỉ tính event CHIẾM lịch (yêu cầu
 * chờ duyệt không giữ chỗ nên ngày có yêu cầu vẫn là "ngày trống"). Chỉ để nói một câu trên bảng
 * thao tác; ghi lịch vẫn qua constraint DB (ADR 0006).
 */
export function isRangeFree(
  events: readonly Pick<CalendarEvent, 'startAt' | 'endAt' | 'occupying'>[],
  fromKey: string,
  toKey: string,
): boolean {
  const { startAt, endAt } = dayKeysToRange(fromKey, toKey);
  return !events.some(
    (event) =>
      isOccupying(event) &&
      new Date(event.startAt).getTime() < endAt.getTime() &&
      new Date(event.endAt).getTime() > startAt.getTime(),
  );
}

/** Đoạn chọn trên một hàng: hai đầu theo thứ tự tăng, bất kể kéo xuôi hay ngược. */
export function orderedSpan(a: number, b: number): { start: number; end: number } {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}
