import type { Href } from 'expo-router';
import type { useTranslations } from 'use-intl';
import { TENANT_ROLE } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';

/**
 * Khoá nhãn TRỌN namespace `Navigation` (`account.profile`, `public.becomeOwner`…) — union đóng
 * lấy thẳng từ bó message, nên gõ sai là lỗi biên dịch chứ không phải một mục menu trống.
 *
 * Khoá trọn namespace chứ không riêng nhóm `account`: mục nào đã có chữ ở nhóm khác thì dùng
 * lại, không chép "Trở thành chủ xe" sang `account` thành bản dịch thứ hai. Cùng luật với
 * `apps/web/src/constants/account-nav.ts`.
 */
export type AccountNavLabelKey = Parameters<ReturnType<typeof useTranslations<'Navigation'>>>[0];

/**
 * CÁCH mở một mục — ba kiểu, vì app native có ba loại đích khác hẳn nhau.
 *
 * `tab`   — một mục của thanh tab khách (`/account`, `/trips`): `replace`. `push` sẽ xếp thêm
 *            một bản sao của tab lên trên tab hiện tại, và nút lui rơi vào một màn người dùng
 *            chưa từng mở. Cùng quy ước mà `TripDetailScreen` và `RequestResultStep` đang dùng.
 * `screen` — màn nằm trong ngăn xếp của khu khách: `push`, để lui về đúng menu tài khoản.
 * `manage` — màn của khu QUẢN LÝ: phải ĐỔI KHU (`switchTo`) chứ không push, vì hai khu có hai bộ
 *            tab riêng — push để lại thanh tab khách nằm dưới một màn quản lý, đúng thứ
 *            `ScopeSwitcher` sinh ra để tránh.
 */
export const NAV_TARGET = {
  TAB: 'tab',
  SCREEN: 'screen',
  MANAGE: 'manage',
} as const;

export type NavTarget = (typeof NAV_TARGET)[keyof typeof NAV_TARGET];

/**
 * Một mục trong menu tài khoản.
 *
 * KHÔNG có `permission`: đây là dữ liệu của chính người đang đăng nhập, không phải dữ liệu của
 * một gian hàng — không có quyền nào để kiểm. Cái quyết định thấy hay không là *đã đăng nhập hay
 * chưa* (`RequireSession` gác một lần cho cả tab) và *có phải chủ xe không* (`resolveAccountNav`).
 */
export interface AccountNavItem {
  readonly key: string;
  readonly labelKey: AccountNavLabelKey;
  readonly href: Href;
  readonly icon: IconName;
  readonly target: NavTarget;
}

export interface AccountNavGroup {
  readonly key: 'owner' | 'account';
  /** Tiêu đề nhóm — `undefined` là nhóm không có tiêu đề (menu ngắn của người không phải chủ xe). */
  readonly labelKey?: AccountNavLabelKey;
  readonly items: readonly AccountNavItem[];
}

const PROFILE: AccountNavItem = {
  key: 'profile',
  labelKey: 'account.profile',
  href: ROUTES.account.home(),
  icon: 'person-outline',
  target: NAV_TARGET.TAB,
};

const TRIPS: AccountNavItem = {
  key: 'trips',
  labelKey: 'account.trips',
  href: ROUTES.booking.list(),
  icon: 'car-outline',
  target: NAV_TARGET.TAB,
};

const CHANGE_PASSWORD: AccountNavItem = {
  key: 'changePassword',
  labelKey: 'account.changePassword',
  href: ROUTES.account.changePassword(),
  icon: 'lock-closed-outline',
  target: NAV_TARGET.SCREEN,
};

const DELETE_ACCOUNT: AccountNavItem = {
  key: 'deleteAccount',
  labelKey: 'account.deleteAccount',
  href: ROUTES.account.deleteAccount(),
  icon: 'trash-outline',
  target: NAV_TARGET.SCREEN,
};

/**
 * Khu CHỦ XE — bản rút gọn của cổng quản lý cho người có ít xe (ADR 0027/0028: Owner Lite dùng
 * chung feature với `/manage`, chỉ khác vỏ). Thứ tự y hệt `OWNER_NAV` bên web.
 *
 * Cả bảy mục Ở LẠI khu khách: hai màn đầu chỉ là feature của `/manage` mặc vỏ tài khoản (cùng
 * API, cùng hook, cùng thẻ xe và cùng lưới lịch), đúng như web. Đẩy chúng sang khu quản lý là đổi
 * cả thanh tab dưới chân màn hình cho một người đang xem hồ sơ của chính mình.
 *
 * Biểu tượng lấy theo ĐÍCH (`manage-nav.ts`) để người dùng không phải học hai hình cho một màn.
 */
export const OWNER_NAV: readonly AccountNavItem[] = [
  {
    key: 'vehicles',
    labelKey: 'account.vehicles',
    href: ROUTES.account.vehicles(),
    icon: 'list-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'calendar',
    labelKey: 'account.calendar',
    href: ROUTES.account.calendar(),
    icon: 'calendar-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'hostGuide',
    labelKey: 'account.hostGuide',
    href: ROUTES.account.hostGuide(),
    icon: 'book-outline',
    target: NAV_TARGET.SCREEN,
  },
  TRIPS,
  {
    key: 'tax',
    labelKey: 'account.tax',
    href: ROUTES.account.tax(),
    icon: 'document-text-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'contractsDocuments',
    labelKey: 'account.contractsDocuments',
    href: ROUTES.account.contractsDocuments(),
    icon: 'documents-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'dataProtection',
    labelKey: 'account.dataProtection',
    href: ROUTES.account.dataProtection(),
    icon: 'shield-checkmark-outline',
    target: NAV_TARGET.SCREEN,
  },
];

/** Người đang đăng nhập là CHỦ gian hàng (ADR 0014: chủ xe và chủ gian hàng cùng một vai). */
export function isShopOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
}

/**
 * Đích của mọi CTA "chủ xe" trong MENU — bản native của `resolveOwnerCtaHref` bên web.
 *
 * Chưa có gian hàng ⇒ dừng ở LANDING công khai `/list-your-vehicle`: mục menu này ném thẳng người
 * ta vào form hỏi tên gian hàng và mã số thuế trước khi họ kịp biết mình được gì, và đó chính là
 * lỗi web đã sửa ngày 09/09/2026. Đã thuộc một gian hàng ⇒ về cổng quản lý.
 *
 * Thẻ `ShopEntryCard` cố ý KHÔNG đi qua hàm này: nút "Bắt đầu" trên thẻ là lời mời đã đọc rồi, nó
 * vào thẳng form đăng ký gian hàng — hai luồng khác nhau, y hệt web.
 */
export function resolveOwnerCtaHref(user: Pick<CurrentUser, 'tenant'> | null | undefined): Href {
  return user?.tenant ? ROUTES.manage.home() : ROUTES.listYourVehicle.root();
}

/**
 * Menu theo LOẠI người dùng — cùng luật, cùng thứ tự với `resolveAccountNav` bên web.
 *
 * - Chủ gian hàng: nhóm chủ xe (7 mục) + nhóm "Tài khoản" (hồ sơ, đổi mật khẩu, xoá tài khoản).
 * - Còn lại — khách thuê, và cả quản lý/nhân viên/người xem của một gian hàng (họ dùng khu quản
 *   lý để làm việc, ở đây họ là một CON NGƯỜI): hồ sơ, "Trở thành chủ xe", chuyến, mật khẩu, xoá.
 *
 * Nhân viên gian hàng KHÔNG nhận menu chủ xe: nó dẫn tới những màn mà guard backend sẽ từ chối,
 * và nhãn CTA của họ đổi theo đích (`public.manageShop`) để nút không hứa "trở thành" với người
 * đã ở trong một gian hàng.
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
    icon: 'storefront-outline',
    /*
     * Đã thuộc một gian hàng ⇒ ĐỔI KHU về cổng quản lý. Chưa có ⇒ form đăng ký gian hàng là một
     * màn chen ngang của khu khách (`ScopeGuard` cho qua đúng route đó), nên nó `push` như mọi
     * màn khác — đổi khu sang nơi họ chưa có quyền vào là đá chính họ ra ngay sau đó.
     */
    target: user?.tenant ? NAV_TARGET.MANAGE : NAV_TARGET.SCREEN,
  };

  return [
    { key: 'account', items: [PROFILE, becomeOwner, TRIPS, CHANGE_PASSWORD, DELETE_ACCOUNT] },
  ];
}

/** Mọi mục của mọi nhóm — cho hàm khớp đường dẫn. */
export function flattenAccountNav(groups: readonly AccountNavGroup[]): AccountNavItem[] {
  return groups.flatMap((group) => [...group.items]);
}

/**
 * Đường dẫn của một mục dưới dạng chuỗi — `Href` có thể là object (`{pathname, params}`), còn
 * việc khớp mục đang mở chỉ quan tâm tới phần đường dẫn.
 */
export function navItemPath(href: Href): string {
  return typeof href === 'string' ? href : String(href.pathname);
}

/**
 * Mục đang mở theo đường dẫn hiện tại — cùng luật với `matchAccountNavKey` bên web.
 *
 * Khớp tuyệt đối trước, không thì lấy mục có đường dẫn là tiền tố dài nhất (để `/trips/abc` vẫn
 * sáng "Chuyến của tôi"). `/account` chỉ khớp tuyệt đối — nếu không thì mọi màn con đều dính vào
 * nó và menu luôn chỉ sai chỗ đứng.
 */
export function matchAccountNavKey(
  pathname: string,
  items: readonly AccountNavItem[],
): string | undefined {
  const root = navItemPath(ROUTES.account.home());
  let best: { key: string; length: number } | undefined;

  for (const item of items) {
    const href = navItemPath(item.href);
    const isMatch = pathname === href || (href !== root && pathname.startsWith(`${href}/`));
    if (isMatch && (!best || href.length > best.length)) {
      best = { key: item.key, length: href.length };
    }
  }

  return best?.key;
}
