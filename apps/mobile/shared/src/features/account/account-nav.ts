import type { Href } from 'expo-router';
import type { useTranslations } from 'use-intl';
import { tenantUsesManagePortal } from '@xeprime/types';
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
  readonly key: 'account';
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

/** Giấy tờ & Xác minh — bằng lái, điều kiện đặt xe tự lái (ADR 0057). */
const DOCUMENTS: AccountNavItem = {
  key: 'documents',
  labelKey: 'account.documents',
  href: ROUTES.account.documents(),
  icon: 'id-card-outline',
  target: NAV_TARGET.SCREEN,
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

const BALANCE: AccountNavItem = {
  key: 'balance',
  labelKey: 'account.balance',
  href: ROUTES.account.balance(),
  icon: 'wallet-outline',
  target: NAV_TARGET.SCREEN,
};

const BANK_ACCOUNTS: AccountNavItem = {
  key: 'bankAccounts',
  labelKey: 'account.bankAccounts',
  href: ROUTES.account.bankAccounts(),
  icon: 'card-outline',
  target: NAV_TARGET.SCREEN,
};

const PAYMENTS: AccountNavItem = {
  key: 'payments',
  labelKey: 'account.payments',
  href: ROUTES.account.payments(),
  icon: 'card-outline',
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
 * "Trở thành chủ xe" — LUÔN sang app XePrime Partner (web `BECOME_OWNER` → trang đăng ký của site
 * partner). Tài khoản khách không có gian hàng (ADR 0053), nên không còn nhánh "về khu làm việc
 * của bạn": ở app này `ROUTES.manage.register()` là màn handoff mở thẳng màn chọn cách cho thuê.
 *
 * `SCREEN` chứ không `MANAGE`: màn handoff là một màn THƯỜNG của app khách (đẩy lên, lui về được).
 * `MANAGE` sẽ đổi khu của vỏ app sang một khu mà app này không có.
 */
const BECOME_OWNER: AccountNavItem = {
  key: 'becomeOwner',
  labelKey: 'public.becomeOwner',
  href: ROUTES.manage.register(),
  icon: 'storefront-outline',
  target: NAV_TARGET.SCREEN,
};

/** Menu tài khoản KHÁCH — cùng chín mục, cùng thứ tự với `ACCOUNT_NAV` bên web. */
export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  PROFILE,
  // Giấy tờ & Xác minh — bằng lái, điều kiện đặt xe tự lái (ADR 0057).
  DOCUMENTS,
  BECOME_OWNER,
  TRIPS,
  PAYMENTS,
  // Khách thuê CÓ số dư: tiền hoàn khoản giữ chỗ chảy vào ví điểm của họ (ADR 0033 điều 5), và tài
  // khoản nhận tiền là nơi khai số để rút nó ra.
  BALANCE,
  BANK_ACCOUNTS,
  CHANGE_PASSWORD,
  DELETE_ACCOUNT,
];

/**
 * "Khu làm việc của người này" — `null` khi không có gian hàng. Ở app khách luôn `null` (ADR 0053);
 * giữ phép suy để một API cũ hơn còn trả `tenant` vẫn được dẫn sang app Partner thay vì vỡ.
 */
export function resolveWorkspaceHref(
  user: Pick<CurrentUser, 'tenant'> | null | undefined,
): Href | null {
  return user?.tenant ? ROUTES.manage.home() : null;
}

export function canUseManagePortal(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return tenantUsesManagePortal(user?.tenant ?? null);
}

/** Menu tài khoản — MỘT nhóm, như `resolveAccountNav()` của web (ADR 0053 bỏ menu Owner Lite ở đây). */
export function resolveAccountNav(_user?: CurrentUser | null): AccountNavGroup[] {
  return [{ key: 'account', items: ACCOUNT_NAV }];
}

/**
 * Màn "Tài khoản của tôi" có phải nơi duy nhất còn dẫn tới YÊU CẦU XOÁ TÀI KHOẢN không?
 *
 * ADR 0038 điều 9 đẩy mục này ra khỏi menu Owner Lite và hẹn nó "nằm trong Tài khoản của tôi,
 * cạnh danh tính mà nó đụng tới" — nhưng chỗ hẹn đó chưa từng được dựng, nên chủ xe tuyến hoa
 * hồng không còn lối nào tới `/account/delete-account`. Hàm này là chỗ hẹn đó.
 *
 * Suy từ CHÍNH cái menu chứ không liệt kê lại một danh sách vai thứ hai: khách thuê đã có mục
 * này trong menu và gian hàng tuyến gói có nó ở `/manage/account`, nên hai nhóm đó không được
 * thấy thêm một lối thứ hai trên cùng một màn. Menu đổi thì luật này tự đúng theo.
 */
export function showsDeleteAccountCard(user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  return !flattenAccountNav(resolveAccountNav(user)).some(
    (item) => item.key === DELETE_ACCOUNT.key,
  );
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
