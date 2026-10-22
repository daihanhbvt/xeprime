import { redirect } from 'next/navigation';
import { ACCOUNT_DOCUMENTS_ANCHOR, ROUTES } from '@/constants/routes';

/**
 * Giấy tờ & Xác minh đã thành một mục TRONG trang Quản lý tài khoản (design Account / Profile).
 * Giữ đường cũ để link/bookmark/thông báo cũ không thành 404 — chuyển tới đúng mục đó.
 */
export default function AccountDocumentsPage(): never {
  redirect(`${ROUTES.ACCOUNT.ROOT}#${ACCOUNT_DOCUMENTS_ANCHOR}`);
}
