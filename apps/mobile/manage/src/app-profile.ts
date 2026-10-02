import type { Href } from 'expo-router';
import { MOBILE_CLIENT_APP, type MobileClientApp } from '@xeprime/types';
import { APP_SCOPE, type AppScope } from '@/features/shell/app-scope';
import { exact, listOrDetail, type AllowedDeepLink } from '@/features/notifications/deep-link-kit';
import { ROUTES } from '@/navigation/routes';

/**
 * HỒ SƠ APP — XePrime Partner (MANAGE). Xem docblock ở bản Customer; bản này là nửa kia của
 * overlay: app chỉ có khu quản lý, không có chợ xe, không có khu khách, không phục vụ admin
 * nền tảng.
 */
export const APP_PROFILE: { readonly clientApp: MobileClientApp } = {
  clientApp: MOBILE_CLIENT_APP.PARTNER,
};

/**
 * App Partner chỉ có khu QUẢN LÝ. Server đã gác cổng đăng nhập (403 `PARTNER_ACCESS_REQUIRED`
 * cho tài khoản ngoài phạm vi), nên tới được đây là có việc để quản lý — hoặc còn nợ bước
 * thanh toán gói (ADR 0040), và `scopeHome` đưa họ vào đúng màn onboarding.
 */
export function resolveInitialScope(_params: {
  user: unknown;
  remembered?: AppScope | null;
}): AppScope {
  return APP_SCOPE.MANAGE;
}

/**
 * Các khu bảng đổi khu được đưa ra. App này KHÔNG có khu khách (ADR 0051): chọn "Tìm & thuê xe"
 * chỉ rơi vào `/not-eligible` với một nút Đăng xuất — đưa lựa chọn đó ra là dựng một ngõ cụt.
 */
export const SWITCHABLE_SCOPES: readonly AppScope[] = [APP_SCOPE.MANAGE];

/**
 * Khu CUSTOMER không tồn tại ở app này. `ScopeGuard` đá một phiên mất quyền về
 * `scopeHome(CUSTOMER)` — ở đây đó là màn giải thích "app này dành cho gian hàng dùng gói",
 * không phải một chợ xe không được đăng ký.
 */
export function scopeHome(scope: AppScope, packageOnboardingPending = false): Href {
  if (scope !== APP_SCOPE.MANAGE) return '/not-eligible';
  return packageOnboardingPending ? ROUTES.manage.onboarding() : ROUTES.manage.home();
}

/** Không có khu công khai — chưa đăng nhập thì việc duy nhất là đăng nhập. */
export function guestHome(): Href {
  return '/login';
}

/**
 * Allowlist deep link của THÔNG BÁO ĐẨY — chỉ các đích `/manage/**`. Thông báo audience
 * khách/Owner Lite thuộc app XePrime; một payload trỏ đích đó ở đây rơi về màn mặc định.
 */
export const NOTIFICATION_ALLOWED: readonly AllowedDeepLink[] = [
  { prefix: 'manage/requests', resolve: exact(ROUTES.manage.requests) },
  {
    prefix: 'manage/bookings',
    resolve: listOrDetail(ROUTES.manage.bookings, ROUTES.manage.bookingDetail),
  },
  {
    prefix: 'manage/vehicles',
    resolve: listOrDetail(ROUTES.manage.vehicles, ROUTES.manage.vehicleDetail),
  },
  { prefix: 'manage/shop', resolve: exact(ROUTES.manage.shop) },
  { prefix: 'manage/chat', resolve: listOrDetail(ROUTES.manage.chat, ROUTES.manage.chatThread) },
];
