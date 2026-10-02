import type { Href } from 'expo-router';
import { MOBILE_CLIENT_APP, type MobileClientApp } from '@xeprime/types';
import { APP_SCOPE, type AppScope } from '@/features/shell/app-scope';
import {
  exact,
  listOrDetail,
  singleDetail,
  type AllowedDeepLink,
} from '@/features/notifications/deep-link-kit';
import { ROUTES } from '@/navigation/routes';

/**
 * HỒ SƠ APP — XePrime (CUSTOMER). File này + `navigation/routes.ts` là hai overlay duy nhất
 * của app: mọi thứ app-specific (app đang là ai, luật chọn khu, allowlist thông báo) sống ở
 * đây; code dùng chung trong `shared/src` import `@/app-profile` và nhận đúng bản của app
 * đang build.
 */
export const APP_PROFILE: { readonly clientApp: MobileClientApp } = {
  clientApp: MOBILE_CLIENT_APP.CUSTOMER,
};

/**
 * App Customer chỉ có MỘT khu. Tài khoản gian hàng tuyến gói vẫn đăng nhập được — họ dùng app
 * này VỚI VAI KHÁCH THUÊ (mọi user đều thuê xe được); bộ quản lý của họ nằm ở app XePrime
 * Partner, và các lối `ROUTES.manage.*` ở app này đều đổ về màn handoff `/partner`.
 */
export function resolveInitialScope(_params: {
  user: unknown;
  remembered?: AppScope | null;
}): AppScope {
  return APP_SCOPE.CUSTOMER;
}

/**
 * Các khu bảng đổi khu được đưa ra. MANAGE vẫn có ở đây vì nó dẫn tới màn handoff `/partner` —
 * một lối có ích cho chủ gian hàng tuyến gói, không phải ngõ cụt.
 */
export const SWITCHABLE_SCOPES: readonly AppScope[] = [APP_SCOPE.MANAGE, APP_SCOPE.CUSTOMER];

/** Màn đầu mỗi khu. Khu MANAGE không tồn tại ở app này ⇒ handoff sang XePrime Partner. */
export function scopeHome(scope: AppScope, _packageOnboardingPending = false): Href {
  return scope === APP_SCOPE.MANAGE ? '/partner' : ROUTES.explore.home();
}

/** Khách chưa đăng nhập hạ cánh ở chợ xe — khu công khai. */
export function guestHome(): Href {
  return ROUTES.explore.home();
}

/**
 * Allowlist deep link của THÔNG BÁO ĐẨY — app Customer chỉ nhận các đích khách + Owner Lite.
 * Đường `/manage/**` KHÔNG có ở đây: thông báo audience MANAGE đi tới app XePrime Partner
 * (server lọc theo `push_devices.client_app`), và một payload lạc/giả trỏ `/manage` sẽ rơi về
 * màn mặc định thay vì một màn trắng.
 */
export const NOTIFICATION_ALLOWED: readonly AllowedDeepLink[] = [
  { prefix: 'trips', resolve: listOrDetail(ROUTES.booking.list, ROUTES.booking.detail) },
  { prefix: 'chat', resolve: listOrDetail(ROUTES.chat.list, ROUTES.chat.thread) },
  // Hai đích của bề mặt CHỦ XE tuyến hoa hồng (`NOTIFICATION_AUDIENCE.OWNER`) — Owner Lite ở
  // khu tài khoản. `exact` vì `notificationDeepLink` không bao giờ gắn id vào hai đích này.
  { prefix: 'account/vehicles', resolve: exact(ROUTES.account.vehicles) },
  { prefix: 'account', resolve: exact(ROUTES.account.home) },
  // Trang xe công khai — "xe bạn hỏi đã rảnh lại" (ADR 0045 điều 6). Bắt buộc có id.
  { prefix: 'listings', resolve: singleDetail((id) => ROUTES.explore.listingDetail(id)) },
];
