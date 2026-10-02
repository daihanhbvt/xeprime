import type { Href } from 'expo-router';
import { ROUTES as BASE_ROUTES, type Tighten } from '@/navigation/routes-base';

/**
 * BẢN ĐỒ ROUTE CỦA APP XePrime Partner (MANAGE) — overlay đè lên `@/navigation/routes-base`.
 *
 * App này KHÔNG đăng ký route khách (chợ xe, chuyến của khách, hộp thư khách, Owner Lite,
 * đăng xe hoa hồng) — chúng sống ở app XePrime. Code dùng chung vẫn tham chiếu các namespace
 * đó, nên INTERFACE giữ nguyên và mọi đích khách đổ về `/not-available`: một màn giải thích
 * "phần này nằm ở app XePrime", là fallback an toàn thay vì màn trắng.
 *
 * Các đích auth (`login`, `set-password`, quên/đặt lại mật khẩu), lời mời, pháp lý và hỗ trợ
 * công khai vẫn là route THẬT — nhân sự gian hàng cần chúng ngay trong app này.
 */
const NOT_AVAILABLE = '/not-available' as const;
const notAvailable = (): Href => NOT_AVAILABLE;

function allNotAvailable<T extends Record<string, (...args: never[]) => unknown>>(namespace: T): T {
  return Object.fromEntries(Object.keys(namespace).map((key) => [key, notAvailable])) as unknown as T;
}

export const ROUTES = {
  ...BASE_ROUTES,
  explore: allNotAvailable(BASE_ROUTES.explore),
  booking: allNotAvailable(BASE_ROUTES.booking),
  chat: allNotAvailable(BASE_ROUTES.chat),
  listYourVehicle: {
    ...allNotAvailable(BASE_ROUTES.listYourVehicle),
    // Wizard đăng nhanh là route THẬT ở đây — đội xe mở nó như web (`?from=manage`).
    register: BASE_ROUTES.listYourVehicle.register,
  },
  content: allNotAvailable(BASE_ROUTES.content),
  account: {
    ...allNotAvailable(BASE_ROUTES.account),
    // Nhóm auth là route thật của app này — giữ nguyên bản base.
    login: BASE_ROUTES.account.login,
    setPassword: BASE_ROUTES.account.setPassword,
    forgotPassword: BASE_ROUTES.account.forgotPassword,
    resetPassword: BASE_ROUTES.account.resetPassword,
    // Hai việc của CON NGƯỜI đăng nhập (không phải của gian hàng) mà `ManageAccountScreen`
    // dẫn tới — nhân sự CHỈ dùng Partner vẫn phải đổi được mật khẩu và yêu cầu xoá tài khoản
    // ngay trong app, không bị đẩy sang "hãy dùng app XePrime".
    changePassword: BASE_ROUTES.account.changePassword,
    deleteAccount: BASE_ROUTES.account.deleteAccount,
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

/** Phần đường dẫn của màn fallback — để test và cổng so với `usePathname()`. */
export const NOT_AVAILABLE_PATHNAME = NOT_AVAILABLE;
