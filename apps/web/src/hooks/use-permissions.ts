'use client';

import { useMemo } from 'react';
import type { Permission } from '@xeprime/types';
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
