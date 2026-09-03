import type { components } from '@xeprime/types';

/**
 * Hai KHU của app native: khu khách thuê xe và khu quản lý gian hàng.
 *
 * Là luật nghiệp vụ chứ không phải chuyện điều hướng: câu hỏi "người này được vào khu nào" trả
 * lời bằng `tenant`/`platformRole` của `/auth/me`, y hệt câu hỏi web đang trả lời ở
 * `resolvePortalDestination`. Đặt ở đây để một ngày hai client gọi chung một luật.
 */
export const APP_SCOPE = {
  CUSTOMER: 'customer',
  MANAGE: 'manage',
} as const;

export type AppScope = (typeof APP_SCOPE)[keyof typeof APP_SCOPE];

export const APP_SCOPE_VALUES = Object.values(APP_SCOPE) as AppScope[];

export function isAppScope(value: unknown): value is AppScope {
  return typeof value === 'string' && (APP_SCOPE_VALUES as string[]).includes(value);
}

/** Hồ sơ phiên hiện tại — `MeDto`, nhận qua tham số nên package không phải biết HTTP. */
type CurrentUserLike = components['schemas']['MeDto'];

export interface ScopeCapability {
  /** Luôn true với user đã đăng nhập — mọi tài khoản đều thuê xe được. */
  readonly canRent: boolean;
  /** Có membership gian hàng. Đây là tín hiệu DUY NHẤT bật navigator quản lý. */
  readonly canManage: boolean;
  /** Nhân sự nền tảng. App native chưa phục vụ scope này — tính sẵn để khỏi đổi chữ ký sau. */
  readonly canAdmin: boolean;
}

/**
 * `canManage` suy từ `tenant != null`, KHÔNG từ một mảng `roles[]`.
 *
 * Thêm mảng vai song song là hai nguồn sự thật cho cùng một câu hỏi, và `customer` vốn không
 * phải một vai (`packages/types/src/rbac.ts`) — nó là mặc định của mọi tài khoản.
 *
 * ⚠️ GIỚI HẠN ĐANG CÓ: `AuthService.me()` dùng `findFirst` nên một người thuộc NHIỀU gian hàng
 * chỉ thấy gian hàng cũ nhất. Hàm này vì thế trả lời được "có quản lý gì không", chưa trả lời
 * được "quản lý những gì". Mở multi-shop thì sửa `MeDto` trước, không sửa ở client.
 */
export function resolveScopeCapability(user: CurrentUserLike | null | undefined): ScopeCapability {
  return {
    canRent: user != null,
    canManage: user?.tenant != null,
    canAdmin: Boolean(user?.platformRole),
  };
}

/**
 * Khu mở app — dùng CHUNG cho lúc KHỞI ĐỘNG/refresh (`useLandingScope`) và lúc VỪA ĐĂNG NHẬP
 * (`useEnterApp`). Một luật duy nhất; hai luật là kiểu lỗi người dùng mô tả thành "app lúc thì
 * vào chỗ này lúc thì vào chỗ kia".
 *
 * Luật: **có việc để quản lý thì mở ở khu quản lý.** Tức có membership gian hàng — ở BẤT KỲ
 * trạng thái nào, kể cả `draft`/`suspended`/`expired`, vì chính `ManageHomeScreen` là màn giải
 * thích vì sao gian hàng chưa chạy — hoặc là nhân sự nền tảng. Còn lại (khách thuần, chưa đăng
 * nhập) mở ở marketplace.
 *
 * `remembered` là lựa chọn TƯỜNG MINH lần trước ở `ScopeSwitcher`, nên nó thắng mặc định —
 * nhưng chỉ theo chiều "tôi muốn ở khu khách", và chỉ khi năng lực còn hợp lệ: quyền có thể đã
 * bị thu hồi giữa hai lần mở app.
 */
export function resolveInitialScope(params: {
  user: CurrentUserLike | null | undefined;
  remembered?: AppScope | null;
}): AppScope {
  const capability = resolveScopeCapability(params.user);
  if (!capability.canManage && !capability.canAdmin) return APP_SCOPE.CUSTOMER;
  return params.remembered === APP_SCOPE.CUSTOMER ? APP_SCOPE.CUSTOMER : APP_SCOPE.MANAGE;
}
