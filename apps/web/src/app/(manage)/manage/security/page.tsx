import { redirect } from 'next/navigation';

import { ROUTES } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (05/10/2026) — "Bảo mật tài khoản" đã gộp vào trang Tài khoản & bảo mật.
 *
 * Route giữ lại vì bookmark, lịch sử trình duyệt và link cũ vẫn mang nó. Từ 17/11/2026 trang đích
 * không còn `?section=` (một trang gọn, nhìn hết một lượt) nên đích là chính trang đó.
 */
export default function ManageSecurityRedirectPage(): never {
  redirect(ROUTES.MANAGE.ACCOUNT);
}
