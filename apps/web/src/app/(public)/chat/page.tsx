import { CHAT_SIDE } from '@xeprime/types';
import type { Metadata } from 'next';
import { ChatView } from '@/features/chat/components/ChatView';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.public');
  return { title: t('chat') };
}

/**
 * Hộp thư của KHÁCH — chỉ những hội thoại mà tài khoản này đứng ở phía người thuê.
 *
 * `side` truyền xuống server qua `ChatView`; một chủ gian hàng mở trang này chỉ thấy các cuộc
 * họ đi thuê xe của người khác, không thấy inbox công việc của shop mình. `?c=` mở sẵn một
 * hội thoại kể cả khi nó không nằm ở trang đầu.
 */
export default async function CustomerChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return <ChatView side={CHAT_SIDE.CUSTOMER} initialConversationId={c ?? null} />;
}
