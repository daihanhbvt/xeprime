import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  financeApi,
  financeRangeParams,
  financeSeriesParams,
  receiptFiltersToParams,
  receiptsApi,
  type FinancePeriodFilters,
  type FinanceScope,
  type ReceiptFilters,
} from '../api';

/**
 * Ba truy vấn của tuyến tiền mà hồ sơ khách dùng.
 *
 * `scope` thu hẹp về MỘT khách — cùng hook, cùng endpoint, cùng phép tính với màn Tổng quan
 * doanh thu. Nhờ vậy con số ở hồ sơ một khách không thể lệch dòng của họ trong bảng tổng quan:
 * hai bề mặt là cùng một câu truy vấn khác nhau đúng một mệnh đề lọc.
 *
 * Gác quyền `finance.view` ở NƠI GỌI — tiền là quyền RIÊNG trong sổ khách (luật của S-01), và
 * gọi khi thiếu quyền chỉ tạo ra một 403 vô nghĩa.
 */
export function useFinanceSummary(
  filters: FinancePeriodFilters,
  scope: FinanceScope | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.finance.summary(financeRangeParams(filters, scope)),
    queryFn: () => financeApi.summary(filters, scope),
    enabled,
  });
}

export function useFinanceSeries(
  filters: FinancePeriodFilters,
  scope: FinanceScope | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.finance.series(financeSeriesParams(filters, scope)),
    queryFn: () => financeApi.series(filters, scope),
    enabled,
  });
}

/** Danh sách phiếu thu/chi — phân trang server-side; giữ trang cũ khi tải trang mới. */
export function useReceipts(filters: ReceiptFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.receipts.list(receiptFiltersToParams(filters)),
    queryFn: () => receiptsApi.list(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}
