import { Ionicons } from '@expo/vector-icons';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import { Pressable, StyleSheet } from 'react-native';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { badgeOffset, CountBadge } from '@/components/ui/CountBadge';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { colors, iconSize, sizing, space } from '@/theme/tokens';
import { useChatBadge } from '../hooks/use-chat';

/**
 * Biểu tượng tin nhắn trên thanh trên — con số là TỔNG cả hai vai, đích đến đi theo nơi thật sự
 * có tin (xem `useChatBadge`).
 *
 * Là component dùng chung vì nó phải có mặt ở CẢ HAI thanh trên, đúng như web đặt cùng một khối
 * ở `MarketHeader` và ở `Topbar` của cổng quản lý. Thiếu nó ở một bên là mở lại đúng lỗ mà
 * `useChatBadge` sinh ra để bịt: chủ gian hàng đang làm việc trong khu quản lý không hề biết
 * khách vừa nhắn vào hộp thư cá nhân của mình, và ngược lại.
 *
 * KHÔNG thay được bằng huy hiệu trên tab hay trên mục menu: hai chỗ đó đếm theo MỘT bề mặt (là
 * đúng — chúng mở đúng hộp thư đó), nên chúng không nói được gì về vai còn lại.
 */
export function ChatBadgeButton({
  surface,
  compact = false,
}: {
  surface: ChatSide;
  /** Vẽ nhỏ lại, vùng chạm giữ nguyên — cho thanh trên CHẬT của khu quản lý. */
  compact?: boolean;
}) {
  const t = useTranslations('Navigation');
  const navigateOnce = useNavigateOnce();
  const chat = useChatBadge(surface);

  // Nhãn theo bề mặt, đúng như web: "Tin nhắn" ở khu khách, "Trò chuyện" ở cổng quản lý.
  const label = surface === CHAT_SIDE.CUSTOMER ? t('public.chat') : t('manage.chat');

  return (
    <Pressable
      onPress={() => navigateOnce(chat.href)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={compact ? Math.ceil((sizing.touchTarget - sizing.compactBox) / 2) : space.xs}
      style={compact ? styles.boxCompact : styles.box}
    >
      <Ionicons
        name="chatbubble-ellipses-outline"
        size={compact ? iconSize.sm : iconSize.md}
        color={colors.text}
      />
      {chat.count > 0 ? (
        <YStack pos="absolute" {...badgeOffset(compact ? sizing.compactBox : sizing.touchTarget, compact ? iconSize.sm : iconSize.md)}>
          <CountBadge count={chat.count} tone="danger" size="sm" />
        </YStack>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    height: sizing.touchTarget,
    justifyContent: 'center',
    width: sizing.touchTarget,
  },
  boxCompact: {
    alignItems: 'center',
    height: sizing.compactBox,
    justifyContent: 'center',
    width: sizing.compactBox,
  },
});
