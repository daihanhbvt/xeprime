import { useRouter } from 'expo-router';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { RegisterScreen } from '@/features/auth/RegisterScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

export default function RegisterRoute() {
  const router = useRouter();
  const enterApp = useEnterApp();

  return (
    <RegisterScreen
      onAuthenticated={() => enterApp()}
      onRegistered={() => enterApp()}
      onOpenAccount={() => {
        enterApp();
        router.push(ROUTES.account.home());
      }}
      onSwitchToLogin={() => router.replace(ROUTES.account.login())}
      onCancel={() => goBackOr(router, ROUTES.explore.home())}
    />
  );
}
