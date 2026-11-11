import { StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { IconDisc } from '@/components/ui/IconDisc';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';

/**
 * Dòng thay ô soạn tin khi hội thoại bị chặn (App Store 1.2) — bản native của `BlockedNotice`
 * web, kiểu Messenger: không đóng khung, đĩa icon đỏ + câu giải thích căn GIỮA ở cuối hội thoại.
 * Bỏ chặn đi qua menu "..." ở đầu màn.
 */
export function BlockedNotice({ text }: { text: string }) {
  const colors = useColors();
  return (
    <YStack
      ai="center"
      gap={space.sm}
      px={space.xl}
      pt={space.md}
      pb={space.lg}
      borderTopWidth={StyleSheet.hairlineWidth}
      borderTopColor={colors.border}
      accessibilityRole="text"
    >
      <IconDisc icon="ban-outline" tone={colors.danger} size={36} />
      <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
        {text}
      </Text>
    </YStack>
  );
}
