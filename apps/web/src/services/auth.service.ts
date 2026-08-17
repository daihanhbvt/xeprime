import { apiDelete, apiGet, apiPost } from './api-client';
import type { CurrentTenantSummary, CurrentUser } from '@/hooks/use-current-user';

export interface RegisterInput {
  displayName: string;
  phone: string;
  password: string;
}

/**
 * `CurrentUser` sinh từ contract OpenAPI (ADR 0007) và khai ở `hooks/use-current-user` — mọi
 * endpoint auth đều trả đúng `MeDto` đó. Re-export để chỗ gọi cũ không phải đổi import.
 */
export type { CurrentTenantSummary, CurrentUser };

export const AUTH_PROVIDER = {
  GOOGLE: 'google',
  FACEBOOK: 'facebook',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];

export const AUTH_PROVIDER_LABEL: Readonly<Record<AuthProvider, string>> = {
  [AUTH_PROVIDER.GOOGLE]: 'Google',
  [AUTH_PROVIDER.FACEBOOK]: 'Facebook',
};

const FIREBASE_NOT_WIRED_MESSAGE =
  'Chưa cấu hình Firebase Web SDK. Phase 0 dùng ô "ID token" bên dưới để tạo phiên.';

/**
 * ADR 0002: Firebase chỉ dùng đúng một lần để lấy ID token, phần còn lại của hệ thống không
 * biết Firebase tồn tại.
 *
 * TODO(Phase 1): thay bằng `signInWithPopup` của `firebase/auth` — chỉ file này phải sửa.
 */
export async function getProviderIdToken(_provider: AuthProvider): Promise<string> {
  return Promise.reject(new Error(FIREBASE_NOT_WIRED_MESSAGE));
}

/** POST /auth/session — backend verify ID token rồi Set-Cookie httpOnly (ADR 0002). */
export function createSession(idToken: string): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/session', { idToken });
}

/** DELETE /auth/session — backend xoá cookie. Client không tự xoá được vì cookie httpOnly. */
export function destroySession(): Promise<void> {
  return apiDelete<void>('/auth/session');
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiGet<CurrentUser>('/auth/me');
}

// --- Đăng nhập/đăng ký bằng định danh + mật khẩu (độc lập Firebase) ---

/** POST /auth/register — tạo tài khoản rồi backend set cookie luôn (đăng nhập ngay). */
export function registerWithPassword(input: RegisterInput): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/register', input);
}

/** POST /auth/login — đăng nhập bằng email HOẶC số điện thoại + mật khẩu, backend set cookie httpOnly. */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/login', { identifier, password });
}

/** POST /auth/password/set — đặt mật khẩu lần đầu cho tài khoản chưa có (cần đã đăng nhập). */
export function setPassword(password: string): Promise<void> {
  return apiPost<void>('/auth/password/set', { password });
}

/**
 * POST /auth/phone/login — đăng nhập passwordless bằng SĐT + OTP (purpose=login). BE tự tạo tài
 * khoản nếu SĐT chưa có rồi set cookie httpOnly. Không cần mật khẩu.
 */
export function phoneLogin(phone: string, code: string): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/phone/login', { phone, code });
}

/** POST /auth/password/forgot — gửi link đặt lại qua email. Luôn thành công (không rò rỉ email). */
export function forgotPassword(email: string): Promise<void> {
  return apiPost<void>('/auth/password/forgot', { email });
}

/** POST /auth/password/reset — đặt mật khẩu mới từ token trong email. */
export function resetPassword(token: string, password: string): Promise<void> {
  return apiPost<void>('/auth/password/reset', { token, password });
}
