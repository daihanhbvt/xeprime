import { FEATURE_STATE, isFeatureVisible, type FeatureState, type PlanFeature } from '@xeprime/types';
import {
  flattenManageLeaves,
  isManageNavBranch,
  isManageNavPermissionGranted,
  manageNavForTrack,
  visibleNodes,
  type ManageNavBadge,
  type ManageNavBranch,
  type ManageNavLeaf,
  type ManageNavNode,
  type ManageNavSection,
} from './manage-nav';
import type { PartnerTrack } from './partner-track';
import type { ManageNavBadgeCounts, ManageNavBadgeUrgency } from './use-manage-nav-badges';

/**
 * Cây menu ĐÃ LỌC cho một người cụ thể — phần logic dùng chung của thanh menu dưới đáy
 * (`ManageTabBar`), tấm danh sách mục của một khối (`ManageSectionSheet`) và màn "Tài khoản của
 * tôi" (`ManageAccountMenuScreen`). Một chỗ lọc duy nhất: ba bề mặt đó không được lệch nhau về việc
 * ai thấy mục nào.
 */

/** Một nhánh đã lọc quyền: mục cha giữ nguyên, mục con chỉ còn cái được phép. */
export interface ResolvedBranch {
  readonly kind: 'branch';
  readonly branch: ManageNavBranch;
  readonly children: readonly ResolvedLeaf[];
  /** Tổng huy hiệu của các mục CON người dùng xem được (web `hiddenCount`). */
  readonly badge: number;
}

export interface ResolvedLeaf {
  readonly kind: 'leaf';
  readonly leaf: ManageNavLeaf;
  readonly badge: number;
  /** Huy hiệu đang khẩn (quá giờ / sắp hết hạn). */
  readonly urgent?: boolean;
}

export type ResolvedNode = ResolvedBranch | ResolvedLeaf;

export interface ResolvedSection {
  readonly section: ManageNavSection;
  /** Mục được VẼ (đã lọc quyền, bỏ mục ẩn). */
  readonly nodes: readonly ResolvedNode[];
  /** Mọi mục lá được phép, KỂ CẢ mục ẩn — để khớp đường dẫn (`activeAs`). */
  readonly allLeaves: readonly ManageNavLeaf[];
  /** Tổng số "cần xử lý" của khối — mỗi việc chỉ đếm ở MỘT mục (web `badgeTotalOf`). */
  readonly badge: number;
  readonly urgent: boolean;
}

/**
 * Lọc cây menu của một tuyến theo người đang đăng nhập — bản native của `canSeeLeaf` web.
 *
 * BA trục độc lập kiểm NỐI TIẾP: `permission` ("anh là ai" — ADR 0027 điều 2), `ownerOnly` ("anh có
 * phải CHỦ" — ADR 0038 điều 3), `feature` ("gian hàng có gì", `hidden` thì ẩn, `read_only` vẫn hiện).
 * Cờ vắng trong cache ⇒ coi như `enabled`. Quyền/năng lực chỉ ẨN mục — chặn thật là guard backend
 * (CLAUDE.md mục 6).
 */
export function resolveSections(
  track: PartnerTrack,
  has: Parameters<typeof isManageNavPermissionGranted>[1],
  featureStates: Partial<Record<PlanFeature, FeatureState>>,
  badges: ManageNavBadgeCounts,
  isShopOwner = false,
  urgency: ManageNavBadgeUrgency = {},
): readonly ResolvedSection[] {
  const badgeOf = (key: ManageNavBadge | undefined) => (key ? badges[key] : 0);
  const urgentOf = (key: ManageNavBadge | undefined) => (key ? urgency[key] === true : false);

  const canSeeLeaf = (leaf: ManageNavLeaf): boolean =>
    isManageNavPermissionGranted(leaf.permission, has) &&
    (leaf.ownerOnly !== true || isShopOwner) &&
    (leaf.feature === undefined ||
      isFeatureVisible(featureStates[leaf.feature] ?? FEATURE_STATE.ENABLED));

  const toLeaf = (leaf: ManageNavLeaf): ResolvedLeaf => ({
    kind: 'leaf',
    leaf,
    badge: badgeOf(leaf.badge),
    urgent: urgentOf(leaf.badge),
  });

  const resolveNode = (node: ManageNavNode): ResolvedNode | null => {
    if (!isManageNavBranch(node)) return canSeeLeaf(node) ? toLeaf(node) : null;
    // Mục cha không có quyền riêng: sống khi CÒN ÍT NHẤT MỘT mục con được phép.
    const children = node.children.filter(canSeeLeaf).map(toLeaf);
    if (children.length === 0) return null;
    return {
      kind: 'branch',
      branch: node,
      children,
      badge: children.reduce((sum, child) => sum + child.badge, 0),
    };
  };

  return manageNavForTrack(track)
    .map((section): ResolvedSection => {
      const nodes = visibleNodes(section)
        .map(resolveNode)
        .filter((node): node is ResolvedNode => node !== null);
      const drawnLeaves = drawnLeavesOf(nodes);
      return {
        section,
        nodes,
        allLeaves: flattenManageLeaves([section]).filter(canSeeLeaf),
        badge: drawnLeaves.reduce((sum, leaf) => sum + leaf.badge, 0),
        urgent: drawnLeaves.some((leaf) => leaf.urgent === true && leaf.badge > 0),
      };
    })
    .filter(({ nodes }) => nodes.length > 0);
}

/** Mọi mục lá ĐƯỢC VẼ của một khối, nhánh trải phẳng — thứ tự giữ nguyên như cây. */
export function drawnLeavesOf(nodes: readonly ResolvedNode[]): readonly ResolvedLeaf[] {
  return nodes.flatMap((node) => (node.kind === 'leaf' ? [node] : [...node.children]));
}

/** Đích sáng của một mục: chính href của nó, hoặc mục HIỆN mà mục ẩn thuộc về. */
export function leafActiveHref(leaf: ManageNavLeaf): string | null {
  return leaf.href != null ? String(leaf.activeAs ?? leaf.href) : null;
}
