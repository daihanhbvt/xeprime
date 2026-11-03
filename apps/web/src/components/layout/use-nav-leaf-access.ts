'use client';

import { useSearchParams } from 'next/navigation';
import { FEATURE_STATE, TENANT_ROLE, isFeatureVisible } from '@xeprime/types';
import { isNavPermissionGranted, type NavLeaf } from '@/constants/nav';
import { withBranchParam } from '@/features/branches/branch-link';
import { useRememberedBranch } from '@/features/branches/branch-memory';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useFeatureStates } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useNavBadges, type NavBadgeCounts } from './use-nav-badges';

export interface NavLeafAccess {
  /** Người dùng có quyền thấy trang này không — kể cả khi nó là mục ẩn (`hidden`). */
  canSeeLeaf: (leaf: NavLeaf) => boolean;
  /** Có VẼ thành một dòng menu không: thấy được và không phải mục ẩn. */
  isShown: (leaf: NavLeaf) => boolean;
  /** Số "cần xử lý" của mục; 0 khi mục không mang huy hiệu. */
  badgeCountOf: (leaf: NavLeaf) => number;
  /** Đường dẫn của mục, mang theo chi nhánh đang lọc (ADR 0052). */
  hrefOf: (leaf: NavLeaf) => string;
}

/**
 * MỘT vị từ "người dùng có thấy mục này không" cho mọi bề mặt menu — menu ngang site partner
 * (`PartnerTopNav`), sidebar và drawer mobile (`useManageNav`). Hai bản lọc riêng là chỗ để một mục
 * hiện ở desktop mà biến mất ở mobile.
 *
 * BA trục độc lập kiểm NỐI TIẾP nhau: `permission` trả lời "anh là ai" (ADR 0027 điều 2),
 * `ownerOnly`/`memberOnly` trả lời "anh có phải CHỦ gian hàng này không" (ADR 0038 điều 3),
 * `feature` trả lời "gian hàng này có gì". Thiếu một trục trong phép dồn huy hiệu thì một khối đóng
 * sẽ đếm việc cho mục người dùng KHÔNG thấy — một con số chỉ vào hư không.
 *
 * Trục sở hữu đọc `roleKey`, không đọc quyền: xem docblock `NavLeaf.ownerOnly`. Cờ tính năng vắng
 * trong cache ⇒ coi như `enabled` (cùng mặc định "cho qua" của `useFeature`).
 *
 * Chi nhánh đang lọc đi THEO LINK sang màn kế tiếp (ADR 0052): URL đang đứng thắng; màn trung lập
 * lấy chi nhánh lọc gần nhất từ bộ nhớ phiên (`branch-memory.ts`).
 */
export function useNavLeafAccess(): NavLeafAccess {
  const remembered = useRememberedBranch();
  const branchId = useSearchParams().get('branchId') ?? remembered;
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  const featureStates = useFeatureStates();
  const badges = useNavBadges();
  const isShopOwner = user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;

  const canSeeLeaf = (leaf: NavLeaf): boolean =>
    isNavPermissionGranted(leaf.permission, has) &&
    (leaf.ownerOnly !== true || isShopOwner) &&
    (leaf.memberOnly !== true || !isShopOwner) &&
    (leaf.feature === undefined ||
      isFeatureVisible(featureStates[leaf.feature] ?? FEATURE_STATE.ENABLED));

  return {
    canSeeLeaf,
    isShown: (leaf) => leaf.hidden !== true && canSeeLeaf(leaf),
    badgeCountOf: (leaf) => (leaf.badge ? (badges[leaf.badge as keyof NavBadgeCounts] ?? 0) : 0),
    hrefOf: (leaf) => withBranchParam(leaf.href, branchId),
  };
}
