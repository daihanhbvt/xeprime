import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  type QueryParams,
} from '@/services/api-client';
import type { PaginationMeta } from '@xeprime/types';
import type {
  AdminPromoCode,
  AdminPromoCodePage,
  AdminPromoCodeStats,
  AdminPromoFilters,
  PromoPreview,
  PromoRedemptionPage,
  PromoTripParams,
  UpsertPromoCodeInput,
} from './types';

/** Số dòng mỗi trang của màn quản trị — khớp ảnh thiết kế (10/trang). */
export const PROMO_CODES_DEFAULT_LIMIT = 10;

// ── Khách thuê ──────────────────────────────────────────────────────────────

/**
 * Tham số chuyến → query/body. Bỏ mọi giá trị trống thay vì gửi chuỗi rỗng: DTO bên API khai
 * `@IsOptional()` kèm `@IsISO8601()`, và `@IsOptional` chỉ bỏ qua `null`/`undefined` — một chuỗi
 * rỗng vẫn đi vào validator và bật 400 (cùng cái bẫy đã gặp ở mã tỉnh/xã của luồng đặt xe).
 */
function tripBody(trip: PromoTripParams): QueryParams {
  return {
    vehicleId: trip.vehicleId,
    ...(trip.serviceType ? { serviceType: trip.serviceType } : {}),
    ...(trip.pickupAt ? { pickupAt: trip.pickupAt } : {}),
    ...(trip.returnAt ? { returnAt: trip.returnAt } : {}),
    ...(trip.packageMonths != null ? { packageMonths: trip.packageMonths } : {}),
    ...(trip.routeType ? { routeType: trip.routeType } : {}),
    ...(trip.personalAccidentSelected
      ? { personalAccidentSelected: trip.personalAccidentSelected }
      : {}),
  };
}

/**
 * XEM TRƯỚC một mã khách vừa gõ — server tính số giảm và tổng khách trả.
 *
 * `POST` cho một lượt ĐỌC là chủ đích: mã khuyến mãi không nên nằm trên URL (nó đi vào log truy
 * cập, lịch sử trình duyệt và referer), và tham số là cả một chuyến.
 *
 * KHÔNG ném khi mã không hợp lệ: `applicable = false` kèm `reason` là một câu TRẢ LỜI, không
 * phải lỗi — giao diện vẽ nhánh lý do chứ không hiện một alert đỏ.
 */
export const previewPromoCode = (code: string, trip: PromoTripParams): Promise<PromoPreview> =>
  apiPost<PromoPreview>('/public/promo-codes/preview', { ...tripBody(trip), code });

/**
 * Mã ĐÃ CÔNG BỐ cho chuyến này, kèm lý do với từng mã không áp được.
 *
 * Handler trả `{ data: [...] }` nên `ResponseInterceptor` giữ nguyên envelope, và `apiGet` bóc
 * đúng một lớp — kết quả là chính mảng.
 */
export const fetchAvailablePromoCodes = (trip: PromoTripParams): Promise<PromoPreview[]> =>
  apiGet<PromoPreview[]>('/public/promo-codes/available', tripBody(trip));

// ── Quản trị nền tảng ───────────────────────────────────────────────────────

function filtersToParams(filters: AdminPromoFilters): QueryParams {
  return {
    q: filters.q?.trim() || null,
    // `'all'` là trạng thái của ô chọn, không phải mã nghiệp vụ ⇒ không gửi.
    discountType: filters.discountType === 'all' ? null : filters.discountType,
    state: filters.state === 'all' ? null : filters.state,
    dateFrom: filters.dateFrom ?? null,
    dateTo: filters.dateTo ?? null,
    page: filters.page,
    limit: PROMO_CODES_DEFAULT_LIMIT,
  };
}

const EMPTY_STATS: AdminPromoCodeStats = {
  total: 0,
  createdLast30Days: 0,
  active: 0,
  endingSoon: 0,
  expired: 0,
};

/**
 * Danh sách + thẻ thống kê.
 *
 * KHÔNG dùng `fetchPage` chung: response mang thêm `stats` bên cạnh `{data, meta}` (thẻ thống kê
 * đếm trên TOÀN BỘ chiến dịch, không theo trang), và helper chung sẽ làm rơi mất phần đó — cùng
 * lý do inbox yêu cầu thuê tự đọc envelope.
 */
export async function fetchAdminPromoCodes(
  filters: AdminPromoFilters,
): Promise<AdminPromoCodePage> {
  const res = await apiRequest<AdminPromoCode[]>('/platform/promo-codes', {
    query: filtersToParams(filters),
  });
  const page = res as unknown as Partial<AdminPromoCodePage>;
  return {
    data: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: filters.page,
      limit: PROMO_CODES_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
    stats: page.stats ?? EMPTY_STATS,
  };
}

export const fetchAdminPromoCode = (id: string): Promise<AdminPromoCode> =>
  apiGet<AdminPromoCode>(`/platform/promo-codes/${id}`);

export const createPromoCode = (body: UpsertPromoCodeInput): Promise<AdminPromoCode> =>
  apiPost<AdminPromoCode>('/platform/promo-codes', body);

export const updatePromoCode = (
  id: string,
  body: UpsertPromoCodeInput,
): Promise<AdminPromoCode> => apiPatch<AdminPromoCode>(`/platform/promo-codes/${id}`, body);

/**
 * Bật/tắt — endpoint RIÊNG, không phải `PATCH` với một trường.
 *
 * Nó là thao tác DUY NHẤT còn dùng được khi chiến dịch đã phát sinh lượt dùng (ADR 0046 điều 8),
 * nên gộp vào `PATCH` sẽ khiến mọi lần bật/tắt phải gửi cả bộ điều kiện đang bị khoá — và bị từ
 * chối vì đúng những trường mà người dùng không hề đụng tới.
 */
export const togglePromoCode = (id: string, isActive: boolean): Promise<AdminPromoCode> =>
  apiPost<AdminPromoCode>(`/platform/promo-codes/${id}/toggle`, { isActive });

export const duplicatePromoCode = (id: string): Promise<AdminPromoCode> =>
  apiPost<AdminPromoCode>(`/platform/promo-codes/${id}/duplicate`, {});

/** XOÁ MỀM — mã đã dùng vẫn giải thích được giá của đơn cũ. */
export const deletePromoCode = (id: string): Promise<void> =>
  apiDelete<void>(`/platform/promo-codes/${id}`);

export const fetchPromoRedemptions = (
  id: string,
  page: number,
): Promise<PromoRedemptionPage> => {
  return apiRequest<PromoRedemptionPage['data']>(`/platform/promo-codes/${id}/redemptions`, {
    query: { page, limit: 20 },
  }).then((res) => ({
    data: res.data,
    meta:
      (res.meta as PaginationMeta | undefined) ??
      { page, limit: 20, total: res.data.length, hasNext: false },
  }));
};
