import { apiDelete, apiGet, apiPost } from './api-client';
import type { CurrentTenantSummary, CurrentUser } from '@/hooks/use-current-user';
export { AUTH_PROVIDER, AUTH_PROVIDER_LABEL, type AuthProvider } from '@/features/auth/constants';

export interface RegisterInput {
  displayName: string;
  phone: string;
  password: string;
  /** Mã OTP `purpose=register` gửi tới `phone` — tài khoản chỉ ra đời khi số đã xác minh (ADR 0060). */
  code: string;
}

/**
 * `CurrentUser` sinh từ contract OpenAPI (ADR 0007) và khai ở `hooks/use-current-user` — mọi
 * endpoint auth đều trả đúng `MeDto` đó. Re-export để chỗ gọi cũ không phải đổi import.
 */
export type { CurrentTenantSummary, CurrentUser };

/*
 * Lối gọi HTTP của tuyến auth trên WEB — ADR 0031: web giữ bản của mình, không dùng chung với
 * app native nữa.
 *
 * Đây CHỈ là họ `/auth/*`: trả `MeDto`, đặt/xoá session cookie httpOnly (ADR 0002), không bao
 * giờ trả token trong body. Họ `/auth/mobile/*` (cặp access/refresh token — ADR 0017) KHÔNG có
 * ở đây và không được thêm vào: web không có chỗ nào cất refresh token an toàn.
 *
 * Quyền không nằm trong cookie — `GET /auth/me` là chỗ duy nhất trả role/permission/tenant, và
 * nó đọc DB mỗi lần gọi.
 */

/** DELETE /auth/session — backend xoá cookie. Client không tự xoá được vì cookie httpOnly. */
export function destroySession(): Promise<void> {
  return apiDelete<void>('/auth/session');
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/auth/me');
}

// --- Đăng nhập/đăng ký bằng SĐT + mật khẩu (ADR 0060) ---

/** POST /auth/register — đối chiếu mã OTP, tạo tài khoản rồi backend set cookie luôn (đăng nhập ngay). */
export function registerWithPassword(input: RegisterInput): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/register', input);
}

/**
 * POST /auth/login — backend set cookie httpOnly. Site khách / site partner gửi SỐ ĐIỆN THOẠI
 * (email bị từ chối `PHONE_LOGIN_REQUIRED` — ADR 0060); site quản trị gửi email hoặc SĐT.
 */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/login', { identifier, password });
}

/** POST /auth/password/set — đặt mật khẩu lần đầu cho tài khoản chưa có (cần đã đăng nhập). */
export function setPassword(password: string): Promise<void> {
  return apiPost<void>('/auth/password/set', { password });
}

/**
 * POST /auth/password/change — đổi mật khẩu khi ĐÃ có mật khẩu, khác `setPassword` (đặt lần đầu
 * cho tài khoản OTP/social).
 *
 * Sai mật khẩu hiện tại là 400 `CURRENT_PASSWORD_INCORRECT`, không phải 401: phiên vẫn còn.
 */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiPost<void>('/auth/password/change', { currentPassword, newPassword });
}

/**
 * POST /auth/password/forgot — gửi link đặt lại qua EMAIL. Chỉ site quản trị dùng: site khách và
 * site partner quên mật khẩu bằng SĐT (`resetPasswordWithOtp`). Luôn thành công (không rò rỉ email).
 */
export function forgotPassword(email: string): Promise<void> {
  return apiPost<void>('/auth/password/forgot', { email });
}

/** POST /auth/password/reset — đặt mật khẩu mới từ token trong email. */
export function resetPassword(token: string, password: string): Promise<void> {
  return apiPost<void>('/auth/password/reset', { token, password });
}

/**
 * POST /auth/password/reset-otp — quên mật khẩu bằng SĐT (ADR 0060): mã OTP
 * `purpose=password_reset` + mật khẩu mới. KHÔNG cấp phiên — người dùng đăng nhập lại bằng mật
 * khẩu vừa đặt.
 */
export function resetPasswordWithOtp(input: {
  phone: string;
  code: string;
  password: string;
}): Promise<void> {
  return apiPost<void>('/auth/password/reset-otp', input);
}
