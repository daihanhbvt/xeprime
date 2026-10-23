import {
  BankOutlined,
  CarOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  HeartOutlined,
  SolutionOutlined,
  LockOutlined,
  ShopOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import type { useTranslations } from 'next-intl';
import { TENANT_ROLE, isCommissionTrack } from '@xeprime/types';

import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import type { CurrentUser } from '@/hooks/use-current-user';
import type { NavigationKey } from '@/i18n/keys';

import { ROUTES } from './routes';

/**
 * Khoá nhãn trong nhóm `Navigation.account` — union đóng lấy thẳng từ bó message tiếng Việt, nên gõ
 * sai là lỗi biên dịch chứ không phải một mục menu trống trên production. Còn dùng cho các trang giữ
 * chỗ (`AccountComingSoon`).
 */
export type AccountNavLabelKey = Parameters<
  ReturnType<typeof useTranslations<'Navigation.account'>>
>[0];

/**
 * Một mục trong menu tài khoản của KHÁCH THUÊ (site `xeprime.vn`).
 *
 * KHÔNG có `permission`: đây là dữ liệu của chính người đang đăng nhập, không phải dữ liệu của một
 * gian hàng. Thấy hay không chỉ phụ thuộc *đã đăng nhập hay chưa* (layout gác một lần cho cả khu).
 *
 * `external` = đích nằm NGOÀI `/account`: "Chuyến của tôi" ở `/trips` (route có từ trước, thông báo
 * đang trỏ tới), và "Đăng xe cho thuê" ở SITE PARTNER (link khác site).
 */
export interface AccountNavItem {
  readonly key: string;
  readonly labelKey: NavigationKey;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly external?: boolean;
}

export interface AccountNavGroup {
  readonly key: 'account';
  readonly labelKey?: NavigationKey;
  readonly items: readonly AccountNavItem[];
}

const PROFILE: AccountNavItem = {
  key: 'profile',
  labelKey: 'account.profile',
  href: ROUTES.ACCOUNT.ROOT,
  icon: UserOutlined,
};

/** "Nơi tôi làm tài xế" — lời mời + liên kết tài xế của tài khoản này (ADR 0063). */
const DRIVING: AccountNavItem = {
  key: 'driving',
  labelKey: 'account.driving',
  href: ROUTES.ACCOUNT.DRIVING,
  icon: SolutionOutlined,
};

/** Xe yêu thích — xe khách đã lưu để xem/đặt sau (BRD customer favorites). */
const FAVORITES: AccountNavItem = {
  key: 'favorites',
  labelKey: 'account.favorites',
  href: ROUTES.ACCOUNT.FAVORITES,
  icon: HeartOutlined,
};

const TRIPS: AccountNavItem = {
  key: 'trips',
  labelKey: 'account.trips',
  href: ROUTES.TRIPS,
  icon: CarOutlined,
  external: true,
};

/**
 * "Lịch sử thanh toán" — tiền ĐÃ TRẢ CHO GIAN HÀNG của các chuyến mình thuê. KHÁC `BALANCE`: đây là
 * tiền mình đã trả ĐI, `BALANCE` là tiền XePrime đang nợ mình.
 */
const PAYMENTS: AccountNavItem = {
  key: 'payments',
  labelKey: 'account.payments',
  href: ROUTES.ACCOUNT.PAYMENTS,
  icon: CreditCardOutlined,
};

/** "Ví điểm" — tiền hoàn khoản giữ chỗ chảy vào đây (ADR 0033 điều 5). Ví của TÀI KHOẢN này. */
const BALANCE: AccountNavItem = {
  key: 'balance',
  labelKey: 'account.balance',
  href: ROUTES.ACCOUNT.BALANCE,
  icon: WalletOutlined,
};

/** Nơi khai số tài khoản ngân hàng để XePrime chuyển tiền hoàn về — không phải nơi giữ tiền. */
const BANK_ACCOUNTS: AccountNavItem = {
  key: 'bankAccounts',
  labelKey: 'account.bankAccounts',
  href: ROUTES.ACCOUNT.BANK_ACCOUNTS,
  icon: BankOutlined,
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
 * Lối sang SITE PARTNER — đăng ký làm chủ xe/gian hàng (ADR 0051 điều 3). Tài khoản partner là tài
 * khoản RIÊNG (ADR 0053): cùng số điện thoại được, nhưng mật khẩu và phiên tách biệt.
 */
const BECOME_OWNER: AccountNavItem = {
  key: 'becomeOwner',
  labelKey: 'public.becomeOwner',
  href: resolveOwnerCtaHref(),
  icon: ShopOutlined,
  external: true,
};

/**
 * Menu TÀI KHOẢN KHÁCH — MỘT nhóm, mọi tài khoản khách như nhau.
 *
 * Từ ADR 0053, tài khoản khách không có gian hàng: menu chủ xe (Owner Lite) và hai mục của tài khoản
 * gian hàng đã sang site partner. Ba mục trong mockup 21/08 cố ý KHÔNG có: "Quản lý đơn thuê" (việc
 * của site partner), "Ví & Ưu đãi" (số dư là sổ công nợ, không phải ví điện tử — ADR 0033 điều 1),
 * "Tỉ lệ phản hồi" (chỉ số của GIAN HÀNG).
 */
export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  // Giấy tờ & Xác minh nằm TRONG trang hồ sơ (design 22/10/2026), không còn là mục riêng.
  PROFILE,
  BECOME_OWNER,
  TRIPS,
  FAVORITES,
  DRIVING,
  PAYMENTS,
  BALANCE,
  BANK_ACCOUNTS,
  CHANGE_PASSWORD,
  DELETE_ACCOUNT,
];

/** Người đang đăng nhập là CHỦ gian hàng (dùng ở site partner — menu ẩn mục `ownerOnly`). */
export function isShopOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
}

/**
 * Chủ xe TUYẾN HOA HỒNG — re-export của `isCommissionTrack` ở `@xeprime/types` để nơi gọi cũ không
 * phải đổi import; luật chỉ có MỘT bản, dùng chung với backend và app native.
 */
export function isCommissionOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return isCommissionTrack(user?.tenant ?? null);
}

/**
 * Menu tài khoản khách — một nhóm (giữ dạng nhóm để `AccountSidebar` không phải đổi). Mục tài xế chỉ
 * hiện khi tài khoản đã từng có liên kết tài xế (ADR 0063) — đa số khách không bao giờ lái thuê.
 */
export function resolveAccountNav(opts: { hasDriverLinks?: boolean } = {}): AccountNavGroup[] {
  const items = opts.hasDriverLinks ? ACCOUNT_NAV : ACCOUNT_NAV.filter((i) => i !== DRIVING);
  return [{ key: 'account', items }];
}

/**
 * Mục đang mở theo đường dẫn hiện tại: khớp tuyệt đối trước, không thì mục có `href` là tiền tố dài
 * nhất (để `/trips/abc` sáng "Chuyến của tôi"). `/account` chỉ khớp tuyệt đối — nếu không thì mọi
 * trang con đều dính vào nó. Link sang site khác (URL tuyệt đối) không bao giờ là mục đang mở.
 */
export function matchAccountNavKey(
  pathname: string,
  items: readonly AccountNavItem[] = ACCOUNT_NAV,
): string | undefined {
  let best: AccountNavItem | undefined;
  for (const item of items) {
    if (!item.href.startsWith('/')) continue;
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
