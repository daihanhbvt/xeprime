'use client';

import {
  CUSTOMER_REVENUE_SORT_VALUES,
  FINANCE_GRANULARITY_VALUES,
  VEHICLE_PROFIT_SORT_VALUES,
} from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { buildPeriodRange } from '@/lib/datetime';
import { FINANCE_OVERVIEW_DEFAULT_PERIOD, VEHICLE_PROFIT_PAGE_SIZE } from '../constants';
import type { FinanceOverviewFilters, FinancePeriodFilters } from '../types';

/**
 * KỲ trên URL — phần dùng chung giữa màn Tổng quan doanh thu và mọi khối tiền nhúng trong hồ sơ
 * một chiếc xe / một khách.
 *
 * **Kỳ luôn có giá trị.** URL trống thì trả về tháng hiện tại như thể người dùng đã chọn: biểu đồ
 * cần hai đầu để dựng cột, và "toàn bộ lịch sử" không phải câu ai hỏi khi mở màn tiền buổi sáng.
 * Giá trị mặc định KHÔNG ghi ngược lên URL — `/manage/finance` trần vẫn là đường dẫn hợp lệ, chỉ
 * khi người dùng tự chọn kỳ thì tham số mới xuất hiện.
 *
 * `granularity` chỉ nhận giá trị trong union: ai sửa tay URL thành `?granularity=fortnight` sẽ rơi
 * về mặc định thay vì gửi rác xuống backend cho nó trả 400.
 */
export function parsePeriodParams(sp: URLSearchParams): FinancePeriodFilters {
  const fallback = buildPeriodRange(FINANCE_OVERVIEW_DEFAULT_PERIOD);
  return {
    from: sp.get('from') ?? fallback.from,
    to: sp.get('to') ?? fallback.to,
    granularity: oneOf(sp.get('granularity'), FINANCE_GRANULARITY_VALUES),
  };
}

/** Chỉ kỳ — cho khối tiền nhúng trong hồ sơ xe / hồ sơ khách. */
export function useFinancePeriodFilters() {
  return useUrlFilters<FinancePeriodFilters>(parsePeriodParams);
}

/** Kỳ + phân trang/sắp xếp của bảng hiệu quả theo xe — chỉ màn Tổng quan cần thêm phần này. */
export function useFinanceOverviewFilters() {
  return useUrlFilters<FinanceOverviewFilters>((sp) => ({
    ...parsePeriodParams(sp),
    sort: oneOf(sp.get('sort'), VEHICLE_PROFIT_SORT_VALUES),
    page: positiveIntParam(sp, 'page'),
    limit: VEHICLE_PROFIT_PAGE_SIZE,
    // Bảng theo khách mang tiền tố riêng: dùng chung `sort`/`page` với bảng theo xe thì bấm
    // sang trang ở bảng này sẽ nhảy luôn cả bảng kia.
    customerSort: oneOf(sp.get('customerSort'), CUSTOMER_REVENUE_SORT_VALUES),
    customerPage: positiveIntParam(sp, 'customerPage'),
    customerLimit: VEHICLE_PROFIT_PAGE_SIZE,
  }));
}

/** Giá trị URL chỉ được đi tiếp khi nó nằm trong union — mọi thứ khác coi như không truyền. */
function oneOf(value: string | null, allowed: readonly string[]): string | undefined {
  return value && allowed.includes(value) ? value : undefined;
}
