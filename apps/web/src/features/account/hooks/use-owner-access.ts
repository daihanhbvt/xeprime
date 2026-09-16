'use client';

import { OWNER_STAGE, isCommissionTrack, resolveOwnerStage, type OwnerStage } from '@xeprime/types';

import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';

export interface OwnerAccess {
  user: CurrentUser | null;
  isLoading: boolean;
  /** `tenant.roleKey === shop_owner` — chủ gian hàng, dù đã mua gói hay chưa (ADR 0014). */
  isOwner: boolean;
  /**
   * Bậc: `none` · `registering` (hồ sơ/xe chưa đi hết vòng duyệt) · `owner` (có xe trên chợ).
   * Luật ở `@xeprime/types` để backend và app native dùng cùng một định nghĩa.
   */
  stage: OwnerStage;
  /** Đã đi hết vòng đăng ký — mở đủ bộ màn chủ xe. */
  isActiveOwner: boolean;
  /** Đang trong vòng đăng ký — chỉ mở màn tiến trình. */
  isRegistering: boolean;
  /** Chủ xe tuyến hoa hồng: chủ gian hàng CHƯA có gói (ADR 0028 điều 1). */
  isCommissionOwner: boolean;
}

/**
 * "Tôi có phải chủ xe không, và đang ở bậc nào" — MỘT định nghĩa cho menu, cổng chặn và các màn
 * chủ xe ở `/account`.
 *
 * Đọc từ `useCurrentUser` (đã được `AccountShell` nạp trước khi trang con render) nên không có
 * request thêm. Đây chỉ là lớp trải nghiệm: mọi endpoint mà các màn chủ xe gọi vẫn qua
 * `TenantScopeGuard` + permission ở backend (CLAUDE.md §3).
 */
export function useOwnerAccess(): OwnerAccess {
  const { data, isLoading } = useCurrentUser();
  const tenant = data?.tenant ?? null;
  const stage = resolveOwnerStage(tenant);

  return {
    user: data ?? null,
    isLoading,
    isOwner: stage !== OWNER_STAGE.NONE,
    stage,
    isActiveOwner: stage === OWNER_STAGE.OWNER,
    isRegistering: stage === OWNER_STAGE.REGISTERING,
    isCommissionOwner: isCommissionTrack(tenant),
  };
}
