import { ChatView } from '@/features/chat/components/ChatView';

/** Tin nhắn khu quản lý (shop). `?c=<id>` để mở sẵn một hội thoại. */
export default async function ManageChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return <ChatView initialConversationId={c ?? null} />;
}
