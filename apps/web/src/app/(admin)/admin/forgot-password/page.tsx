import { AuthPageFrame } from '@/features/auth/components/AuthPageFrame';
import { ForgotPasswordView } from '@/features/auth/components/ForgotPasswordView';

/** Quên mật khẩu của tài khoản thuộc site này — link đặt lại về đúng site (ADR 0053). */
export default function ForgotPasswordPage() {
  return (
    <AuthPageFrame>
      <ForgotPasswordView />
    </AuthPageFrame>
  );
}
