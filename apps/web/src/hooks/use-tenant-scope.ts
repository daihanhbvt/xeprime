'use client';

import { useSupportSession } from '@/features/tenant-support/support-session';
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
 *
 * Trong phiên hỗ trợ gian hàng (ADR 0050 §12) "gian hàng hiện hành" là gian hàng CỦA PHIÊN (server
 * trả cùng hình dạng với `/auth/me`, `roleKey = shop_viewer`) — cùng lý do `usePermissions` và
 * `useFeatureStates` đổi nguồn: màn dùng lại không phải biết mình đang ở trong phiên. Khung trang
 * (`AppShell`) đứng NGOÀI ranh giới phiên nên vẫn thấy tài khoản nhân sự của chính nó.
 */
export function useTenantScope(): TenantScope {
  const { data, isLoading } = useCurrentUser();
  const support = useSupportSession();
  if (support) return { tenant: support.context.tenant, hasNoTenant: false, isLoading: false };
  const tenant = data?.tenant ?? null;

  return {
    tenant,
    hasNoTenant: !isLoading && Boolean(data) && tenant === null,
    isLoading,
  };
}
