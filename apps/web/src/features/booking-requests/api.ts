import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import {
  BOOKING_REQUEST_CLOSED_STATUSES,
  BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
  BOOKING_REQUEST_TAB_CLOSED,
  BOOKING_REQUEST_TAB_NEEDS_ACTION,
} from './constants';
import type {
  ApproveBookingRequestInput,
  BookingRequestConversation,
  BookingRequestFilters,
  BookingRequestItem,
  BookingRequestListMeta,
  BookingRequestReceipt,
  CancelBookingRequestInput,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  CreateBookingRequestInput,
  VehicleBusyDays,
} from './types';

/**
 * Fetch của inbox KHÔNG dùng `fetchPage` chung: `meta` ở đây là `BookingRequestListMeta`
 * (thêm `statusCounts` cho hàng huy hiệu) chứ không phải `PaginationMeta` thuần — nhét vào
 * helper chung sẽ làm rơi mất phần đếm ở nhánh dự phòng.
 */
export const BOOKING_REQUESTS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export interface BookingRequestListResult {
  items: BookingRequestItem[];
  meta: BookingRequestListMeta;
}

/**
 * Filter của giao diện → tham số API.
 *
 * Hai tab GỘP (`needs_action`, `closed`) không phải mã nghiệp vụ thật (ADR 0005) — dịch thành
 * các mã thật nối dấu phẩy. MỘT chuỗi, không phải mảng: `QueryParams` của `@xeprime/api-client`
 * cố ý không có kiểu mảng (xem `url.ts`), backend tách chuỗi ở DTO. Tab "Chờ khách thanh toán"
 * gửi thẳng `awaiting_hold` — nó đã là một mã thật, không cần dịch (ADR 0047).
 *
 * `status=all` — TƯƠNG THÍCH NGƯỢC: tab "Tất cả" đã bị xoá (ADR 0047), nhưng ai đó có thể còn
 * một liên kết/bookmark cũ mang `?status=all`. Dịch thành *không gửi* `status` (như hành vi cũ
 * của giá trị này) thay vì gửi nguyên chữ `"all"` lên backend — backend sẽ từ chối một mã không
 * nằm trong `BOOKING_REQUEST_STATUS_VALUES`, và một liên kết cũ vỡ ngay khi mở lại là trải
 * nghiệm tệ hơn nhiều so với việc âm thầm rơi về "không lọc".
 */
export function filtersToParams(filters: BookingRequestFilters): QueryParams {
  const status =
    filters.status === BOOKING_REQUEST_TAB_NEEDS_ACTION
      ? BOOKING_REQUEST_NEEDS_ACTION_STATUSES.join(',')
      : filters.status === BOOKING_REQUEST_TAB_CLOSED
        ? BOOKING_REQUEST_CLOSED_STATUSES.join(',')
        : filters.status === 'all'
          ? null
          : (filters.status ?? null);
  return {
    status,
    q: filters.q ?? null,
    serviceType: filters.serviceType ?? null,
    vehicleId: filters.vehicleId ?? null,
    branchId: filters.branchId ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? BOOKING_REQUESTS_DEFAULT_LIMIT,
  };
}

const EMPTY_META = (limit: number, total: number): BookingRequestListMeta => ({
  page: 1,
  limit,
  total,
  hasNext: false,
  statusCounts: [],
});

export async function fetchBookingRequests(
  filters: BookingRequestFilters,
): Promise<BookingRequestListResult> {
  const res = await apiRequest<BookingRequestItem[]>('/booking-requests', {
    query: filtersToParams(filters),
  });
  return {
    items: res.data,
    meta:
      (res.meta as BookingRequestListMeta | undefined) ??
      EMPTY_META(filters.limit ?? BOOKING_REQUESTS_DEFAULT_LIMIT, res.data.length),
  };
}

/**
 * Duyệt yêu cầu. Dịch vụ theo ngày không cần body; THUÊ DÀI HẠN bắt buộc `scheduledPickupAt`
 * (gian hàng chốt giờ nhận, server tính giờ trả theo gói — ADR 0011).
 */
export const approveBookingRequest = (
  id: string,
  body?: ApproveBookingRequestInput,
): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/approve`, body ?? {});

export const rejectBookingRequest = (id: string, reason?: string): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/reject`, { reason });

/**
 * HUỶ một chuyến ĐÃ NHẬN — khác endpoint với `reject` vì đây là một việc khác (ADR 0045 điều 1).
 *
 * `reject` trả lời "không" cho một câu hỏi còn treo; `cancel` rút lại một lời đã hứa, nên nó
 * phải đóng khoản giữ chỗ, nhả lịch, hoàn phần khách đã chuyển và ghi một dòng trách nhiệm.
 * Gộp hai việc vào một endpoint bằng một cờ sẽ để một trong hai nhánh tiền đi sai đường.
 */
export const cancelBookingRequest = (
  id: string,
  body: CancelBookingRequestInput,
): Promise<BookingRequestItem> =>
  apiPost<BookingRequestItem>(`/booking-requests/${id}/cancel`, body);

/**
 * Mở/lấy hội thoại với khách của một yêu cầu — đường của GIAN HÀNG.
 *
 * KHÔNG dùng `startConversation(vehicleId)` của `features/chat`: endpoint đó lấy người đang
 * đăng nhập làm KHÁCH, nên nhân viên gian hàng gọi vào sẽ tự mở một thread với chính mình.
 */
export const startBookingRequestConversation = (id: string): Promise<BookingRequestConversation> =>
  apiPost<BookingRequestConversation>(`/booking-requests/${id}/conversation`, {});

/** Công khai — khách gửi yêu cầu thuê từ marketplace (không cần đăng nhập). */
export const submitBookingRequest = (
  body: CreateBookingRequestInput,
): Promise<BookingRequestReceipt> =>
  apiPost<BookingRequestReceipt>('/public/booking-requests', body);

/** Công khai — kiểm tra nhanh khung giờ của một xe còn trống không (preview, ADR 0006). */
export const checkAvailability = (body: CheckAvailabilityInput): Promise<CheckAvailabilityResult> =>
  apiPost<CheckAvailabilityResult>('/public/booking-requests/check-availability', body);

/**
 * Số ngày lịch bận nạp sẵn khi mở hộp chọn thời gian thuê.
 *
 * Một request cho cả năm thay vì một request mỗi lần lật tháng: kết quả THƯA (chỉ ngày bận) nên
 * xe rảnh trả về mảng rỗng, và khách lật tháng không phải chờ lịch tô lại.
 */
export const BUSY_DAYS_LOOKAHEAD = 366;

/**
 * Công khai — lịch bận của một xe trong cửa sổ `[from, to]` (ngày lịch Việt Nam) để hộp chọn
 * thời gian thuê khoá ngày bận. Preview, không phải bảo vệ (ADR 0006).
 */
export const fetchVehicleBusyDays = async (
  vehicleId: string,
  from: string,
  to: string,
): Promise<VehicleBusyDays> => {
  const res = await apiRequest<VehicleBusyDays>('/public/booking-requests/busy-days', {
    query: { vehicleId, from, to },
  });
  return res.data;
};
