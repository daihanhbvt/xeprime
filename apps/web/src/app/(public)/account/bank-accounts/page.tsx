import { redirect } from 'next/navigation';
import { accountBalancePayoutPath } from '@/constants/routes';

/**
 * Tài khoản nhận tiền đã thành một khối của tab "Tài khoản thanh toán" trong mục Quản lý thanh toán
 * (design Account 22/10/2026), ngay dưới nút Rút. Giữ đường cũ để link/bookmark cũ không thành 404 —
 * chuyển tới đúng khối đó.
 */
export default function AccountBankAccountsPage(): never {
  redirect(accountBalancePayoutPath());
}
