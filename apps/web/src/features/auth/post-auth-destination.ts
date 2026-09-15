import { OWNER_STAGE, isCommissionTrack, resolveOwnerStage } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { isSafeNextPath, safeNextPath } from './safe-next';

/**
 * "Sau khi đăng nhập thì đi đâu" — hàm THUẦN, tách khỏi component để test được và để hai
 * presentation (modal khách / trang portal) không trôi khỏi nhau.
 *
 * Đây chính là chỗ bug gốc từng nằm: mọi đường đăng nhập đều mặc định về `/manage`, nên khách
 * thuê xe bị đẩy vào khu quản lý rồi bị hỏi tạo gian hàng. Quy tắc bây giờ: **đích phụ thuộc
 * ngữ cảnh mở auth, không phụ thuộc việc user có tài khoản hay không.**
 */

/**
 * Người dùng như `/auth/me` trả về — chỉ lấy phần quyết định điều hướng.
 * Nhận cả `undefined` để dùng được với mọi shape gọi tới (kể cả response cũ thiếu field).
 */
export interface AuthScope {
  /**
   * Đủ để chọn KHU, không chỉ để biết "có gian hàng hay không".
   *
   * Bốn trường sau `id` là thứ phân biệt hai tuyến của ADR 0028: chủ xe tuyến hoa hồng làm việc
   * ở `/account`, gian hàng có gói làm việc ở `/manage`. Trước đây chỉ có `id`, nên MỌI người có
   * tenant đều bị đẩy vào cổng quản lý — kể cả người vừa đăng ký xong một chiếc xe.
   */
  tenant?: {
    id: string;
    roleKey?: string | null;
    status?: string | null;
    billingMode?: string | null;
    publicVehicleCount?: number | null;
  } | null;
  platformRole?: string | null;
}

/**
 * "Khu làm việc của người này ở đâu" — `/manage` hay `/account`.
 *
 * MỘT nơi trả lời, vì câu hỏi này xuất hiện ở rất nhiều chỗ: sau đăng nhập, CTA chủ xe, thẻ gian
 * hàng ở trang tài khoản, menu marketplace, màn kết thúc wizard đăng xe, và cổng chặn của
 * `AppShell`. Mỗi nơi tự quyết định là mỗi nơi một luật, và đó chính là hiện trạng đang sửa.
 *
 * Luật:
 *  - Không có gian hàng → `null` (nơi gọi tự chọn: landing đăng xe, hay ở nguyên trang).
 *  - `shop_owner` tuyến HOA HỒNG → `/account`: đang đăng ký thì về màn tiến trình, xong rồi thì
 *    về danh sách xe. Tuyệt đối không đưa vào `/manage`.
 *  - Còn lại (gian hàng có gói, và nhân viên của mọi gian hàng) → `/manage`.
 */
export function resolveWorkspaceHref(user: AuthScope | null | undefined): string | null {
  const tenant = user?.tenant;
  if (!tenant) return null;
  if (!isCommissionTrack(tenant)) return ROUTES.MANAGE.ROOT;
  return resolveOwnerStage(tenant) === OWNER_STAGE.OWNER
    ? ROUTES.ACCOUNT.VEHICLES
    : ROUTES.ACCOUNT.REGISTRATION;
}

/** Khu làm việc là `/manage` — tức người này ĐƯỢC vào cổng quản lý. */
export function canUseManagePortal(user: AuthScope | null | undefined): boolean {
  return resolveWorkspaceHref(user) === ROUTES.MANAGE.ROOT;
}

/** Ý định mở cổng quản lý, đi trong URL (`?intent=owner`). */
export const AUTH_INTENT = {
  OWNER: 'owner',
} as const;

export type AuthIntent = (typeof AUTH_INTENT)[keyof typeof AUTH_INTENT];

/** Chế độ của form auth. */
export const AUTH_MODE = {
  LOGIN: 'login',
  REGISTER: 'register',
} as const;

export type AuthMode = (typeof AUTH_MODE)[keyof typeof AUTH_MODE];

export function isAuthMode(value: string | null | undefined): value is AuthMode {
  return value === AUTH_MODE.LOGIN || value === AUTH_MODE.REGISTER;
}

/**
 * Đích sau khi KHÁCH đăng nhập/đăng ký từ marketplace.
 *
 * `null` = không điều hướng: đóng modal và ở nguyên trang đang xem. Đây là mặc định, KHÔNG
 * phải `/manage` — khách đăng nhập từ header trang chủ thì phải vẫn ở trang chủ.
 */
export function resolveCustomerDestination(next: string | null | undefined): string | null {
  return isSafeNextPath(next) ? next : null;
}

/**
 * Đích sau khi đăng nhập ở CỔNG QUẢN LÝ, theo scope thật lấy từ `/auth/me`.
 *
 * Thứ tự quyết định:
 *  1. `next` an toàn → tôn trọng ý định ban đầu (proxy đặt `next` khi chặn route).
 *     Riêng route nền tảng: user không có `platformRole` KHÔNG được đưa tới đó — trả về
 *     `/manage` để họ gặp màn hợp lệ, còn 403 thật do layout admin + guard backend quyết định.
 *  2. `intent=owner` và chưa có gian hàng → onboarding (owner intent tường minh).
 *  3. Có gian hàng → khu làm việc của họ (`resolveWorkspaceHref`): `/manage` với gian hàng có
 *     gói và nhân viên, `/account` với chủ xe tuyến hoa hồng.
 *  4. Chỉ có platform role → `/manage/admin`.
 *  5. Không tenant, không platform, không owner intent → `/manage` (ở đó hiện màn "Bạn chưa có
 *     gian hàng", KHÔNG tự bật form tạo shop).
 */
export function resolvePortalDestination(params: {
  user: AuthScope;
  next?: string | null;
  intent?: string | null;
}): string {
  const { user, next, intent } = params;
  const hasTenant = user.tenant != null;
  const isPlatform = Boolean(user.platformRole);
  const workspace = resolveWorkspaceHref(user);

  if (isSafeNextPath(next)) {
    if (isPlatformRoute(next) && !isPlatform) return workspace ?? ROUTES.MANAGE.ROOT;
    /*
     * Chủ xe tuyến hoa hồng gõ (hoặc được `next` dẫn) tới một trang `/manage` thì không đi tới
     * đó, kể cả khi họ có gian hàng: khu đó không dành cho họ (ADR 0027/0028). Đưa về đúng khu
     * của mình thay vì để `AppShell` nhận rồi đá ra — một cú nhảy, không phải hai.
     */
    if (isManageRoute(next) && !isPlatform && workspace !== ROUTES.MANAGE.ROOT) {
      if (next === ROUTES.MANAGE.ONBOARDING && !hasTenant) return next;
      return workspace ?? ROUTES.MANAGE.ROOT;
    }
    // Đừng ném người chưa có gian hàng vào một trang quản lý gian hàng cụ thể — họ sẽ thấy
    // dashboard rỗng/lỗi. Cho về `/manage` để gặp màn lựa chọn.
    if (!hasTenant && !isPlatform && next !== ROUTES.MANAGE.ONBOARDING) {
      return intent === AUTH_INTENT.OWNER ? ROUTES.MANAGE.ONBOARDING : ROUTES.MANAGE.ROOT;
    }
    return next;
  }

  if (intent === AUTH_INTENT.OWNER && !hasTenant) return ROUTES.MANAGE.ONBOARDING;
  if (workspace) return workspace;
  if (isPlatform) return ROUTES.MANAGE.ADMIN;
  return ROUTES.MANAGE.ROOT;
}

/** `/manage` và mọi route con. */
export function isManageRoute(pathname: string): boolean {
  return pathname === ROUTES.MANAGE.ROOT || pathname.startsWith(`${ROUTES.MANAGE.ROOT}/`);
}

/** `/manage/admin` và mọi route con. */
export function isPlatformRoute(pathname: string): boolean {
  return (
    pathname === ROUTES.MANAGE.ADMIN || pathname.startsWith(`${ROUTES.MANAGE.ADMIN}/`)
  );
}

/**
 * Đích khi bấm CTA chủ xe ("Đăng xe cho thuê", "Trở thành chủ xe").
 * Chưa đăng nhập → portal login kèm owner intent; đã có gian hàng → thẳng vào portal.
 */
export function resolveOwnerCtaHref(user: AuthScope | null | undefined): string {
  /*
   * 09/09/2026: mọi CTA chủ xe đi qua LANDING "Đăng xe cho thuê" trước.
   *
   * Trước đây nút này ném thẳng người chưa đăng nhập vào form tạo gian hàng — hỏi tên gian hàng
   * và mã số thuế trước khi họ kịp biết mình được gì. Landing là trang công khai, đọc xong mới
   * quyết định, và chính nó rẽ tiếp theo trạng thái thật (đăng nhập → onboarding → wizard).
   */
  return resolveWorkspaceHref(user) ?? ROUTES.LIST_YOUR_VEHICLE.ROOT;
}

/** Đích khi phiên hỏng/hết hạn ở khu quản lý: quay lại portal login, giữ đường đang mở. */
export function portalLoginWithNext(pathname: string): string {
  return `${ROUTES.MANAGE.LOGIN}?next=${encodeURIComponent(
    safeNextPath(pathname, ROUTES.MANAGE.ROOT),
  )}`;
}
