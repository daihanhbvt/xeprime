import { CHAT_SIDE } from '@xeprime/types';
import { ChatListScreen } from '@/features/chat/ChatListScreen';

/** Inbox GIAN HÀNG (`side = shop`) — cùng địa chỉ với web `/manage/chat`. */
export default function ManageChatRoute() {
  return <ChatListScreen side={CHAT_SIDE.SHOP} />;
}
