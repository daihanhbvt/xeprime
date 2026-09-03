import type { components, PaginationMeta } from '@xeprime/types';
import { getApiClient } from '../../client';
import type { QueryParams } from '../../url';

type Schemas = components['schemas'];

export type BookingRequestItem = Schemas['BookingRequestDto'];
export type CreateBookingRequestInput = Schemas['CreateBookingRequestDto'];
/** Body duyệt — thuê dài hạn bắt buộc `scheduledPickupAt` (ADR 0011). */
export type ApproveBookingRequestInput = Schemas['ApproveBookingRequestDto'];
export type BookingRequestReceipt = Schemas['BookingRequestReceiptDto'];
export type CheckAvailabilityInput = Schemas['CheckAvailabilityDto'];
export type CheckAvailabilityResult = Schemas['CheckAvailabilityResultDto'];
/** Lịch bận của một xe để tô/khoá ô trên hộp chọn thời gian thuê (preview — ADR 0006). */
export type VehicleBusyDays = Schemas['VehicleBusyDaysDto'];
export type BookingRequestConversation = Schemas['ConversationSummaryDto'];
export type BookingRequestStatusCount = Schemas['BookingRequestStatusCountDto'];

/**
 * `meta` của danh sách: phân trang + đếm theo trạng thái.
 *
 * Đếm KHÔNG suy từ trang hiện tại — trang chỉ có tối đa `limit` bản ghi nên mọi phép cộng ở
 * client đều sai kể từ bản ghi thứ 21.
 */
export interface BookingRequestListMeta extends PaginationMeta {
  statusCounts: BookingRequestStatusCount[];
}

export interface BookingRequestListResult {
  items: BookingRequestItem[];
  meta: BookingRequestListMeta;
}

export interface BookingRequestFilters {
  /**
   * Trạng thái đang lọc. `all` là một GIÁ TRỊ THẬT của giao diện chứ không phải "không lọc":
   * bỏ tham số đi thì màn hình lại rơi về mặc định `pending_host_approval`, nên "Tất cả" sẽ
   * không bao giờ giữ được. Nó chỉ được dịch thành "không gửi `status`" ở đúng hàm dưới đây.
   */
  status?: string;
  /** Tìm theo tên khách / SĐT / tên xe / biển số — lọc ở SERVER, không cắt trên trang đang mở. */
  q?: string;
  serviceType?: string;
  vehicleId?: string;
  branchId?: string;
  page?: number;
  limit?: number;
}

export const BOOKING_REQUESTS_DEFAULT_LIMIT = 20;

/** Sentinel "mọi trạng thái" của giao diện — không endpoint nào nhận `status=all`. */
export const BOOKING_REQUEST_STATUS_ALL = 'all';

export function bookingRequestFiltersToParams(filters: BookingRequestFilters): QueryParams {
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

/**
 * Một request cho cả năm thay vì một request mỗi lần lật tháng: kết quả THƯA (chỉ ngày bận) nên
 * xe rảnh trả về mảng rỗng, và khách lật tháng không phải chờ lịch tô lại.
 */
export const BUSY_DAYS_LOOKAHEAD = 366;

export const bookingRequestsApi = {
  /**
   * Inbox KHÔNG dùng `fetchPage` chung: `meta` ở đây mang thêm `statusCounts` cho hàng huy hiệu,
   * và helper chung sẽ làm rơi mất phần đếm ở nhánh dự phòng.
   */
  async list(filters: BookingRequestFilters): Promise<BookingRequestListResult> {
    const limit = filters.limit ?? BOOKING_REQUESTS_DEFAULT_LIMIT;
    const res = await getApiClient().request<BookingRequestItem[]>('/booking-requests', {
      query: bookingRequestFiltersToParams(filters),
    });
    return {
      items: res.data,
      meta: (res.meta as BookingRequestListMeta | undefined) ?? {
        page: filters.page ?? 1,
        limit,
        total: res.data.length,
        hasNext: false,
        statusCounts: [],
      },
    };
  },

  detail(id: string): Promise<BookingRequestItem> {
    return getApiClient().get<BookingRequestItem>(`/booking-requests/${encodeURIComponent(id)}`);
  },

  /**
   * Duyệt yêu cầu. Dịch vụ theo ngày không cần body; THUÊ DÀI HẠN bắt buộc `scheduledPickupAt`
   * (gian hàng chốt giờ nhận, server tính giờ trả theo gói — ADR 0011).
   */
  approve(id: string, body?: ApproveBookingRequestInput): Promise<BookingRequestItem> {
    return getApiClient().post<BookingRequestItem>(
      `/booking-requests/${encodeURIComponent(id)}/approve`,
      body ?? {},
    );
  },

  reject(id: string, reason?: string): Promise<BookingRequestItem> {
    return getApiClient().post<BookingRequestItem>(
      `/booking-requests/${encodeURIComponent(id)}/reject`,
      { reason },
    );
  },

  /**
   * Mở/lấy hội thoại với khách của một yêu cầu — đường của GIAN HÀNG.
   *
   * KHÔNG dùng endpoint mở chat từ phía khách: endpoint đó lấy người đang đăng nhập làm KHÁCH,
   * nên nhân viên gian hàng gọi vào sẽ tự mở một thread với chính mình.
   */
  conversation(id: string): Promise<BookingRequestConversation> {
    return getApiClient().post<BookingRequestConversation>(
      `/booking-requests/${encodeURIComponent(id)}/conversation`,
      {},
    );
  },

  /** Công khai — khách gửi yêu cầu thuê từ marketplace (không cần đăng nhập). */
  submit(body: CreateBookingRequestInput): Promise<BookingRequestReceipt> {
    return getApiClient().post<BookingRequestReceipt>('/public/booking-requests', body);
  },

  /** Công khai — kiểm tra nhanh khung giờ của một xe còn trống không (preview, ADR 0006). */
  checkAvailability(body: CheckAvailabilityInput): Promise<CheckAvailabilityResult> {
    return getApiClient().post<CheckAvailabilityResult>(
      '/public/booking-requests/check-availability',
      body,
    );
  },

  /**
   * Công khai — lịch bận của một xe trong cửa sổ `[from, to]` (ngày lịch Việt Nam).
   *
   * Cửa sổ tra cứu bị SERVER kẹp trần: đọc `from`/`to` trong kết quả thay vì giả định nó bằng
   * đúng cái vừa gửi, nếu không lịch sẽ tô một khoảng rộng hơn khoảng thật sự được trả lời.
   */
  busyDays(vehicleId: string, from: string, to: string): Promise<VehicleBusyDays> {
    return getApiClient().get<VehicleBusyDays>('/public/booking-requests/busy-days', {
      vehicleId,
      from,
      to,
    });
  },
};
