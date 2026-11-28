import { ActivityIndicator } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { radius, space, typeScale } from '@/theme/tokens';

/** Ô vuông giữ chỗ - cùng cỡ icon loại tệp của dòng tệp (`ReceiptAttachmentRow`). */
const TILE = 40;

/**
 * Dòng "đang tải tệp lên" - CÙNG khuôn với dòng tệp đã tải (viền, bo, đệm, ô 40), chỉ thay icon
 * bằng vòng quay. Một vòng quay trần cạnh dòng chữ nhỏ trông như lỗi giao diện; dòng giữ chỗ cho
 * thấy tệp sắp hiện đúng ở vị trí đó (người dùng chốt 27/11/2026).
 */
export function UploadingFileRow({ label, detail }: { label: string; detail?: string | undefined }) {
  const colors = useColors();
  return (
    <XStack
      ai="center"
      gap={space.md}
      px={space.lg}
      py={space.md}
      br={radius.control}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
      accessibilityLiveRegion="polite"
      accessibilityLabel={detail ? `${label} ${detail}` : label}
    >
      <YStack w={TILE} h={TILE} ai="center" jc="center" br={radius.sm} bg={colors.surfaceMuted}>
        <ActivityIndicator size="small" color={colors.brandShape} />
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontFamily={FONT_FAMILY.medium}>
          {label}
        </Text>
        {detail ? (
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}
