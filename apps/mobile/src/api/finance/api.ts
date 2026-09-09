import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';
import type { UploadMeta, UploadPresign } from '../vehicles/api';

type Schemas = components['schemas'];

export type Receipt = Schemas['ReceiptListItemDto'];
export type ReceiptDetail = Schemas['ReceiptDetailDto'];
export type ReceiptSummary = Schemas['ReceiptSummaryDto'];
export type CreateReceiptInput = Schemas['CreateReceiptDto'];
export type ReceiptBookingOption = Schemas['ReceiptBookingOptionDto'];
export type ReceiptVehicleOption = Schemas['ReceiptVehicleOptionDto'];
export type FinanceCategory = Schemas['FinanceCategoryDto'];
export type CreateCategoryInput = Schemas['CreateCategoryDto'];
export type DebtItem = Schemas['DebtItemDto'];
export type FinanceSummary = Schemas['FinanceSummaryDto'];
export type FinanceSeries = Schemas['FinanceSeriesDto'];
export type FinanceSeriesBucket = Schemas['FinanceSeriesBucketDto'];
export type FinanceCategoryBreakdown = Schemas['FinanceCategoryBreakdownDto'];
export type FinanceCategoryBreakdownItem = Schemas['FinanceCategoryBreakdownItemDto'];
export type VehicleProfit = Schemas['VehicleProfitItemDto'];
export type CustomerRevenue = Schemas['CustomerRevenueItemDto'];

export const RECEIPTS_DEFAULT_LIMIT = 20;

/**
 * Bộ lọc sổ Thu-Chi.
 *
 * `bookingId`/`vehicleId`/`tenantCustomerId` không có ô điều khiển riêng trên thanh lọc: chúng
 * là đường VÀO từ chi tiết đơn / hồ sơ xe / sổ khách.
 *
 * Ý ĐỊNH của giao diện (web đặt `create=1` lên URL để mở sẵn form) KHÔNG nằm ở đây — nó không
 * xuống API, nên nó thuộc về client dựng ra nó.
 */
export interface ReceiptFilters {
  type?: string;
  status?: string;
  categoryId?: string;
  source?: string;
  /** Nhóm nguồn: tiền thật của gian hàng ↔ tiền giữ hộ. */
  sourceGroup?: string;
  paymentMethod?: string;
  bookingId?: string;
  vehicleId?: string;
  tenantCustomerId?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function receiptFiltersToParams(filters: ReceiptFilters): QueryParams {
  return {
    type: filters.type ?? null,
    status: filters.status ?? null,
    categoryId: filters.categoryId ?? null,
    source: filters.source ?? null,
    sourceGroup: filters.sourceGroup ?? null,
    paymentMethod: filters.paymentMethod ?? null,
    bookingId: filters.bookingId ?? null,
    vehicleId: filters.vehicleId ?? null,
    tenantCustomerId: filters.tenantCustomerId ?? null,
    q: filters.q ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

/**
 * Tham số cho thẻ tổng: CÙNG bộ lọc với danh sách, bỏ phân trang.
 *
 * Bỏ `page`/`limit` không phải để gọn — giữ chúng lại thì mỗi lần sang trang là một query key
 * mới cho một con số không đổi, tức các thẻ nhấp nháy mỗi lần bấm sang trang.
 */
export function receiptSummaryParams(filters: ReceiptFilters): QueryParams {
  const { page: _page, limit: _limit, ...rest } = receiptFiltersToParams(filters);
  return rest;
}

/**
 * Khoá lọc THẬT SỰ đi xuống API — mọi thứ ngoài phân trang.
 *
 * Dùng để trả lời "màn này có đang lọc gì không", thứ quyết định trạng thái rỗng nói "chưa có
 * phiếu nào" hay "không có phiếu khớp bộ lọc". Gương của `RECEIPT_FILTER_KEYS` bên web, đặt ở
 * package dùng chung để hai client không đếm lệch nhau.
 */
export const RECEIPT_FILTER_KEYS = [
  'type',
  'status',
  'categoryId',
  'source',
  'sourceGroup',
  'paymentMethod',
  'bookingId',
  'vehicleId',
  'tenantCustomerId',
  'q',
  'from',
  'to',
] as const satisfies readonly (keyof ReceiptFilters)[];

export function hasReceiptFilters(filters: ReceiptFilters): boolean {
  return RECEIPT_FILTER_KEYS.some((key) => Boolean(filters[key]));
}

/** KỲ của mọi bề mặt tiền theo kỳ — hai đầu `YYYY-MM-DD` + độ mịn biểu đồ. */
export interface FinancePeriodFilters {
  from?: string;
  to?: string;
  granularity?: string;
}

/**
 * Thu hẹp một báo cáo về MỘT thực thể.
 *
 * Đúng MỘT khoá được đặt — panel không dựng để cắt hai chiều cùng lúc, và một giao điểm
 * "xe X của khách Y" là câu hỏi khác hẳn.
 */
export interface FinanceScope {
  vehicleId?: string;
  tenantCustomerId?: string;
}

/**
 * Kỳ + phân trang/sắp xếp của HAI bảng xếp hạng ở màn Tổng quan doanh thu.
 *
 * Hai bảng (theo xe, theo khách) phân trang và sắp xếp RIÊNG, nên mỗi bảng mang tiền tố tham số
 * của mình. Dùng chung một cặp sẽ làm bấm sang trang ở bảng này nhảy luôn cả bảng kia.
 */
export interface FinanceOverviewFilters extends FinancePeriodFilters {
  sort?: string;
  page?: number;
  limit?: number;
  customerSort?: string;
  customerPage?: number;
  customerLimit?: number;
}

/**
 * Phạm vi đi CÙNG bộ tham số kỳ, không tách riêng: khoá cache và request phải dựng từ đúng một
 * object, nếu không hồ sơ khách A sẽ đọc trúng cache của khách B.
 */
export function financeRangeParams(
  filters: FinancePeriodFilters,
  scope: FinanceScope = {},
): QueryParams {
  return {
    from: filters.from ?? null,
    to: filters.to ?? null,
    vehicleId: scope.vehicleId ?? null,
    tenantCustomerId: scope.tenantCustomerId ?? null,
  };
}

export function financeSeriesParams(
  filters: FinancePeriodFilters,
  scope: FinanceScope = {},
): QueryParams {
  return { ...financeRangeParams(filters, scope), granularity: filters.granularity ?? null };
}

export function financeByCategoryParams(
  filters: FinancePeriodFilters,
  type: string,
  scope: FinanceScope = {},
): QueryParams {
  return { ...financeRangeParams(filters, scope), type };
}

export function vehicleProfitParams(filters: FinanceOverviewFilters): QueryParams {
  return {
    ...financeRangeParams(filters),
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

/**
 * Bảng doanh thu theo khách: tiền tố `customer*` chỉ tồn tại ở TẦNG GIAO DIỆN — xuống API thì cả
 * hai bảng đều là `sort`/`page`/`limit`. Tiền tố là chuyện của một màn có hai bảng, không phải
 * của endpoint.
 */
export function customerRevenueParams(filters: FinanceOverviewFilters): QueryParams {
  return {
    from: filters.from ?? null,
    to: filters.to ?? null,
    sort: filters.customerSort ?? null,
    page: filters.customerPage ?? 1,
    limit: filters.customerLimit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

/** Bộ lọc màn Công nợ — từ khoá + nhóm hạn trả, cả hai lọc ở SERVER. */
export interface DebtFilters {
  q?: string;
  filter?: string;
  page?: number;
  limit?: number;
}

export function debtFiltersToParams(filters: DebtFilters): QueryParams {
  return {
    q: filters.q ?? null,
    filter: filters.filter ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? RECEIPTS_DEFAULT_LIMIT,
  };
}

export const receiptsApi = {
  list(filters: ReceiptFilters): Promise<Paged<Receipt>> {
    return getApiClient().fetchPage<Receipt>(
      '/receipts',
      receiptFiltersToParams(filters),
      RECEIPTS_DEFAULT_LIMIT,
    );
  },

  detail(id: string): Promise<ReceiptDetail> {
    return getApiClient().get<ReceiptDetail>(`/receipts/${encodeURIComponent(id)}`);
  },

  /** Thẻ tổng của ĐÚNG bộ lọc đang xem — backend cộng cùng một vị từ với danh sách. */
  summary(filters: ReceiptFilters): Promise<ReceiptSummary> {
    return getApiClient().get<ReceiptSummary>('/receipts/summary', receiptSummaryParams(filters));
  },

  create(body: CreateReceiptInput): Promise<ReceiptDetail> {
    return getApiClient().post<ReceiptDetail>('/receipts', body);
  },

  approve(id: string): Promise<ReceiptDetail> {
    return getApiClient().post<ReceiptDetail>(`/receipts/${encodeURIComponent(id)}/approve`);
  },

  cancel(id: string, reason?: string): Promise<ReceiptDetail> {
    return getApiClient().post<ReceiptDetail>(`/receipts/${encodeURIComponent(id)}/cancel`, {
      reason,
    });
  },

  /** Đơn gợi ý cho ô "Liên kết đơn thuê" — server đã sắp đơn còn nợ lên trước. */
  bookingOptions(q?: string): Promise<ReceiptBookingOption[]> {
    return getApiClient().get<ReceiptBookingOption[]>('/receipts/booking-options', {
      q: q?.trim() || null,
    });
  },

  /**
   * Xe gợi ý cho ô "Liên kết xe". `includeId` giữ xe đang chọn sẵn trong kết quả kể cả khi nó
   * không khớp từ khoá đang gõ — không có nó, gõ tìm xe khác sẽ làm ô chọn hiện lại id thô.
   */
  vehicleOptions(q?: string, includeId?: string | null): Promise<ReceiptVehicleOption[]> {
    return getApiClient().get<ReceiptVehicleOption[]>('/receipts/vehicle-options', {
      q: q?.trim() || null,
      includeId: includeId || null,
    });
  },

  /**
   * Presign chứng từ của phiếu (ảnh hoặc PDF) — bucket CÔNG KHAI, cùng mức phơi bày với ảnh xe.
   *
   * `fileSize` được server ký vào URL (`content-length` nằm trong `X-Amz-SignedHeaders`), nên số
   * khai ở đây phải khớp TUYỆT ĐỐI số byte lúc PUT, nếu không R2 trả 403.
   */
  presignAttachment(meta: UploadMeta): Promise<UploadPresign> {
    return getApiClient().post<UploadPresign>('/uploads/receipt-attachments/presign', meta);
  },
};

/**
 * Danh mục thu/chi của gian hàng.
 *
 * CỐ Ý không có `update`: backend có `PATCH /finance/categories/:id` từ Phase 6 nhưng KHÔNG giao
 * diện nào gọi nó — mở nút đổi tên ở app mà web chưa có là app đi trước web, đúng thứ luật clone
 * cấm. Mở cùng lúc hai bên hoặc không mở.
 */
export const financeCategoriesApi = {
  list(type?: string): Promise<FinanceCategory[]> {
    return getApiClient().get<FinanceCategory[]>(
      '/finance/categories',
      type ? { type } : undefined,
    );
  },

  create(body: CreateCategoryInput): Promise<FinanceCategory> {
    return getApiClient().post<FinanceCategory>('/finance/categories', body);
  },

  remove(id: string): Promise<void> {
    return getApiClient().delete<void>(`/finance/categories/${encodeURIComponent(id)}`);
  },
};

/** Công nợ — tính động từ `bookings`, phân trang ở SERVER. */
export const debtsApi = {
  list(filters: DebtFilters): Promise<Paged<DebtItem>> {
    return getApiClient().fetchPage<DebtItem>(
      '/debts',
      debtFiltersToParams(filters),
      RECEIPTS_DEFAULT_LIMIT,
    );
  },
};

/**
 * Báo cáo tiền theo KỲ — dùng lại nguyên bộ endpoint của màn Tổng quan doanh thu, chỉ thêm mệnh
 * đề thu hẹp `scope`. Đó là điều làm cho con số ở hồ sơ một khách và con số ở bảng tổng quan
 * **không thể lệch nhau**: chúng là cùng một câu truy vấn.
 */
export const financeApi = {
  summary(filters: FinancePeriodFilters, scope?: FinanceScope): Promise<FinanceSummary> {
    return getApiClient().get<FinanceSummary>('/finance/summary', financeRangeParams(filters, scope));
  },

  series(filters: FinancePeriodFilters, scope?: FinanceScope): Promise<FinanceSeries> {
    return getApiClient().get<FinanceSeries>('/finance/series', financeSeriesParams(filters, scope));
  },

  /** Cơ cấu MỘT chiều tiền — gọi hai lần (thu và chi) để hai khối tải song song, không nối đuôi. */
  byCategory(
    filters: FinancePeriodFilters,
    type: string,
    scope?: FinanceScope,
  ): Promise<FinanceCategoryBreakdown> {
    return getApiClient().get<FinanceCategoryBreakdown>(
      '/finance/by-category',
      financeByCategoryParams(filters, type, scope),
    );
  },

  byVehicle(filters: FinanceOverviewFilters): Promise<Paged<VehicleProfit>> {
    return getApiClient().fetchPage<VehicleProfit>(
      '/finance/by-vehicle',
      vehicleProfitParams(filters),
      RECEIPTS_DEFAULT_LIMIT,
    );
  },

  byCustomer(filters: FinanceOverviewFilters): Promise<Paged<CustomerRevenue>> {
    return getApiClient().fetchPage<CustomerRevenue>(
      '/finance/by-customer',
      customerRevenueParams(filters),
      RECEIPTS_DEFAULT_LIMIT,
    );
  },
};
