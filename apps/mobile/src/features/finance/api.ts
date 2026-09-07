// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  receiptsApi,
  financeApi,
  receiptFiltersToParams,
  receiptSummaryParams,
  financeRangeParams,
  financeSeriesParams,
  RECEIPTS_DEFAULT_LIMIT,
} from '@xeprime/api-client';

export type {
  FinancePeriodFilters,
  FinanceScope,
  FinanceSeries,
  FinanceSeriesBucket,
  FinanceSummary,
  Receipt,
  ReceiptDetail,
  ReceiptFilters,
  ReceiptSummary,
} from '@xeprime/api-client';
