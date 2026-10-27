import type { ReactNode } from 'react';
import { AccountPaymentsHub } from '@/features/account-payments/components/AccountPaymentsHub';

/**
 * Mục "Quản lý thanh toán" (design Account 22/10/2026) — số dư (`/account/balance`) và lịch sử
 * thanh toán (`/account/payments`) là hai tab trong CÙNG một khung. Route group `(payments)` chỉ
 * để chia layout: URL không đổi, link cũ không gãy.
 */
export default function AccountPaymentsLayout({ children }: { children: ReactNode }) {
  return <AccountPaymentsHub>{children}</AccountPaymentsHub>;
}
