import {
  BookOutlined,
  CalendarOutlined,
  CarOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  LockOutlined,
  SafetyOutlined,
  ShopOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import type { useTranslations } from 'next-intl';
import { TENANT_ROLE } from '@xeprime/types';

import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import type { CurrentUser } from '@/hooks/use-current-user';
import type { NavigationKey } from '@/i18n/keys';

import { ROUTES } from './routes';

/**
 * Khoá nhãn trong nhóm `Navigation.account` — union đóng lấy thẳng từ bó message tiếng Việt,
 * nên gõ sai là lỗi biên dịch chứ không phải một mục menu trống trên production. Còn dùng cho
 * các trang giữ chỗ cũ (`AccountComingSoon`).
 */
export type AccountNavLabelKey = Parameters<
  ReturnType<typeof useTranslations<'Navigation.account'>>
>[0];

/**
 * Một mục trong menu tài khoản.
 *
 * KHÔNG có `permission`: đây là dữ liệu của chính người đang đăng nhập, không phải dữ liệu
 * của một gian hàng — không có quyền nào để kiểm. Cái quyết định thấy hay không là *đã đăng
 * nhập hay chưa* (layout gác một lần cho cả khu) và *có phải chủ xe không* (`resolveAccountNav`).
 *
 * `labelKey` là khoá TRỌN namespace `Navigation` (`account.profile`, `public.becomeOwner`…) để
 * mục nào đã có chữ ở nhóm khác thì dùng lại, không chép "Trở thành chủ xe" sang nhóm `account`
 * thành bản dịch thứ hai.
 *
 * `external` = đích nằm NGOÀI `/account` (Chuyến của tôi ở `/trips`). Route đó có từ trước và
 * đang được thông báo trỏ tới; menu này bọc nó vào cùng vỏ chứ không đổi URL.
 */
export interface AccountNavItem {
  readonly key: string;
  readonly labelKey: NavigationKey;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly external?: boolean;
}

export interface AccountNavGroup {
  readonly key: 'owner' | 'account';
  /** Tiêu đề nhóm — `undefined` là nhóm không có tiêu đề (menu ngắn của người không phải chủ xe). */
  readonly labelKey?: NavigationKey;
  readonly items: readonly AccountNavItem[];
}

const PROFILE: AccountNavItem = {
  key: 'profile',
  labelKey: 'account.profile',
  href: ROUTES.ACCOUNT.ROOT,
  icon: UserOutlined,
};

const TRIPS: AccountNavItem = {
  key: 'trips',
  labelKey: 'account.trips',
  href: ROUTES.TRIPS,
  icon: CarOutlined,
  external: true,
};

const CHANGE_PASSWORD: AccountNavItem = {
  key: 'changePassword',
  labelKey: 'account.changePassword',
  href: ROUTES.ACCOUNT.CHANGE_PASSWORD,
  icon: LockOutlined,
};

const DELETE_ACCOUNT: AccountNavItem = {
  key: 'deleteAccount',
  labelKey: 'account.deleteAccount',
  href: ROUTES.ACCOUNT.DELETE_ACCOUNT,
  icon: DeleteOutlined,
};

/**
 * Khu CHỦ XE — bản rút gọn của cổng quản lý cho người có ít xe (ADR 0027/0028: Owner Lite dùng
 * chung feature với `/manage`, chỉ khác vỏ). Thứ tự theo mockup 08/09/2026.
 */
export const OWNER_NAV: readonly AccountNavItem[] = [
  {
    key: 'vehicles',
    labelKey: 'account.vehicles',
    href: ROUTES.ACCOUNT.VEHICLES,
    icon: UnorderedListOutlined,
  },
  {
    key: 'calendar',
    labelKey: 'account.calendar',
    href: ROUTES.ACCOUNT.CALENDAR,
    icon: CalendarOutlined,
  },
  {
    key: 'hostGuide',
    labelKey: 'account.hostGuide',
    href: ROUTES.ACCOUNT.HOST_GUIDE,
    icon: BookOutlined,
  },
  TRIPS,
  {
    key: 'tax',
    labelKey: 'account.tax',
    href: ROUTES.ACCOUNT.TAX,
    icon: FileTextOutlined,
  },
  {
    key: 'contractsDocuments',
    labelKey: 'account.contractsDocuments',
    href: ROUTES.ACCOUNT.CONTRACTS_DOCUMENTS,
    icon: FileProtectOutlined,
  },
  {
    key: 'dataProtection',
    labelKey: 'account.dataProtection',
    href: ROUTES.ACCOUNT.DATA_PROTECTION,
    icon: SafetyOutlined,
  },
];

/**
 * Menu TÀI KHOẢN CÁ NHÂN — phần mọi người đăng nhập đều có.
 *
 * Ba mục trong mockup 21/08 KHÔNG có ở đây, có chủ đích:
 * - **"Quản lý đơn thuê"** → đã là `/manage/bookings`; thẻ "Gian hàng của tôi" ở đầu trang hồ
 *   sơ (`ShopEntryCard`) dẫn sang.
 * - **"Ví & Ưu đãi"** → bỏ. Số dư chủ xe là sổ công nợ, không phải ví (ADR 0028 điều 8).
 * - **"Tỉ lệ phản hồi / 5★"** → chỉ số của GIAN HÀNG, thuộc `/manage` và `/shops/[slug]`.
 */
export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  PROFILE,
  TRIPS,
  CHANGE_PASSWORD,
  DELETE_ACCOUNT,
];

/** Người đang đăng nhập là CHỦ gian hàng (ADR 0014: chủ xe và chủ gian hàng cùng một vai). */
export function isShopOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
}

/**
 * Chủ xe TUYẾN HOA HỒNG — chủ gian hàng chưa mua gói (ADR 0028 điều 1: Basic owner). Menu chủ xe
 * hiện cho mọi `shop_owner`; cờ này chỉ để màn nào cần nói khác đi (nhắc nâng cấp) đọc chung
 * một định nghĩa.
 */
export function isCommissionOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return isShopOwner(user) && user?.tenant?.planCode == null;
}

/**
 * Menu theo LOẠI người dùng.
 *
 * - Chủ gian hàng: nhóm chủ xe (7 mục) + nhóm "Tài khoản" (hồ sơ, đổi mật khẩu, xoá tài khoản).
 * - Còn lại — khách thuê, và cả quản lý/nhân viên/người xem của một gian hàng (họ dùng `/manage`
 *   để làm việc, ở đây họ là một CON NGƯỜI): hồ sơ, "Trở thành chủ xe", chuyến, mật khẩu, xoá.
 *
 * "Trở thành chủ xe" đi qua `resolveOwnerCtaHref` như mọi CTA chủ xe khác: chưa có gian hàng thì
 * vào onboarding; đã thuộc một gian hàng (nhân viên) thì về cổng quản lý — nhãn đổi theo đích
 * để nút không hứa "trở thành" với người đã ở trong một gian hàng.
 */
export function resolveAccountNav(user: CurrentUser | null | undefined): AccountNavGroup[] {
  if (isShopOwner(user)) {
    return [
      { key: 'owner', items: OWNER_NAV },
      {
        key: 'account',
        labelKey: 'account.groupAccount',
        items: [PROFILE, CHANGE_PASSWORD, DELETE_ACCOUNT],
      },
    ];
  }

  const becomeOwner: AccountNavItem = {
    key: 'becomeOwner',
    labelKey: user?.tenant ? 'public.manageShop' : 'public.becomeOwner',
    href: resolveOwnerCtaHref(user),
    icon: ShopOutlined,
    external: true,
  };
  return [
    { key: 'account', items: [PROFILE, becomeOwner, TRIPS, CHANGE_PASSWORD, DELETE_ACCOUNT] },
  ];
}

/**
 * Mục đang mở theo đường dẫn hiện tại.
 *
 * Cùng luật với `matchSelectedKey` của cổng quản lý: khớp tuyệt đối trước, không thì lấy mục
 * có `href` là tiền tố dài nhất (để `/account/vehicles/abc` vẫn sáng "Danh sách xe" và
 * `/trips/abc` sáng "Chuyến của tôi"). `/account` chỉ khớp tuyệt đối — nếu không thì mọi trang
 * con đều dính vào nó.
 */
export function matchAccountNavKey(
  pathname: string,
  items: readonly AccountNavItem[] = ACCOUNT_NAV,
): string | undefined {
  let best: AccountNavItem | undefined;
  for (const item of items) {
    const isMatch =
      pathname === item.href ||
      (item.href !== ROUTES.ACCOUNT.ROOT && pathname.startsWith(`${item.href}/`));
    if (isMatch && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key;
}

/** Mọi mục của mọi nhóm — cho hàm khớp đường dẫn. */
export function flattenAccountNav(groups: readonly AccountNavGroup[]): AccountNavItem[] {
  return groups.flatMap((group) => [...group.items]);
}
