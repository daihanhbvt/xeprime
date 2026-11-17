import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, typeScale } from '@/theme/tokens';
import { CountBadge } from './CountBadge';

/**
 * Nút "Lọc" của design v2 (Figma `24175:57180`) — đứng cạnh ô tìm `SearchInput variant="field"`,
 * cùng khuôn: cao 40, đệm 14, viền `stroke/gray-low300`, bo 12, bóng xs; icon "Filter 5" 20 · chữ
 * 14/20 đậm vừa. Số bộ lọc đang bật là viên đỏ ở GÓC (như `Badge` của web).
 */
export const FilterButton = memo(function FilterButton({
  label,
  accessibilityLabel,
  count,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  count: number;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={HIT_SLOP}
    >
      {({ pressed }) => (
        <XStack
          ai="center"
          jc="center"
          gap={GAP}
          minHeight={MIN_HEIGHT}
          px={PAD_X}
          bg={colors.surface}
          bw={1}
          bc={count > 0 ? colors.primary : colors.borderInput}
          br={radius.control}
          opacity={pressed ? 0.7 : 1}
          style={elevation.xs}
        >
          <LineIcon name="filter" size={iconSize.lg} color={colors.text} />
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={1}
          >
            {label}
          </Text>
          {count > 0 ? (
            <YStack pos="absolute" top={-BADGE_OFFSET} right={-BADGE_OFFSET}>
              <CountBadge count={count} tone="danger" size="sm" />
            </YStack>
          ) : null}
        </XStack>
      )}
    </Pressable>
  );
});

/** Figma: cao tối thiểu 40, đệm ngang 14, icon cách chữ 6; vùng chạm bù lên 48. */
const MIN_HEIGHT = 40;
const PAD_X = 14;
const GAP = 6;
const HIT_SLOP = 4;
const BADGE_OFFSET = 6;
