'use client';

import { useMemo } from 'react';
import type { Permission } from '@xeprime/types';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useCurrentUser } from './use-current-user';

export interface PermissionCheck {
  /** Có đúng quyền này không. */
  has: (permission: Permission) => boolean;
  /** Có ít nhất một trong các quyền. */
  hasAny: (...permissions: Permission[]) => boolean;
  isLoading: boolean;
}

/**
 * CHỈ dùng để ẩn/hiện UI.
 *
 * CLAUDE.md mục 3: guard backend là nguồn bảo vệ chính. Ẩn một nút ở đây không bảo vệ gì
 * cả — người dùng vẫn gọi API được bằng curl. Mọi endpoint tương ứng PHẢI có
 * `@RequirePermissions(...)` ở backend.
 *
 * Trong PHIÊN HỖ TRỢ gian hàng (ADR 0050) quyền là bộ server suy từ capability của phiên — KHÔNG
 * phải quyền nền tảng của người đang đăng nhập. Nhờ vậy mọi component đọc quyền tự khoá/mở đúng
 * trong phiên mà không cần một prop `isAdmin` nào.
 */
export function usePermissions(): PermissionCheck {
  const { data, isLoading } = useCurrentUser();
  const support = useSupportSession();
  const supportPermissions = support?.context.permissions;

  return useMemo(() => {
    const granted = new Set<string>(supportPermissions ?? data?.permissions ?? []);
    return {
      has: (permission: Permission) => granted.has(permission),
      hasAny: (...permissions: Permission[]) => permissions.some((p) => granted.has(p)),
      // Quyền của phiên đã có sẵn cùng bản ghi phiên — không chờ `/auth/me`.
      isLoading: supportPermissions ? false : isLoading,
    };
  }, [data?.permissions, isLoading, supportPermissions]);
}
