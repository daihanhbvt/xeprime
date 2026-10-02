import { BOOKING_REQUEST_STATUS, type components, type PaginationMeta } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type BookingRequestItem = Schemas['BookingRequestDto'];
export type CreateBookingRequestInput = Schemas['CreateBookingRequestDto'];
/** Body duyệt — thuê dài hạn bắt buộc `scheduledPickupAt` (ADR 0011). */
export type ApproveBookingRequestInput = Schemas['ApproveBookingRequestDto'];
/** Body huỷ chuyến đã nhận — nhóm lý do BẮT BUỘC, chữ tự do bắt buộc khi chọn "Lý do khác". */
export type CancelBookingRequestInput = Schemas['CancelBookingRequestDto'];
export type BookingRequestReceipt = Schemas['BookingRequestReceiptDto'];
export type CheckAvailabilityInput = Schemas['CheckAvailabilityDto'];
export type CheckAvailabilityResult = Schemas['CheckAvailabilityResultDto'];
/** Lịch bận của một xe để tô/khoá ô trên hộp chọn thời gian thuê (preview — ADR 0006). */
export type VehicleBusyDays = Schemas['VehicleBusyDaysDto'];
export type BookingRequestConversation = Schemas['ConversationSummaryDto'];

/**
 * Lát cắt mà BA tấm trượt quyết định (duyệt · từ chối · duyệt xong) thật sự đọc.
 *
 * Tồn tại vì hai màn nuôi cùng ba tấm trượt đó bằng hai DTO khác nhau: hộp thư gian hàng có
 * `BookingRequestDto` đầy đủ, còn danh sách "Chuyến của tôi" chỉ có `CustomerTripListItemDto` —
 * một DTO CỐ Ý hẹp hơn (không ghi chú nội bộ, không hồ sơ khách). Khai kiểu theo cái rộng hơn sẽ
 * buộc màn chuyến bịa ra những trường nó không có, ngay trước một thao tác giữ chỗ một chiếc xe
 * thật.
 *
 * `customerPhone` là `null` khi chưa được phép liên hệ — chuyến tuyến hoa hồng còn chờ duyệt
 * (ADR 0028 điều 9). Hộp thư luôn có số thật nên vẫn thoả kiểu này.
 */
export type BookingRequestDecisionTarget = Omit<
  Pick<
    BookingRequestItem,
    | 'id'
    | 'bookingId'
    | 'vehicleId'
    | 'vehicleName'
    | 'vehiclePlate'
    | 'customerName'
    | 'customerPhone'
    | 'serviceType'
    | 'respondBy'
    | 'pickupAt'
    | 'returnAt'
    | 'deliveryRequested'
    | 'longTermPackageMonths'
    | 'pickupPreference'
    | 'requestedPickupDate'
    | 'pickupWindowStartDate'
    | 'pickupWindowEndDate'
  >,
  'customerPhone' | 'serviceType' | 'pickupPreference' | 'respondBy'
> & {
  readonly customerPhone: string | null;
  /**
   * `null` khi chuyến không còn (hoặc chưa có) hạn phản hồi — hộp thư luôn có mốc thật.
   *
   * `isBookingRequestPastDue(null)` trả `false`, tức "không có hạn thì không quá hạn": đúng, vì
   * một chuyến đã được duyệt hoặc đã khép không còn đồng hồ nào chạy.
   */
  readonly respondBy: string | null;
  /** Mã dịch vụ đi trên dây; `/trips` khai `string` còn hộp thư khai union — `string` nhận cả hai. */
  readonly serviceType: string;
  readonly pickupPreference?: string | null;
};
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

/**
 * Sentinel "mọi trạng thái" — KHÔNG còn một tab nào dùng tới nó kể từ ADR 0047 (ba tab đã phủ
 * hết 11 trạng thái).
 *
 * Giữ lại vì hai lý do, cả hai đều là TƯƠNG THÍCH NGƯỢC chứ không phải một lựa chọn còn sống:
 * deep link cũ có thể mang `status=all`, và `bookingRequestFiltersToParams` phải dịch nó thành
 * *không gửi* `status` thay vì đẩy nguyên chữ `"all"` lên backend — backend từ chối một mã
 * không nằm trong `BOOKING_REQUEST_STATUS_VALUES`, và một liên kết cũ vỡ ngay khi mở còn tệ
 * hơn nhiều so với việc âm thầm rơi về "không lọc".
 */
export const BOOKING_REQUEST_STATUS_ALL = 'all';

/**
 * Tab GỘP "Cần xử lý" — KHÔNG phải một trạng thái thật của `BookingRequestStatus`, mà là HAI
 * trạng thái cùng cần gian hàng quyết định: `pending_host_approval` (mới hỏi) và `hold_paid`
 * (LEGACY ADR 0039 — đã trả đủ trước khi ai duyệt; ADR 0044 không sinh trạng thái này nữa, nhưng
 * những yêu cầu đã ở đó vẫn cần gian hàng quyết).
 *
 * Trước đây hai cái này là HAI TAB riêng vì sợ `hold_paid` chìm mất. Nhưng nó chỉ chìm khi lẫn
 * vào tab "Tất cả" (gồm cả yêu cầu đã chết); gộp với đúng `pending_host_approval` không làm mất
 * tính khẩn cấp — đồng hồ đếm hạn phản hồi đã hiện trên MỌI thẻ cần quyết định, không phân biệt
 * theo tab. Phản hồi người dùng 19/09/2026, gương `BOOKING_REQUEST_TAB_NEEDS_ACTION` bên web.
 */
export const BOOKING_REQUEST_TAB_NEEDS_ACTION = 'needs_action';

/** Hai trạng thái gộp trong tab "Cần xử lý" — cùng thứ tự với chuỗi gửi lên server. */
export const BOOKING_REQUEST_NEEDS_ACTION_STATUSES = [
  BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
  BOOKING_REQUEST_STATUS.HOLD_PAID,
] as const;

/**
 * Tab GỘP "Đã đóng" — SÁU kết cục kết thúc của một yêu cầu, gộp thành MỘT ngăn (ADR 0047) thay
 * vì bốn tab riêng như trước, cộng hai trạng thái trước đây KHÔNG có tab nào (`slot_taken`,
 * `cancelled_by_host` — chỉ thấy được qua tab "Tất cả" nay đã bỏ).
 *
 * Gộp tab KHÔNG đồng nghĩa gộp nhãn: mỗi thẻ vẫn tự hiện đúng kết cục của nó qua
 * `StatusBadge`/`BOOKING_REQUEST_STATUS_META`. Tab chỉ là một NGĂN LỌC, không phải một trạng
 * thái mới.
 *
 * `converted_to_booking` KHÔNG nằm trong nhóm này — nó là kết cục THÀNH CÔNG (đơn đã ra đời),
 * không phải "đã đóng" theo nghĩa hỏng việc. Tra cứu nó ở danh sách đơn thuê; chạm vào một thẻ
 * đã có `bookingId` vẫn mở thẳng chi tiết ĐƠN, không đổi.
 */
export const BOOKING_REQUEST_TAB_CLOSED = 'closed';

/** Sáu trạng thái gộp trong tab "Đã đóng" — cùng thứ tự với chuỗi gửi lên server. */
export const BOOKING_REQUEST_CLOSED_STATUSES = [
  BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
  BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
  BOOKING_REQUEST_STATUS.EXPIRED,
  BOOKING_REQUEST_STATUS.HOLD_EXPIRED,
  BOOKING_REQUEST_STATUS.SLOT_TAKEN,
  BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
] as const;

/**
 * Hai tab GỘP (`needs_action`, `closed`) không phải mã nghiệp vụ (ADR 0005) — dịch thành các mã
 * thật nối dấu phẩy. MỘT chuỗi, không phải mảng: `QueryParams` của `@xeprime/api-client` cố ý
 * không có kiểu mảng, backend tách chuỗi ở DTO (`BookingRequestListQueryDto`).
 *
 * Tab "Chờ khách thanh toán" gửi thẳng `awaiting_hold` — nó đã là một mã thật, không cần dịch.
 * `status=all` là đường LÙI cho liên kết cũ: dịch thành *không gửi* `status`.
 */
export function bookingRequestFiltersToParams(filters: BookingRequestFilters): QueryParams {
  const status =
    filters.status === BOOKING_REQUEST_TAB_NEEDS_ACTION
      ? BOOKING_REQUEST_NEEDS_ACTION_STATUSES.join(',')
      : filters.status === BOOKING_REQUEST_TAB_CLOSED
        ? BOOKING_REQUEST_CLOSED_STATUSES.join(',')
        : filters.status === BOOKING_REQUEST_STATUS_ALL
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
   * HUỶ một chuyến ĐÃ NHẬN — endpoint KHÁC `reject` vì đây là việc khác (ADR 0045 điều 1).
   *
   * `reject` trả lời "không" cho một câu hỏi còn treo; `cancel` rút lại một lời đã hứa, nên
   * server phải đóng khoản giữ chỗ, nhả lịch, hoàn phần khách đã chuyển và ghi một dòng trách
   * nhiệm. Gộp hai việc vào một endpoint bằng một cờ sẽ để một trong hai nhánh tiền đi sai đường.
   */
  cancel(id: string, body: CancelBookingRequestInput): Promise<BookingRequestItem> {
    return getApiClient().post<BookingRequestItem>(
      `/booking-requests/${encodeURIComponent(id)}/cancel`,
      body,
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
