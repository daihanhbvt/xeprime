import {
  TENANT_ROLE,
  WORKSPACE_TARGET,
  isPackageOnboardingPending,
  resolveWorkspaceTarget,
  tenantUsesManagePortal,
  REGISTRATION_TRACK,
  type RegistrationTrack,
  type WorkspaceTarget,
} from '@xeprime/types';

import {
  ACCOUNT_SECTION,
  ROUTES,
  SHOP_SECTION,
  accountSectionPath,
  partnerTrackStartHref,
  balancePayoutPath,
  shopSectionPath,
  withPlanPurchaseIntent,
} from '@/constants/routes';
import { ZONE, isPathInZone, siteHref, zoneRelativePath } from '@/zones';
import { isSafeNextPath, safeNextPath } from './safe-next';

/**
 * "Sau khi đăng nhập thì đi đâu" — hàm THUẦN, theo từng SITE (ADR 0051 · ADR 0053).
 *
 * Mỗi site là một không gian tài khoản riêng, nên mỗi site trả lời câu này một kiểu:
 *
 *  - **site khách** (`xeprime.vn`): đăng nhập là modal ngay trên trang đang xem — mặc định ở
 *    nguyên chỗ (`resolveCustomerDestination`). Tài khoản khách không có gian hàng nào.
 *  - **site partner**: đích theo TUYẾN hiệu lực do server trả (`resolvePartnerTrack`, bảng B1);
 *  - **site quản trị**: khu quản trị, hoặc `next` an toàn trong khu đó.
 *
 * Web chỉ ĐIỀU HƯỚNG theo dữ liệu server trả; chặn thật là guard backend (`@SubscriptionTrackOnly`,
 * `@PlatformOnly`, RealmGuard).
 */

/**
 * Người dùng như `/auth/me` trả về — chỉ lấy phần quyết định điều hướng.
 */
export interface AuthScope {
  tenant?: {
    id: string;
    roleKey?: string | null;
    status?: string | null;
    billingMode?: string | null;
    /**
     * Trục ĐĂNG KÝ (ADR 0040) — `commission` · `package_pending` · `package_active`. Phân biệt
     * "gian hàng trả phí chưa chuyển khoản" với "gian hàng đã trả rồi hết gói".
     */
    onboardingState?: string | null;
    publicVehicleCount?: number | null;
  } | null;
  platformRole?: string | null;
}

// ── Site partner: tuyến hiệu lực ─────────────────────────────────────────────────────────────

/**
 * Tuyến của một tài khoản partner, theo đúng thứ tự B1 (ADR 0040 · 0038):
 *
 * | Tuyến | Trạng thái server trả | Vào đâu sau đăng nhập | Menu |
 * | --- | --- | --- | --- |
 * | `none` | chưa có gian hàng | `/register` (trang chọn cách cho thuê) | — |
 * | `package_pending` | `onboardingState = package_pending`, chưa có gói | `/onboarding` (bare) | — |
 * | `package` | `billingMode = package` (`current`/`grace`) | Dashboard Manage | tuyến gói |
 * | `commission` | còn lại — kể cả `lapsed` và `unconfigured` | Trang chủ Owner Lite | tuyến hoa hồng |
 *
 * `unconfigured` (danh mục gói hỏng) rơi vào `commission` CÓ CHỦ ĐÍCH: đường đọc hiển thị chưa xác
 * định (cảnh báo không chặn — `AccountTrackNotice`), đường ghi tiền do server từ chối (ADR 0038
 * điều 1/11). Đây là phép chọn MENU, không phải phép chọn tuyến tiền.
 */
export const PARTNER_TRACK = {
  NONE: 'none',
  PACKAGE_PENDING: 'package_pending',
  PACKAGE: 'package',
  COMMISSION: 'commission',
} as const;

export type PartnerTrack = (typeof PARTNER_TRACK)[keyof typeof PARTNER_TRACK];

export function resolvePartnerTrack(user: AuthScope | null | undefined): PartnerTrack {
  const tenant = user?.tenant ?? null;
  if (!tenant) return PARTNER_TRACK.NONE;
  if (isPackageOnboardingPending(tenant)) return PARTNER_TRACK.PACKAGE_PENDING;
  if (tenantUsesManagePortal(tenant)) return PARTNER_TRACK.PACKAGE;
  return PARTNER_TRACK.COMMISSION;
}

/**
 * CHỦ xe tuyến hoa hồng — người mà "gian hàng" và "con người" là một (`STOREFRONT_KIND.PERSONAL`).
 *
 * Với họ trang tài khoản là "Hồ sơ chủ xe": hồ sơ cá nhân và trang chủ xe công khai trên CÙNG một
 * trang. Thành viên (không phải chủ) của một gian hàng tuyến hoa hồng vẫn chỉ có trang tài khoản
 * của riêng họ — trang chủ xe không phải của họ để sửa.
 */
export function isCommissionOwner(user: AuthScope | null | undefined): boolean {
  return (
    user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER &&
    resolvePartnerTrack(user) === PARTNER_TRACK.COMMISSION
  );
}

/** Trang chủ của một tài khoản partner theo tuyến (cột "Vào đâu sau đăng nhập" của B1). */
export function partnerHomeHref(user: AuthScope | null | undefined): string {
  switch (resolvePartnerTrack(user)) {
    case PARTNER_TRACK.NONE:
      return ROUTES.MANAGE.REGISTER;
    case PARTNER_TRACK.PACKAGE_PENDING:
      return ROUTES.MANAGE.ONBOARDING;
    default:
      // Một URL, nội dung theo tuyến: dashboard Manage hoặc trang chủ Owner Lite.
      return ROUTES.MANAGE.ROOT;
  }
}

/**
 * `/register?track=…` khi tài khoản ĐÃ có gian hàng. Ngay sau form đăng ký một trang, lượt hỏi lại
 * `/auth/me` (đổi cửa sổ, lượt làm mới sau khi tạo tài khoản…) có thể về TRƯỚC khi form kịp điều
 * hướng — nếu trang đọc "đã có gian hàng ⇒ về trang chủ" thì chủ xe rơi về `/` thay vì bước đăng
 * xe. Nên đích suy từ DỮ LIỆU (tuyến trên URL + tuyến của gian hàng), không từ một state tạm:
 * cùng tuyến ⇒ bước tiếp theo của tuyến đó; khác tuyến ⇒ trang chủ.
 */
export function partnerSignupContinueHref(
  user: AuthScope | null | undefined,
  chosenTrack: RegistrationTrack | null,
): string {
  const track = resolvePartnerTrack(user);
  if (chosenTrack === REGISTRATION_TRACK.COMMISSION && track === PARTNER_TRACK.COMMISSION) {
    return partnerTrackStartHref(REGISTRATION_TRACK.COMMISSION);
  }
  if (chosenTrack === REGISTRATION_TRACK.PACKAGE && track === PARTNER_TRACK.PACKAGE_PENDING) {
    return partnerTrackStartHref(REGISTRATION_TRACK.PACKAGE);
  }
  return partnerHomeHref(user);
}

/**
 * Trang của site partner mà tuyến HOA HỒNG dùng được — mọi trang khác của site là của tuyến gói,
 * server chặn bằng `@SubscriptionTrackOnly` và web đưa về trang chủ Owner Lite.
 *
 * DANH SÁCH TRẮNG chứ không phải đen: một trang tuyến gói thêm tháng sau mặc định bị chặn với tuyến
 * hoa hồng, thay vì mặc định mở cho tới khi ai đó nhớ thêm nó vào danh sách đen.
 *
 * `exact` = chỉ khớp đúng đường dẫn (gốc site là tiền tố của mọi thứ; `/vehicles/new` là form đầy
 * đủ của tuyến gói, còn chủ xe hoa hồng đăng xe qua wizard `/vehicles/register`).
 */
const COMMISSION_PAGES: ReadonlyArray<{ readonly href: string; readonly exact?: true }> = [
  { href: ROUTES.MANAGE.ROOT, exact: true },
  { href: ROUTES.MANAGE.REGISTRATION },
  { href: ROUTES.MANAGE.VEHICLES, exact: true },
  { href: ROUTES.MANAGE.VEHICLE_REGISTER },
  { href: ROUTES.MANAGE.CALENDAR },
  { href: ROUTES.MANAGE.TRIPS },
  // Hộp thư + bảng đơn vẫn là trang của tuyến: THÀNH VIÊN không phải chủ làm việc ở đó, còn CHỦ xe
  // được `ownerTripsRedirect` đưa sang `TRIPS`. `/bookings/[id]` là chi tiết đơn dùng chung.
  { href: ROUTES.MANAGE.BOOKING_REQUESTS },
  { href: ROUTES.MANAGE.BOOKINGS },
  { href: ROUTES.MANAGE.CHAT },
  { href: ROUTES.MANAGE.BALANCE },
  // Tài xế mở cho cả chủ xe tuyến hoa hồng (ADR 0063).
  { href: ROUTES.MANAGE.DRIVERS },
  // `/subscription`, `/tax`, `/bank-accounts` KHÔNG ở đây (07/10/2026): chúng là alias, và đích của
  // chúng là `commissionEquivalent` — một lần chuyển, cùng một luật cho gõ URL lẫn `next`.
  { href: ROUTES.MANAGE.HOST_GUIDE },
  { href: ROUTES.MANAGE.CONTRACTS_DOCUMENTS },
  { href: ROUTES.MANAGE.DATA_PROTECTION },
  { href: ROUTES.MANAGE.SUPPORT },
  { href: ROUTES.MANAGE.SECURITY },
  { href: ROUTES.MANAGE.ACCOUNT },
];

function pathOnly(path: string): string {
  return path.split(/[?#]/)[0] ?? path;
}

function matchesPage(pathname: string, page: { href: string; exact?: true }): boolean {
  if (pathname === page.href) return true;
  return page.exact !== true && pathname.startsWith(`${page.href}/`);
}

/** Đường này mở được với tuyến hoa hồng không. Xe: danh sách, chi tiết và không gian quản lý xe. */
export function isCommissionPage(path: string): boolean {
  const pathname = pathOnly(path);
  if (COMMISSION_PAGES.some((page) => matchesPage(pathname, page))) return true;
  // `/vehicles/<id>` (chi tiết, MỘT URL hai tuyến) và `/vehicles/<id>/manage/...` (Owner Lite) —
  // KHÔNG `/vehicles/<id>/edit` (màn sửa đầy đủ của tuyến gói) hay `/vehicles/new`.
  const vehicles = `${ROUTES.MANAGE.VEHICLES}/`;
  if (!pathname.startsWith(vehicles)) return false;
  const rest = pathname.slice(vehicles.length);
  if (/^[^/]+$/.test(rest)) return rest !== 'new';
  return /^[^/]+\/manage(\/.*)?$/.test(rest);
}

/**
 * Trang công khai của site partner — không cần phiên, không có khung. Proxy và `AppShell` cùng đọc.
 */
export const PARTNER_PUBLIC_PAGES: readonly string[] = [
  ROUTES.MANAGE.LOGIN,
  ROUTES.MANAGE.REGISTER,
  ROUTES.MANAGE.FORGOT_PASSWORD,
  ROUTES.MANAGE.RESET_PASSWORD,
];

export function isPartnerPublicPage(path: string): boolean {
  const pathname = pathOnly(path);
  return PARTNER_PUBLIC_PAGES.includes(pathname) || isPartnerInvitePage(pathname);
}

/**
 * Trang LỜI MỜI vào gian hàng (`/invites/<token>`) — công khai nhưng KHÁC bốn trang xác thực: nó là
 * một ĐÍCH hợp lệ của `next`. Người được mời bấm "Đăng nhập"/"Tạo tài khoản đối tác" từ thư mời phải
 * quay về đúng lời mời, kể cả khi tài khoản chưa có gian hàng nào (B1 sẽ đưa họ về `/register`).
 */
export function isPartnerInvitePage(path: string | null | undefined): path is string {
  if (!isSafeNextPath(path)) return false;
  return pathOnly(path).startsWith(`${ROUTES.MANAGE.INVITES}/`);
}

/** Trang công khai của site quản trị — chỉ đăng nhập và đặt lại mật khẩu (không tự đăng ký). */
export const ADMIN_PUBLIC_PAGES: readonly string[] = [
  ROUTES.ADMIN.LOGIN,
  ROUTES.ADMIN.FORGOT_PASSWORD,
  ROUTES.ADMIN.RESET_PASSWORD,
];

export function isAdminPublicPage(path: string): boolean {
  return ADMIN_PUBLIC_PAGES.includes(pathOnly(path));
}

/** Trang mà tài khoản CHƯA có gian hàng được ở: hai bước đầu của hai tuyến. */
const NO_SHOP_PAGES: readonly string[] = [ROUTES.MANAGE.ONBOARDING, ROUTES.MANAGE.VEHICLE_REGISTER];

/**
 * Tuyến gói mở một trang CHỈ của tuyến hoa hồng → bản tương đương của tuyến gói (`null` = ở lại).
 * Hồ sơ + khai thuế có bản một-đối-một trong trang Cửa hàng (section "Thông tin khai thuế" dùng CHÍNH
 * component của tuyến hoa hồng); tài khoản nhận tiền nằm ở trang số dư
 * như tuyến hoa hồng; còn lại (cẩm nang, mẫu chứng từ…) dùng chung.
 */
function packageEquivalent(pathname: string): string | null {
  if (matchesPage(pathname, { href: ROUTES.MANAGE.REGISTRATION })) return ROUTES.MANAGE.SHOP;
  if (pathname === ROUTES.MANAGE.TAX) return shopSectionPath(SHOP_SECTION.TAX);
  // `/subscription` là lối vào ỔN ĐỊNH của email hướng dẫn gói: tới "Gói & hạn mức" VÀ mở hộp thoại mua.
  if (pathname === ROUTES.MANAGE.SUBSCRIPTION) {
    return withPlanPurchaseIntent(shopSectionPath(SHOP_SECTION.PLAN));
  }
  if (pathname === ROUTES.MANAGE.BANK_ACCOUNTS) return balancePayoutPath();
  if (pathname === ROUTES.MANAGE.TRIPS) return ROUTES.MANAGE.BOOKING_REQUESTS;
  return null;
}

/**
 * Hộp thư yêu cầu + bảng đơn của tuyến gói — CHỦ xe tuyến hoa hồng đọc chúng gộp ở "Chuyến cho
 * thuê" (`TRIPS`). Chi tiết `/bookings/<id>` KHÔNG nằm đây: đó là màn đơn dùng chung, nơi bàn giao.
 */
const OWNER_TRIPS_REPLACES: readonly string[] = [
  ROUTES.MANAGE.BOOKING_REQUESTS,
  ROUTES.MANAGE.BOOKINGS,
  ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP,
];

/**
 * Tuyến hoa hồng: yêu cầu + đơn ở đâu tuỳ người xem là CHỦ hay THÀNH VIÊN (`null` = ở lại).
 *
 *  - CHỦ xe (1–3 xe) → "Chuyến cho thuê", danh sách thẻ gộp; hộp thư + bảng đơn chuyển sang đó.
 *  - THÀNH VIÊN (vd nhân viên của gian hàng vừa hết gói — ADR 0038 điều 5) → hộp thư + bảng đơn
 *    như cũ. `GET /trips` chỉ dựng phía chủ xe cho CHỦ gian hàng, nên `TRIPS` với họ là một trang
 *    rỗng — trong khi họ vẫn phải bàn giao những chuyến đang chạy.
 */
function ownerTripsRedirect(user: AuthScope | null | undefined, pathname: string): string | null {
  if (isCommissionOwner(user)) {
    return OWNER_TRIPS_REPLACES.includes(pathname) ? ROUTES.MANAGE.TRIPS : null;
  }
  return pathname === ROUTES.MANAGE.TRIPS ? ROUTES.MANAGE.BOOKING_REQUESTS : null;
}

/**
 * CHỦ xe tuyến hoa hồng mở trang Cửa hàng (bookmark, thông báo, link từ thời còn gói) → phần tương
 * đương trong "Hồ sơ chủ xe". Cùng một bản ghi gian hàng ở cả hai trang, nên đây là chuyển chỗ đọc,
 * không phải chuyển dữ liệu. Thành viên không có section đó (trang tài khoản của họ là bản thường)
 * ⇒ về trang chủ. Trang con của Cửa hàng (chi nhánh, chính sách…) là năng lực của gói ⇒ về trang
 * chủ như mọi trang tuyến gói khác.
 *
 * Ba ALIAS của chính tuyến hoa hồng (07/10/2026) cũng giải ở đây: khai thuế + gói về section của
 * "Hồ sơ chủ xe", tài khoản nhận tiền về trang số dư. Thành viên không có các section đó (và không có
 * ví) ⇒ trang tài khoản của họ / trang chủ.
 */
function commissionEquivalent(user: AuthScope | null | undefined, pathname: string): string | null {
  const owner = isCommissionOwner(user);
  if (pathname === ROUTES.MANAGE.SHOP && owner) {
    return accountSectionPath(ACCOUNT_SECTION.PROFILE);
  }
  if (pathname === ROUTES.MANAGE.TAX) {
    return owner ? accountSectionPath(ACCOUNT_SECTION.TAX) : ROUTES.MANAGE.ACCOUNT;
  }
  if (pathname === ROUTES.MANAGE.SUBSCRIPTION) {
    return owner
      ? withPlanPurchaseIntent(accountSectionPath(ACCOUNT_SECTION.PLAN))
      : ROUTES.MANAGE.ACCOUNT;
  }
  if (pathname === ROUTES.MANAGE.BANK_ACCOUNTS && owner) return balancePayoutPath();
  return null;
}

/**
 * Trang THANH TOÁN của site partner — trang chọn kênh trả một hoá đơn gói (`/payment/:invoiceId`)
 * và trang quay về cũ của cổng (`/payment-return`). Cả hai đúng cho MỌI tuyến và không có khung:
 * gian hàng đang nợ bước thanh toán đầu tiên (ADR 0040) trả tiền ngay tại đây, và một trang ép họ
 * về `/onboarding` giữa chừng là mất luôn lượt vừa trả. Server mới gác dữ liệu (hoá đơn và lượt chỉ
 * đọc được trong phạm vi gian hàng của người gọi).
 */
export function isPartnerPaymentPage(path: string): boolean {
  const pathname = pathOnly(path);
  return (
    pathname === ROUTES.MANAGE.PAYMENT_RETURN || pathname.startsWith(`${ROUTES.MANAGE.PAYMENT}/`)
  );
}

/**
 * Người này có được ở lại trang `path` của site partner không — trả đích cần chuyển tới, hoặc
 * `null`. MỘT hàm cho `AppShell` (gõ thẳng URL) và cho đích sau đăng nhập (`next`).
 */
export function partnerPageRedirect(
  user: AuthScope | null | undefined,
  path: string,
): string | null {
  const pathname = pathOnly(path);
  if (isPartnerPublicPage(pathname)) return null;
  /*
   * Trang quay về từ cổng thanh toán (ADR 0058) đúng cho MỌI tuyến: gian hàng đang nợ bước thanh
   * toán đầu tiên phải thấy kết quả của chính lượt vừa trả, không bị đẩy về `/onboarding` giữa chừng.
   * Server mới gác dữ liệu (lượt chỉ đọc được trong phạm vi gian hàng của người gọi).
   */
  if (isPartnerPaymentPage(pathname)) return null;

  switch (resolvePartnerTrack(user)) {
    case PARTNER_TRACK.NONE:
      // Chưa có gian hàng: chọn cách cho thuê ở `/register`, rồi vào bước đầu của tuyến — wizard
      // đăng xe nhanh (hoa hồng, tự mở gian hàng ở bước lưu) hoặc onboarding (gói).
      return NO_SHOP_PAGES.includes(pathname) ? null : ROUTES.MANAGE.REGISTER;
    case PARTNER_TRACK.PACKAGE_PENDING:
      // Cổng quản lý chưa mở: màn thanh toán là nơi DUY NHẤT (ADR 0040 điều 3).
      return pathname === ROUTES.MANAGE.ONBOARDING ? null : ROUTES.MANAGE.ONBOARDING;
    case PARTNER_TRACK.COMMISSION: {
      // Onboarding tự đưa gian hàng hoa hồng về tiến trình đăng ký của nó.
      if (pathname === ROUTES.MANAGE.ONBOARDING) return null;
      const trips = ownerTripsRedirect(user, pathname);
      if (trips) return trips;
      if (isCommissionPage(pathname)) return null;
      return commissionEquivalent(user, pathname) ?? ROUTES.MANAGE.ROOT;
    }
    case PARTNER_TRACK.PACKAGE:
      return packageEquivalent(pathname);
  }
}

/**
 * Đích sau khi đăng nhập ở SITE PARTNER.
 *
 *  1. `next` an toàn VÀ thuộc site partner → đi tới đó, trừ khi tuyến không được ở đó
 *     (`partnerPageRedirect` quyết — một luật cho cả gõ URL lẫn `next`);
 *  2. không thì trang chủ theo tuyến (`partnerHomeHref`).
 *
 * `next` trỏ sang site khác bị bỏ qua: đăng nhập ở partner thì phiên chỉ sống ở partner.
 */
export function resolvePartnerDestination(params: {
  user: AuthScope;
  next?: string | null;
}): string {
  const { user, next } = params;
  // Lời mời: về đúng lời mời, bất kể tuyến — trả lời lời mời chính là cách CÓ gian hàng.
  if (isPartnerInvitePage(next)) return next;
  if (isSafeNextPath(next) && isPathInZone(ZONE.PARTNER, next) && !isPartnerPublicPage(next)) {
    return partnerPageRedirect(user, next) ?? next;
  }
  return partnerHomeHref(user);
}

/** Đích sau khi đăng nhập ở SITE QUẢN TRỊ: `next` an toàn trong khu quản trị, hoặc trang đầu. */
export function resolveAdminDestination(params: { next?: string | null }): string {
  const { next } = params;
  if (isSafeNextPath(next) && isPathInZone(ZONE.ADMIN, next) && !isAdminPublicPage(next)) {
    return next;
  }
  return ROUTES.ADMIN.ROOT;
}

// ── Khoá khu làm việc dùng chung với app native ──────────────────────────────────────────────

/**
 * Khoá khu làm việc (`resolveWorkspaceTarget` — `@xeprime/types`, dùng chung với app native) →
 * đích ở SITE PARTNER. `Record` đầy đủ nên thêm một khoá mà quên đường dẫn sẽ đỏ ngay ở đây.
 */
const TARGET_HREF: Readonly<Record<WorkspaceTarget, string>> = {
  [WORKSPACE_TARGET.ONBOARDING]: ROUTES.MANAGE.ONBOARDING,
  [WORKSPACE_TARGET.MANAGE]: ROUTES.MANAGE.ROOT,
  [WORKSPACE_TARGET.ACCOUNT]: ROUTES.MANAGE.ROOT,
  [WORKSPACE_TARGET.VEHICLES]: ROUTES.MANAGE.VEHICLES,
  // Bậc `registering`: trang chủ Owner Lite CHÍNH LÀ màn tiến trình đăng ký (`OwnerLiteHome`).
  [WORKSPACE_TARGET.REGISTRATION]: ROUTES.MANAGE.ROOT,
};

/**
 * "Chỗ làm việc của người này" ở site partner — `null` khi chưa có gian hàng.
 * Đường dẫn TRONG site partner.
 */
export function resolveWorkspaceHref(user: AuthScope | null | undefined): string | null {
  const target = resolveWorkspaceTarget(user?.tenant);
  return target ? TARGET_HREF[target] : null;
}

/** Người này làm việc bằng Full Manage (gian hàng có gói, hoặc nhân viên của một gian hàng gói). */
export function canUseManagePortal(user: AuthScope | null | undefined): boolean {
  return resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE;
}

/** Người này đang nợ bước thanh toán gói — màn onboarding là nơi DUY NHẤT họ vào được. */
export function isPackageOnboarding(user: AuthScope | null | undefined): boolean {
  return isPackageOnboardingPending(user?.tenant);
}

// ── Modal đăng nhập của site khách ───────────────────────────────────────────────────────────

/** Ý định mở cửa chủ xe, đi trong URL (`?intent=owner`). */
export const AUTH_INTENT = {
  OWNER: 'owner',
} as const;

export type AuthIntent = (typeof AUTH_INTENT)[keyof typeof AUTH_INTENT];

/**
 * Chế độ của form auth.
 *
 * `forgot` chỉ có ở hộp đăng nhập của SITE KHÁCH (quên mật khẩu ba bước ngay trong hộp, design v2).
 * Site partner/quản trị quên mật khẩu ở trang riêng (`zoneAuthRoutes(zone).forgotPassword`), nên
 * `AuthPanel` dùng chung của hai site đó chỉ nhận `PanelAuthMode`.
 */
export const AUTH_MODE = {
  LOGIN: 'login',
  REGISTER: 'register',
  FORGOT: 'forgot',
} as const;

export type AuthMode = (typeof AUTH_MODE)[keyof typeof AUTH_MODE];

/** Hai chế độ của form đăng nhập/đăng ký dùng chung (`AuthPanel`). */
export type PanelAuthMode = Exclude<AuthMode, typeof AUTH_MODE.FORGOT>;

/**
 * Hộp đăng nhập mở GIỮA một luồng đang dở — chỉ sống trong bộ nhớ, không lên URL.
 *
 * `booking`: khách bấm "Tiếp tục" ở hộp yêu cầu thuê khi chưa đăng nhập (ADR 0060). Hộp nói rõ vì
 * sao được hỏi đăng nhập (phụ đề riêng). Đăng nhập hay đăng ký xong đều đóng thẳng để luồng thuê
 * đi tiếp — như mọi lần mở hộp từ design v2.
 */
export const AUTH_CONTEXT = {
  BOOKING: 'booking',
} as const;

export type AuthContext = (typeof AUTH_CONTEXT)[keyof typeof AUTH_CONTEXT];

export function isAuthMode(value: string | null | undefined): value is AuthMode {
  return (
    value === AUTH_MODE.LOGIN || value === AUTH_MODE.REGISTER || value === AUTH_MODE.FORGOT
  );
}

/**
 * Đích sau khi KHÁCH đăng nhập/đăng ký từ marketplace. `null` = đóng modal, ở nguyên trang đang xem.
 */
export function resolveCustomerDestination(next: string | null | undefined): string | null {
  return isSafeNextPath(next) && isPathInZone(ZONE.MARKET, next) ? next : null;
}

/**
 * Đích của CTA chủ xe trên SITE KHÁCH ("Đăng xe cho thuê", "Trở thành chủ xe") — trang chọn cách
 * cho thuê CỦA SITE KHÁCH (`/list-your-vehicle`: Đăng xe cá nhân / Mở gian hàng), không nhảy thẳng
 * sang site partner. Hai lựa chọn ở đó mới dẫn sang `partner…/register?track=` (ADR 0051 điều 3:
 * đăng ký diễn ra ở site partner). Tài khoản khách không có gian hàng (ADR 0053).
 */
export function resolveOwnerCtaHref(): string {
  return siteHref(ZONE.MARKET, zoneRelativePath(ZONE.MARKET, ROUTES.LIST_YOUR_VEHICLE.ROOT));
}

/** Đích khi phiên hỏng/hết hạn ở site partner: về trang đăng nhập, giữ đường đang mở. */
export function portalLoginWithNext(pathname: string): string {
  return `${ROUTES.MANAGE.LOGIN}?next=${encodeURIComponent(
    safeNextPath(pathname, ROUTES.MANAGE.ROOT),
  )}`;
}

/** Đích khi phiên hỏng/hết hạn ở site quản trị. */
export function adminLoginWithNext(pathname: string): string {
  return `${ROUTES.ADMIN.LOGIN}?next=${encodeURIComponent(
    safeNextPath(pathname, ROUTES.ADMIN.ROOT),
  )}`;
}

/**
 * Đường này có phải màn ONBOARDING không — so PHẦN ĐƯỜNG DẪN, bỏ qua query (route mang `?track=`).
 */
export function isOnboardingRoute(path: string | null | undefined): boolean {
  if (!path) return false;
  return pathOnly(path) === ROUTES.MANAGE.ONBOARDING;
}
