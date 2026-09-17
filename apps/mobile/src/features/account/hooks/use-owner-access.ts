import { OWNER_STAGE, resolveOwnerStage, type OwnerStage } from '@xeprime/types';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import type { CurrentUser } from '@/features/auth/api';

export interface OwnerAccess {
  user: CurrentUser | null;
  isLoading: boolean;
  /** `tenant.roleKey === shop_owner` — chủ gian hàng, dù đã mua gói hay chưa (ADR 0014). */
  isOwner: boolean;
  /**
   * Bậc: `none` · `registering` (hồ sơ/xe chưa đi hết vòng duyệt) · `owner` (có xe trên chợ).
   * Luật ở `@xeprime/types` để backend, web và app native dùng cùng một định nghĩa.
   */
  stage: OwnerStage;
  /** Đã đi hết vòng đăng ký — mở đủ bộ màn chủ xe. */
  isActiveOwner: boolean;
  /** Đang trong vòng đăng ký — chỉ mở màn tiến trình và những màn có việc thật để làm. */
  isRegistering: boolean;
}

/**
 * "Tôi có phải chủ xe không, và đang ở bậc nào" — MỘT định nghĩa cho menu tài khoản và cho
 * `OwnerGate`.
 *
 * Bản native của `apps/web/src/features/account/hooks/use-owner-access.ts`. Đọc từ
 * `useCurrentUser` (`/auth/me`, đã nằm trong cache khi tab Tài khoản mở) nên không có request
 * thêm. Đây chỉ là lớp trải nghiệm: mọi endpoint mà các màn chủ xe gọi vẫn qua `TenantScopeGuard`
 * + permission ở backend (CLAUDE.md §3).
 *
 * `isOwner` suy từ BẬC chứ không hỏi riêng `roleKey`: hai nguồn cho cùng một câu hỏi sẽ trôi khỏi
 * nhau đúng lúc luật bậc đổi. Hai cách hiện cho cùng kết quả (`resolveOwnerStage` trả `none` khi
 * và chỉ khi không phải `shop_owner`) — giữ một nguồn là để nó còn đúng ở lần sửa sau.
 */
export function useOwnerAccess(): OwnerAccess {
  const { data, isLoading } = useCurrentUser();
  const stage = resolveOwnerStage(data?.tenant ?? null);

  return {
    user: data ?? null,
    isLoading,
    isOwner: stage !== OWNER_STAGE.NONE,
    stage,
    isActiveOwner: stage === OWNER_STAGE.OWNER,
    isRegistering: stage === OWNER_STAGE.REGISTERING,
  };
}
