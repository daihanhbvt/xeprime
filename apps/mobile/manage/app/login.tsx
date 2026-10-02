import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import type { CurrentUser } from '@/features/auth/api';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { LoginScreen } from '@/features/auth/LoginScreen';
import {
  postLoginDestination,
  type LoginMethod,
} from '@/features/auth/post-login-destination';
import { ROUTES } from '@/navigation/routes';

/**
 * Đăng nhập XePrime Partner. Khác bản Customer hai chỗ CỐ Ý:
 *  - không có lối "chưa có tài khoản?" — Partner không đăng ký tài khoản mới (hồ sơ gian hàng
 *    mở từ app XePrime rồi handoff sang);
 *  - KHÔNG có nút lui ở header: màn đăng nhập LÀ màn gốc của app, không có khu công khai
 *    nào để quay về (app XePrime thì ngược lại — lui về chợ xe).
 *
 * Tài khoản ngoài phạm vi app nhận 403 `PARTNER_ACCESS_REQUIRED` từ server — form hiển thị
 * đúng câu của namespace `Errors`, không vào app.
 */
export default function LoginRoute() {
  const router = useRouter();
  const t = useTranslations('Auth');
  const toast = useAppToast();
  const enterApp = useEnterApp();

  function finish(user: CurrentUser, method: LoginMethod) {
    toast.showSuccess(t('login.success'));

    const destination = postLoginDestination(user, method);
    if (destination) {
      router.replace(destination);
      return;
    }

    enterApp(user);
  }

  return (
    <LoginScreen
      onSuccess={finish}
      onForgotPassword={() => router.push(ROUTES.account.forgotPassword())}
    />
  );
}
