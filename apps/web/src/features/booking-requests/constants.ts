import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';

/**
 * "Tất cả trạng thái" ở inbox.
 *
 * Nó phải là một giá trị ĐI VÀO URL (`?status=all`), không phải sự vắng mặt của tham số: mặc
 * định của inbox là `pending_host_approval`, nên xoá tham số đi là quay về tab "Cần xử lý" chứ
 * không phải mở tab "Tất cả". Đây chính là lỗi của bản trước.
 *
 * Không nằm ở `@xeprime/types` vì nó KHÔNG phải một trạng thái nghiệp vụ: backend không bao giờ
 * nhận `status=all` (ADR 0005 — mã đi trên dây là mã thật), lớp gọi API dịch nó thành "không
 * gửi `status`".
 */
export const BOOKING_REQUEST_STATUS_ALL = 'all';

/** Tab của inbox — `null` ở `status` nghĩa là tab "Tất cả". */
export interface BookingRequestTab {
  /** Giá trị đi vào `?status=`. */
  readonly value: string;
  /** Trạng thái để tra `statusCounts`; `null` với tab "Tất cả" (cộng mọi trạng thái). */
  readonly status: BookingRequestStatus | null;
  /** Khoá message trong namespace `BookingRequests.tabs`. */
  readonly labelKey: 'needsAction' | 'converted' | 'rejected' | 'cancelled' | 'expired' | 'all';
}

/**
 * Thứ tự tab theo VIỆC PHẢI LÀM, không theo thứ tự khai báo enum: việc cần xử lý đứng đầu,
 * rồi tới kết quả tích cực, rồi các nhánh kết thúc khác.
 *
 * `approved_by_host` cố ý KHÔNG có tab riêng: luồng duyệt chuyển thẳng sang
 * `converted_to_booking` trong cùng transaction, nên đó là một trạng thái chỉ tồn tại ở dữ
 * liệu cũ. Nó vẫn được đếm trong tab "Tất cả" (tab đó cộng mọi trạng thái, không liệt kê tay).
 */
export const BOOKING_REQUEST_TABS: readonly BookingRequestTab[] = [
  {
    value: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    labelKey: 'needsAction',
  },
  {
    value: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
    status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
    labelKey: 'converted',
  },
  {
    value: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
    status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
    labelKey: 'rejected',
  },
  {
    value: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
    status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
    labelKey: 'cancelled',
  },
  {
    value: BOOKING_REQUEST_STATUS.EXPIRED,
    status: BOOKING_REQUEST_STATUS.EXPIRED,
    labelKey: 'expired',
  },
  { value: BOOKING_REQUEST_STATUS_ALL, status: null, labelKey: 'all' },
];

/** Lý do từ chối bấm-là-điền. Chữ nằm ở message; đây chỉ là DANH SÁCH và thứ tự. */
export const REJECT_REASON_PRESETS = [
  'vehicleUnavailable',
  'scheduleUnavailable',
  'requirementsUnsuitable',
  'other',
] as const;

export type RejectReasonPreset = (typeof REJECT_REASON_PRESETS)[number];

/** Trần độ dài lý do từ chối — khớp `@MaxLength(1000)` của `RejectBookingRequestDto`. */
export const REJECT_REASON_MAX_LENGTH = 1000;
