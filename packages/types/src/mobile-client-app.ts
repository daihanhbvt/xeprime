import { isPackageOnboardingPending, type ShopOnboardingInput } from './shop-onboarding';
import { tenantUsesManagePortal } from './owner-stage';

/**
 * Hai app mobile phát hành riêng dùng chung một backend (tách 25/09/2026):
 *
 *   customer — XePrime         (chợ thuê xe + Owner Lite tuyến hoa hồng)
 *   partner  — XePrime Partner (bộ quản lý gian hàng tuyến gói, gồm cả onboarding gói)
 *
 * Giá trị đi trên dây ở `clientApp` của các endpoint phát hành phiên native
 * (`/auth/mobile/*`) và ở `push_devices.client_app`. App hợp nhất CŨ không gửi trường này —
 * server hiểu thiếu là `customer` cho phiên (không siết gì thêm) và `NULL` cho push device
 * (nhận mọi audience), nên bản cũ ngoài thị trường không hỏng.
 */
export const MOBILE_CLIENT_APP = {
  CUSTOMER: 'customer',
  PARTNER: 'partner',
} as const;

export type MobileClientApp = (typeof MOBILE_CLIENT_APP)[keyof typeof MOBILE_CLIENT_APP];

export const MOBILE_CLIENT_APP_VALUES = Object.values(MOBILE_CLIENT_APP) as MobileClientApp[];

export function isMobileClientApp(value: unknown): value is MobileClientApp {
  return typeof value === 'string' && (MOBILE_CLIENT_APP_VALUES as string[]).includes(value);
}

/**
 * Tài khoản này có được vào app XePrime Partner không — MỘT nguồn cho cả guard server lẫn
 * màn hình hai app, chính là quy tắc `ScopeGuard` của app hợp nhất cũ chuyển lên server:
 *
 *   - gian hàng tuyến gói hiệu lực (kể cả ân hạn — `tenantUsesManagePortal`), mọi vai
 *     thành viên; HOẶC
 *   - đang nợ bước thanh toán gói đầu tiên (`package_pending`) — họ vào để trả nốt tiền
 *     (ADR 0040), không phải để dùng bộ quản lý.
 *
 * CỐ Ý không nhận `platformRole`: admin nền tảng không được phục vụ trên hai app mobile này
 * (màn platform trên app cũ chỉ là placeholder). Hết ân hạn ⇒ tenant về tuyến hoa hồng và
 * hàm trả `false` — đúng ADR 0038 điều 5; tiền/hoá đơn của họ vẫn xem được trên web.
 */
/**
 * App SẼ NHẬN một thông báo đẩy — suy từ deep link đã đóng băng vào `notifications.data_json`
 * lúc phát (`notificationDeepLink`): audience MANAGE là các đường `/manage/**` ⇒ XePrime
 * Partner; CUSTOMER và OWNER (`/trips…`, `/account…`, `/listings…`, Owner Lite) ⇒ XePrime.
 *
 * Suy từ URL chứ không thêm cột audience vào `notifications`: URL là chính dữ liệu mà app sẽ
 * mở, nên nó không thể lệch với app đích — một cột riêng thì có thể. Không có URL (thông báo
 * chỉ nằm trong chuông) thì mặc định `customer`.
 */
export function pushClientAppForUrl(url: string | null | undefined): MobileClientApp {
  return url != null && (url === '/manage' || url.startsWith('/manage/'))
    ? MOBILE_CLIENT_APP.PARTNER
    : MOBILE_CLIENT_APP.CUSTOMER;
}

/**
 * URL scheme deep link của từng app — hợp đồng giữa `app.config.ts` hai app, allowlist
 * `MOBILE_AUTH_REDIRECT_URIS` và phép suy app từ `redirect_uri` của luồng social (dưới đây).
 * Đổi scheme ở app mà không đổi ở đây là social login của app đó bind nhầm app.
 */
export const MOBILE_APP_SCHEME = {
  [MOBILE_CLIENT_APP.CUSTOMER]: 'xeprime',
  [MOBILE_CLIENT_APP.PARTNER]: 'xeprimepartner',
} as const;

/**
 * App nào đã khởi tạo luồng social — suy TẤT ĐỊNH từ `redirect_uri` (đã qua allowlist).
 * Scheme lạ (URI dev `exp://…`, hay scheme cũ) rơi về `customer` — đúng hành vi app hợp nhất
 * cũ; app Partner luôn dùng build có scheme thật nên không đi nhánh này.
 */
export function clientAppForRedirectUri(redirectUri: string): MobileClientApp {
  const scheme = redirectUri.split(':', 1)[0]?.toLowerCase();
  return scheme === MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.PARTNER]
    ? MOBILE_CLIENT_APP.PARTNER
    : MOBILE_CLIENT_APP.CUSTOMER;
}

export function canUsePartnerApp(
  tenant: ShopOnboardingInput | null | undefined,
): boolean {
  return tenantUsesManagePortal(tenant) || isPackageOnboardingPending(tenant);
}

/**
 * Tài khoản này có được vào app XePrime (khách) không — LOẠI TRỪ với `canUsePartnerApp`.
 *
 * Hai app chia đôi hoàn toàn theo quyết định sản phẩm 28/09/2026: một tài khoản thuộc về ĐÚNG
 * MỘT app. Tài khoản của gian hàng tuyến gói (mọi vai: chủ, quản lý, nhân viên, người xem) —
 * và cả người đang nợ bước thanh toán gói — chỉ dùng XePrime Partner.
 *
 * Không phải luật mới, chỉ là siết lại cho nhất quán: app hợp nhất cũ đã đẩy họ ra khỏi khu
 * khách bằng `ShopAccountGate` (ADR 0038 điều 7), và `SHOP_ACCOUNT_CANNOT_BOOK` đã cấm chính
 * họ gửi yêu cầu thuê. Cho họ đăng nhập vào một app mà mọi nút đặt xe đều trả 403 là mời
 * người dùng vào một ngõ cụt.
 *
 * Chủ xe tuyến HOA HỒNG (Owner Lite) KHÔNG nằm trong nhóm này — khu khách là nhà của họ, và
 * họ vẫn thuê xe như người dùng thường (ADR 0032 điều 1). Admin nền tảng cũng vào được app
 * khách với tư cách một người dùng bình thường.
 */
export function canUseCustomerApp(
  tenant: ShopOnboardingInput | null | undefined,
): boolean {
  return !canUsePartnerApp(tenant);
}
