import { deleteSecureItem, getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';

/**
 * "Ghi nhớ tài khoản" của màn đăng nhập - bản native của `apps/web/src/features/auth/lib/remembered-phone.ts`:
 *
 *  - Chỉ ĐỊNH DANH (SĐT hoặc tên đăng nhập nhân viên), KHÔNG BAO GIỜ mật khẩu hay token.
 *  - Ghi chỉ khi đăng nhập THÀNH CÔNG với ô được tick; thành công mà bỏ tick ⇒ xoá. Một định danh
 *    gõ sai không bao giờ được nhớ.
 *  - Không đổi thời hạn phiên: phiên do server quyết, tick hay không cũng như nhau.
 *
 * Đọc/ghi hỏng thì coi như chưa nhớ gì - mất tiện ích, đăng nhập vẫn chạy.
 */
export async function readRememberedLogin(): Promise<string | null> {
  try {
    return (await getSecureItem(SECURE_KEY.REMEMBERED_LOGIN)) || null;
  } catch {
    return null;
  }
}

/** `null` ⇒ quên định danh đã nhớ. */
export function rememberLogin(identifier: string | null): void {
  const write = identifier
    ? setSecureItem(SECURE_KEY.REMEMBERED_LOGIN, identifier)
    : deleteSecureItem(SECURE_KEY.REMEMBERED_LOGIN);
  void write.catch(() => undefined);
}
