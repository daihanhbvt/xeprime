import { Redirect, useLocalSearchParams } from 'expo-router';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ManageAccountScreen } from '@/features/account/ManageAccountScreen';
import {
  PARTNER_TRACK,
  isCommissionOwner,
  resolvePartnerTrack,
} from '@/features/shell/partner-track';
import {
  ACCOUNT_SECTION,
  ACCOUNT_SECTION_PARAM,
  isAccountSection,
  type AccountSection,
} from '@/navigation/account-section';
import { ROUTES, SHOP_SECTION, type ShopSection } from '@/navigation/routes';

/** `?section=` cũ của trang tài khoản → section cùng vai của `/manage/shop` (web `shopSectionForAccountSection`). */
function shopSectionForAccountSection(section: AccountSection | undefined): ShopSection | null {
  switch (section) {
    case ACCOUNT_SECTION.PLAN:
      return SHOP_SECTION.PLAN;
    case ACCOUNT_SECTION.TAX:
      return SHOP_SECTION.TAX;
    case ACCOUNT_SECTION.ADDRESS:
      return SHOP_SECTION.LEGAL;
    case ACCOUNT_SECTION.VAT_INVOICE:
      return SHOP_SECTION.VAT_INVOICE;
    default:
      return null;
  }
}

/**
 * `/manage/account` — "Tài khoản & bảo mật" của MỌI tài khoản partner (ADR 0085 điều 2, web
 * `PartnerAccountRoute`).
 *
 * Trước ADR 0085 cùng URL này là "Hồ sơ chủ xe" của chủ xe tuyến hoa hồng. Hồ sơ đó nay là trang
 * Thông tin `/manage/shop`, nên link cũ mang section của nó (`?section=address|vat-invoice|tax|plan`
 * từ thông báo, bookmark) chuyển sang section cùng vai của `/manage/shop`. Chỉ người CÓ trang đó mới
 * được chuyển: chủ gian hàng tuyến gói, hoặc CHỦ xe tuyến hoa hồng — thành viên của chủ xe cá nhân ở
 * lại trang tài khoản của chính họ.
 */
export default function ManageAccountRoute() {
  const params = useLocalSearchParams<{ [ACCOUNT_SECTION_PARAM]?: string }>();
  const raw = params[ACCOUNT_SECTION_PARAM];
  const section = isAccountSection(raw) ? raw : undefined;
  const { data: user } = useCurrentUser();

  const hasProfilePage =
    resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE || isCommissionOwner(user);
  const shopSection = hasProfilePage ? shopSectionForAccountSection(section) : null;
  if (shopSection) return <Redirect href={ROUTES.manage.shop({ section: shopSection })} />;

  return <ManageAccountScreen {...(section ? { section } : {})} />;
}
