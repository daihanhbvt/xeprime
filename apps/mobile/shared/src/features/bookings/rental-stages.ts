import { BOOKING_LIST_PRESET, BOOKING_REQUEST_STATUS, BOOKING_STATUS } from '@xeprime/types';

/**
 * Bốn NHÓM của màn "Đơn thuê xe" gộp — bản native của `constants/rental-stages.ts` web (05/11/2026,
 * Figma "Rental Request - List" `23973:51952`): Cần xử lý → Chờ khách thanh toán → Chờ giao xe →
 * Đang thuê. Hai nhóm đầu đọc YÊU CẦU, hai nhóm sau đọc ĐƠN; ranh giới là lượt đối soát đủ tiền
 * (ADR 0044 điều 2).
 *
 * Khoá GIAO DIỆN, không phải mã nghiệp vụ trên dây (ADR 0005). Hai nhóm đơn trùng tên với
 * `BOOKING_LIST_PRESET` nên link cũ `preset=awaiting_pickup` vẫn mở đúng nhóm.
 */
export const RENTAL_STAGE = {
  NEEDS_ACTION: 'needs_action',
  AWAITING_PAYMENT: 'awaiting_payment',
  AWAITING_PICKUP: BOOKING_LIST_PRESET.AWAITING_PICKUP,
  RENTING: BOOKING_LIST_PRESET.RENTING,
} as const;

export type RentalStage = (typeof RENTAL_STAGE)[keyof typeof RENTAL_STAGE];

/** Thứ tự trên dải nhóm và trong ô "Tất cả" — cũng là thứ tự một chuyến đi qua. */
export const RENTAL_STAGE_ORDER: readonly RentalStage[] = [
  RENTAL_STAGE.NEEDS_ACTION,
  RENTAL_STAGE.AWAITING_PAYMENT,
  RENTAL_STAGE.AWAITING_PICKUP,
  RENTAL_STAGE.RENTING,
];

export function isRentalStage(value: unknown): value is RentalStage {
  return typeof value === 'string' && (RENTAL_STAGE_ORDER as readonly string[]).includes(value);
}

/** Sắc của từng nhóm — vạch đầu nhóm (design: đỏ · cam · xanh dương · xanh lá; web `STAGE_TONE`). */
export const RENTAL_STAGE_TONE: Readonly<
  Record<RentalStage, 'danger' | 'warning' | 'info' | 'success'>
> = {
  [RENTAL_STAGE.NEEDS_ACTION]: 'danger',
  [RENTAL_STAGE.AWAITING_PAYMENT]: 'warning',
  [RENTAL_STAGE.AWAITING_PICKUP]: 'info',
  [RENTAL_STAGE.RENTING]: 'success',
};

/**
 * Tham số `status` CŨ của hộp thư "Yêu cầu đặt xe" (đã gộp, 05/11/2026) → nhóm mới. Trả `null` cho
 * `closed` — nơi gọi chuyển sang "Đơn đã kết thúc" › "Không thành đơn" (web `rentals-redirect.ts`).
 */
export function stageFromLegacyRequestStatus(status: string | undefined): RentalStage | null {
  if (status === BOOKING_REQUEST_STATUS.AWAITING_HOLD) return RENTAL_STAGE.AWAITING_PAYMENT;
  if (
    status === undefined ||
    status === 'needs_action' ||
    status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL
  ) {
    return RENTAL_STAGE.NEEDS_ACTION;
  }
  return null;
}

/**
 * Nhóm của một ĐƠN theo trạng thái — native port of web `rentalStageOfBookingStatus` (lịch v2,
 * 25/11/2026): `reserved` (và `confirmed` của dữ liệu cũ) là "Chờ giao xe", `active` là "Đang thuê".
 * Trạng thái đã kết thúc không thuộc nhóm nào (`null`).
 */
export function rentalStageOfBookingStatus(status: string | null | undefined): RentalStage | null {
  switch (status) {
    case BOOKING_STATUS.RESERVED:
    case BOOKING_STATUS.CONFIRMED:
      return RENTAL_STAGE.AWAITING_PICKUP;
    case BOOKING_STATUS.ACTIVE:
      return RENTAL_STAGE.RENTING;
    default:
      return null;
  }
}

/** Nhóm của một YÊU CẦU còn mở — web `rentalStageOfRequestStatus`; yêu cầu đã khép ⇒ `null`. */
export function rentalStageOfRequestStatus(status: string | null | undefined): RentalStage | null {
  switch (status) {
    case BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL:
      return RENTAL_STAGE.NEEDS_ACTION;
    case BOOKING_REQUEST_STATUS.AWAITING_HOLD:
      return RENTAL_STAGE.AWAITING_PAYMENT;
    default:
      return null;
  }
}
