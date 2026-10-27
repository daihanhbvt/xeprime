import { RequireSession } from '@/features/auth/RequireSession';
import { ChangePasswordScreen } from '@/features/account/ChangePasswordScreen';

/**
 * "Bảo mật tài khoản" — đổi mật khẩu (hoặc đặt lần đầu với tài khoản OTP/mạng xã hội) và lối gửi
 * YÊU CẦU xoá tài khoản (web `/account/change-password`, design Account / Security 22/10/2026).
 */
export default function AccountChangePasswordRoute() {
  return (
    <RequireSession>
      <ChangePasswordScreen variant="security" />
    </RequireSession>
  );
}
