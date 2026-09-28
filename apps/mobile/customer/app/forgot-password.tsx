import { useRouter } from 'expo-router';
import { ForgotPasswordScreen } from '@/features/auth/ForgotPasswordScreen';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';

export default function ForgotPasswordRoute() {
  const router = useRouter();

  return (
    <ForgotPasswordScreen
      onBackToLogin={() => goBackOr(router, ROUTES.account.login())}
    />
  );
}
