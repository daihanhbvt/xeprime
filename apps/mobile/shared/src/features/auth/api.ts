import { authApi } from '@/api/auth/api';
import { type CurrentUser, type MobileRegisterInput } from '@/api/auth/types';
import type { AuthProvider } from '@xeprime/types';
import {
  isAppleSignInAvailable,
  signInWithApple,
  signInWithPassword,
  signInWithSocial,
  signOut,
  signUpWithPassword,
} from '@/lib/auth-session';
// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình, và
// `authApi.me()` bên dưới dùng chính client đó.
import '@/lib/api-client';

export type { CurrentUser };

export type RegisterInput = Omit<MobileRegisterInput, 'device'>;

/**
 * `identifier` là SỐ ĐIỆN THOẠI (ADR 0060 — server từ chối email bằng `PHONE_LOGIN_REQUIRED`).
 * Token đi thẳng vào Keychain/Keystore, không qua đây.
 */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return signInWithPassword(identifier, password);
}

export function registerWithPassword(input: RegisterInput): Promise<CurrentUser> {
  return signUpWithPassword(input);
}

/** Kiểm thông tin đăng ký TRƯỚC bước nhập mã (SĐT trùng, luật mật khẩu…) — không gửi mã. */
export function checkRegistration(input: Omit<RegisterInput, 'code'>): Promise<void> {
  return authApi.checkRegistration(input);
}

/** `null` = người dùng đóng trình duyệt giữa chừng, KHÔNG phải lỗi — xem `signInWithSocial`. */
export function loginWithSocial(
  provider: AuthProvider,
  locale: string,
): Promise<CurrentUser | null> {
  return signInWithSocial(provider, locale);
}

/** "Sign in with Apple" — chỉ iOS. `null` = người dùng tự huỷ bảng đăng nhập, KHÔNG phải lỗi. */
export function loginWithApple(): Promise<CurrentUser | null> {
  return signInWithApple();
}

export { isAppleSignInAvailable };

/** Đặt mật khẩu LẦN ĐẦU cho tài khoản chưa có (vào bằng Google/Facebook/Apple) — màn đổi mật khẩu. */
export function setAccountPassword(password: string): Promise<void> {
  return authApi.setPassword({ password });
}

/**
 * Đổi mật khẩu khi ĐÃ có mật khẩu — khác `setAccountPassword` (đặt lần đầu cho tài khoản
 * OTP/mạng xã hội). Sai mật khẩu hiện tại trả 400 `CURRENT_PASSWORD_INCORRECT`, không phải 401:
 * phiên vẫn còn nguyên, nên màn hiện lỗi TRÊN Ô chứ không đá người dùng ra đăng nhập lại.
 */
export function changeAccountPassword(currentPassword: string, newPassword: string): Promise<void> {
  return authApi.changePassword({ currentPassword, newPassword });
}

export function resetPasswordWithToken(token: string, password: string): Promise<void> {
  return authApi.resetPassword({ token, password });
}

/** Quên mật khẩu bằng SĐT (ADR 0060) — mã `password_reset` + mật khẩu mới. Không cấp phiên. */
export function resetPasswordWithOtp(phone: string, code: string, password: string): Promise<void> {
  return authApi.resetPasswordWithOtp({ phone, code, password });
}

/**
 * Quyền và tenant scope KHÔNG nằm trong access token (ADR 0017 §1) — đây là chỗ duy nhất trả
 * chúng, và nó đọc DB mỗi lần gọi.
 */
export function fetchCurrentUser(): Promise<CurrentUser> {
  return authApi.me();
}

/** Thu hồi phiên ở SERVER rồi mới xoá token ở máy — xoá mỗi ở máy là để phiên sống tiếp 60 ngày. */
export function destroySession(): Promise<void> {
  return signOut();
}

/**
 * Nạp phiên do `POST /public/booking-requests` phát ra khi khách vãng lai vừa được tạo tài
 * khoản (`client: 'native'`). Đi qua đúng kho token đang dùng — không có đường thứ hai.
 */
export { adoptSession as adoptMobileSession, describeDevice } from '@/lib/auth-session';
export type { MobileSession } from '@/api/auth/types';
