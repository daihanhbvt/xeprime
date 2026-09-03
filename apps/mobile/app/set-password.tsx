import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { SetPasswordScreen } from '@/features/auth/SetPasswordScreen';

/**
 * Chỉ tới đây từ `login` khi tài khoản vừa đăng nhập bằng OTP mà CHƯA có mật khẩu, và luôn
 * bằng `replace` — phiên đã cấp xong, nên không có gì để lui về.
 *
 * Đặt xong hay bỏ qua đều dẫn vào app: đây là một gợi ý, không phải một cổng.
 */
export default function SetPasswordRoute() {
  const enterApp = useEnterApp();

  return <SetPasswordScreen onDone={() => enterApp()} />;
}
