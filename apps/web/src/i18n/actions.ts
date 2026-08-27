'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE_NAME, LOCALE_COOKIE_OPTIONS, isAppLocale, type AppLocale } from './config';

export interface SetLocaleResult {
  readonly ok: boolean;
  /** Ngôn ngữ ĐANG có hiệu lực sau lời gọi — client dùng để biết có cần refresh không. */
  readonly locale: AppLocale | null;
}

/**
 * Đổi ngôn ngữ giao diện. Đây là bề mặt DUY NHẤT ghi cookie `XP_LOCALE`.
 *
 * Cố ý hẹp: không nhận tên cookie, không nhận đích chuyển hướng, không tự redirect. Server
 * Action là một endpoint POST công khai — mọi tham số nó nhận đều là đầu vào từ Internet, nên
 * thứ duy nhất nó nhận là một trong hai mã ngôn ngữ, và nó tự kiểm tra lại thay vì tin kiểu
 * TypeScript (kiểu bị xoá lúc chạy).
 *
 * Không `revalidatePath`/`redirect`: client tự gọi `router.refresh()` sau khi thành công, nhờ
 * vậy đường dẫn, query, hash và lịch sử trình duyệt giữ nguyên tuyệt đối.
 */
export async function setLocale(locale: AppLocale): Promise<SetLocaleResult> {
  if (!isAppLocale(locale)) {
    return { ok: false, locale: null };
  }

  const store = await cookies();
  store.set(LOCALE_COOKIE_NAME, locale, LOCALE_COOKIE_OPTIONS);

  return { ok: true, locale };
}
