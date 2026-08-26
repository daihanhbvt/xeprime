import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';

/**
 * Tab "Tin nhắn" — trạng thái rỗng.
 *
 * Chat thật (COM-01) chạy trên projection Firestore + outbox của ADR 0009 và là task riêng.
 * Dựng vỏ rỗng bằng CHÍNH chuỗi `Chat.empty` của web, không bịa câu chữ tạm.
 */
export default function ChatRoute() {
  const t = useTranslations('Chat');

  return (
    <Screen scroll={false}>
      <ScreenMessage
        icon="chatbubble-ellipses-outline"
        title={t('empty')}
        description={t('pickConversation')}
      />
    </Screen>
  );
}
