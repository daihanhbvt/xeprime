import type { components } from '@xeprime/types';

/** Shape phiếu thu/chi + danh mục lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Receipt = Schemas['ReceiptListItemDto'];
export type ReceiptDetail = Schemas['ReceiptDetailDto'];
export type CreateReceiptInput = Schemas['CreateReceiptDto'];
export type ReceiptSummary = Schemas['ReceiptSummaryDto'];
export type ReceiptBookingOption = Schemas['ReceiptBookingOptionDto'];
export type FinanceCategory = Schemas['FinanceCategoryDto'];
export type CreateCategoryInput = Schemas['CreateCategoryDto'];
export type DebtItem = Schemas['DebtItemDto'];
export type FinanceSummary = Schemas['FinanceSummaryDto'];

/** Filter công nợ ở URL searchParams (ADR 0004). */
export interface DebtFilters {
  /** Tìm theo mã đơn / tên khách / SĐT / tên xe / biển số — lọc ở SERVER, không cắt ở client. */
  q?: string;
  filter?: string;
  page?: number;
  limit?: number;
}

/**
 * Filter danh sách phiếu — ở URL searchParams (ADR 0004).
 *
 * `bookingId`/`vehicleId`/`tenantCustomerId` không có ô điều khiển riêng trên thanh lọc: chúng là
 * đường VÀO từ chi tiết đơn / hồ sơ xe / sổ khách. Vẫn phải nằm ở đây để URL đó chia sẻ được và
 * sống sót qua reload.
 */
export interface ReceiptFilters {
  type?: string;
  status?: string;
  categoryId?: string;
  source?: string;
  /**
   * Nhóm nguồn: tiền thật của gian hàng ↔ tiền giữ hộ. Không có ô trên thanh lọc — nó chỉ đến
   * từ thẻ tổng của màn Tổng quan doanh thu, và là thứ làm tổng ở đây khớp con số trên thẻ đó.
   */
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

// --- Báo cáo doanh thu (`/manage/finance`) ---------------------------------

export type FinanceSeries = Schemas['FinanceSeriesDto'];
export type FinanceSeriesBucket = Schemas['FinanceSeriesBucketDto'];
export type FinanceCategoryBreakdown = Schemas['FinanceCategoryBreakdownDto'];
export type FinanceCategoryBreakdownItem = Schemas['FinanceCategoryBreakdownItemDto'];
export type VehicleProfit = Schemas['VehicleProfitItemDto'];
export type CustomerRevenue = Schemas['CustomerRevenueItemDto'];

/**
 * KỲ trên URL (ADR 0004) — phần dùng chung của mọi bề mặt tiền theo kỳ.
 *
 * `from`/`to` dùng CHUNG tên tham số với sổ Thu-Chi để một đường dẫn đã lọc chuyển qua lại giữa
 * các màn mà không phải dịch tên. `granularity` nằm trên URL vì nó đổi HÌNH mà người dùng đang
 * đọc — gửi link cho đồng nghiệp phải ra đúng biểu đồ đó.
 */
export interface FinancePeriodFilters {
  from?: string;
  to?: string;
  granularity?: string;
}

/**
 * Kỳ + phân trang/sắp xếp — chỉ màn Tổng quan doanh thu cần thêm phần này.
 *
 * Hai bảng xếp hạng (theo xe, theo khách) có phân trang và sắp xếp RIÊNG, nên mỗi bảng mang
 * tiền tố tham số của mình trên URL. Dùng chung một cặp / sẽ làm bấm sang trang ở
 * bảng này nhảy luôn cả bảng kia.
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
 * Thu hẹp một báo cáo về MỘT thực thể.
 *
 * Không phải filter trên URL: nó đến từ tham số route (`/manage/vehicles/[id]`), nên nó là ngữ
 * cảnh của trang chứ không phải lựa chọn của người dùng.
 */
export interface FinanceScope {
  vehicleId?: string;
  tenantCustomerId?: string;
}
