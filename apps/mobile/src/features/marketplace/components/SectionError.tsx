import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * Lỗi CỤC BỘ của một khối trang chủ — hỏng một mục không kéo cả trang về màn lỗi.
 *
 * Chữ đến từ MÃ lỗi qua `useErrorMessage`, không bao giờ từ `message` tiếng Việt của backend
 * (ADR 0012).
 */
export function SectionError({
  title,
  error,
  action,
}: {
  title: string;
  error: unknown;
  /** Lối thoát khi khối hỏng — web đính một nút ngay trong cảnh báo, không để ngõ cụt. */
  action?: { label: string; onPress: () => void };
}) {
  const errorMessage = useErrorMessage();

  return (
    <XStack
      bg={colors.dangerSurface}
      br={radius.md}
      p={space.md}
      gap={space.sm}
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle-outline" size={iconSize.lg} color={colors.danger} />
      <YStack f={1} gap={2}>
        <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {title}
        </Text>
        <Text col={colors.danger} fos={fontSize.bodySm}>
          {errorMessage(error)}
        </Text>
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            hitSlop={space.xs}
            style={{
              alignSelf: 'flex-start',
              minHeight: sizing.touchTarget,
              justifyContent: 'center',
            }}
          >
            <Text
              col={colors.danger}
              fos={fontSize.bodySm}
              fow={fontWeight.semibold}
              textDecorationLine="underline"
            >
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </YStack>
    </XStack>
  );
}
