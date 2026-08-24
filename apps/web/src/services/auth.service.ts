import { authApi } from '@xeprime/api-client';
import { apiPost } from './api-client';
import type { CurrentTenantSummary, CurrentUser } from '@/hooks/use-current-user';
import { getFirebaseProviderIdToken } from '@/features/auth/lib/firebase-social-auth';
export { AUTH_PROVIDER, AUTH_PROVIDER_LABEL, type AuthProvider } from '@/features/auth/constants';
import type { AuthProvider } from '@/features/auth/constants';
import type { AppLocale } from '@/i18n/config';

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

/**
 * ADR 0002: Firebase chỉ dùng đúng một lần để lấy ID token, phần còn lại của hệ thống không
 * biết Firebase tồn tại.
 */
export function getProviderIdToken(provider: AuthProvider, locale: AppLocale): Promise<string> {
  return getFirebaseProviderIdToken(provider, locale);
}

/*
 * Tám hàm dưới đây uỷ quyền cho `authApi` ở `@xeprime/api-client`.
 *
 * Giữ nguyên TÊN và CHỮ KÝ cũ để chỗ gọi không phải đổi; phần gọi HTTP thì chỉ còn một bản, và
 * app native dùng đúng bản đó (`docs/mobile-readiness-audit.md` §14.1 bước 4 — feature `auth` là
 * feature đầu tiên được chuyển).
 */

/** POST /auth/session — backend verify ID token rồi Set-Cookie httpOnly (ADR 0002). */
export function createSession(idToken: string): Promise<CurrentUser> {
  return authApi.createSession({ idToken });
}

/** DELETE /auth/session — backend xoá cookie. Client không tự xoá được vì cookie httpOnly. */
export function destroySession(): Promise<void> {
  return authApi.destroySession();
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return authApi.me();
}

// --- Đăng nhập/đăng ký bằng định danh + mật khẩu (độc lập Firebase) ---

/** POST /auth/register — tạo tài khoản rồi backend set cookie luôn (đăng nhập ngay). */
export function registerWithPassword(input: RegisterInput): Promise<CurrentUser> {
  return authApi.register(input);
}

/** POST /auth/login — đăng nhập bằng email HOẶC số điện thoại + mật khẩu, backend set cookie httpOnly. */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return authApi.login({ identifier, password });
}

/** POST /auth/password/set — đặt mật khẩu lần đầu cho tài khoản chưa có (cần đã đăng nhập). */
export function setPassword(password: string): Promise<void> {
  return authApi.setPassword({ password });
}

/**
 * POST /auth/phone/login — đăng nhập passwordless bằng SĐT + OTP (purpose=login). BE tự tạo tài
 * khoản nếu SĐT chưa có rồi set cookie httpOnly. Không cần mật khẩu.
 *
 * CỐ Ý không nằm trong `authApi`: endpoint này thuộc `PhoneVerificationController`, và nó là
 * luồng CHỈ-WEB (đặt cookie). Native đăng nhập qua `/auth/mobile/*`.
 */
export function phoneLogin(phone: string, code: string): Promise<CurrentUser> {
  return apiPost<CurrentUser>('/auth/phone/login', { phone, code });
}

/** POST /auth/password/forgot — gửi link đặt lại qua email. Luôn thành công (không rò rỉ email). */
export function forgotPassword(email: string): Promise<void> {
  return authApi.forgotPassword({ email });
}

/** POST /auth/password/reset — đặt mật khẩu mới từ token trong email. */
export function resetPassword(token: string, password: string): Promise<void> {
  return authApi.resetPassword({ token, password });
}
