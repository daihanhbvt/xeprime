import { CHAT_SIDE, OWNER_STAGE } from '@xeprime/types';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { ChatView } from '@/features/chat/components/ChatView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation.account');
  return { title: t('messages'), robots: { index: false, follow: false } };
}

/**
 * Hộp thư phía CHỦ XE trong khu tài khoản — `side=shop`, cùng `ChatView` với `/manage/chat`.
 *
 * Tồn tại vì chủ xe tuyến hoa hồng không vào cổng quản lý được (ADR 0027/0028) và `/chat` là hộp
 * thư phía KHÁCH: nó chỉ hiện những cuộc họ đi thuê xe của người khác. Không có trang này thì
 * chặn `/manage` đồng nghĩa với cắt đứt liên lạc giữa họ và khách thuê xe của chính họ.
 *
 * Cổng ở mức `registering`: khách có thể nhắn tin từ trước khi chiếc xe đầu tiên được duyệt, và
 * một tin nhắn không đọc được vì cổng đóng là một khách mất.
 */
export default async function AccountMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <ChatView side={CHAT_SIDE.SHOP} initialConversationId={c ?? null} />
    </OwnerGate>
  );
}
