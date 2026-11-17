import { memo } from 'react';
import { XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

export interface StackedBarSegment {
  key: string;
  value: number;
  color: string;
}

/**
 * Thanh CHỒNG nhiều đoạn theo tỉ lệ (Figma "Marketplace status bar" `24175:52540`): cao 8, bo hết
 * cỡ, các đoạn cách 2. Đoạn bằng 0 không vẽ; tổng bằng 0 thì chỉ còn rãnh xám.
 */
export const StackedBar = memo(function StackedBar({
  segments,
  accessibilityLabel,
}: {
  segments: readonly StackedBarSegment[];
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const visible = segments.filter((segment) => segment.value > 0);
  return (
    <XStack
      h={HEIGHT}
      gap={GAP}
      br={radius.pill}
      ov="hidden"
      bg={visible.length === 0 ? colors.surfaceMuted : 'transparent'}
      accessible
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {visible.map((segment) => (
        <YStack key={segment.key} h={HEIGHT} f={segment.value} bg={segment.color} />
      ))}
    </XStack>
  );
});

const HEIGHT = 8;
const GAP = 2;
