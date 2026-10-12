import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ManageAccountScreen } from '@/features/account/ManageAccountScreen';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';
import {
  ACCOUNT_SECTION,
  ACCOUNT_SECTION_PARAM,
  isAccountSection,
} from '@/navigation/account-section';
import { ROUTES, SHOP_SECTION } from '@/navigation/routes';

/**
 * `/manage/account` — MỘT URL, nội dung theo tuyến (web `PartnerAccountRoute`, PR #156 · #159).
 *
 * `?section=` cuộn tới một khối. Bookmark/thông báo `?section=address|tax|plan` của một tài khoản
 * NAY đã ở tuyến gói thì sang trang Cửa hàng (web `shopSectionForAccountSection`): địa chỉ ở khối pháp lý,
 * khai thuế và gói ở hai khối cùng tên của trang Cửa hàng — "Hồ sơ chủ xe" không còn là của họ.
 */
export default function ManageAccountRoute() {
  const params = useLocalSearchParams<{ [ACCOUNT_SECTION_PARAM]?: string }>();
  const raw = params[ACCOUNT_SECTION_PARAM];
  const section = isAccountSection(raw) ? raw : undefined;
  const { data: user } = useCurrentUser();

  if (resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE) {
    if (section === ACCOUNT_SECTION.ADDRESS) {
      return <Redirect href={ROUTES.manage.shop({ section: SHOP_SECTION.LEGAL })} />;
    }
    if (section === ACCOUNT_SECTION.TAX)
      return <Redirect href={ROUTES.manage.shop({ section: SHOP_SECTION.TAX })} />;
    if (section === ACCOUNT_SECTION.PLAN)
      return <Redirect href={ROUTES.manage.shop({ section: SHOP_SECTION.PLAN })} />;
  }

  return <ManageAccountScreen {...(section ? { section } : {})} />;
}
