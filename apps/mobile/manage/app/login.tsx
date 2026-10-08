import { Redirect, useRouter, type Href } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import type { CurrentUser } from '@/features/auth/api';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { postLoginDestination, type LoginMethod } from '@/features/auth/post-login-destination';
import { ROUTES } from '@/navigation/routes';
import { usePendAuthNext } from '@/features/auth/auth-next';
import { SESSION_STATUS, useSessionGate } from '@/features/auth/hooks/use-session-gate';

/**
 * Đăng nhập XePrime Partner — tài khoản ĐỐI TÁC (realm `partner`, ADR 0053): chủ xe cá nhân tuyến
 * hoa hồng, gian hàng tuyến gói và nhân viên gian hàng. Khác bản Customer:
 *  - lối "chưa có tài khoản?" dẫn tới tạo tài khoản ĐỐI TÁC (cùng SĐT với tài khoản khách cũng được);
 *  - KHÔNG có nút lui ở header: màn đăng nhập LÀ màn gốc của app, không có khu công khai nào để
 *    quay về (app XePrime thì ngược lại — lui về chợ xe).
 */
export default function LoginRoute() {
  const router = useRouter();
  const t = useTranslations('Auth');
  const toast = useAppToast();
  const enterApp = useEnterApp();

  /*
   * Mở từ app XePrime (hoặc link khác) kèm `?next=`: cất đích để vào thẳng đó sau khi xong. Đã có
   * phiên sẵn thì không bắt đăng nhập/đăng ký lần nữa — đi thẳng tới đích.
   */
  const session = useSessionGate();
  const signedIn = session.status === SESSION_STATUS.READY;
  const next = usePendAuthNext({ enabled: !signedIn });
  if (signedIn && next) {
    return <Redirect href={next as Href} />;
  }

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
      onSwitchToRegister={() => router.push(ROUTES.account.register())}
    />
  );
}
