import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { RequireSession } from '@/features/auth/RequireSession';
import { ChatListScreen } from '@/features/chat/ChatListScreen';

/**
 * Tab "Tin nhắn". Cổng phiên ở đây chứ không trong màn: một deep link `xeprime://chat` hay một
 * thông báo đẩy mở thẳng màn này, và ẩn tab không phải chặn nó.
 */
export default function ChatRoute() {
  return (
    <RequireSession fallback={<ChatListFallback />}>
      <ChatListScreen />
    </RequireSession>
  );
}

function ChatListFallback() {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <ListRowSkeleton key={row} />
      ))}
    </>
  );
}
