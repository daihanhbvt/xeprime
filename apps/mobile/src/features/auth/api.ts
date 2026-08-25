import { authApi, type CurrentUser } from '@xeprime/api-client';
import { signInWithPassword, signOut } from '@/lib/auth-session';
// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình, và
// `authApi.me()` bên dưới dùng chính client đó.
import '@/lib/api-client';

export type { CurrentUser };

/** `identifier` là email HOẶC số điện thoại. Token đi thẳng vào Keychain/Keystore, không qua đây. */
export function loginWithPassword(identifier: string, password: string): Promise<CurrentUser> {
  return signInWithPassword(identifier, password);
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
