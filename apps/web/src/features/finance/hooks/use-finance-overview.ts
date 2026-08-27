'use client';

import { useQuery } from '@tanstack/react-query';
import { RECEIPT_TYPE } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  customerRevenueParams,
  fetchCustomerRevenue,
  fetchFinanceByCategory,
  fetchFinanceSeries,
  fetchFinanceSummary,
  fetchVehicleProfit,
  overviewRangeParams,
  vehicleProfitParams,
} from '../api';
import type { FinanceOverviewFilters, FinancePeriodFilters, FinanceScope } from '../types';

/**
 * Bốn truy vấn của tuyến báo cáo tiền.
 *
 * Tách thành bốn `useQuery` chứ không gộp một endpoint "tất cả trong một": bảng theo xe phân
 * trang và sắp xếp riêng, còn ba khối kia không đổi khi người dùng sang trang bảng. Gộp lại thì
 * mỗi lần bấm trang là nạp lại cả biểu đồ và thẻ tổng.
 *
 * `scope` thu hẹp về MỘT xe hoặc MỘT khách — cùng hook, cùng endpoint, cùng phép tính. Nhờ vậy
 * con số ở hồ sơ một chiếc xe không thể lệch dòng của nó trong bảng tổng quan; hai bề mặt là
 * cùng một câu truy vấn khác nhau đúng một mệnh đề lọc.
 */

export function useFinanceSummaryOverview(filters: FinancePeriodFilters, scope?: FinanceScope) {
  return useQuery({
    queryKey: queryKeys.finance.summary(overviewRangeParams(filters, scope)),
    queryFn: () => fetchFinanceSummary(filters, scope),
  });
}

export function useFinanceSeries(filters: FinancePeriodFilters, scope?: FinanceScope) {
  return useQuery({
    queryKey: queryKeys.finance.series({
      ...overviewRangeParams(filters, scope),
      granularity: filters.granularity ?? null,
    }),
    queryFn: () => fetchFinanceSeries(filters, scope),
  });
}

/** Cơ cấu một CHIỀU tiền — gọi hai lần (thu và chi) để hai khối tải song song, không nối đuôi. */
export function useFinanceByCategory(
  filters: FinancePeriodFilters,
  type: (typeof RECEIPT_TYPE)[keyof typeof RECEIPT_TYPE],
  scope?: FinanceScope,
) {
  return useQuery({
    queryKey: queryKeys.finance.byCategory({ ...overviewRangeParams(filters, scope), type }),
    queryFn: () => fetchFinanceByCategory(filters, type, scope),
  });
}

export function useVehicleProfit(filters: FinanceOverviewFilters) {
  return useQuery({
    queryKey: queryKeys.finance.byVehicle(vehicleProfitParams(filters)),
    queryFn: () => fetchVehicleProfit(filters),
  });
}

export function useCustomerRevenue(filters: FinanceOverviewFilters) {
  return useQuery({
    queryKey: queryKeys.finance.byCustomer(customerRevenueParams(filters)),
    queryFn: () => fetchCustomerRevenue(filters),
  });
}
