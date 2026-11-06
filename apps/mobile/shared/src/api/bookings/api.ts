import type {
  BookingHistoryOutcome,
  BookingHistoryTab,
  BookingListPreset,
  components,
} from '@xeprime/types';
import { fetchPage, getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

export type BookingListItem = Schemas['BookingListItemDto'];
export type BookingDetail = Schemas['BookingDetailDto'];
export type CreateBookingInput = Schemas['CreateBookingDto'];
export type UpdateBookingInput = Schemas['UpdateBookingDto'];
export type TransitionBookingInput = Schemas['TransitionBookingDto'];
export type UpdateDeliveryFeeInput = Schemas['UpdateBookingDeliveryFeeDto'];
export type CheckConflictInput = Schemas['CheckConflictDto'];
export type CheckConflictResult = Schemas['CheckConflictResultDto'];
export type BookingDriverSummary = Schemas['BookingDriverSummaryDto'];
export type BookingDriverHistoryItem = Schemas['BookingDriverHistoryItemDto'];
export type BookingDriverIncident = Schemas['BookingDriverIncidentDto'];
/**
 * Body của `PATCH /bookings/:id/driver` — chỉ tài xế LIÊN KẾT (`null` = bỏ gán). Khoá
 * `externalDriver` đã bỏ (ADR 0074 điều 4 — server trả 422 `EXTERNAL_DRIVER_NOT_SUPPORTED`).
 * `wageAmount` (VND chuỗi) bỏ trống = mức mặc định × số ngày (ADR 0075).
 */
export type AssignBookingDriverInput = { driverId: string | null; wageAmount?: string };
/** Tiền công của một lượt gán (ADR 0075) — XePrime chỉ ghi nhận, chủ xe trả trực tiếp. */
export type DriverWage = Schemas['DriverWageDto'];
/** Số liệu cho hộp gán: số ngày, gợi ý mặc định × N, khoảng hợp lệ — server tính. */
export type DriverWageQuote = Schemas['DriverWageQuoteDto'];
export type UpdateDriverWageInput = Schemas['UpdateDriverWageDto'];
/** Meta của trang danh sách đơn — kèm số đếm các ngăn (02/11/2026). */
export type BookingListMeta = Schemas['BookingPageMetaDto'];
/** Phụ lục gia hạn đơn dài hạn (ADR 0077) — bề mặt đối tác, có dòng phía chủ xe. */
export type BookingExtension = Schemas['BookingExtensionDto'];
export type BookingExtensionQuote = Schemas['BookingExtensionQuoteDto'];
/** Khối "Chuẩn bị bàn giao" — việc suy tự động + dấu tay (03/11/2026). */
export type BookingHandoverPrep = Schemas['BookingHandoverPrepDto'];
export type SetHandoverPrepCheckInput = Schemas['SetHandoverPrepCheckDto'];
/** "Đơn đã kết thúc" (05/11/2026) — đơn đã đóng + yêu cầu không thành đơn, `GET /booking-history`. */
export type BookingHistoryItem = Schemas['BookingHistoryItemDto'];
export type BookingHistoryMeta = Schemas['BookingHistoryMetaDto'];

export interface BookingHistoryFilters {
  tab?: BookingHistoryTab;
  outcome?: BookingHistoryOutcome;
  q?: string;
  serviceType?: string;
  branchId?: string;
  page?: number;
  limit?: number;
}

/** Cùng 10 dòng/trang với web (`BOOKING_HISTORY_DEFAULT_LIMIT`). */
export const BOOKING_HISTORY_DEFAULT_LIMIT = 10;

export function historyFiltersToParams(filters: BookingHistoryFilters): QueryParams {
  return {
    tab: filters.tab ?? null,
    outcome: filters.outcome ?? null,
    q: filters.q ?? null,
    serviceType: filters.serviceType ?? null,
    branchId: filters.branchId ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? BOOKING_HISTORY_DEFAULT_LIMIT,
  };
}

/** Khớp `BOOKING_SORT` ở backend DTO. */
export type BookingSort = 'newest' | 'pickup_asc' | 'pickup_desc' | 'return_asc';

export interface BookingFilters {
  q?: string;
  status?: string;
  /**
   * Nhóm việc dựng sẵn — CỘNG THÊM vào các bộ lọc khác, không thay thế chúng.
   *
   * `awaiting_pickup` là một câu BA VẾ (trạng thái đơn + chưa có mốc giao thật + chưa có biên bản
   * giao đã xác nhận) mà `status` không diễn đạt nổi. Câu đó sống ở SERVER để mọi client hỏi cùng
   * một câu — cho client tự ghép ba tham số nghĩa là mỗi client giữ một bản, và bản nào lạc hậu
   * thì nó âm thầm đếm sai mà không có gì đỏ lên (ADR 0047).
   *
   * KHÔNG nằm trong bộ lọc người dùng đổi được: "đang xem nhóm nào" do chính MÀN quyết.
   */
  preset?: BookingListPreset;
  vehicleId?: string;
  /** Loại dịch vụ của ĐƠN — ô "Loại dịch vụ" (19/10/2026), cùng bộ lọc của web. */
  serviceType?: string;
  /** Chi nhánh của XE trong đơn. */
  branchId?: string;
  /** Lọc theo ngày TRẢ — nuôi các panel "sắp trả" / "quá hạn". */
  returnFrom?: string;
  returnTo?: string;
  sort?: BookingSort;
  page?: number;
  limit?: number;
}

export const BOOKINGS_DEFAULT_LIMIT = 20;

export function bookingFiltersToParams(filters: BookingFilters): QueryParams {
  return {
    q: filters.q ?? null,
    status: filters.status ?? null,
    preset: filters.preset ?? null,
    vehicleId: filters.vehicleId ?? null,
    serviceType: filters.serviceType ?? null,
    branchId: filters.branchId ?? null,
    returnFrom: filters.returnFrom ?? null,
    returnTo: filters.returnTo ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? BOOKINGS_DEFAULT_LIMIT,
  };
}

export type QuoteBreakdown = Schemas['QuoteBreakdownDto'];

/**
 * Tham số báo giá nội bộ. Hai dạng loại trừ nhau, đúng như luật giá:
 *  - thuê NGÀY/GIỜ: khoảng `pickupAt`–`returnAt`;
 *  - thuê DÀI HẠN: một `packageMonths`, không có ngày trả (ADR 0011).
 */
export interface StaffQuoteParams extends QueryParams {
  vehicleId: string;
  serviceType: string;
  pickupAt?: string;
  returnAt?: string;
  packageMonths?: number;
  routeType?: string;
}

export const bookingsApi = {
  list(filters: BookingFilters): Promise<Paged<BookingListItem, BookingListMeta>> {
    return fetchPage<BookingListItem, BookingListMeta>(
      '/bookings',
      bookingFiltersToParams(filters),
      BOOKINGS_DEFAULT_LIMIT,
    );
  },

  detail(id: string): Promise<BookingDetail> {
    return getApiClient().get<BookingDetail>(`/bookings/${encodeURIComponent(id)}`);
  },

  create(body: CreateBookingInput): Promise<BookingDetail> {
    return getApiClient().post<BookingDetail>('/bookings', body);
  },

  update(id: string, body: UpdateBookingInput): Promise<BookingDetail> {
    return getApiClient().patch<BookingDetail>(`/bookings/${encodeURIComponent(id)}`, body);
  },

  /**
   * Đổi trạng thái đơn — chỉ dùng cho HAI quyết định bấm tay: huỷ đơn và ghi nhận khách không
   * đến. `active`/`completed` KHÔNG bao giờ đi qua đây: chúng là hệ quả của một lần xác nhận
   * bàn giao thật, và một lối tắt ở đây xoá đúng ranh giới đó.
   */
  transition(id: string, body: TransitionBookingInput): Promise<BookingDetail> {
    return getApiClient().post<BookingDetail>(
      `/bookings/${encodeURIComponent(id)}/transition`,
      body,
    );
  },

  /**
   * Chốt phí giao nhận sau khi chủ xe và khách đã thống nhất NGOÀI ứng dụng.
   *
   * Endpoint ngữ nghĩa riêng chứ không phải `PATCH /bookings/:id`: server tính lại tổng tiền và
   * ghi audit (ai đổi, từ bao nhiêu sang bao nhiêu). Số bản đồ chỉ là ƯỚC LƯỢNG (ADR 0018).
   */
  updateDeliveryFee(id: string, body: UpdateDeliveryFeeInput): Promise<BookingDetail> {
    return getApiClient().patch<BookingDetail>(
      `/bookings/${encodeURIComponent(id)}/delivery-fee`,
      body,
    );
  },

  /**
   * Gán/bỏ gán tài xế liên kết, hoặc ghi tài xế ngoài hệ thống (ADR 0067) — gửi ĐÚNG MỘT khoá.
   * Server có audit.
   */
  assignDriver(id: string, body: AssignBookingDriverInput): Promise<BookingDetail> {
    return getApiClient().patch<BookingDetail>(`/bookings/${encodeURIComponent(id)}/driver`, body);
  },

  /** Số liệu tiền công cho hộp gán tài xế (ADR 0075) — số ngày, gợi ý, khoảng hợp lệ. */
  driverWageQuote(id: string): Promise<DriverWageQuote> {
    return getApiClient().get<DriverWageQuote>(
      `/bookings/${encodeURIComponent(id)}/driver-wage-quote`,
    );
  },

  /** Sửa tiền công của một lượt gán (ADR 0075) — trả lịch sử tài xế của đơn đã cập nhật. */
  updateDriverWage(
    id: string,
    assignmentId: string,
    body: UpdateDriverWageInput,
  ): Promise<BookingDriverHistoryItem[]> {
    return getApiClient().patch<BookingDriverHistoryItem[]>(
      `/bookings/${encodeURIComponent(id)}/driver-assignments/${encodeURIComponent(assignmentId)}/wage`,
      body,
    );
  },

  /** Lịch sử gán tài xế của đơn (ADR 0063) — đọc sổ `booking_driver_assignments`, kèm tiền công. */
  driverHistory(id: string): Promise<BookingDriverHistoryItem[]> {
    return getApiClient().get<BookingDriverHistoryItem[]>(
      `/bookings/${encodeURIComponent(id)}/driver-history`,
    );
  },

  /** Đơn đã kết thúc + yêu cầu không thành đơn, MỘT danh sách xếp theo lúc kết thúc. */
  history(filters: BookingHistoryFilters): Promise<Paged<BookingHistoryItem, BookingHistoryMeta>> {
    return fetchPage<BookingHistoryItem, BookingHistoryMeta>(
      '/booking-history',
      historyFiltersToParams(filters),
      BOOKING_HISTORY_DEFAULT_LIMIT,
    );
  },

  /** Phụ lục gia hạn của một đơn, cũ trước (ADR 0077). */
  extensions(id: string): Promise<BookingExtension[]> {
    return getApiClient().get<BookingExtension[]>(
      `/bookings/${encodeURIComponent(id)}/extensions`,
    );
  },

  /** Xem trước giá + lịch trống của phụ lục N tháng — cùng hàm tính với lượt tạo. */
  extensionQuote(id: string, months: number): Promise<BookingExtensionQuote> {
    return getApiClient().get<BookingExtensionQuote>(
      `/bookings/${encodeURIComponent(id)}/extensions/quote`,
      { months },
    );
  },

  createExtension(id: string, months: number): Promise<BookingExtension> {
    return getApiClient().post<BookingExtension>(
      `/bookings/${encodeURIComponent(id)}/extensions`,
      { months },
    );
  },

  cancelExtension(id: string, extensionId: string): Promise<BookingExtension> {
    return getApiClient().post<BookingExtension>(
      `/bookings/${encodeURIComponent(id)}/extensions/${encodeURIComponent(extensionId)}/cancel`,
      {},
    );
  },

  /** Đánh dấu / bỏ đánh dấu TAY một việc chuẩn bị bàn giao — trả về khối checklist mới. */
  setHandoverPrepCheck(id: string, body: SetHandoverPrepCheckInput): Promise<BookingHandoverPrep> {
    return getApiClient().put<BookingHandoverPrep>(
      `/bookings/${encodeURIComponent(id)}/handover-prep`,
      body,
    );
  },

  /** Preview trùng lịch — chỉ để cảnh báo sớm cho UX, KHÔNG phải lớp bảo vệ (ADR 0006). */
  checkConflict(body: CheckConflictInput): Promise<CheckConflictResult> {
    return getApiClient().post<CheckConflictResult>('/calendar/check-conflict', body);
  },

  /**
   * Báo giá NỘI BỘ cho luồng đặt hộ tại quầy.
   *
   * CÙNG `PricingService` với báo giá công khai của khách, nên nhân viên và khách thấy đúng một
   * con số cho cùng một gói — kể cả bậc cuối tuần, ngày lễ và ưu đãi cam kết thời hạn. Đây là lý
   * do luồng tạo đơn KHÔNG được tự cộng trừ tiền ở client.
   *
   * Ném 400 khi xe chưa cấu hình giá — đó là một trạng thái HỢP LỆ, nơi gọi rơi về nhập tiền tay
   * chứ không phải một lỗi cần báo đỏ.
   */
  quote(params: StaffQuoteParams): Promise<QuoteBreakdown> {
    return getApiClient().get<QuoteBreakdown>('/calendar/quote', params as QueryParams);
  },
};
