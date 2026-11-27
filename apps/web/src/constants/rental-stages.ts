import {
  BOOKING_HISTORY_TAB,
  BOOKING_LIST_PRESET,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  type BookingHistoryTab,
} from '@xeprime/types';

/**
 * Bốn NHÓM của màn "Đơn thuê xe" gộp (05/11/2026, Figma Partner-XePrime "Rental Request - List"
 * `23973:51952`) — một chuyến đi từ trái sang phải: Cần xử lý → Chờ khách thanh toán → Chờ giao xe
 * → Đang thuê. Kết thúc rồi thì sang màn "Đơn đã kết thúc".
 *
 * Đây là KHOÁ GIAO DIỆN sống trên URL (`?preset=`), không phải mã nghiệp vụ trên dây (ADR 0005):
 * hai nhóm đầu là YÊU CẦU (`GET /booking-requests?status=`), hai nhóm sau là ĐƠN
 * (`GET /bookings?preset=` — trùng tên với `BOOKING_LIST_PRESET` nên link cũ `?preset=awaiting_pickup`
 * vẫn mở đúng nhóm). Ranh giới giữa nhóm 2 và 3 là lượt đối soát đủ tiền — không ai bấm qua được
 * (ADR 0044 điều 2).
 */
export const RENTAL_STAGE = {
  NEEDS_ACTION: 'needs_action',
  AWAITING_PAYMENT: 'awaiting_payment',
  AWAITING_PICKUP: BOOKING_LIST_PRESET.AWAITING_PICKUP,
  RENTING: BOOKING_LIST_PRESET.RENTING,
} as const;

export type RentalStage = (typeof RENTAL_STAGE)[keyof typeof RENTAL_STAGE];

/** Thứ tự trên cột trái và trong ô "Tất cả" — cũng là thứ tự một chuyến đi qua. */
export const RENTAL_STAGE_ORDER: readonly RentalStage[] = [
  RENTAL_STAGE.NEEDS_ACTION,
  RENTAL_STAGE.AWAITING_PAYMENT,
  RENTAL_STAGE.AWAITING_PICKUP,
  RENTAL_STAGE.RENTING,
];

export function isRentalStage(value: unknown): value is RentalStage {
  return typeof value === 'string' && (RENTAL_STAGE_ORDER as readonly string[]).includes(value);
}

/** Hai nhóm đầu đọc YÊU CẦU; hai nhóm sau đọc ĐƠN. */
export type RequestStage = typeof RENTAL_STAGE.NEEDS_ACTION | typeof RENTAL_STAGE.AWAITING_PAYMENT;
export type BookingStage = typeof RENTAL_STAGE.AWAITING_PICKUP | typeof RENTAL_STAGE.RENTING;

export function isRequestStage(stage: RentalStage): stage is RequestStage {
  return stage === RENTAL_STAGE.NEEDS_ACTION || stage === RENTAL_STAGE.AWAITING_PAYMENT;
}

/**
 * Bước KẾ của mỗi nhóm trên bảng Kanban (Figma "Rental Request - Kanban" `23895:15181`): thẻ chỉ kéo
 * được sang đúng cột này. `null` = cột cuối (trả xe đi qua nút "Nhận xe", không có cột "Kết thúc").
 */
export const RENTAL_STAGE_NEXT: Readonly<Record<RentalStage, RentalStage | null>> = {
  [RENTAL_STAGE.NEEDS_ACTION]: RENTAL_STAGE.AWAITING_PAYMENT,
  [RENTAL_STAGE.AWAITING_PAYMENT]: RENTAL_STAGE.AWAITING_PICKUP,
  [RENTAL_STAGE.AWAITING_PICKUP]: RENTAL_STAGE.RENTING,
  [RENTAL_STAGE.RENTING]: null,
};

/** Hai cách xem màn "Đơn thuê xe" — `?view=` trên URL (khoá giao diện, không lên API). */
export const RENTAL_VIEW = {
  BOARD: 'board',
  LIST: 'list',
} as const;

export type RentalView = (typeof RENTAL_VIEW)[keyof typeof RENTAL_VIEW];

export const RENTAL_VIEW_VALUES: readonly RentalView[] = [RENTAL_VIEW.BOARD, RENTAL_VIEW.LIST];

export function isRentalView(value: unknown): value is RentalView {
  return typeof value === 'string' && (RENTAL_VIEW_VALUES as readonly string[]).includes(value);
}

/**
 * Nhóm của một ĐƠN theo trạng thái của nó — `reserved` (và `confirmed` của dữ liệu cũ) là "Chờ giao
 * xe", `active` là "Đang thuê". Trạng thái đã kết thúc không thuộc nhóm nào (`null`).
 */
export function rentalStageOfBookingStatus(status: string | null | undefined): BookingStage | null {
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

/** Nhóm của một YÊU CẦU còn mở theo trạng thái của nó; yêu cầu đã khép không thuộc nhóm nào. */
export function rentalStageOfRequestStatus(status: string | null | undefined): RequestStage | null {
  switch (status) {
    case BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL:
      return RENTAL_STAGE.NEEDS_ACTION;
    case BOOKING_REQUEST_STATUS.AWAITING_HOLD:
      return RENTAL_STAGE.AWAITING_PAYMENT;
    default:
      return null;
  }
}

/** Trạng thái yêu cầu của mỗi nhóm yêu cầu — một trạng thái, không gộp. */
export const REQUEST_STAGE_STATUS: Readonly<Record<RequestStage, string>> = {
  [RENTAL_STAGE.NEEDS_ACTION]: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
  [RENTAL_STAGE.AWAITING_PAYMENT]: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
};

/**
 * Tham số `?status=` CŨ của hộp thư "Yêu cầu đặt xe" (đã gộp, 05/11/2026) → nhóm mới. `closed` (tab
 * "Đã kết thúc" cũ) đi sang màn "Đơn đã kết thúc", ngăn "Không thành đơn".
 */
export const LEGACY_REQUEST_TAB_STAGE: Readonly<Record<string, RentalStage>> = {
  needs_action: RENTAL_STAGE.NEEDS_ACTION,
  [BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL]: RENTAL_STAGE.NEEDS_ACTION,
  [BOOKING_REQUEST_STATUS.AWAITING_HOLD]: RENTAL_STAGE.AWAITING_PAYMENT,
};

/** Ngăn "Đã kết thúc" cũ của hai màn đã gộp → ngăn của màn "Đơn đã kết thúc". */
export const LEGACY_ENDED_TAB: Readonly<Record<string, BookingHistoryTab>> = {
  closed: BOOKING_HISTORY_TAB.NOT_CONVERTED,
  [BOOKING_LIST_PRESET.COMPLETED]: BOOKING_HISTORY_TAB.COMPLETED,
  [BOOKING_LIST_PRESET.CANCELLED]: BOOKING_HISTORY_TAB.CANCELLED,
};
