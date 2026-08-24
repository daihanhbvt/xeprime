import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';

export default function NotFoundScreen() {
  const router = useRouter();
  const t = useTranslations('Common');

  return (
    <Screen scroll={false} centered>
      <ScreenMessage
        title={t('notFound.title')}
        description={t('notFound.description')}
        actionLabel={t('actions.backHome')}
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
