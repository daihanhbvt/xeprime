import { RequireSession } from '@/features/auth/RequireSession';
import { ChangePasswordScreen } from '@/features/account/ChangePasswordScreen';

/** Đổi mật khẩu (hoặc đặt lần đầu với tài khoản OTP/mạng xã hội) — dữ liệu của chính người dùng. */
export default function AccountChangePasswordRoute() {
  return (
    <RequireSession>
      <ChangePasswordScreen />
    </RequireSession>
  );
}
