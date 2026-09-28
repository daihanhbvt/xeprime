'use client';

import { TENANT_STATUS_VALUES, isPlatformTenantSort } from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { ADMIN_PARTNER_TAB_PARAM, ADMIN_PARTNER_TENANT_PARAM } from '@/constants/routes';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { AdminPartnerListUrlState } from '../types';

/**
 * Filter + gian hàng đang mở của một danh sách đối tác, ở URL searchParams (ADR 0004).
 *
 * Giá trị LẠ trong URL (gõ tay, link cũ) rơi về mặc định thay vì được gửi nguyên lên server: một
 * `status=abc` sẽ là lỗi 400 và một màn đỏ cho thứ người dùng không hề gõ.
 *
 * Hook chung coi `'all'` là sentinel không-lọc và xoá hẳn khỏi URL — link sạch, đồng nhất với các
 * danh sách còn lại.
 */
/** Trần `limit` của `GET /platform/tenants` (`PLATFORM_TENANT_MAX_LIMIT`) — vượt thì API trả 400. */
const MAX_LIMIT = 100;

export function useAdminTenantFilters() {
  return useUrlFilters<AdminPartnerListUrlState>((sp) => {
    const status = sp.get('status');
    const sort = sp.get('sort');
    const limit = positiveIntParam(sp, 'limit');
    return {
      status:
        status && (TENANT_STATUS_VALUES as readonly string[]).includes(status)
          ? status
          : ALL_FILTER,
      q: sp.get('q')?.trim() || undefined,
      sort: isPlatformTenantSort(sort) ? sort : undefined,
      page: positiveIntParam(sp, 'page'),
      limit: limit !== undefined && limit <= MAX_LIMIT ? limit : undefined,
      tenant: sp.get(ADMIN_PARTNER_TENANT_PARAM)?.trim() || undefined,
      tab: sp.get(ADMIN_PARTNER_TAB_PARAM) || undefined,
    };
  });
}
