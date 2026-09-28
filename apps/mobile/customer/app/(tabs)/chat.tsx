import { CHAT_SIDE } from '@xeprime/types';
import { ListRowSkeleton } from '@/components/ui/Skeleton';
import { RequireSession } from '@/features/auth/RequireSession';
import { ChatListScreen } from '@/features/chat/ChatListScreen';

/**
 * Tab "Tin nhắn" — hộp thư KHÁCH (`side = customer`). Inbox gian hàng là một bề mặt khác, ở
 * `/manage/chat`.
 *
 * Cổng phiên ở đây chứ không trong màn: một deep link `xeprime://chat` mở thẳng màn này, và ẩn
 * tab không phải chặn nó.
 */
export default function ChatRoute() {
  return (
    <RequireSession fallback={<ChatListFallback />}>
      <ChatListScreen side={CHAT_SIDE.CUSTOMER} />
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
