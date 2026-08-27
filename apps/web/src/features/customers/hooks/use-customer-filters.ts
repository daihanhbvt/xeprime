'use client';

import {
  DEFAULT_TENANT_CUSTOMER_SORT,
  TENANT_CUSTOMER_RELATIONSHIP,
  type TenantCustomerRelationship,
  type TenantCustomerSort,
} from '@xeprime/types';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { isAllowedRelationship, isAllowedSort } from '../constants';
import type { CustomerFilters } from '../types';

/**
 * Bộ lọc sổ khách sống ở URL (ADR 0004): gửi link "khách còn nợ, sắp theo nợ giảm dần, trang 2"
 * cho đồng nghiệp phải mở ra đúng màn đó, và F5 không mất chỗ đang đọc.
 *
 * `canViewFinance` tham gia phần ĐỌC: một URL mang `sort=debt` mở bởi người không có quyền xem
 * tiền sẽ rơi về mặc định thay vì gọi API rồi ăn 403 — link cũ/đường dẫn dán tay không được
 * biến thành màn lỗi.
 */
export function useCustomerFilters(canViewFinance: boolean): {
  filters: CustomerFilters;
  relationship: TenantCustomerRelationship;
  sort: TenantCustomerSort;
  setFilters: (patch: Partial<CustomerFilters>) => void;
  clear: () => void;
  hasActiveFilters: boolean;
} {
  const { filters, setFilters } = useUrlFilters<CustomerFilters>((params) => {
    const relationship = params.get('relationship') ?? undefined;
    const sort = params.get('sort') ?? undefined;
    return {
      q: params.get('q') ?? undefined,
      relationship: isAllowedRelationship(relationship, canViewFinance) ? relationship : undefined,
      sort: isAllowedSort(sort, canViewFinance) ? sort : undefined,
      page: positiveIntParam(params, 'page'),
      limit: positiveIntParam(params, 'limit'),
    };
  });

  const relationship = (filters.relationship ??
    TENANT_CUSTOMER_RELATIONSHIP.ALL) as TenantCustomerRelationship;
  const sort = (filters.sort ?? DEFAULT_TENANT_CUSTOMER_SORT) as TenantCustomerSort;

  return {
    filters,
    relationship,
    sort,
    setFilters,
    // Sắp xếp KHÔNG tính là "đang lọc": đổi thứ tự không làm mất dòng nào, nên trạng thái rỗng
    // vẫn phải là "chưa có khách" chứ không phải "không khớp bộ lọc".
    hasActiveFilters: Boolean(filters.q) || relationship !== TENANT_CUSTOMER_RELATIONSHIP.ALL,
    clear: () =>
      setFilters({ q: undefined, relationship: TENANT_CUSTOMER_RELATIONSHIP.ALL, page: undefined }),
  };
}
