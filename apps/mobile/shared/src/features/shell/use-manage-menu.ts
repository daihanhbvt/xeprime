import { useMemo } from 'react';
import { useTabBarHidden } from '@/components/layout/tab-bar-visibility';
import { usePathname } from 'expo-router';
import { TENANT_ROLE } from '@xeprime/types';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ROUTES } from '@/navigation/routes';
import { matchActiveHref } from './manage-nav';
import { drawnLeavesOf, resolveSections, type ResolvedSection } from './manage-menu';
import { resolvePartnerTrack, type PartnerTrack } from './partner-track';
import { useManageNavBadgeUrgency, useManageNavBadges } from './use-manage-nav-badges';

export interface ManageMenuState {
  readonly track: PartnerTrack;
  /** Cây menu đã lọc cho người đang đăng nhập (quyền · chủ · cờ gói · tuyến) kèm huy hiệu. */
  readonly sections: readonly ResolvedSection[];
  /** `href` của mục đang mở (mục ẩn quy về mục hiện qua `activeAs`), hoặc `null`. */
  readonly activeHref: string | null;
  /**
   * Đang đứng ở một màn CHA của menu: Tổng quan, "Tài khoản của tôi", hoặc một mục được VẼ trong năm
   * khối (vd. Vận hành: Đơn thuê xe, Lịch thuê, Khách hàng). Màn con (Đơn đã kết thúc, chi tiết…)
   * là `false` - thanh menu dưới đáy chỉ hiện ở màn cha (người dùng chốt 20/11/2026).
   */
  readonly isMenuRoot: boolean;
}

/** Đường dẫn không kèm query - so với `usePathname()` (vốn không có query). */
const pathOf = (href: unknown): string => String(href).split('?')[0] ?? '';

/**
 * Trạng thái menu khu quản lý cho một lượt vẽ — thanh tab dưới đáy và màn "Tài khoản của tôi" đọc
 * CÙNG một nguồn, nên hai nơi không lệch nhau về mục nào hiện và mục nào đang sáng.
 */
export function useManageMenu(): ManageMenuState {
  const user = useAuthenticatedUser();
  const permissions = usePermissions();
  const featureStates = useFeatureStates();
  const badges = useManageNavBadges();
  const urgency = useManageNavBadgeUrgency();
  const pathname = usePathname();

  const track = resolvePartnerTrack(user);
  const isShopOwner = user.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;

  const sections = useMemo(
    () => resolveSections(track, permissions.has, featureStates, badges, isShopOwner, urgency),
    [track, permissions, featureStates, badges, isShopOwner, urgency],
  );

  /*
   * Mục đang sáng tra trên MỌI mục lá được phép — kể cả mục ẩn: đứng ở "Đơn đã kết thúc" thì
   * "Đơn thuê xe" sáng (`activeAs`), đúng như web.
   */
  const activeHref = useMemo(
    () =>
      matchActiveHref(
        pathname,
        sections.flatMap(({ allLeaves }) => allLeaves),
        String(ROUTES.manage.home()),
      ),
    [pathname, sections],
  );

  const isMenuRoot = useMemo(() => {
    const roots = new Set<string>([
      pathOf(ROUTES.manage.home()),
      pathOf(ROUTES.manage.more()),
      // Link cũ vẫn dựng CHÍNH màn "Đơn thuê xe" (mở sẵn một nhóm) - vẫn là màn cha.
      pathOf(ROUTES.manage.requests()),
      pathOf(ROUTES.manage.bookingsAwaitingPickup()),
    ]);
    for (const { nodes } of sections) {
      for (const { leaf } of drawnLeavesOf(nodes)) if (leaf.href) roots.add(pathOf(leaf.href));
    }
    return roots.has(pathname);
  }, [sections, pathname]);

  return { track, sections, activeHref, isMenuRoot };
}

/**
 * Thanh menu dưới đáy có đang ẩn không: màn con của menu, hoặc một màn xin ẩn (`useHideTabBar`).
 * Thanh tab và layout bộ tab (đệm vạch điều hướng) đọc CÙNG hook để không lệch nhau.
 */
export function useManageTabBarHidden(): boolean {
  const requested = useTabBarHidden();
  const { isMenuRoot } = useManageMenu();
  return requested || !isMenuRoot;
}
