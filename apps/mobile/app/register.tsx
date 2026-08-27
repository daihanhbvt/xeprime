import { useRouter } from 'expo-router';
import { enterApp } from '@/features/auth/enter-app';
import { RegisterScreen } from '@/features/auth/RegisterScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

export default function RegisterRoute() {
  const router = useRouter();

  return (
    <RegisterScreen
      onAuthenticated={() => enterApp(router)}
      onRegistered={() => enterApp(router)}
      onOpenAccount={() => {
        enterApp(router);
        router.push(ROUTES.account.home());
      }}
      onSwitchToLogin={() => router.replace(ROUTES.account.login())}
      onCancel={() => goBackOr(router, ROUTES.explore.home())}
    />
  );
}
