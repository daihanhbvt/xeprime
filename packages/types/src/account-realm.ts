import { MOBILE_CLIENT_APP, type MobileClientApp } from './mobile-client-app';

/**
 * Ba KHÔNG GIAN TÀI KHOẢN tách biệt — ADR 0053.
 *
 *   customer — `xeprime.vn` · app XePrime          — khách thuê
 *   partner  — `partner.xeprime.vn` · app Partner   — gian hàng tuyến gói + chủ xe tuyến hoa hồng
 *   platform — `admin.xeprime.vn`                   — nhân sự nền tảng
 *
 * Mỗi tài khoản (`users.realm`) thuộc ĐÚNG MỘT realm. Cùng một số điện thoại, email hay tài khoản
 * Google tạo được một tài khoản RIÊNG ở mỗi realm, mật khẩu độc lập; hệ thống không liên kết chúng
 * (trừ đúng phép so SĐT đã xác minh của luật chặn tự đặt xe — ADR 0053 điều 7).
 *
 * Realm của một REQUEST không bao giờ do client tự khai ở staging/production: web lấy từ header
 * proxy gắn theo host (`ACCOUNT_REALM_HEADER`), native lấy từ app đã đăng nhập (`client_app`).
 */
export const ACCOUNT_REALM = {
  CUSTOMER: 'customer',
  PARTNER: 'partner',
  PLATFORM: 'platform',
} as const;

export type AccountRealm = (typeof ACCOUNT_REALM)[keyof typeof ACCOUNT_REALM];

export const ACCOUNT_REALM_VALUES = Object.values(ACCOUNT_REALM) as AccountRealm[];

export function isAccountRealm(value: unknown): value is AccountRealm {
  return typeof value === 'string' && (ACCOUNT_REALM_VALUES as string[]).includes(value);
}

/**
 * Header mang realm của request web. Caddy GHI ĐÈ nó theo host ở staging/production (xoá mọi giá
 * trị client gửi lên); chỉ máy dev — chế độ `path` của ADR 0051, cả ba khu chung `localhost:3000` —
 * mới được nhận giá trị do web app gắn, và chỉ khi API bật cờ dev tường minh.
 */
export const ACCOUNT_REALM_HEADER = 'x-xp-realm';

/**
 * Realm của một phiên native — suy từ app đã đăng nhập, không thêm cột trùng nghĩa
 * (`native_auth_sessions.client_app`, `native_auth_codes.client_app`). App hợp nhất cũ không gửi
 * `clientApp` ⇒ `customer`, đúng mặc định của cột.
 */
export function realmForClientApp(clientApp: MobileClientApp | null | undefined): AccountRealm {
  return clientApp === MOBILE_CLIENT_APP.PARTNER ? ACCOUNT_REALM.PARTNER : ACCOUNT_REALM.CUSTOMER;
}

/** Realm nào được TỰ đăng ký. `platform` chỉ do admin nền tảng tạo (ADR 0053 điều 3). */
export function realmAllowsSelfRegistration(realm: AccountRealm): boolean {
  return realm !== ACCOUNT_REALM.PLATFORM;
}

/** Realm nào mở đăng nhập bằng OTP và bằng Google/Facebook. `platform` chỉ có mật khẩu. */
export function realmAllowsPasswordlessLogin(realm: AccountRealm): boolean {
  return realm !== ACCOUNT_REALM.PLATFORM;
}
