import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { ROUTES } from '@/navigation/routes';

export default function NotFoundScreen() {
  const router = useRouter();
  const t = useTranslations('MobileShell');

  return (
    <Screen scroll={false} centered>
      <ScreenMessage
        title={t('notFound.title')}
        description={t('notFound.description')}
        actionLabel={t('nav.backHome')}
        onAction={() => router.replace(ROUTES.root.index())}
      />
    </Screen>
  );
}
