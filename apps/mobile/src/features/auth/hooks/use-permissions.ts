import { useMemo } from 'react';
import type { Permission } from '@xeprime/types';
import { useCurrentUser } from './use-auth';

export interface PermissionCheck {
  has: (permission: Permission) => boolean;
  /** Có ÍT NHẤT MỘT trong các quyền — không phải tất cả. */
  hasAny: (...permissions: Permission[]) => boolean;
  isLoading: boolean;
}

/**
 * RBAC ở phía app — bản native của `apps/web/src/hooks/use-permissions.ts`.
 *
 * CHỈ dùng để ẩn/hiện UI. CLAUDE.md mục 3: guard backend là nguồn bảo vệ chính — ẩn một nút ở
 * đây không bảo vệ gì cả, vì access token vẫn gọi được API bằng curl. Mọi endpoint tương ứng
 * PHẢI có `@RequirePermissions(...)`.
 *
 * Quyền đọc từ `useCurrentUser()`, tức từ `GET /auth/me`, tức từ DB ở mỗi lần gọi — KHÔNG bao
 * giờ từ claim của access token (ADR 0017 §1). Đó là điều làm cho việc thu hồi quyền có hiệu
 * lực ngay mà không cần bắt người dùng đăng nhập lại.
 */
export function usePermissions(): PermissionCheck {
  const { data, isLoading } = useCurrentUser();

  return useMemo(() => {
    const granted = new Set(data?.permissions ?? []);
    return {
      has: (permission: Permission) => granted.has(permission),
      hasAny: (...permissions: Permission[]) => permissions.some((p) => granted.has(p)),
      isLoading,
    };
  }, [data?.permissions, isLoading]);
}
