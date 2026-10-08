import {
  isPackageOnboardingPending,
  tenantUsesManagePortal,
  type components,
} from '@xeprime/types';

/**
 * TUYẾN của một tài khoản ĐỐI TÁC trong app XePrime Partner — bản native của
 * `resolvePartnerTrack` / `partnerPageRedirect` bên web (`post-auth-destination.ts`, ADR 0053).
 *
 * Từ ADR 0053 app Partner là app của MỌI chủ xe: tài khoản realm `partner` đăng nhập ở đây, kể cả
 * chủ xe cá nhân tuyến hoa hồng (Owner Lite) và tài khoản chưa có gian hàng. Câu hỏi không còn là
 * "được vào app không" (server đã trả lời bằng realm) mà là "ở tuyến nào thì thấy menu nào và được
 * đứng ở trang nào":
 *
 * | Tuyến | Trạng thái server trả | Trang chủ | Menu |
 * | --- | --- | --- | --- |
 * | `none` | chưa có gian hàng | `/manage/register` (chọn cách cho thuê) | — |
 * | `package_pending` | `onboardingState = package_pending` | `/manage/onboarding` | — |
 * | `package` | `billingMode = package` | Tổng quan gian hàng | tuyến gói |
 * | `commission` | còn lại — kể cả `lapsed`, `unconfigured` | Trang chủ Owner Lite | tuyến hoa hồng |
 *
 * App chỉ ĐIỀU HƯỚNG theo dữ liệu server trả; chặn thật là guard backend (`@SubscriptionTrackOnly`,
 * RealmGuard).
 */
export const PARTNER_TRACK = {
  NONE: 'none',
  PACKAGE_PENDING: 'package_pending',
  PACKAGE: 'package',
  COMMISSION: 'commission',
} as const;

export type PartnerTrack = (typeof PARTNER_TRACK)[keyof typeof PARTNER_TRACK];

type CurrentUserLike = Pick<components['schemas']['MeDto'], 'tenant'>;

export function resolvePartnerTrack(user: CurrentUserLike | null | undefined): PartnerTrack {
  const tenant = user?.tenant ?? null;
  if (!tenant) return PARTNER_TRACK.NONE;
  if (isPackageOnboardingPending(tenant)) return PARTNER_TRACK.PACKAGE_PENDING;
  if (tenantUsesManagePortal(tenant)) return PARTNER_TRACK.PACKAGE;
  return PARTNER_TRACK.COMMISSION;
}

/**
 * Đường dẫn của các màn khu quản lý mà luật tuyến cần biết. Hằng PHẦN ĐƯỜNG DẪN (không qua builder
 * `ROUTES`): hàm này so với `usePathname()`, và builder của app khách trả `/partner` cho mọi đích
 * quản lý — so với nó là so với màn handoff.
 */
export const PARTNER_PATH = {
  HOME: '/manage',
  REGISTER: '/manage/register',
  ONBOARDING: '/manage/onboarding',
  REGISTRATION: '/manage/registration',
  VEHICLES: '/manage/vehicles',
  CALENDAR: '/manage/calendar',
  REQUESTS: '/manage/requests',
  BOOKINGS: '/manage/bookings',
  CHAT: '/manage/chat',
  BALANCE: '/manage/balance',
  SUBSCRIPTION: '/manage/subscription',
  PLAN: '/manage/plan',
  TAX: '/manage/tax',
  BANK_ACCOUNTS: '/manage/bank-accounts',
  HOST_GUIDE: '/manage/host-guide',
  CONTRACTS_DOCUMENTS: '/manage/contracts-documents',
  DATA_PROTECTION: '/manage/data-protection',
  SUPPORT: '/manage/support',
  HELP: '/manage/help',
  ACCOUNT: '/manage/account',
  SHOP: '/manage/shop',
  /** Hai khối của trang Cửa hàng — cùng `?section=` với web `shopSectionPath`. */
  SHOP_LEGAL: '/manage/shop?section=legal',
  SHOP_PAYOUT: '/manage/shop?section=payout',
} as const;

interface PageRule {
  readonly href: string;
  readonly exact?: true;
}

/**
 * Trang tuyến HOA HỒNG dùng được — DANH SÁCH TRẮNG như `COMMISSION_PAGES` của web: một màn tuyến
 * gói thêm sau mặc định bị chặn với tuyến hoa hồng, thay vì mặc định mở cho tới khi ai đó nhớ.
 *
 * `/manage/vehicles` chỉ khớp tuyệt đối: `/manage/vehicles/new` là form đầy đủ của tuyến gói, còn
 * chủ xe hoa hồng đăng xe qua wizard đăng nhanh. Chi tiết xe và không gian `…/manage/**` xét riêng
 * ở `isCommissionPath`.
 */
const COMMISSION_PAGES: readonly PageRule[] = [
  { href: PARTNER_PATH.HOME, exact: true },
  { href: PARTNER_PATH.REGISTRATION },
  { href: PARTNER_PATH.VEHICLES, exact: true },
  { href: PARTNER_PATH.CALENDAR },
  { href: PARTNER_PATH.REQUESTS },
  { href: PARTNER_PATH.BOOKINGS },
  { href: PARTNER_PATH.CHAT },
  { href: PARTNER_PATH.BALANCE },
  { href: PARTNER_PATH.SUBSCRIPTION },
  { href: PARTNER_PATH.PLAN },
  { href: PARTNER_PATH.TAX },
  { href: PARTNER_PATH.BANK_ACCOUNTS },
  { href: PARTNER_PATH.HOST_GUIDE },
  { href: PARTNER_PATH.CONTRACTS_DOCUMENTS },
  { href: PARTNER_PATH.DATA_PROTECTION },
  { href: PARTNER_PATH.SUPPORT },
  { href: PARTNER_PATH.HELP },
  { href: PARTNER_PATH.ACCOUNT },
];

/** Trang mà tài khoản CHƯA có gian hàng được ở: chọn cách cho thuê và bước đầu tuyến gói. */
const NO_SHOP_PAGES: readonly string[] = [PARTNER_PATH.REGISTER, PARTNER_PATH.ONBOARDING];

function pathOnly(path: string): string {
  return path.split(/[?#]/)[0] ?? path;
}

function matchesPage(pathname: string, page: PageRule): boolean {
  if (pathname === page.href) return true;
  return page.exact !== true && pathname.startsWith(`${page.href}/`);
}

/** Đường này mở được với tuyến hoa hồng không. Xe: danh sách, chi tiết và không gian quản lý xe. */
export function isCommissionPath(path: string): boolean {
  const pathname = pathOnly(path);
  if (COMMISSION_PAGES.some((page) => matchesPage(pathname, page))) return true;
  // `/manage/vehicles/<id>` (chi tiết, MỘT màn hai tuyến) và `/manage/vehicles/<id>/manage/...`
  // (Owner Lite) — KHÔNG `/manage/vehicles/<id>/edit` (sửa đầy đủ của tuyến gói) hay `/new`.
  const vehicles = `${PARTNER_PATH.VEHICLES}/`;
  if (!pathname.startsWith(vehicles)) return false;
  const rest = pathname.slice(vehicles.length);
  if (/^[^/]+$/.test(rest)) return rest !== 'new';
  return /^[^/]+\/manage(\/.*)?$/.test(rest);
}

/**
 * Tuyến gói mở một trang CHỈ của tuyến hoa hồng → bản tương đương trong khu Gian hàng (`null` =
 * ở lại). Cùng ba cặp với `packageEquivalent` của web (hồ sơ → Cửa hàng, thuế → khối pháp lý, tài
 * khoản nhận tiền → khối payout); trang chọn cách cho thuê thì về Tổng quan.
 */
function packageEquivalent(pathname: string): string | null {
  if (matchesPage(pathname, { href: PARTNER_PATH.REGISTRATION })) return PARTNER_PATH.SHOP;
  if (pathname === PARTNER_PATH.TAX) return PARTNER_PATH.SHOP_LEGAL;
  if (pathname === PARTNER_PATH.BANK_ACCOUNTS) return PARTNER_PATH.SHOP_PAYOUT;
  if (pathname === PARTNER_PATH.REGISTER) return PARTNER_PATH.HOME;
  return null;
}

/**
 * Người này có được ở lại trang `path` của khu quản lý không — trả đích cần chuyển tới, hoặc
 * `null`. MỘT hàm cho `ScopeGuard` (mở thẳng một deep link) và cho đích sau đăng nhập.
 */
export function partnerPathRedirect(
  user: CurrentUserLike | null | undefined,
  path: string,
): string | null {
  const pathname = pathOnly(path);
  switch (resolvePartnerTrack(user)) {
    case PARTNER_TRACK.NONE:
      return NO_SHOP_PAGES.includes(pathname) ? null : PARTNER_PATH.REGISTER;
    case PARTNER_TRACK.PACKAGE_PENDING:
      // Cổng quản lý chưa mở: màn thanh toán là nơi DUY NHẤT (ADR 0040 điều 3).
      return pathname === PARTNER_PATH.ONBOARDING ? null : PARTNER_PATH.ONBOARDING;
    case PARTNER_TRACK.COMMISSION:
      // Onboarding tự đưa gian hàng hoa hồng về tiến trình đăng ký của nó.
      if (pathname === PARTNER_PATH.ONBOARDING) return null;
      // Chiều ngược của `packageEquivalent`: thông báo gian hàng (`/manage/shop`) với chủ xe tuyến
      // hoa hồng là hồ sơ chủ xe — web `notificationHref` ngữ cảnh `owner` cũng trỏ vào đó.
      if (pathname === PARTNER_PATH.SHOP) return PARTNER_PATH.REGISTRATION;
      // `/manage/register` (chọn cách cho thuê) KHÔNG trong danh sách trắng: người đã có gian hàng
      // về trang chủ — web `PartnerRegisterView` cũng chuyển họ về `partnerHomeHref`.
      return isCommissionPath(pathname) ? null : PARTNER_PATH.HOME;
    case PARTNER_TRACK.PACKAGE:
      return packageEquivalent(pathname);
  }
}
