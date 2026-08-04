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
  tenant?: { id: string } | null;
  platformRole?: string | null;
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
 *  3. Có gian hàng → `/manage`.
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

  if (isSafeNextPath(next)) {
    if (isPlatformRoute(next) && !isPlatform) return ROUTES.MANAGE.ROOT;
    // Đừng ném người chưa có gian hàng vào một trang quản lý gian hàng cụ thể — họ sẽ thấy
    // dashboard rỗng/lỗi. Cho về `/manage` để gặp màn lựa chọn.
    if (!hasTenant && !isPlatform && next !== ROUTES.MANAGE.ONBOARDING) {
      return intent === AUTH_INTENT.OWNER ? ROUTES.MANAGE.ONBOARDING : ROUTES.MANAGE.ROOT;
    }
    return next;
  }

  if (intent === AUTH_INTENT.OWNER && !hasTenant) return ROUTES.MANAGE.ONBOARDING;
  if (hasTenant) return ROUTES.MANAGE.ROOT;
  if (isPlatform) return ROUTES.MANAGE.ADMIN;
  return ROUTES.MANAGE.ROOT;
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
  if (!user) {
    return `${ROUTES.MANAGE.LOGIN}?intent=${AUTH_INTENT.OWNER}&next=${encodeURIComponent(
      ROUTES.MANAGE.ONBOARDING,
    )}`;
  }
  return user.tenant ? ROUTES.MANAGE.ROOT : ROUTES.MANAGE.ONBOARDING;
}

/** Đích khi phiên hỏng/hết hạn ở khu quản lý: quay lại portal login, giữ đường đang mở. */
export function portalLoginWithNext(pathname: string): string {
  return `${ROUTES.MANAGE.LOGIN}?next=${encodeURIComponent(
    safeNextPath(pathname, ROUTES.MANAGE.ROOT),
  )}`;
}
