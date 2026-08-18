'use client';

import { MessageOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import {
  useAuthModal,
  useNextFromCurrentPath,
} from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { getErrorMessage, isUnauthenticated } from '@/services/api-client';
import { useStartConversation } from '../hooks/use-chat-mutations';

/** Nút "Nhắn shop" ở trang chi tiết xe — mở/lấy hội thoại rồi mở khu tin nhắn của khách. */
export function ChatWithShopButton({
  vehicleId,
  block,
  size,
  className,
  label = 'Nhắn shop',
  type,
  onNavigate,
}: {
  vehicleId: string;
  block?: boolean;
  size?: 'middle' | 'large';
  className?: string;
  /** Nhãn theo ngữ cảnh — trang xe dùng "Nhắn shop", màn gửi yêu cầu xong dùng "Nhắn chủ xe". */
  label?: string;
  type?: 'default' | 'primary';
  /**
   * Gọi NGAY TRƯỚC khi rời trang. Nút này tự điều hướng sang khu tin nhắn, nên nơi gọi nằm
   * trong overlay phải có chỗ đóng overlay lại — nếu không nó treo trên màn chat mới.
   */
  onNavigate?: () => void;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const start = useStartConversation();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  function startChat() {
    start.mutate(vehicleId, {
      onSuccess: (conversation) => {
        onNavigate?.();
        router.push(`${ROUTES.CHAT}?c=${conversation.id}`);
      },
      onError: (err) => {
        if (isUnauthenticated(err)) {
          // Mở modal ngay trên trang xe và TỰ CHẠY LẠI hành động sau khi đăng nhập — khách
          // không phải nhớ mình đang định nhắn shop nào. `next` là lưới an toàn nếu họ F5.
          open({
            mode: AUTH_MODE.LOGIN,
            next: nextFromHere(),
            onSuccess: () => startChat(),
          });
          return;
        }
        message.error(getErrorMessage(err));
      },
    });
  }

  return (
    <Button
      icon={<MessageOutlined />}
      type={type}
      block={block}
      size={size}
      className={className}
      loading={start.isPending}
      onClick={startChat}
    >
      {label}
    </Button>
  );
}
