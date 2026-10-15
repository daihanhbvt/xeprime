import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import type { CurrentUser } from '@/features/auth/api';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

export default function LoginRoute() {
  const router = useRouter();
  const t = useTranslations('Auth');
  const toast = useAppToast();
  const enterApp = useEnterApp();

  /**
   * Chỗ DUY NHẤT biết "đăng nhập xong thì đi đâu" — đúng vai `finish()` của `AuthPanel` bên web.
   * Không còn màn đặt mật khẩu sau đăng nhập: đăng nhập OTP đã gỡ (ADR 0060), mọi đường vào đều
   * vào thẳng app. Tài khoản chưa có SĐT đã xác minh gặp cổng xác minh ở khu khách.
   */
  function finish(user: CurrentUser) {
    toast.showSuccess(t('login.success'));
    enterApp(user);
  }

  return (
    <LoginScreen
      onSuccess={finish}
      onForgotPassword={() => router.push(ROUTES.account.forgotPassword())}
      onSwitchToRegister={() => router.replace(ROUTES.account.register())}
      onCancel={() => goBackOr(router, ROUTES.explore.home())}
      /*
       * Lối thoát TƯỜNG MINH cho người chưa muốn có tài khoản: chợ xe của XePrime xem được
       * mà không cần đăng nhập, nhưng nếu chỉ có mũi tên lui ở góc thì không ai đọc ra điều
       * đó. Cùng đích với `onCancel` — khác ở chỗ nó được viết thành chữ.
       */
      onContinueAsGuest={() => goBackOr(router, ROUTES.explore.home())}
    />
  );
}
