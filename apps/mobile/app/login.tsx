import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import type { CurrentUser } from '@/features/auth/api';
import { enterApp } from '@/features/auth/enter-app';
import { LoginScreen } from '@/features/auth/LoginScreen';
import {
  postLoginDestination,
  type LoginMethod,
} from '@/features/auth/post-login-destination';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

export default function LoginRoute() {
  const router = useRouter();
  const t = useTranslations('Auth');
  const toast = useAppToast();

  /**
   * Chỗ DUY NHẤT biết "đăng nhập xong thì đi đâu" — đúng vai `finish()` của `AuthPanel` bên web.
   * Ba form chỉ báo "xong, đây là hồ sơ"; chúng không biết màn đặt mật khẩu tồn tại.
   */
  function finish(user: CurrentUser, method: LoginMethod) {
    toast.showSuccess(t('login.success'));

    // Luật "đi đâu" nằm ở `postLoginDestination` — hàm thuần, có test, khớp với web.
    const destination = postLoginDestination(user, method);
    if (destination) {
      router.replace(destination);
      return;
    }

    enterApp(router);
  }

  return (
    <LoginScreen
      onSuccess={finish}
      onForgotPassword={() => router.push(ROUTES.account.forgotPassword())}
      onSwitchToRegister={() => router.replace(ROUTES.account.register())}
      onCancel={() => goBackOr(router, ROUTES.explore.home())}
    />
  );
}
