import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';

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

/** Khớp `BOOKING_SORT` ở backend DTO. */
export type BookingSort = 'newest' | 'pickup_asc' | 'pickup_desc' | 'return_asc';

export interface BookingFilters {
  q?: string;
  status?: string;
  vehicleId?: string;
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
    vehicleId: filters.vehicleId ?? null,
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
  list(filters: BookingFilters): Promise<Paged<BookingListItem>> {
    return getApiClient().fetchPage<BookingListItem>(
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

  /** Gán/bỏ gán tài xế — `driverId: null` là bỏ gán tường minh; server có audit. */
  assignDriver(id: string, driverId: string | null): Promise<BookingDetail> {
    return getApiClient().patch<BookingDetail>(`/bookings/${encodeURIComponent(id)}/driver`, {
      driverId,
    });
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
