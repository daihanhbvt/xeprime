import { STATUS_COLOR, type StatusMeta } from './meta';

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
  [TENANT_STATUS.DRAFT]: { label: 'Nháp', color: STATUS_COLOR.NEUTRAL },
  [TENANT_STATUS.PENDING_REVIEW]: { label: 'Chờ duyệt', color: STATUS_COLOR.WAITING },
  [TENANT_STATUS.NEEDS_REVISION]: { label: 'Cần bổ sung', color: STATUS_COLOR.WARNING },
  [TENANT_STATUS.ACTIVE]: { label: 'Đang hoạt động', color: STATUS_COLOR.SUCCESS },
  [TENANT_STATUS.SUSPENDED]: { label: 'Bị khóa', color: STATUS_COLOR.DANGER },
  [TENANT_STATUS.REJECTED]: { label: 'Bị từ chối', color: STATUS_COLOR.DANGER },
  [TENANT_STATUS.EXPIRED]: { label: 'Hết hạn gói', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái tenant cho phép gửi (lại) duyệt: chưa gửi hoặc bị yêu cầu bổ sung. */
export const TENANT_STATUS_SUBMITTABLE: readonly TenantStatus[] = [
  TENANT_STATUS.DRAFT,
  TENANT_STATUS.NEEDS_REVISION,
  TENANT_STATUS.REJECTED,
];

/** Loại hình gian hàng. */
export const TENANT_TYPE = {
  INDIVIDUAL: 'individual',
  BUSINESS: 'business',
} as const;

export type TenantType = (typeof TENANT_TYPE)[keyof typeof TENANT_TYPE];
export const TENANT_TYPE_VALUES = Object.values(TENANT_TYPE) as TenantType[];

export const TENANT_TYPE_LABEL: Readonly<Record<TenantType, string>> = {
  [TENANT_TYPE.INDIVIDUAL]: 'Cá nhân',
  [TENANT_TYPE.BUSINESS]: 'Doanh nghiệp',
};
