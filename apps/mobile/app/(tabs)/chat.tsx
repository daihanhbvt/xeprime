import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { RequireSession } from '@/features/auth/RequireSession';

export default function ChatRoute() {
  const t = useTranslations('Chat');

  return (
    <RequireSession>
      <Screen edges={['left', 'right']} scroll={false}>
        <ScreenMessage
          icon="chatbubble-ellipses-outline"
          title={t('empty')}
          description={t('pickConversation')}
        />
      </Screen>
    </RequireSession>
  );
}
