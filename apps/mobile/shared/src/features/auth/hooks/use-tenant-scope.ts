import type { components } from '@xeprime/types';
import { useCurrentUser } from './use-auth';

export type CurrentTenantSummary = components['schemas']['CurrentTenantSummaryDto'];

export interface TenantScope {
  tenant: CurrentTenantSummary | null;
  /** Đã đăng nhập nhưng chưa thuộc gian hàng nào — khác hẳn với "đang tải". */
  hasNoTenant: boolean;
  isLoading: boolean;
}

/**
 * Gian hàng của phiên hiện tại — bản native của `apps/web/src/hooks/use-tenant-scope.ts`.
 *
 * Đây là BẢN SAO để render, không phải nguồn phân quyền: backend luôn tự lấy `tenant_id` từ
 * membership (CLAUDE.md mục 6, lằn ranh 1), và app không bao giờ gửi `tenantId` lên.
 */
export function useTenantScope(): TenantScope {
  const { data, isLoading } = useCurrentUser();
  const tenant = data?.tenant ?? null;

  return {
    tenant,
    hasNoTenant: !isLoading && Boolean(data) && tenant === null,
    isLoading,
  };
}
