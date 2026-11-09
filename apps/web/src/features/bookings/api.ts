import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  AssignBookingDriverInput,
  BookingDetail,
  BookingExtension,
  BookingExtensionQuote,
  BookingDriverHistoryItem,
  BookingFilters,
  BookingHandoverPrep,
  BookingHistoryFilters,
  BookingHistoryItem,
  BookingHistoryMeta,
  BookingListItem,
  BookingListMeta,
  CheckConflictInput,
  CheckConflictResult,
  CreateBookingInput,
  DriverWageQuote,
  SetHandoverPrepCheckInput,
  TransitionInput,
  UpdateBookingInput,
  UpdateDeliveryFeeInput,
  UpdateDriverWageInput,
} from './types';

export const BOOKINGS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type BookingListResult = Paged<BookingListItem, BookingListMeta>;

/** Filter (URL) → query params gửi API. Bỏ giá trị rỗng để URL và cache key gọn. */
export function filtersToParams(filters: BookingFilters): QueryParams {
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

export const fetchBookings = (filters: BookingFilters): Promise<BookingListResult> =>
  fetchPage<BookingListItem, BookingListMeta>(
    '/bookings',
    filtersToParams(filters),
    BOOKINGS_DEFAULT_LIMIT,
  );

/** "Đơn đã kết thúc" mặc định 10 dòng/trang — đúng ô "10 dòng" của design `23948:99426`. */
export const BOOKING_HISTORY_DEFAULT_LIMIT = 10;

export type BookingHistoryResult = Paged<BookingHistoryItem, BookingHistoryMeta>;

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

/** Đơn đã đóng + yêu cầu không thành đơn, MỘT danh sách xếp theo lúc kết thúc (05/11/2026). */
export const fetchBookingHistory = (filters: BookingHistoryFilters): Promise<BookingHistoryResult> =>
  fetchPage<BookingHistoryItem, BookingHistoryMeta>(
    '/booking-history',
    historyFiltersToParams(filters),
    BOOKING_HISTORY_DEFAULT_LIMIT,
  );

export const fetchBooking = (id: string): Promise<BookingDetail> =>
  apiGet<BookingDetail>(`/bookings/${id}`);

export const createBooking = (body: CreateBookingInput): Promise<BookingDetail> =>
  apiPost<BookingDetail>('/bookings', body);

export const updateBooking = (id: string, body: UpdateBookingInput): Promise<BookingDetail> =>
  apiPatch<BookingDetail>(`/bookings/${id}`, body);

export const transitionBooking = (id: string, body: TransitionInput): Promise<BookingDetail> =>
  apiPost<BookingDetail>(`/bookings/${id}/transition`, body);

/**
 * Chốt phí giao nhận sau khi chủ xe và khách đã thống nhất NGOÀI ứng dụng (Wave 9).
 *
 * Endpoint ngữ nghĩa riêng chứ không phải `PATCH /bookings/:id`: server tính lại tổng tiền và
 * ghi audit (ai đổi, từ bao nhiêu sang bao nhiêu). Khách KHÔNG phải xác nhận.
 */
export const updateBookingDeliveryFee = (
  id: string,
  body: UpdateDeliveryFeeInput,
): Promise<BookingDetail> => apiPatch<BookingDetail>(`/bookings/${id}/delivery-fee`, body);

/**
 * Gán/bỏ gán tài xế LIÊN KẾT cho đơn (`null` = bỏ gán, gỡ cả tài xế ngoài hệ thống của đơn cũ —
 * ADR 0063 · ADR 0074). Server có audit.
 */
export const assignBookingDriver = (
  id: string,
  body: AssignBookingDriverInput,
): Promise<BookingDetail> => apiPatch<BookingDetail>(`/bookings/${id}/driver`, body);

/** Lịch sử gán tài xế của đơn (ADR 0063) — mỗi lượt một dòng, cũ nhất trước, kèm tiền công. */
export const fetchBookingDriverHistory = (id: string): Promise<BookingDriverHistoryItem[]> =>
  apiGet<BookingDriverHistoryItem[]>(`/bookings/${id}/driver-history`);

/** Số liệu tiền công cho hộp gán tài xế (ADR 0075) — số ngày, gợi ý, khoảng hợp lệ. */
export const fetchDriverWageQuote = (id: string): Promise<DriverWageQuote> =>
  apiGet<DriverWageQuote>(`/bookings/${id}/driver-wage-quote`);

/** Sửa tiền công của một lượt gán (ADR 0075) — trả lịch sử tài xế của đơn đã cập nhật. */
export const updateDriverWage = (
  id: string,
  assignmentId: string,
  body: UpdateDriverWageInput,
): Promise<BookingDriverHistoryItem[]> =>
  apiPatch<BookingDriverHistoryItem[]>(
    `/bookings/${id}/driver-assignments/${assignmentId}/wage`,
    body,
  );

/** Preview trùng lịch — chỉ để cảnh báo sớm cho UX, không phải lớp bảo vệ (ADR 0006). */
/** Phụ lục gia hạn của một đơn, cũ trước (ADR 0077). */
export const fetchBookingExtensions = (id: string): Promise<BookingExtension[]> =>
  apiGet<BookingExtension[]>(`/bookings/${id}/extensions`);

/** Xem trước giá + lịch trống của phụ lục N tháng — cùng hàm tính với lượt tạo. */
export const fetchBookingExtensionQuote = (
  id: string,
  months: number,
): Promise<BookingExtensionQuote> =>
  apiGet<BookingExtensionQuote>(`/bookings/${id}/extensions/quote`, { months });

export const createBookingExtension = (id: string, months: number): Promise<BookingExtension> =>
  apiPost<BookingExtension>(`/bookings/${id}/extensions`, { months });

export const cancelBookingExtension = (
  id: string,
  extensionId: string,
): Promise<BookingExtension> =>
  apiPost<BookingExtension>(`/bookings/${id}/extensions/${extensionId}/cancel`, {});

export const checkConflict = (body: CheckConflictInput): Promise<CheckConflictResult> =>
  apiPost<CheckConflictResult>('/calendar/check-conflict', body);

/** Đánh dấu / bỏ đánh dấu TAY một việc chuẩn bị bàn giao — trả về khối checklist mới. */
export const setHandoverPrepCheck = (
  id: string,
  body: SetHandoverPrepCheckInput,
): Promise<BookingHandoverPrep> =>
  apiPut<BookingHandoverPrep>(`/bookings/${encodeURIComponent(id)}/handover-prep`, body);
