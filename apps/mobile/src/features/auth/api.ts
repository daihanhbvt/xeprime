import { authApi, type CurrentUser, type MobileRegisterInput } from '@xeprime/api-client';
import type { AuthProvider } from '@xeprime/types';
import {
  signInWithOtp,
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

/** `identifier` là email HOẶC số điện thoại. Token đi thẳng vào Keychain/Keystore, không qua đây. */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return signInWithPassword(identifier, password);
}

export function registerWithPassword(input: RegisterInput): Promise<CurrentUser> {
  return signUpWithPassword(input);
}

export function loginWithOtp(phone: string, code: string): Promise<CurrentUser> {
  return signInWithOtp(phone, code);
}

/** `null` = người dùng đóng trình duyệt giữa chừng, KHÔNG phải lỗi — xem `signInWithSocial`. */
export function loginWithSocial(
  provider: AuthProvider,
  locale: string,
): Promise<CurrentUser | null> {
  return signInWithSocial(provider, locale);
}

export function setAccountPassword(password: string): Promise<void> {
  return authApi.setPassword({ password });
}

export function requestPasswordReset(email: string): Promise<void> {
  return authApi.forgotPassword({ email });
}

export function resetPasswordWithToken(token: string, password: string): Promise<void> {
  return authApi.resetPassword({ token, password });
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
export type { MobileSession } from '@xeprime/api-client';
