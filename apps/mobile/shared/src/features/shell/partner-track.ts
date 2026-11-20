import {
  TENANT_ROLE,
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
 * CHỦ gian hàng tuyến hoa hồng (Owner Lite) — gương `isCommissionOwner` của web. Chỉ CHỦ có
 * "Chuyến cho thuê": `GET /trips` dựng phía chủ xe cho chủ gian hàng; thành viên giữ hộp thư.
 */
export function isCommissionOwner(user: CurrentUserLike | null | undefined): boolean {
  return (
    user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER &&
    resolvePartnerTrack(user) === PARTNER_TRACK.COMMISSION
  );
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
  BOOKINGS_AWAITING_PICKUP: '/manage/bookings/awaiting-pickup',
  /** "Chuyến cho thuê" — chỉ CHỦ xe tuyến hoa hồng (PR #158). */
  TRIPS: '/manage/trips',
  CHAT: '/manage/chat',
  /** Tài xế — mở cho cả chủ xe tuyến hoa hồng (ADR 0063). */
  DRIVERS: '/manage/drivers',
  BALANCE: '/manage/balance',
  TAX: '/manage/tax',
  BANK_ACCOUNTS: '/manage/bank-accounts',
  HOST_GUIDE: '/manage/host-guide',
  CONTRACTS_DOCUMENTS: '/manage/contracts-documents',
  DATA_PROTECTION: '/manage/data-protection',
  SUPPORT: '/manage/support',
  HELP: '/manage/help',
  /** "Tài khoản của tôi" - đích ô Tài khoản trên thanh menu dưới đáy (`ManageAccountMenuScreen`). Chỉ có ở app. */
  MORE: '/manage/more',
  ACCOUNT: '/manage/account',
  SHOP: '/manage/shop',
  /** Các khối của trang Cửa hàng — cùng `?section=` với web `shopSectionPath`. */
  SHOP_LEGAL: '/manage/shop?section=legal',
  SHOP_TAX: '/manage/shop?section=tax',
  SHOP_PLAN: '/manage/shop?section=plan',
  /**
   * `?section=payout` CŨ của trang Cửa hàng — từ PR #159 tài khoản nhận tiền nằm ở trang số dư
   * (`BALANCE_PAYOUT`); trang Cửa hàng chuyển tiếp giá trị này sang đó.
   */
  SHOP_PAYOUT: '/manage/shop?section=payout',
  /** Khối "Tài khoản nhận tiền" của trang số dư — web `balancePayoutPath()` (PR #159). */
  BALANCE_PAYOUT: '/manage/balance?section=payout',
  /** Alias CŨ của hồ sơ người bán — nay chuyển tới khối khai thuế `SHOP_TAX`. */
  SELLER_PROFILE: '/manage/shop/seller-profile',
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
  { href: PARTNER_PATH.TRIPS },
  { href: PARTNER_PATH.CHAT },
  { href: PARTNER_PATH.BALANCE },
  // Tài xế mở cho cả chủ xe tuyến hoa hồng (ADR 0063) — web `post-auth-destination.ts`.
  { href: PARTNER_PATH.DRIVERS },
  { href: PARTNER_PATH.TAX },
  { href: PARTNER_PATH.BANK_ACCOUNTS },
  { href: PARTNER_PATH.HOST_GUIDE },
  { href: PARTNER_PATH.CONTRACTS_DOCUMENTS },
  { href: PARTNER_PATH.DATA_PROTECTION },
  { href: PARTNER_PATH.SUPPORT },
  { href: PARTNER_PATH.HELP },
  { href: PARTNER_PATH.ACCOUNT },
  // Ô Tài khoản của thanh menu dưới đáy - thiếu dòng này thì chủ xe bấm Tài khoản bị đá về Tổng quan.
  { href: PARTNER_PATH.MORE },
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
 * ở lại). Cùng các cặp với `packageEquivalent` của web (hồ sơ → Cửa hàng, thuế → khối khai thuế,
 * gói → khối gói, tài khoản nhận tiền → khối payout của số dư); trang chọn cách cho thuê thì về
 * Tổng quan.
 */
function packageEquivalent(pathname: string): string | null {
  if (matchesPage(pathname, { href: PARTNER_PATH.REGISTRATION })) return PARTNER_PATH.SHOP;
  // PR #159: mã số thuế là khối "Thông tin khai thuế" của trang Cửa hàng (web `shopSectionPath(TAX)`),
  // tài khoản nhận tiền về trang số dư. (Gói không còn màn riêng trên app: khối "Gói & hạn mức" của
  // trang Cửa hàng / Hồ sơ chủ xe.)
  if (pathname === PARTNER_PATH.TAX || pathname === PARTNER_PATH.SELLER_PROFILE)
    return PARTNER_PATH.SHOP_TAX;
  if (pathname === PARTNER_PATH.BANK_ACCOUNTS) return PARTNER_PATH.BALANCE_PAYOUT;
  if (pathname === PARTNER_PATH.REGISTER) return PARTNER_PATH.HOME;
  // `/manage/trips` cũ (Owner Lite "Chuyến cho thuê", gỡ ở web PR #278) về màn Đơn thuê.
  if (pathname === PARTNER_PATH.TRIPS) return PARTNER_PATH.BOOKINGS;
  return null;
}

/** Hai trang tiền/thuế của CHỦ — với thành viên gian hàng chúng là alias về trang tài khoản. */
const OWNER_MONEY_ALIASES: readonly string[] = [PARTNER_PATH.TAX, PARTNER_PATH.BANK_ACCOUNTS];

/**
 * Thành viên (không phải chủ) của một gian hàng ĐÃ vào khu quản lý mở `/manage/tax`
 * hay `/manage/bank-accounts` ⇒ trang tài khoản, đúng web PR #159: ví,
 * tài khoản nhận tiền, thuế và gói là của chủ (`@ShopOwnerOnly`), mở chúng chỉ để nhận 403.
 * Chủ mở `/manage/bank-accounts` ⇒ khối payout của trang số dư, ở cả hai tuyến.
 */
function memberAliasRedirect(
  user: CurrentUserLike | null | undefined,
  pathname: string,
): string | null {
  const track = resolvePartnerTrack(user);
  if (track !== PARTNER_TRACK.COMMISSION && track !== PARTNER_TRACK.PACKAGE) return null;
  if (user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER) {
    // Chủ ở CẢ hai tuyến: tài khoản nhận tiền là khối của trang số dư (web `balancePayoutPath`).
    return pathname === PARTNER_PATH.BANK_ACCOUNTS ? PARTNER_PATH.BALANCE_PAYOUT : null;
  }
  return OWNER_MONEY_ALIASES.includes(pathname) ? PARTNER_PATH.ACCOUNT : null;
}

/**
 * "Chuyến cho thuê" riêng của chủ xe đã gỡ (web PR #278, 06/11/2026): cả chủ lẫn thành viên tuyến
 * hoa hồng dùng CÙNG hộp thư + màn "Đơn thuê xe" với gian hàng. `/manage/trips` cũ (thông báo, liên
 * kết đã lưu) chuyển về màn Đơn thuê — gương `legacyOwnerTripsTarget` của web.
 */
function ownerTripsRedirect(pathname: string): string | null {
  return pathname === PARTNER_PATH.TRIPS ? PARTNER_PATH.BOOKINGS : null;
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
  const staff = memberAliasRedirect(user, pathname);
  if (staff) return staff;
  switch (resolvePartnerTrack(user)) {
    case PARTNER_TRACK.NONE:
      return NO_SHOP_PAGES.includes(pathname) ? null : PARTNER_PATH.REGISTER;
    case PARTNER_TRACK.PACKAGE_PENDING:
      // Cổng quản lý chưa mở: màn thanh toán là nơi DUY NHẤT (ADR 0040 điều 3).
      return pathname === PARTNER_PATH.ONBOARDING ? null : PARTNER_PATH.ONBOARDING;
    case PARTNER_TRACK.COMMISSION:
      // Onboarding tự đưa gian hàng hoa hồng về tiến trình đăng ký của nó.
      if (pathname === PARTNER_PATH.ONBOARDING) return null;
      {
        const trips = ownerTripsRedirect(pathname);
        if (trips) return trips;
      }
      // Trang Thông tin `/manage/shop` là "Hồ sơ chủ xe" của CHỦ (ADR 0085 điều 2) - thành viên
      // không có nó (về trang chủ ở dòng cuối). `/manage/registration` chỉ còn là alias chuyển tiếp
      // tới đó (web `OwnerRegistrationRedirect`).
      if (pathname === PARTNER_PATH.SHOP && isCommissionOwner(user)) return null;
      // `/manage/tax` cũ: khai thuế là khối của "Hồ sơ chủ xe" (web `commissionEquivalent`,
      // PR #284). Thành viên đã được `memberAliasRedirect` đưa về trang tài khoản ở trên.
      if (pathname === PARTNER_PATH.TAX && isCommissionOwner(user)) return PARTNER_PATH.SHOP_TAX;
      if (matchesPage(pathname, { href: PARTNER_PATH.REGISTRATION })) {
        return isCommissionOwner(user) ? PARTNER_PATH.SHOP : PARTNER_PATH.HOME;
      }
      // `/manage/register` (chọn cách cho thuê) KHÔNG trong danh sách trắng: người đã có gian hàng
      // về trang chủ — web `PartnerRegisterView` cũng chuyển họ về `partnerHomeHref`.
      return isCommissionPath(pathname) ? null : PARTNER_PATH.HOME;
    case PARTNER_TRACK.PACKAGE:
      return packageEquivalent(pathname);
  }
}
