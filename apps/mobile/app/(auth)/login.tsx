import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { LoginForm } from '@/features/auth/components/LoginForm';

export default function LoginScreen() {
  const router = useRouter();
  const t = useTranslations('Common.actions');

  // `replace` chứ không `push`: hai màn của base là hai điểm vào ngang hàng, không xếp chồng.
  const goHome = () => router.replace('/home');

  return (
    <Screen centered>
      <LoginForm onSuccess={goHome} />
      <Button label={t('goToHome')} variant="secondary" onPress={goHome} />
    </Screen>
  );
}
