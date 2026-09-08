'use client';

import { isCommissionOwner, isShopOwner } from '@/constants/account-nav';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';

export interface OwnerAccess {
  user: CurrentUser | null;
  isLoading: boolean;
  /** `tenant.roleKey === shop_owner` — chủ gian hàng, dù đã mua gói hay chưa (ADR 0014). */
  isOwner: boolean;
  /** Chủ xe tuyến hoa hồng: chủ gian hàng CHƯA có gói (ADR 0028 điều 1). */
  isCommissionOwner: boolean;
}

/**
 * "Tôi có phải chủ xe không" — MỘT định nghĩa cho menu, cổng chặn và các màn chủ xe ở `/account`.
 *
 * Đọc từ `useCurrentUser` (đã được `AccountShell` nạp trước khi trang con render) nên không có
 * request thêm. Đây chỉ là lớp trải nghiệm: mọi endpoint mà các màn chủ xe gọi vẫn qua
 * `TenantScopeGuard` + permission ở backend (CLAUDE.md §3).
 */
export function useOwnerAccess(): OwnerAccess {
  const { data, isLoading } = useCurrentUser();
  return {
    user: data ?? null,
    isLoading,
    isOwner: isShopOwner(data),
    isCommissionOwner: isCommissionOwner(data),
  };
}
