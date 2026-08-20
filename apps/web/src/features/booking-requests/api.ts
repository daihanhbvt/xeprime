import { apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import { BOOKING_REQUEST_STATUS_ALL } from './constants';
import type {
  ApproveBookingRequestInput,
  BookingRequestConversation,
  BookingRequestFilters,
  BookingRequestItem,
  BookingRequestListMeta,
  BookingRequestReceipt,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  CreateBookingRequestInput,
  VehicleBusyDays,
} from './types';

export const BOOKING_REQUESTS_DEFAULT_LIMIT = 20;

export interface BookingRequestListResult {
  items: BookingRequestItem[];
  meta: BookingRequestListMeta;
}

/**
 * Filter của giao diện → tham số API.
 *
 * `status=all` là trạng thái của TAB, không phải một mã nghiệp vụ: backend chỉ biết bộ mã thật
 * (ADR 0005) nên "Tất cả" được dịch thành *không gửi* `status`. Phép dịch nằm đúng ở đây, một
 * chỗ, để URL giữ được lựa chọn còn dây thì vẫn sạch.
 */
export function filtersToParams(filters: BookingRequestFilters): QueryParams {
  const status = filters.status === BOOKING_REQUEST_STATUS_ALL ? null : (filters.status ?? null);
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
