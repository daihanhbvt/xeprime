import { useMemo } from 'react';
import { usePathname } from 'expo-router';
import { TENANT_ROLE } from '@xeprime/types';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-authenticated-user';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ROUTES } from '@/navigation/routes';
import { matchActiveHref } from './manage-nav';
import { resolveSections, type ResolvedSection } from './manage-menu';
import { resolvePartnerTrack, type PartnerTrack } from './partner-track';
import { useManageNavBadgeUrgency, useManageNavBadges } from './use-manage-nav-badges';

export interface ManageMenuState {
  readonly track: PartnerTrack;
  /** Cây menu đã lọc cho người đang đăng nhập (quyền · chủ · cờ gói · tuyến) kèm huy hiệu. */
  readonly sections: readonly ResolvedSection[];
  /** `href` của mục đang mở (mục ẩn quy về mục hiện qua `activeAs`), hoặc `null`. */
  readonly activeHref: string | null;
}

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

  return { track, sections, activeHref };
}
