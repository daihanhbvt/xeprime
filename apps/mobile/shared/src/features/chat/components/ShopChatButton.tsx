import { useShopChatAvailable } from '@/features/chat/hooks/use-shop-chat-available';
import { ChatWithShopButton } from './ChatWithShopButton';

/**
 * Nút nhắn tin của một GIAN HÀNG, đã qua cổng "khách này có nhắn được không".
 *
 * Câu trả lời nằm ở `useShopChatAvailable` — dùng CHÍNH hook đó ở nơi bày bố cục khi việc ẩn nút
 * phải kéo theo việc bỏ ô chứa nó, đừng dựa vào `null` mà component này trả về.
 */
export function ShopChatButton({
  shopSlug,
  vehicleId,
  tripId,
  publicChatOpen,
  label,
  variant,
  size,
  iconOnly,
  iconTone,
  onNavigate,
}: {
  shopSlug: string;
  vehicleId?: string;
  /** Nhắn về một CHUYẾN (id yêu cầu) — xem `ChatWithShopButton.tripId`. */
  tripId?: string;
  publicChatOpen: boolean;
  label?: string;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  iconTone?: 'primary' | 'surface' | 'accent';
  onNavigate?: () => void;
}) {
  const canChat = useShopChatAvailable(shopSlug, publicChatOpen);

  if (!canChat) return null;

  return (
    <ChatWithShopButton
      {...(vehicleId ? { vehicleId } : { shopSlug })}
      {...(tripId ? { tripId } : {})}
      {...(label ? { label } : {})}
      {...(variant ? { variant } : {})}
      {...(size ? { size } : {})}
      {...(iconOnly ? { iconOnly } : {})}
      {...(iconTone ? { iconTone } : {})}
      {...(onNavigate ? { onNavigate } : {})}
    />
  );
}
