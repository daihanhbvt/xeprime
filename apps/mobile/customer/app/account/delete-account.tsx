import { RequireSession } from '@/features/auth/RequireSession';
import { CustomerDeleteAccountScreen } from '@/features/account/CustomerDeleteAccountScreen';

/**
 * YÊU CẦU xoá tài khoản — mở support case `account_deletion`, nền tảng xử lý tay. Bố cục theo hộp
 * `AccountDeletionDialog` của site khách (app Partner dùng `DeleteAccountScreen`).
 */
export default function AccountDeleteAccountRoute() {
  return (
    <RequireSession>
      <CustomerDeleteAccountScreen />
    </RequireSession>
  );
}
