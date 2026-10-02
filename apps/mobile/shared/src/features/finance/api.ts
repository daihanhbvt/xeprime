// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  receiptsApi,
  financeApi,
  financeCategoriesApi,
  debtsApi,
  receiptFiltersToParams,
  receiptSummaryParams,
  hasReceiptFilters,
  RECEIPT_FILTER_KEYS,
  financeRangeParams,
  financeSeriesParams,
  financeByCategoryParams,
  vehicleProfitParams,
  customerRevenueParams,
  debtFiltersToParams,
  RECEIPTS_DEFAULT_LIMIT,
} from '@/api/finance/api';

export type {
  CreateCategoryInput,
  CreateReceiptInput,
  CustomerRevenue,
  DebtFilters,
  DebtItem,
  FinanceCategory,
  FinanceCategoryBreakdown,
  FinanceCategoryBreakdownItem,
  FinanceOverviewFilters,
  FinancePeriodFilters,
  FinanceScope,
  FinanceSeries,
  FinanceSeriesBucket,
  FinanceSummary,
  Receipt,
  ReceiptBookingOption,
  ReceiptDetail,
  ReceiptFilters,
  ReceiptSummary,
  ReceiptVehicleOption,
  VehicleProfit,
} from '@/api/finance/api';
export type { UploadMeta, UploadPresign } from '@/api/vehicles/api';
