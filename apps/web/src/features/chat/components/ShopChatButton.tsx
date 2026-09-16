'use client';

import { ChatWithShopButton } from './ChatWithShopButton';
import { useChatEligibility } from '../hooks/use-chat-eligibility';

/**
 * Nút nhắn cho gian hàng, ĐÃ GÁC theo người đang xem.
 *
 * ## Vì sao cần một lớp bọc thay vì tự kiểm ở mỗi trang
 *
 * Luật mở kênh có hai vế, và chúng sống ở hai tầng khác nhau:
 *
 *  - **Vế công khai** — gian hàng tuyến gói mở hộp thư cho mọi người. Đây là thuộc tính của gian
 *    hàng, đi kèm dữ liệu trang (`chatOpen` / `shopChatOpen`) và cache chung được.
 *  - **Vế theo người xem** — chủ xe tuyến hoa hồng mở kênh cho khách ĐÃ gửi yêu cầu thuê. Câu
 *    này khác nhau với từng người, nên nó không thể nằm trong một hồ sơ gian hàng cache 60 giây;
 *    nó phải là một lượt hỏi riêng, sau khi đã biết người xem là ai.
 *
 * Gộp hai vế vào một component để mọi bề mặt (trang gian hàng, trang chi tiết xe) hỏi cùng một
 * câu và ra cùng một đáp án. Hai trang tự ghép luật là hai chỗ để luật lệch nhau.
 *
 * ## Không có trạng thái trung gian
 *
 * Trong lúc chờ trả lời: không vẽ gì. Một nút loading rồi biến mất tệ hơn hẳn một khoảng trống
 * rồi hiện nút — cái đầu làm người dùng thấy thứ họ vừa định bấm bị lấy đi.
 */
export function ShopChatButton({
  shopSlug,
  vehicleId,
  publicChatOpen,
  label,
  size,
  type,
  className,
  onNavigate,
}: {
  /** Slug gian hàng — luôn cần, vì lượt hỏi "tôi được nhắn chưa" đi theo gian hàng. */
  shopSlug: string;
  /** Nhắn TỪ một chiếc xe: xe đi kèm làm thẻ ngữ cảnh cho câu nhắn đầu tiên. */
  vehicleId?: string;
  /** Gian hàng mở hộp thư công khai (backend chấm) — đúng thì bỏ qua lượt hỏi theo người xem. */
  publicChatOpen: boolean;
  label?: string;
  size?: 'middle' | 'large';
  type?: 'default' | 'primary';
  className?: string;
  onNavigate?: () => void;
}) {
  const eligibility = useChatEligibility(shopSlug, { enabled: !publicChatOpen });

  if (!publicChatOpen && eligibility.data?.canChat !== true) return null;

  return (
    <ChatWithShopButton
      {...(vehicleId ? { vehicleId } : { shopSlug })}
      {...(label ? { label } : {})}
      {...(size ? { size } : {})}
      {...(type ? { type } : {})}
      {...(className ? { className } : {})}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );
}
