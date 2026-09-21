import {
  isPackageOnboardingPending,
  tenantUsesManagePortal,
  type components,
} from '@xeprime/types';

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
  /** Thuộc một gian hàng TUYẾN GÓI. Đây là tín hiệu DUY NHẤT bật navigator quản lý. */
  readonly canManage: boolean;
  /** Nhân sự nền tảng. App native chưa phục vụ scope này — tính sẵn để khỏi đổi chữ ký sau. */
  readonly canAdmin: boolean;
  /**
   * Gian hàng TRẢ PHÍ đang nợ bước thanh toán lượt gói đầu (ADR 0040).
   *
   * Tách hẳn khỏi `canManage` vì họ chưa vào được bộ quản lý — nhưng cũng KHÔNG phải chủ xe tuyến
   * hoa hồng: `billingMode` của họ rỗng y như một tenant có danh mục gói hỏng, và xếp họ vào Owner
   * Lite là thả họ vào đúng màn "Hồ sơ chủ xe" mà ADR 0040 sinh ra để họ không bao giờ thấy.
   */
  readonly packageOnboardingPending: boolean;
}

/**
 * `canManage` hỏi `tenantUsesManagePortal` — tức `billingMode === 'package'` — KHÔNG hỏi
 * `tenant != null` và KHÔNG hỏi vai (ADR 0038 điều 4).
 *
 * Có membership là điều kiện CẦN chứ không đủ: chủ xe tuyến hoa hồng cũng có `tenant`, nhưng
 * bộ quản lý của họ là Owner Lite trong khu khách. Mở khu quản lý cho họ là đẩy họ vào một loạt
 * màn mà `SubscriptionTrackGuard` ở server trả 403 — app trông như hỏng, còn nguyên nhân nằm ở
 * một tầng họ không nhìn thấy.
 *
 * Không hỏi vai có chủ đích: "ai vào được Manage" là thuộc tính của TENANT, nên hết ân hạn thì
 * chủ, quản lý, nhân viên và người xem rời khu quản lý CÙNG LÚC.
 *
 * `billingMode` đã được server giải qua `resolveEffectiveBilling` trước khi đi trên dây, nên
 * `grace` vẫn là `package` (còn quyền) và `lapsed` đã thành `commission` (mất quyền) — client
 * không tự so `planEndsAt` với đồng hồ máy mình.
 *
 * ⚠️ GIỚI HẠN ĐANG CÓ: `AuthService.me()` dùng `findFirst` nên một người thuộc NHIỀU gian hàng
 * chỉ thấy gian hàng cũ nhất. Hàm này vì thế trả lời được "có quản lý gì không", chưa trả lời
 * được "quản lý những gì". Mở multi-shop thì sửa `MeDto` trước, không sửa ở client.
 */
export function resolveScopeCapability(user: CurrentUserLike | null | undefined): ScopeCapability {
  return {
    canRent: user != null,
    canManage: tenantUsesManagePortal(user?.tenant ?? null),
    canAdmin: Boolean(user?.platformRole),
    packageOnboardingPending: isPackageOnboardingPending(user?.tenant ?? null),
  };
}

/**
 * Khu mở app — dùng CHUNG cho lúc KHỞI ĐỘNG/refresh (`useLandingScope`) và lúc VỪA ĐĂNG NHẬP
 * (`useEnterApp`). Một luật duy nhất; hai luật là kiểu lỗi người dùng mô tả thành "app lúc thì
 * vào chỗ này lúc thì vào chỗ kia".
 *
 * Luật: **có việc để quản lý thì mở ở khu quản lý.** Tức thuộc một gian hàng TUYẾN GÓI — ở BẤT
 * KỲ trạng thái tenant nào, kể cả `draft`/`suspended`, vì chính `ManageHomeScreen` là màn giải
 * thích vì sao gian hàng chưa chạy — hoặc là nhân sự nền tảng. Còn lại (khách thuần, chủ xe
 * tuyến hoa hồng, chưa đăng nhập) mở ở marketplace: chủ xe hoa hồng làm việc ở Owner Lite trong
 * khu khách, nên đó mới là nhà của họ (ADR 0038 điều 9).
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
  /*
   * BƯỚC CÒN NỢ thắng cả lựa chọn đã nhớ (ADR 0040).
   *
   * Gian hàng trả phí chưa chuyển khoản chỉ vào được đúng màn onboarding, và đó là việc duy nhất
   * họ có trong app lúc này. Tôn trọng `remembered = customer` ở đây là mở marketplace cho một
   * người vừa bấm "Đăng ký gian hàng" rồi tắt app giữa chừng — họ không có gì để làm ở đó, và
   * Owner Lite thì `AccountTrackNotice` phải giải thích bằng một dải nhắc thay vì một màn hình.
   */
  if (capability.packageOnboardingPending) return APP_SCOPE.MANAGE;
  if (!capability.canManage && !capability.canAdmin) return APP_SCOPE.CUSTOMER;
  return params.remembered === APP_SCOPE.CUSTOMER ? APP_SCOPE.CUSTOMER : APP_SCOPE.MANAGE;
}
