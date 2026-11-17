import { FlatList, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { elevation } from '@/theme/elevation';
import { fontSize, fontWeight, radius } from '@/theme/tokens';

/** Tông chấm màu của một mục - web `StatusRailTone`. */
export type StatusRailTone = 'neutral' | 'warning' | 'info' | 'success' | 'danger';

export interface StatusRailItem<V extends string> {
  value: V;
  label: string;
  tone: StatusRailTone;
  count: number | undefined;
}

/**
 * Dải nhóm trạng thái - bản native của web `StatusRail` ở khổ ≤1024 (`StatusRail.module.css`):
 * MỘT thẻ viền `color-border`, bo 16, đệm 6, cuộn NGANG; mỗi mục cao 40, bo 12, đệm ngang 12 =
 * chấm tông 8 · nhãn 14 đậm vừa (chữ phụ) · viên đếm (viền, nền trang, bo 16, tối thiểu 28).
 * Mục đang chọn: nền `bg-muted`, chữ màu mực. Dùng cho mọi màn danh sách partner có cột nhóm.
 */
export function StatusRail<V extends string>({
  label,
  items,
  value,
  onSelect,
  gutter,
}: {
  label: string;
  items: readonly StatusRailItem<V>[];
  value: V;
  onSelect: (next: V) => void;
  /** Lề ngang của màn - thẻ nằm thẳng hàng với nội dung. */
  gutter: number;
}) {
  const colors = useColors();
  const dot: Record<StatusRailTone, string> = {
    neutral: colors.placeholder,
    warning: colors.warningStrong,
    info: colors.infoStrong,
    success: colors.success,
    danger: colors.danger,
  };

  return (
    <YStack px={gutter}>
      <YStack
        bg={colors.surface}
        bw={1}
        bc={colors.border}
        br={radius.card}
        p={RAIL_PAD}
        // Web `box-shadow: 0 1px 2px 0 rgba(10, 13, 18, .05)` = bậc bóng nhẹ nhất của theme.
        style={elevation.xs}
      >
        <FlatList
          horizontal
          data={items}
          keyExtractor={(item) => item.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={CONTENT_STYLE}
          accessibilityLabel={label}
          accessibilityRole="tablist"
          renderItem={({ item }) => {
            const active = item.value === value;
            return (
              <Pressable
                onPress={() => onSelect(item.value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={item.count === undefined ? item.label : `${item.label} ${item.count}`}
              >
                {({ pressed }) => (
                  <XStack
                    ai="center"
                    gap={ITEM_GAP}
                    h={ITEM_HEIGHT}
                    px={ITEM_PAD_X}
                    br={radius.control}
                    bg={active ? colors.surfaceMuted : pressed ? colors.surfaceMuted : 'transparent'}
                  >
                    <YStack w={DOT} h={DOT} br={radius.pill} bg={dot[item.tone]} />
                    <Text
                      col={active ? colors.text : colors.textMuted}
                      fos={fontSize.body}
                      fow={fontWeight.medium}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {item.count !== undefined ? (
                      <YStack
                        minWidth={COUNT_MIN_WIDTH}
                        px={COUNT_PAD_X}
                        py={COUNT_PAD_Y}
                        bw={1}
                        bc={colors.border}
                        br={radius.card}
                        bg={colors.background}
                        ai="center"
                      >
                        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} fontVariant={['tabular-nums']}>
                          {item.count}
                        </Text>
                      </YStack>
                    ) : null}
                  </XStack>
                )}
              </Pressable>
            );
          }}
        />
      </YStack>
    </YStack>
  );
}

/** Web ≤1024: `.rail { padding: var(--xp-space-6) }`, `.items { gap: var(--xp-space-xs) }`. */
const RAIL_PAD = 6;
const CONTENT_STYLE = { gap: 4 } as const;
/** `.item { height: 40px; padding: 0 12px; gap: 8px }`, `.dot 8`. */
const ITEM_HEIGHT = 40;
const ITEM_PAD_X = 12;
const ITEM_GAP = 8;
const DOT = 8;
/** `.count` ≤1024: `min-width: 28px; padding: 2px 6px`. */
const COUNT_MIN_WIDTH = 28;
const COUNT_PAD_X = 6;
const COUNT_PAD_Y = 2;
