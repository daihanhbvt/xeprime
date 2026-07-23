'use client';

import { TENANT_STATUS } from '@xeprime/types';
import { useCurrentUser, type CurrentTenantSummary } from './use-current-user';

export interface TenantScope {
  tenant: CurrentTenantSummary | null;
  /** User đã đăng nhập nhưng chưa thuộc gian hàng nào — cần màn "chưa có gian hàng". */
  hasNoTenant: boolean;
  /** Gian hàng đã được duyệt và đang hoạt động. */
  isActive: boolean;
  /** Đang chờ duyệt/cần bổ sung — portal chỉ nên hiện checklist hồ sơ. */
  isPendingApproval: boolean;
  isLoading: boolean;
}

/**
 * Tenant scope hiển thị ở client.
 *
 * Lưu ý: đây là BẢN SAO để render, không phải nguồn phân quyền. Backend luôn tự lấy
 * tenant từ membership (CLAUDE.md mục 6, lằn ranh 1) — client không gửi tenantId lên.
 */
export function useTenantScope(): TenantScope {
  const { data, isLoading } = useCurrentUser();
  const tenant = data?.tenant ?? null;

  return {
    tenant,
    hasNoTenant: !isLoading && Boolean(data) && tenant === null,
    isActive: tenant?.status === TENANT_STATUS.ACTIVE,
    isPendingApproval:
      tenant?.status === TENANT_STATUS.PENDING_REVIEW ||
      tenant?.status === TENANT_STATUS.NEEDS_REVISION ||
      tenant?.status === TENANT_STATUS.DRAFT,
    isLoading,
  };
}
