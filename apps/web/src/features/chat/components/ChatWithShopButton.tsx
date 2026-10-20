'use client';

import { MessageOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
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
 *
 * `appearance="cta"` vẽ nút bằng `CtaButton` gradient (bảng nút v2, ADR 0062) cho những màn mà
 * nhắn tin là VIỆC CHÍNH — chuyến chờ chủ xe phản hồi. Ghi đè `.ant-btn` thành gradient ở từng màn
 * là đúng cách bảng nút trôi khỏi thiết kế mà `CtaButton` sinh ra để chặn.
 */
export function ChatWithShopButton({
  vehicleId,
  shopSlug,
  block,
  size,
  className,
  label,
  type,
  appearance = 'antd',
  ctaVariant = 'gradient',
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
   * `antd` — `Button` của khu quản lý/trang xe · `cta` — nút gradient 48px của màn v2. Hình thái
   * `cta` có cỡ và màu CỐ ĐỊNH của bảng nút, nên bỏ qua `size`/`type`; `block`/`className` vẫn áp.
   * `icon` — nút CHỈ có icon (tròn cạnh tên chủ xe ở chuyến đã xác nhận, Figma `19879:73248`):
   * `label` thành `aria-label`, hình dáng do `className` của nơi gọi quyết.
   */
  appearance?: 'antd' | 'cta' | 'icon';
  /**
   * Hình thái của `CtaButton` khi `appearance="cta"` — `gradient` khi nhắn tin là VIỆC CHÍNH của
   * màn, `neutral` (viền xám) khi nó là một lối phụ đứng cạnh nút chính khác (chuyến chờ giữ chỗ,
   * nơi việc chính là thanh toán).
   */
  ctaVariant?: 'gradient' | 'neutral';
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

  if (appearance === 'icon') {
    return (
      <button
        type="button"
        className={className}
        aria-label={buttonLabel}
        title={buttonLabel}
        aria-busy={start.isPending || undefined}
        disabled={start.isPending}
        onClick={startChat}
      >
        <MessageOutlined aria-hidden />
      </button>
    );
  }

  if (appearance === 'cta') {
    return (
      <CtaButton
        variant={ctaVariant}
        size="form"
        block={block}
        className={className}
        iconStart={<MessageOutlined />}
        loading={start.isPending}
        onClick={startChat}
      >
        {buttonLabel}
      </CtaButton>
    );
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
