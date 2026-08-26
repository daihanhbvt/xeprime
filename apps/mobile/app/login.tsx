import { useRouter } from 'expo-router';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { ROUTES } from '@/navigation/routes';

export default function LoginRoute() {
  const router = useRouter();

  return (
    <LoginScreen
      // Về Khám phá chứ không `back()`: đăng nhập xong thanh tab mới xuất hiện, và Khám phá là
      // tab đầu tiên. `replace` để bấm Back không quay lại chính màn đăng nhập.
      onSuccess={() => router.replace(ROUTES.explore.home())}
      onCancel={() => (router.canGoBack() ? router.back() : router.replace(ROUTES.explore.home()))}
    />
  );
}
