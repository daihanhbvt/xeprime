import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { ROUTES } from '@/navigation/routes';

/**
 * Fallback an toàn cho mọi đích KHÁCH mà code dùng chung tham chiếu (`ROUTES.explore.*`,
 * `booking.*`, `chat.*`… — xem `src/navigation/routes.ts`): phần đó sống ở app XePrime,
 * không phải một màn trắng hay một cú crash typed-routes.
 */
export default function NotAvailableRoute() {
  const router = useRouter();
  const t = useTranslations('MobileShell.partner');

  return (
    <Screen scroll={false} centered>
      <ScreenMessage
        icon="phone-portrait-outline"
        title={t('notAvailableTitle')}
        description={t('notAvailableDescription')}
        actionLabel={t('later')}
        onAction={() => router.replace(ROUTES.root.index())}
      />
    </Screen>
  );
}
