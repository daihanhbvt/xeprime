import { CHAT_SIDE } from '@xeprime/types';
import { ChatListScreen } from '@/features/chat/ChatListScreen';

/**
 * Inbox GIAN HÀNG (`side = shop`) - cùng địa chỉ với web `/manage/chat`. Trang RIÊNG ở stack ngoài
 * (không thanh menu, không ManageHeader): bấm một hội thoại mở trang tin nhắn chồng lên, lui về đây.
 */
export default function ManageChatRoute() {
  return <ChatListScreen side={CHAT_SIDE.SHOP} />;
}
