'use client';

import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { cx } from '@/lib/cx';
import { useTranslations } from 'next-intl';
import styles from './ShopContactActions.module.css';

/**
 * Liên hệ ở thẻ danh tính trang gian hàng — client island nhỏ nhất có thể, để phần còn lại của
 * đầu trang ở lại Server Component (SEO của khu `(public)`).
 *
 * ## Không có nút "Gọi", và không có số điện thoại
 *
 * Trang này không cần đăng nhập, nên một số điện thoại in ra ở đây là số bị công khai cho mọi
 * trình thu thập. Backend đã thôi trả `phone` trong `PublicShopDto` — xem docblock ở đó. Liên hệ
 * đi qua hộp thư trong ứng dụng; số điện thoại tới tay khách ở bước bàn giao.
 *
 * ## Nút nhắn tin xuất hiện theo NGƯỜI ĐANG XEM
 *
 * Gian hàng tuyến gói: luôn có. Chủ xe tuyến hoa hồng: chỉ có với khách đã gửi yêu cầu thuê cho
 * họ — trước đó chỗ này trống hẳn, không nút và không dòng giải thích nào. `ShopChatButton` lo
 * cả hai vế; chặn thật nằm ở `ChatService` (`CHAT_REQUIRES_BOOKING`).
 *
 * KHÔNG có `<div>` bọc quanh nút: nút tự biến mất được, và một lớp bọc luôn render sẽ để lại một
 * phần tử flex rỗng trong thẻ danh tính — vô hình trên desktop, nhưng dưới 900px nó là một hàng
 * kéo hết chiều ngang mà không ai thấy có gì trong đó.
 */
export function ShopContactActions({
  slug,
  chatOpen,
  className,
}: {
  slug: string;
  chatOpen: boolean;
  className?: string;
}) {
  const t = useTranslations('Shops.header');

  return (
    <ShopChatButton
      shopSlug={slug}
      publicChatOpen={chatOpen}
      type="primary"
      size="large"
      label={t('message')}
      className={cx(styles.button, className)}
    />
  );
}
