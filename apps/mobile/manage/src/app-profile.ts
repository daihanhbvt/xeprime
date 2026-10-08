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
 * App Partner chỉ có khu QUẢN LÝ. Mọi tài khoản đăng nhập ở đây là tài khoản ĐỐI TÁC (realm do
 * server quyết theo `clientApp` — ADR 0053); `ScopeGuard` đặt họ vào đúng trang của tuyến.
 */
export function resolveInitialScope(_params: {
  user: unknown;
  remembered?: AppScope | null;
}): AppScope {
  return APP_SCOPE.MANAGE;
}

/**
 * Các khu bảng đổi khu được đưa ra. App này KHÔNG có khu khách (ADR 0051 · 0053): tài khoản đối
 * tác không thuê xe — việc đó là của tài khoản khách ở app XePrime.
 */
export const SWITCHABLE_SCOPES: readonly AppScope[] = [APP_SCOPE.MANAGE];

/**
 * Khu CUSTOMER không tồn tại ở app này, nên mọi khu đều về khu quản lý. Tuyến "chưa có gian hàng"
 * được `ScopeGuard` chuyển tiếp sang màn chọn cách cho thuê; gói chưa thanh toán vào thẳng
 * onboarding.
 */
export function scopeHome(_scope: AppScope, packageOnboardingPending = false): Href {
  return packageOnboardingPending ? ROUTES.manage.onboarding() : ROUTES.manage.home();
}

/** Không có khu công khai — chưa đăng nhập thì việc duy nhất là đăng nhập. */
export function guestHome(): Href {
  return '/login';
}

/**
 * Allowlist deep link của THÔNG BÁO ĐẨY — chỉ các đích `/manage/**`. Thông báo cho tài khoản đối
 * tác — kể cả chủ xe tuyến hoa hồng — phát với audience MANAGE (ADR 0053); `ScopeGuard` đổi các
 * đích tuyến gói sang bản Owner Lite tương ứng.
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
