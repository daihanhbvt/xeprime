import type { ConversationSummary } from '@xeprime/api-client';
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Avatar } from '@/components/ui/Avatar';
import { CountBadge } from '@/components/ui/CountBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';
import { layout } from '@/theme/layout';

/**
 * Một dòng trong danh sách tin nhắn.
 *
 * `memo` không phải trang trí: mỗi nhịp poll làm màn render lại, và không có nó thì cả danh sách
 * dựng lại theo dù không dòng nào đổi — thấy rõ thành giật khi vừa cuộn vừa tới nhịp hỏi tin.
 */
export const ConversationRow = memo(function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary;
  onPress: (conversation: ConversationSummary) => void;
}) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const unread = conversation.unread > 0;
  const preview =
    conversation.lastMessageText ??
    (conversation.vehicleName
      ? t('about', { subject: conversation.vehicleName })
      : t('startConversation'));

  return (
    <Pressable
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={conversation.partyName}
      style={styles.row}
    >
      <XStack ai="center" gap={space.md}>
        <Avatar name={conversation.partyName} url={conversation.partyAvatarUrl} size={44} />

        <YStack f={1} gap={2}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              numberOfLines={1}
              col={colors.text}
              fos={fontSize.body}
              fow={unread ? fontWeight.bold : fontWeight.semibold}
            >
              {conversation.partyName}
            </Text>
            {conversation.lastMessageAt ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {fmt.shortDateTime(conversation.lastMessageAt)}
              </Text>
            ) : null}
          </XStack>

          {conversation.vehicleName ? (
            <Text numberOfLines={1} col={colors.primaryActive} fos={fontSize.label}>
              {conversation.vehicleName}
            </Text>
          ) : null}

          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              numberOfLines={1}
              col={unread ? colors.text : colors.textMuted}
              fos={fontSize.bodySm}
              fow={unread ? fontWeight.semibold : fontWeight.regular}
            >
              {preview}
            </Text>
            {unread ? <CountBadge count={conversation.unread} /> : null}
          </XStack>
        </YStack>
      </XStack>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    borderBottomColor: colors.borderSubtle,
    borderBottomWidth: 1,
    // Sàn chạm 44pt/48dp — dòng thấp hơn thì ngón cái trượt sang cuộc trò chuyện bên cạnh.
    minHeight: sizing.touchTarget + space.md,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
  },
});
