import { redirect } from 'next/navigation';

import { FINANCE_QUEUE, financeQueueHref } from '@/features/platform-money/finance-queues';

/**
 * URL CŨ của hàng đợi "Đối soát tiền vào" — từ 01/10/2026 là hàng đợi "Tiền vào chưa khớp" của
 * màn Tài chính. Route còn sống dưới dạng chuyển tiếp để link và bookmark cũ không chết; trang cũ
 * không đặt tham số nào lên URL, nên không có gì để mang theo.
 */
export default function LegacyBankTransactionsPage() {
  redirect(financeQueueHref(FINANCE_QUEUE.BANK_IN));
}
