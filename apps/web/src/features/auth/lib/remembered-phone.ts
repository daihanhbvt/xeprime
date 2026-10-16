/**
 * "Ghi nhớ tài khoản" của hộp đăng nhập site khách — nhớ SỐ ĐIỆN THOẠI đã đăng nhập thành công để
 * lần sau điền sẵn. Chỉ là tiện ích của trình duyệt này:
 *
 *  - Chỉ SĐT, KHÔNG BAO GIỜ mật khẩu hay token (CLAUDE.md §5 — phiên sống ở cookie httpOnly). Lưu
 *    mật khẩu là việc của trình quản lý mật khẩu, ô nhập đã khai `autocomplete` cho nó.
 *  - Ghi chỉ khi đăng nhập THÀNH CÔNG với ô được tick; đăng nhập thành công mà bỏ tick ⇒ xoá. Một số
 *    gõ sai không bao giờ được nhớ.
 *  - Không đổi thời hạn phiên: phiên do server quyết, tick hay không cũng như nhau.
 *
 * Mọi truy cập storage bọc `try` (chế độ riêng tư, chặn site data làm chính lời gọi NÉM) và không
 * hàm nào chạy lúc render phía server — hộp đăng nhập chỉ dựng nội dung sau khi mở ở client.
 */
const STORAGE_KEY = 'xp.auth.rememberedPhone';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRememberedPhone(): string | null {
  try {
    return storage()?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** `null` ⇒ quên số đã nhớ. */
export function rememberPhone(phone: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (phone) store.setItem(STORAGE_KEY, phone);
    else store.removeItem(STORAGE_KEY);
  } catch {
    // Trình duyệt từ chối ghi nhớ — đăng nhập vẫn thành công, chỉ lần sau không được điền sẵn.
  }
}
