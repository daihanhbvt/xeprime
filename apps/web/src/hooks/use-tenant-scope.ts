'use client';

import { useCurrentUser, type CurrentTenantSummary } from './use-current-user';

export interface TenantScope {
  tenant: CurrentTenantSummary | null;
  /** User đã đăng nhập nhưng chưa thuộc gian hàng nào — cần màn "chưa có gian hàng". */
  hasNoTenant: boolean;
  isLoading: boolean;
}

/**
 * Tenant scope hiển thị ở client.
 *
 * Lưu ý: đây là BẢN SAO để render, không phải nguồn phân quyền. Backend luôn tự lấy
 * tenant từ membership (CLAUDE.md mục 6, lằn ranh 1) — client không gửi tenantId lên.
 *
 * Ở đây từng có `isPendingApproval` gộp `draft | pending_review | needs_revision` thành một cờ,
 * và `AppShell` in "Gian hàng đang chờ duyệt" cho cả ba — trong khi shop `draft` chưa gửi gì cả.
 * Một cờ boolean không thể mang ba câu khác nhau, nên chỗ quyết định nói gì là
 * `features/shop/status-notice.ts`, đọc thẳng từ `tenant.status`.
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
