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
import { useTranslations } from 'next-intl';

/**
 * Nút nhắn cho gian hàng — mở/lấy hội thoại rồi chuyển sang khu tin nhắn của khách.
 *
 * Hai đường vào, một nút: từ một chiếc XE (trang chi tiết, overlay đặt xe) thì truyền
 * `vehicleId`; từ trang GIAN HÀNG thì truyền `shopSlug`. Cả hai rơi vào đúng một thread vì danh
 * tính hội thoại là (khách, gian hàng) — nên hai nút riêng sẽ chỉ nhân đôi đúng phần khó ở đây:
 * bắt 401, mở modal đăng nhập tại chỗ, và TỰ CHẠY LẠI hành động sau khi đăng nhập xong.
 */
export function ChatWithShopButton({
  vehicleId,
  shopSlug,
  block,
  size,
  className,
  label,
  type,
  onNavigate,
}: {
  /** Nhắn từ một chiếc xe — xe đi kèm làm thẻ ngữ cảnh cho câu nhắn đầu tiên. */
  vehicleId?: string;
  /** Nhắn từ trang gian hàng, khi chưa có chiếc xe nào đang mở. */
  shopSlug?: string;
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
  const t = useTranslations('Chat');
  const buttonLabel = label ?? t('messageShop');
  const { message } = App.useApp();
  const router = useRouter();
  const start = useStartConversation();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  function startChat() {
    start.mutate(vehicleId ? { vehicleId } : { shopSlug }, {
      onSuccess: (conversation) => {
        onNavigate?.();
        // `v` = xe đang xem. Hội thoại thuộc về GIAN HÀNG (một thread cho mọi xe của shop), nên
        // chiếc xe phải đi kèm riêng để ô soạn tin gắn được thẻ ngữ cảnh vào câu đầu tiên. Vào
        // từ trang gian hàng thì không có xe nào để gắn — bỏ hẳn tham số, đừng gửi `v=undefined`.
        const query = vehicleId ? `?c=${conversation.id}&v=${vehicleId}` : `?c=${conversation.id}`;
        router.push(`${ROUTES.CHAT}${query}`);
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
      {buttonLabel}
    </Button>
  );
}
