import { CHAT_SIDE } from '@xeprime/types';
import { ChatView } from '@/features/chat/components/ChatView';

/**
 * Inbox của GIAN HÀNG — chỉ hội thoại thuộc gian hàng mà tài khoản này là thành viên active.
 *
 * Không trộn các hội thoại mà chính họ là khách (chủ shop đi thuê xe của shop khác): server lọc
 * theo `side=shop` và loại luôn những cuộc có `customerUserId` là chính người đang xem.
 */
export default async function ManageChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return <ChatView side={CHAT_SIDE.SHOP} initialConversationId={c ?? null} />;
}
