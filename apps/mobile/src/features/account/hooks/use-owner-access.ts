import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import type { CurrentUser } from '@/features/auth/api';
import { isShopOwner } from '../account-nav';

export interface OwnerAccess {
  user: CurrentUser | null;
  isLoading: boolean;
  /** `tenant.roleKey === shop_owner` — chủ gian hàng, dù đã mua gói hay chưa (ADR 0014). */
  isOwner: boolean;
}

/**
 * "Tôi có phải chủ xe không" — MỘT định nghĩa cho menu tài khoản và cho `OwnerGate`.
 *
 * Bản native của `apps/web/src/features/account/hooks/use-owner-access.ts`. Đọc từ
 * `useCurrentUser` (`/auth/me`, đã nằm trong cache khi tab Tài khoản mở) nên không có request
 * thêm. Đây chỉ là lớp trải nghiệm: mọi endpoint mà các màn chủ xe gọi vẫn qua `TenantScopeGuard`
 * + permission ở backend (CLAUDE.md §3).
 */
export function useOwnerAccess(): OwnerAccess {
  const { data, isLoading } = useCurrentUser();
  return {
    user: data ?? null,
    isLoading,
    isOwner: isShopOwner(data),
  };
}
