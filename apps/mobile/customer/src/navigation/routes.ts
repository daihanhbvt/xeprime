import type { Href } from 'expo-router';
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';
import {
  REGISTRATION_TRACK_PARAM,
  ROUTES as BASE_ROUTES,
  type Tighten,
} from '@/navigation/routes-base';

/**
 * BẢN ĐỒ ROUTE CỦA APP XePrime (CUSTOMER) — overlay đè lên `@/navigation/routes-base` (shared).
 *
 * App này là app của TÀI KHOẢN KHÁCH (ADR 0053): không đăng ký cây `/manage/**`, không có Owner Lite
 * và không tạo gian hàng — mọi việc của chủ xe nằm ở app XePrime Partner với một tài khoản đối tác
 * riêng. Code dùng chung vẫn gọi `ROUTES.manage.*`, các màn chủ xe của `ROUTES.account.*` và
 * `ROUTES.listYourVehicle.register` — ở app này mọi đích đó đổ về màn HANDOFF `/partner`.
 *
 * `intent` trên `/partner` chỉ để màn handoff chọn đúng màn mở ở app Partner — không phải một
 * đường dẫn để chuyển tiếp, nên không có chuyện open-redirect.
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

/** Ý định của màn handoff — `register` mở thẳng màn chọn cách cho thuê ở app Partner. */
export const PARTNER_HANDOFF_INTENT = {
  REGISTER: 'register',
  /** Link mời vào gian hàng mở nhầm app khách — mở lại đúng lời mời (`token`) ở app Partner. */
  INVITE: 'invite',
} as const;

/**
 * Đăng ký cho thuê — GIỮ tuyến người dùng vừa chọn (web: hai nút đi thẳng `/vehicles/register` và
 * `/onboarding?track=package` của site partner). Không có tuyến (CTA chung "Trở thành chủ xe")
 * ⇒ màn chọn cách cho thuê.
 */
const registerHandoff = (track?: RegistrationTrack): Href =>
  track
    ? {
        pathname: PARTNER_HANDOFF_PATHNAME,
        params: { intent: PARTNER_HANDOFF_INTENT.REGISTER, [REGISTRATION_TRACK_PARAM]: track },
      }
    : partnerHandoff(PARTNER_HANDOFF_INTENT.REGISTER);

/** Màn chủ xe (Owner Lite) cũ của khu tài khoản — nay ở app Partner (ADR 0053). */
const OWNER_LITE_ACCOUNT_KEYS = [
  'vehicles',
  'calendar',
  'vehicleDetail',
  'vehicleManage',
  'vehicleManageSection',
  'hostGuide',
  'contractsDocuments',
  'dataProtection',
  'tax',
  'subscription',
  'earnings',
  'registration',
] as const satisfies readonly (keyof typeof BASE_ROUTES.account)[];

export const ROUTES = {
  ...BASE_ROUTES,
  account: {
    ...BASE_ROUTES.account,
    ...Object.fromEntries(OWNER_LITE_ACCOUNT_KEYS.map((key) => [key, () => partnerHandoff(key)])),
  },
  listYourVehicle: {
    ...BASE_ROUTES.listYourVehicle,
    // Wizard đăng xe nhanh = bước đầu tuyến HOA HỒNG.
    register: () => registerHandoff(REGISTRATION_TRACK.COMMISSION),
  },
  manage: {
    ...manageHandoff,
    onboarding: (track?: RegistrationTrack) => registerHandoff(track),
    register: () => registerHandoff(),
  },
  // Siết về `Href` THẬT của app đang build — xem docblock `Href`/`Tighten` ở routes-base.
} as unknown as Tighten<typeof BASE_ROUTES>;

export {
  MANAGE_ONBOARDING_PATHNAME,
  MANAGE_SHOP_PATHNAME,
  REGISTRATION_TRACK_PARAM,
  SHOP_SECTION,
  SHOP_SECTION_PARAM,
  SHOP_WELCOME_PARAM,
  isShopSection,
  type ShopSection,
  vehicleListPathFor,
  type BookingCreatePrefill,
  type CalendarFilters,
  type ExploreSearchParams,
  type ReceiptRouteFilters,
} from '@/navigation/routes-base';

/** Phần đường dẫn của màn handoff — cho cổng/analytics so với `usePathname()`. */
export const PARTNER_HANDOFF_PATHNAME = '/partner';
