import { useLocalSearchParams } from 'expo-router';
import { RequireSession } from '@/features/auth/RequireSession';
import { ChatThreadScreen } from '@/features/chat/ChatThreadScreen';

/**
 * Một cuộc trò chuyện. Route RIÊNG (không phải sheet trong tab) để nút lui của Android, cử chỉ
 * vuốt của iOS và deep link `xeprime://chat/<id>` đều hoạt động như người dùng mong đợi.
 */
export default function ChatThreadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireSession>
      <ChatThreadScreen conversationId={id} />
    </RequireSession>
  );
}
