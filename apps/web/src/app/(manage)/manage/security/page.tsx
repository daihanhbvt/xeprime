import { redirect } from 'next/navigation';

import { ACCOUNT_SECTION, accountSectionPath } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (05/10/2026) — "Bảo mật tài khoản" đã gộp vào trang Tài khoản & bảo mật.
 *
 * Route giữ lại vì bookmark, lịch sử trình duyệt và link cũ vẫn mang nó; đích là section "Thông
 * tin đăng nhập" — phần gần nhất với điều người bấm "Bảo mật" muốn tìm. Không còn mục menu nào
 * trỏ tới đây.
 */
export default function ManageSecurityRedirectPage(): never {
  redirect(accountSectionPath(ACCOUNT_SECTION.LOGIN));
}
