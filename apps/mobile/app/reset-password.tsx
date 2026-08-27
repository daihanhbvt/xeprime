import { useLocalSearchParams, useRouter } from 'expo-router';
import { ResetPasswordScreen } from '@/features/auth/ResetPasswordScreen';
import { ROUTES } from '@/navigation/routes';

export default function ResetPasswordRoute() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  function leaveTo(href: Parameters<typeof router.replace>[0]) {
    if (router.canGoBack()) router.dismissAll();
    router.replace(href);
  }

  return (
    <ResetPasswordScreen
      token={token ?? null}
      onRequestNewLink={() => leaveTo(ROUTES.account.forgotPassword())}
      onBackToLogin={() => leaveTo(ROUTES.account.login())}
    />
  );
}
