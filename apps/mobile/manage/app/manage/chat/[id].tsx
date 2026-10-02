import { useLocalSearchParams } from 'expo-router';
import { CHAT_SIDE } from '@xeprime/types';
import { ChatThreadScreen } from '@/features/chat/ChatThreadScreen';

/**
 * Một hội thoại trong inbox GIAN HÀNG.
 *
 * Nằm ở stack BỌC NGOÀI bộ tab quản lý (không phải trong `(tabs)`) như mọi màn đi sâu khác của
 * khu này: mở từ danh sách rồi bấm lui phải trả về đúng danh sách đó, còn nguyên bộ lọc và vị
 * trí cuộn — xem docblock `app/manage/_layout.tsx`.
 *
 * KHÔNG có `?v=`: ngữ cảnh xe là thứ khách mang theo từ một tin đăng, và gian hàng không đi vào
 * chat từ tin đăng của chính mình.
 */
export default function ManageChatThreadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <ChatThreadScreen conversationId={id} side={CHAT_SIDE.SHOP} />;
}
