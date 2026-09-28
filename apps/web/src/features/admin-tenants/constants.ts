import { PLATFORM_TENANT_SORT_VALUES, TENANT_STATUS, type TenantStatus } from '@xeprime/types';

/**
 * Thứ tự trạng thái trong bộ lọc — trạng thái hay dùng đứng trước. Nhãn dịch qua
 * `useDomainLabel('tenantStatus', …)`, không viết ở đây.
 */
export const ADMIN_TENANT_STATUS_FILTER_ORDER: readonly TenantStatus[] = [
  TENANT_STATUS.ACTIVE,
  TENANT_STATUS.SUSPENDED,
  TENANT_STATUS.PENDING_REVIEW,
  TENANT_STATUS.NEEDS_REVISION,
  TENANT_STATUS.DRAFT,
  TENANT_STATUS.REJECTED,
];

/** Sắp xếp danh sách đối tác — nhãn dịch qua `useDomainLabel('platformTenantSort', …)`. */
export const ADMIN_TENANT_SORT_OPTIONS = PLATFORM_TENANT_SORT_VALUES;
