import { RequireSession } from '@/features/auth/RequireSession';
import { DeleteAccountScreen } from '@/features/account/DeleteAccountScreen';

/** YÊU CẦU xoá tài khoản — mở support case `account_deletion`, nền tảng xử lý tay. */
export default function AccountDeleteAccountRoute() {
  return (
    <RequireSession>
      <DeleteAccountScreen />
    </RequireSession>
  );
}
