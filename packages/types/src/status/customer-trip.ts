/**
 * Cách KHÁCH nhìn một chuyến (Wave 11) — view-model, **không phải** một bộ trạng thái mới.
 *
 * Backend vẫn giữ nguyên máy trạng thái vận hành đầy đủ (`BookingRequestStatus` +
 * `BookingStatus`): chủ xe cần phân biệt `reserved` với `confirmed`, `no_show` với `cancelled`.
 * Khách thì không — với khách chỉ có "đang chờ / sắp tới / đang thuê / xong / hỏng". Gộp hai
 * enum kia lại thành một enum mới ở DB là cách chắc chắn nhất để mất thông tin vận hành, nên ở
 * đây là một phép CHIẾU một chiều, tính tại chỗ, không lưu.
 *
 * Hệ quả quan trọng: mọi nơi hiển thị cho khách phải đi qua `customerTripStage()`. Component
 * không được tự đọc `booking.status` rồi tự đoán nhãn — đó là chỗ hai màn bắt đầu kể hai câu
 * chuyện khác nhau.
 */

import { BOOKING_STATUS, type BookingStatus } from './booking';
import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from './booking-request';
import type { StatusMeta } from './meta';

export const CUSTOMER_TRIP_STAGE = {
  /** Đã gửi yêu cầu, chủ xe chưa trả lời. Chưa có đơn thuê. */
  PENDING_APPROVAL: 'pending_approval',
  /** Chủ xe đã nhận, chưa tới giờ giao xe. */
  READY: 'ready',
  /** Xe đã ở với khách. */
  ACTIVE: 'active',
  /** Đã trả xe, chuyến khép lại. */
  COMPLETED: 'completed',
  /** Khách/chủ xe huỷ trước khi chuyến bắt đầu. */
  CANCELLED: 'cancelled',
  /** Chủ xe từ chối yêu cầu, hoặc yêu cầu quá hạn phản hồi. */
  REJECTED: 'rejected',
  /** Tới giờ mà khách không nhận xe. */
  NO_SHOW: 'no_show',
} as const;

export type CustomerTripStage = (typeof CUSTOMER_TRIP_STAGE)[keyof typeof CUSTOMER_TRIP_STAGE];

export const CUSTOMER_TRIP_STAGE_VALUES = Object.values(CUSTOMER_TRIP_STAGE) as CustomerTripStage[];

export const CUSTOMER_TRIP_STAGE_META: Readonly<Record<CustomerTripStage, StatusMeta>> = {
  [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL]: { label: 'Chờ xác nhận', color: 'gold' },
  [CUSTOMER_TRIP_STAGE.READY]: { label: 'Sẵn sàng', color: 'green' },
  [CUSTOMER_TRIP_STAGE.ACTIVE]: { label: 'Đang thuê', color: 'green' },
  [CUSTOMER_TRIP_STAGE.COMPLETED]: { label: 'Hoàn thành', color: 'blue' },
  [CUSTOMER_TRIP_STAGE.CANCELLED]: { label: 'Đã hủy chuyến', color: 'default' },
  [CUSTOMER_TRIP_STAGE.REJECTED]: { label: 'Bị từ chối', color: 'red' },
  [CUSTOMER_TRIP_STAGE.NO_SHOW]: { label: 'Không nhận xe', color: 'red' },
};

/**
 * Chiếu trạng thái vận hành → chặng của khách.
 *
 * `bookingStatus` là nguồn ưu tiên: một khi đơn thuê đã tồn tại thì trạng thái yêu cầu chỉ còn
 * là lịch sử (`converted_to_booking` đứng yên trong khi đơn chạy tiếp).
 */
export function customerTripStage(input: {
  requestStatus: BookingRequestStatus;
  bookingStatus: BookingStatus | null;
}): CustomerTripStage {
  if (input.bookingStatus) {
    switch (input.bookingStatus) {
      case BOOKING_STATUS.RESERVED:
      case BOOKING_STATUS.CONFIRMED:
        return CUSTOMER_TRIP_STAGE.READY;
      case BOOKING_STATUS.ACTIVE:
        return CUSTOMER_TRIP_STAGE.ACTIVE;
      case BOOKING_STATUS.COMPLETED:
        return CUSTOMER_TRIP_STAGE.COMPLETED;
      case BOOKING_STATUS.NO_SHOW:
        return CUSTOMER_TRIP_STAGE.NO_SHOW;
      case BOOKING_STATUS.CANCELLED:
        return CUSTOMER_TRIP_STAGE.CANCELLED;
    }
  }

  switch (input.requestStatus) {
    case BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL:
      return CUSTOMER_TRIP_STAGE.PENDING_APPROVAL;
    case BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER:
      return CUSTOMER_TRIP_STAGE.CANCELLED;
    case BOOKING_REQUEST_STATUS.REJECTED_BY_HOST:
    case BOOKING_REQUEST_STATUS.EXPIRED:
      return CUSTOMER_TRIP_STAGE.REJECTED;
    // Đã duyệt/đã chuyển đơn mà chưa thấy đơn: dữ liệu cũ hoặc đơn bị xoá mềm. Coi như sắp tới
    // thay vì ném lỗi — khách không có gì để làm với một sự cố dữ liệu nội bộ.
    case BOOKING_REQUEST_STATUS.APPROVED_BY_HOST:
    case BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING:
      return CUSTOMER_TRIP_STAGE.READY;
  }
}

// ── Dòng thời gian hai mốc ───────────────────────────────────────────────────

/**
 * Khách chỉ thấy ĐÚNG hai mốc. `Đã giao xe` / `Đang thuê` là **trạng thái hiện tại**, không
 * phải một mốc thứ ba: thêm mốc nghĩa là dòng thời gian dài ra theo tiến trình vận hành và
 * không còn ở một hàng ngang trên màn 390px.
 */
export interface CustomerTripTimelineState {
  /** Có dựng dòng thời gian không. Yêu cầu chờ duyệt và các kết cục hỏng thì KHÔNG. */
  visible: boolean;
  confirmedDone: boolean;
  completedDone: boolean;
}

export function customerTripTimeline(stage: CustomerTripStage): CustomerTripTimelineState {
  switch (stage) {
    case CUSTOMER_TRIP_STAGE.READY:
    case CUSTOMER_TRIP_STAGE.ACTIVE:
      return { visible: true, confirmedDone: true, completedDone: false };
    case CUSTOMER_TRIP_STAGE.COMPLETED:
      return { visible: true, confirmedDone: true, completedDone: true };
    // Chờ duyệt: chưa có gì để "đã xác nhận". Huỷ/từ chối/không nhận xe: chuyến KHÔNG đi hết
    // đường, đánh dấu mốc nào cũng là nói dối — các trạng thái đó có khối riêng của chúng.
    default:
      return { visible: false, confirmedDone: false, completedDone: false };
  }
}

/** Chặng đã khép lại — không còn hành động vận hành nào của khách. */
export function isCustomerTripClosed(stage: CustomerTripStage): boolean {
  return (
    stage === CUSTOMER_TRIP_STAGE.COMPLETED ||
    stage === CUSTOMER_TRIP_STAGE.CANCELLED ||
    stage === CUSTOMER_TRIP_STAGE.REJECTED ||
    stage === CUSTOMER_TRIP_STAGE.NO_SHOW
  );
}

// ── Bộ lọc danh sách ─────────────────────────────────────────────────────────

/** Tab lọc trên màn `Chuyến của tôi`. Một tab gom nhiều chặng — không phải ánh xạ 1-1. */
export const CUSTOMER_TRIP_FILTER = {
  ALL: 'all',
  PENDING: 'pending',
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type CustomerTripFilter = (typeof CUSTOMER_TRIP_FILTER)[keyof typeof CUSTOMER_TRIP_FILTER];

export const CUSTOMER_TRIP_FILTER_VALUES = Object.values(
  CUSTOMER_TRIP_FILTER,
) as CustomerTripFilter[];

export const CUSTOMER_TRIP_FILTER_LABEL: Readonly<Record<CustomerTripFilter, string>> = {
  [CUSTOMER_TRIP_FILTER.ALL]: 'Tất cả',
  [CUSTOMER_TRIP_FILTER.PENDING]: 'Chờ xác nhận',
  [CUSTOMER_TRIP_FILTER.UPCOMING]: 'Sắp tới',
  [CUSTOMER_TRIP_FILTER.ACTIVE]: 'Đang thuê',
  [CUSTOMER_TRIP_FILTER.COMPLETED]: 'Hoàn thành',
  [CUSTOMER_TRIP_FILTER.CANCELLED]: 'Đã hủy',
};

/** Chặng nào thuộc tab nào — dùng chung cho cả đếm ở server lẫn nhãn ở client. */
export const CUSTOMER_TRIP_FILTER_STAGES: Readonly<
  Record<CustomerTripFilter, readonly CustomerTripStage[]>
> = {
  [CUSTOMER_TRIP_FILTER.ALL]: CUSTOMER_TRIP_STAGE_VALUES,
  [CUSTOMER_TRIP_FILTER.PENDING]: [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL],
  [CUSTOMER_TRIP_FILTER.UPCOMING]: [CUSTOMER_TRIP_STAGE.READY],
  [CUSTOMER_TRIP_FILTER.ACTIVE]: [CUSTOMER_TRIP_STAGE.ACTIVE],
  [CUSTOMER_TRIP_FILTER.COMPLETED]: [CUSTOMER_TRIP_STAGE.COMPLETED],
  [CUSTOMER_TRIP_FILTER.CANCELLED]: [
    CUSTOMER_TRIP_STAGE.CANCELLED,
    CUSTOMER_TRIP_STAGE.REJECTED,
    CUSTOMER_TRIP_STAGE.NO_SHOW,
  ],
};

export function isCustomerTripFilter(value: unknown): value is CustomerTripFilter {
  return typeof value === 'string' && (CUSTOMER_TRIP_FILTER_VALUES as string[]).includes(value);
}
