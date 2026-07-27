'use client';

import { MessageOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage, isUnauthenticated } from '@/services/api-client';
import { useStartConversation } from '../hooks/use-chat-mutations';

/** Nút "Nhắn shop" ở trang chi tiết xe — mở/lấy hội thoại rồi mở khu tin nhắn của khách. */
export function ChatWithShopButton({
  vehicleId,
  block,
  size,
  className,
}: {
  vehicleId: string;
  block?: boolean;
  size?: 'middle' | 'large';
  className?: string;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const start = useStartConversation();

  const onClick = () => {
    start.mutate(vehicleId, {
      onSuccess: (conversation) => router.push(`${ROUTES.CHAT}?c=${conversation.id}`),
      onError: (err) => {
        if (isUnauthenticated(err)) {
          router.push(`${ROUTES.LOGIN}?next=${encodeURIComponent(ROUTES.CHAT)}`);
          return;
        }
        message.error(getErrorMessage(err));
      },
    });
  };

  return (
    <Button
      icon={<MessageOutlined />}
      block={block}
      size={size}
      className={className}
      loading={start.isPending}
      onClick={onClick}
    >
      Nhắn shop
    </Button>
  );
}
