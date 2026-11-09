import {
  BOOKING_HISTORY_TAB,
  BOOKING_STATUS,
  CUSTOMER_TRIP_FILTER,
  type BookingHistoryTab,
} from '@xeprime/types';
import {
  LEGACY_ENDED_TAB,
  LEGACY_REQUEST_TAB_STAGE,
  RENTAL_STAGE,
  type RentalStage,
} from '@/constants/rental-stages';
import { BOOKINGS_GROUP_PARAM } from '@/constants/routes';

/**
 * Chuyển tiếp link CŨ sau khi gộp hai màn thành "Đơn thuê xe" (05/11/2026) — hàm THUẦN, dùng chung
 * cho route site partner và route của phiên hỗ trợ, để link trong email, thông báo, bookmark không
 * chết và không mất bộ lọc người dùng đã chọn.
 */

type SearchParamsRecord = Record<string, string | string[] | undefined>;

/** Bộ lọc dùng chung của cả ba màn — mang theo qua mỗi lần chuyển. */
const CARRIED_PARAMS = ['q', 'branchId', 'serviceType', 'vehicleId'] as const;

/** Tham số trạng thái ĐƠN cũ (thẻ Tổng quan trước 02/11) đã kết thúc → ngăn của màn lịch sử. */
const LEGACY_ENDED_BOOKING_STATUS: Readonly<Record<string, BookingHistoryTab>> = {
  [BOOKING_STATUS.COMPLETED]: BOOKING_HISTORY_TAB.COMPLETED,
  [BOOKING_STATUS.CANCELLED]: BOOKING_HISTORY_TAB.CANCELLED,
  [BOOKING_STATUS.NO_SHOW]: BOOKING_HISTORY_TAB.CANCELLED,
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function carried(searchParams: SearchParamsRecord): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of CARRIED_PARAMS) {
    const value = first(searchParams[key]);
    if (value) params.set(key, value);
  }
  return params;
}

function withQuery(base: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export interface RentalsBasePaths {
  /** Màn "Đơn thuê xe" (`/bookings` hoặc bản trong phiên hỗ trợ). */
  bookings: string;
  /** Màn "Đơn đã kết thúc". */
  ended: string;
}

/** Đích của màn "Đơn đã kết thúc" kèm ngăn + bộ lọc mang theo. */
function historyTarget(paths: RentalsBasePaths, tab: BookingHistoryTab, params: URLSearchParams) {
  if (tab !== BOOKING_HISTORY_TAB.ALL) params.set('tab', tab);
  return withQuery(paths.ended, params);
}

function stageTarget(paths: RentalsBasePaths, stage: RentalStage, params: URLSearchParams) {
  params.set(BOOKINGS_GROUP_PARAM, stage);
  return withQuery(paths.bookings, params);
}

/** Hộp thư "Yêu cầu đặt xe" cũ (`?status=` = tab cũ) → nhóm tương ứng / ngăn "Không thành đơn". */
export function legacyRequestsTarget(
  searchParams: SearchParamsRecord,
  paths: RentalsBasePaths,
): string {
  const params = carried(searchParams);
  const status = first(searchParams.status);
  const endedTab = status ? LEGACY_ENDED_TAB[status] : undefined;
  if (endedTab) return historyTarget(paths, endedTab, params);
  const stage = (status && LEGACY_REQUEST_TAB_STAGE[status]) || RENTAL_STAGE.NEEDS_ACTION;
  return stageTarget(paths, stage, params);
}

/**
 * "Chuyến cho thuê" cũ của chủ xe tuyến hoa hồng (`/trips`, 07/10 → 06/11/2026): tab "Lịch sử chuyến"
 * (`?filter=history`) → màn "Đơn đã kết thúc"; tab hiện tại → màn "Đơn thuê xe". Từ khoá đi theo.
 */
export function legacyOwnerTripsTarget(
  searchParams: SearchParamsRecord,
  paths: RentalsBasePaths,
): string {
  const params = carried(searchParams);
  if (first(searchParams.filter) === CUSTOMER_TRIP_FILTER.HISTORY) {
    return historyTarget(paths, BOOKING_HISTORY_TAB.ALL, params);
  }
  return withQuery(paths.bookings, params);
}

/**
 * Màn "Đơn thuê xe": link cũ trỏ vào một ngăn ĐÃ KẾT THÚC (`?preset=completed|cancelled`, hoặc
 * `?status=completed|cancelled|no_show`) → màn "Đơn đã kết thúc". `null` = ở lại.
 */
export function legacyEndedBookingsTarget(
  searchParams: SearchParamsRecord,
  paths: RentalsBasePaths,
): string | null {
  const preset = first(searchParams[BOOKINGS_GROUP_PARAM]);
  const status = first(searchParams.status);
  const tab =
    (preset ? LEGACY_ENDED_TAB[preset] : undefined) ??
    (status ? LEGACY_ENDED_BOOKING_STATUS[status] : undefined);
  return tab ? historyTarget(paths, tab, carried(searchParams)) : null;
}
