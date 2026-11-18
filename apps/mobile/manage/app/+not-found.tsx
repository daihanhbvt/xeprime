import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { ROUTES } from '@/navigation/routes';

export default function NotFoundScreen() {
  const router = useRouter();
  // Chữ chung với trang 404 của web (`Common.statePages`, Figma `22306:65272`).
  const tState = useTranslations('Common.statePages');

  return (
    <Screen scroll={false} centered>
      <ScreenMessage
        kind="not-found"
        title={tState('notFound.title')}
        description={tState('notFound.description')}
        actionLabel={tState('backHome')}
        onAction={() => router.replace(ROUTES.root.index())}
      />
    </Screen>
  );
}
