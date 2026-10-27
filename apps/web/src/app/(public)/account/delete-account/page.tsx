import { redirect } from 'next/navigation';

import { accountDeletionPath } from '@/constants/routes';

/**
 * Đường cũ của "Yêu cầu xoá tài khoản" — giờ là một hộp trên trang Bảo mật tài khoản (design
 * Account / Security, 22/10/2026). Giữ đường để link cũ (trang `/delete-account` công khai, email,
 * dấu trang) mở thẳng hộp đó.
 */
export default function DeleteAccountPage() {
  redirect(accountDeletionPath());
}
