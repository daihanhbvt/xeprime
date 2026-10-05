import { AuthPageFrame } from '@/features/auth/components/AuthPageFrame';
import { ResetPasswordView } from '@/features/auth/components/ResetPasswordView';

/** Đích của link đặt lại mật khẩu trong email của tài khoản thuộc site này (ADR 0053). */
export default function ResetPasswordPage() {
  return (
    <AuthPageFrame>
      <ResetPasswordView />
    </AuthPageFrame>
  );
}
