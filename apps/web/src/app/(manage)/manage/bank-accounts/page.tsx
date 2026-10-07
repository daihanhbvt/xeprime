import { redirect } from 'next/navigation';

import { balancePayoutPath } from '@/constants/routes';

/**
 * ALIAS CHUYỂN TIẾP (07/10/2026) — "Tài khoản nhận tiền" là một khối của trang "Số dư & rút tiền" ở
 * CẢ hai tuyến: rút tiền và nơi tiền về là một việc, nên là một trang.
 *
 * Route giữ lại vì bookmark, thông báo cũ và app native vẫn mang nó. Đích như nhau với mọi tuyến nên
 * chuyển ngay ở server, không phải đợi `/auth/me`. Không còn mục menu nào trỏ tới đây.
 */
export default function PartnerBankAccountsRedirectPage(): never {
  redirect(balancePayoutPath());
}
