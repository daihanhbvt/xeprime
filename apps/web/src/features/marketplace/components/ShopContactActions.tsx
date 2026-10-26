'use client';

import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { useTranslations } from 'next-intl';

/**
 * Liên hệ ở thẻ danh tính trang gian hàng — client island nhỏ nhất có thể, để phần còn lại của
 * đầu trang ở lại Server Component (SEO của khu `(public)`).
 *
 * Nút tròn chỉ có icon ở góc phải hàng danh tính (Figma `20063:59358`); chữ "Nhắn tin" thành tên
 * khả truy cập và tooltip. Hình dáng do `className` của đầu trang quyết.
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
 * phần tử flex rỗng trong thẻ danh tính.
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
  const t = useTranslations('Shops.profile');

  return (
    <ShopChatButton
      shopSlug={slug}
      publicChatOpen={chatOpen}
      appearance="icon"
      label={t('message')}
      {...(className ? { className } : {})}
    />
  );
}
