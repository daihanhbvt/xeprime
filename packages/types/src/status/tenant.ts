import type { StatusMeta } from './meta';

/** Trạng thái gian hàng (ADR 0005). Nguồn: `xeprime_database_design.md` §5.1. */
export const TENANT_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  NEEDS_REVISION: 'needs_revision',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

export type TenantStatus = (typeof TENANT_STATUS)[keyof typeof TENANT_STATUS];

export const TENANT_STATUS_VALUES = Object.values(TENANT_STATUS) as TenantStatus[];

export function isTenantStatus(value: unknown): value is TenantStatus {
  return typeof value === 'string' && (TENANT_STATUS_VALUES as string[]).includes(value);
}

/**
 * Chỉ tenant ở trạng thái này mới được hiện xe ra marketplace và nhận booking.
 *
 * ADR 0008 quyết định KHÔNG denormalize trạng thái này vào `public_listings` — marketplace
 * luôn join `tenants` và lọc bằng hằng số dưới đây, để khoá shop có hiệu lực tức thì.
 */
export const TENANT_STATUS_PUBLISHABLE: readonly TenantStatus[] = [TENANT_STATUS.ACTIVE];

export const TENANT_STATUS_META: Readonly<Record<TenantStatus, StatusMeta>> = {
  [TENANT_STATUS.DRAFT]: { label: 'Nháp', color: 'default' },
  [TENANT_STATUS.PENDING_REVIEW]: { label: 'Chờ duyệt', color: 'gold' },
  [TENANT_STATUS.NEEDS_REVISION]: { label: 'Cần bổ sung', color: 'orange' },
  [TENANT_STATUS.ACTIVE]: { label: 'Đang hoạt động', color: 'green' },
  [TENANT_STATUS.SUSPENDED]: { label: 'Bị khóa', color: 'red' },
  [TENANT_STATUS.REJECTED]: { label: 'Bị từ chối', color: 'red' },
  [TENANT_STATUS.EXPIRED]: { label: 'Hết hạn gói', color: 'default' },
};
