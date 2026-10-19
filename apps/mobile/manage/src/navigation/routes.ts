import type { Href } from 'expo-router';
import { ROUTES as BASE_ROUTES, type Tighten } from '@/navigation/routes-base';

/**
 * BẢN ĐỒ ROUTE CỦA APP XePrime Partner (MANAGE) — overlay đè lên `@/navigation/routes-base`.
 *
 * App này KHÔNG đăng ký route khách (chợ xe, chuyến của khách, hộp thư khách, ví hoàn tiền) — chúng
 * sống ở app XePrime. Code dùng chung vẫn tham chiếu các namespace đó, nên INTERFACE giữ nguyên và
 * mọi đích khách đổ về `/not-available`: một màn giải thích "phần này nằm ở app XePrime", là
 * fallback an toàn thay vì màn trắng.
 *
 * NGOẠI LỆ — Owner Lite (ADR 0053): các màn chủ xe tuyến hoa hồng dùng chung với bản cũ ở khu tài
 * khoản và còn gọi `ROUTES.account.vehicles/…/tax/registration…`. Ở app này chúng là màn THẬT dưới
 * `/manage/**` (đúng site partner của web), nên các builder đó trỏ về bản `manage.*` tương ứng.
 *
 * Các đích auth (`login`, quên/đặt lại mật khẩu), lời mời, pháp lý và hỗ trợ
 * công khai vẫn là route THẬT — nhân sự gian hàng cần chúng ngay trong app này.
 */
const NOT_AVAILABLE = '/not-available' as const;
const notAvailable = (): Href => NOT_AVAILABLE;

function allNotAvailable<T extends Record<string, (...args: never[]) => unknown>>(namespace: T): T {
  return Object.fromEntries(
    Object.keys(namespace).map((key) => [key, notAvailable]),
  ) as unknown as T;
}

export const ROUTES = {
  ...BASE_ROUTES,
  explore: allNotAvailable(BASE_ROUTES.explore),
  booking: allNotAvailable(BASE_ROUTES.booking),
  // Phía tài xế là của TÀI KHOẢN KHÁCH (ADR 0063) — chỉ app XePrime có.
  driving: allNotAvailable(BASE_ROUTES.driving),
  chat: allNotAvailable(BASE_ROUTES.chat),
  listYourVehicle: {
    ...allNotAvailable(BASE_ROUTES.listYourVehicle),
    // Wizard đăng nhanh là route THẬT ở đây — đội xe mở nó như web (`?from=manage`).
    register: BASE_ROUTES.listYourVehicle.register,
    // "Gốc" đăng xe ở app này là màn chọn cách cho thuê — đích thoát của wizard `from=marketplace`
    // (web `vehicleListPathFor` mặc định → `ROUTES.MANAGE.REGISTER`).
    root: BASE_ROUTES.manage.register,
  },
  content: allNotAvailable(BASE_ROUTES.content),
  account: {
    ...allNotAvailable(BASE_ROUTES.account),
    // Nhóm auth là route thật của app này — giữ nguyên bản base.
    login: BASE_ROUTES.account.login,
    forgotPassword: BASE_ROUTES.account.forgotPassword,
    resetPassword: BASE_ROUTES.account.resetPassword,
    // Hai việc của CON NGƯỜI đăng nhập (không phải của gian hàng) mà `ManageAccountScreen`
    // dẫn tới — nhân sự CHỈ dùng Partner vẫn phải đổi được mật khẩu và yêu cầu xoá tài khoản
    // ngay trong app, không bị đẩy sang "hãy dùng app XePrime".
    changePassword: BASE_ROUTES.account.changePassword,
    deleteAccount: BASE_ROUTES.account.deleteAccount,
    // Owner Lite — màn dùng chung, đứng ở khu quản lý của app này (ADR 0053).
    home: BASE_ROUTES.manage.home,
    vehicles: BASE_ROUTES.manage.vehicles,
    calendar: BASE_ROUTES.manage.calendar,
    vehicleDetail: BASE_ROUTES.manage.vehicleDetail,
    vehicleManage: BASE_ROUTES.manage.vehicleManage,
    vehicleManageSection: BASE_ROUTES.manage.vehicleManageSection,
    hostGuide: BASE_ROUTES.manage.hostGuide,
    contractsDocuments: BASE_ROUTES.manage.contractsDocuments,
    dataProtection: BASE_ROUTES.manage.dataProtection,
    tax: BASE_ROUTES.manage.tax,
    plan: BASE_ROUTES.manage.plan,
    earnings: BASE_ROUTES.manage.balance,
    registration: BASE_ROUTES.manage.registration,
    bankAccounts: BASE_ROUTES.manage.bankAccounts,
    // Yêu cầu hỗ trợ của tài khoản đối tác là yêu cầu của gian hàng.
    support: BASE_ROUTES.manage.supportCases,
    supportCase: BASE_ROUTES.manage.supportCase,
    // Đăng ký TÀI KHOẢN đối tác — app Partner tạo tài khoản realm partner (ADR 0053 điều 3).
    register: BASE_ROUTES.account.register,
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

/** Phần đường dẫn của màn fallback — để test và cổng so với `usePathname()`. */
export const NOT_AVAILABLE_PATHNAME = NOT_AVAILABLE;
