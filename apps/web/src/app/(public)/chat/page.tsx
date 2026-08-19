import type { Metadata } from 'next';
import { ChatView } from '@/features/chat/components/ChatView';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.public');
  return { title: t('chat') };
}

/** Khu tin nhắn của khách (chat với shop). `?c=<id>` để mở sẵn một hội thoại. */
export default async function CustomerChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return <ChatView initialConversationId={c ?? null} />;
}
