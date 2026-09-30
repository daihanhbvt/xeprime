import type { Href } from 'expo-router';
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';
import { REGISTRATION_TRACK_PARAM, ROUTES as BASE_ROUTES, type Tighten } from '@/navigation/routes-base';

/**
 * BẢN ĐỒ ROUTE CỦA APP XePrime (CUSTOMER) — overlay đè lên `@/navigation/routes-base` (shared).
 *
 * App này KHÔNG đăng ký cây `/manage/**`: khu quản lý sống ở app XePrime Partner. Nhưng code
 * dùng chung (menu tài khoản, thẻ gian hàng, màn hỗ trợ…) vẫn gọi `ROUTES.manage.*` — ở app
 * này, mọi đích đó đổ về màn HANDOFF `/partner` (mở hoặc tải XePrime Partner), trừ:
 *
 *  - `manage.onboarding` → `/partner/register`: ĐĂNG KÝ gian hàng vẫn là việc của app
 *    Customer (spec handoff §7) — tạo hồ sơ qua `POST /tenants` rồi màn success mời mở app
 *    Partner. KHÔNG điều hướng nội bộ sang một route Partner nào.
 *
 * `intent` trên `/partner` chỉ để màn handoff nói đúng "bạn vừa bấm gì" — không phải một đường
 * dẫn để chuyển tiếp, nên không có chuyện open-redirect.
 */
const partnerHandoff = (intent: string): Href => ({
  pathname: '/partner',
  params: { intent },
});

const manageHandoff = Object.fromEntries(
  Object.keys(BASE_ROUTES.manage).map((key) => [key, () => partnerHandoff(key)]),
  // Hàm 0 tham số gán được vào mọi chữ ký của bản gốc (TS cho phép ít tham số hơn); cast giữ
  // nguyên INTERFACE để code dùng chung typecheck y hệt hai app.
) as unknown as typeof BASE_ROUTES.manage;

export const ROUTES = {
  ...BASE_ROUTES,
  manage: {
    ...manageHandoff,
    onboarding: (track: RegistrationTrack = REGISTRATION_TRACK.COMMISSION): Href => ({
      pathname: '/partner/register',
      params: { [REGISTRATION_TRACK_PARAM]: track },
    }),
  },
  // Siết về `Href` THẬT của app đang build — xem docblock `Href`/`Tighten` ở routes-base.
} as unknown as Tighten<typeof BASE_ROUTES>;

export {
  MANAGE_ONBOARDING_PATHNAME,
  MANAGE_SHOP_PATHNAME,
  REGISTRATION_TRACK_PARAM,
  SHOP_WELCOME_PARAM,
  vehicleListPathFor,
  type BookingCreatePrefill,
  type CalendarFilters,
  type ExploreSearchParams,
  type ReceiptRouteFilters,
} from '@/navigation/routes-base';

/** Phần đường dẫn của luồng handoff — cho cổng/analytics so với `usePathname()`. */
export const PARTNER_HANDOFF_PATHNAME = '/partner';
export const PARTNER_REGISTER_PATHNAME = '/partner/register';
export const PARTNER_SUCCESS_PATHNAME = '/partner/success';

export const PARTNER_ROUTES = {
  handoff: (intent?: string): Href =>
    intent ? { pathname: '/partner', params: { intent } } : '/partner',
  register: (track: RegistrationTrack = REGISTRATION_TRACK.PACKAGE): Href => ({
    pathname: '/partner/register',
    params: { [REGISTRATION_TRACK_PARAM]: track },
  }),
  success: (): Href => '/partner/success',
} as const;
