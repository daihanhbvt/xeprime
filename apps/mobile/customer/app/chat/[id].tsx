import { useLocalSearchParams } from 'expo-router';
import { CHAT_SIDE } from '@xeprime/types';
import { RequireSession } from '@/features/auth/RequireSession';
import { ChatThreadScreen } from '@/features/chat/ChatThreadScreen';

/**
 * Một cuộc trò chuyện phía KHÁCH. Route RIÊNG (không phải sheet trong tab) để nút lui của
 * Android, cử chỉ vuốt của iOS và deep link `xeprime://chat/<id>` đều hoạt động như mong đợi.
 *
 * `v` = xe khách vừa bấm "Nhắn shop" từ tin đăng của nó, `t` = CHUYẾN (id yêu cầu) vừa bấm "Nhắn"
 * từ chuyến đi — ngữ cảnh CHỜ gắn vào câu đầu tiên, đúng vai của `?v=`/`?t=` bên web.
 */
export default function ChatThreadRoute() {
  const { id, v, t } = useLocalSearchParams<{ id: string; v?: string; t?: string }>();

  return (
    <RequireSession>
      <ChatThreadScreen
        conversationId={id}
        side={CHAT_SIDE.CUSTOMER}
        pendingVehicleId={v ?? null}
        pendingTripId={t ?? null}
      />
    </RequireSession>
  );
}
