import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import { Pill } from './Pill';

export interface ChipTabItem<V extends string> {
  value: V;
  label: string;
  /** Màu chấm 6px trước nhãn (Figma "_Dot") - vắng thì không có chấm. */
  dot?: string | undefined;
  /** Số đếm cạnh nhãn - `undefined` khi chưa có số (đang tải), KHÔNG quy về 0. */
  count?: number | undefined;
}

/**
 * Dải tab NGANG dạng viên của design v2 (Figma "Horizontal tabs" `24175:57186`): khung nền
 * `bg/gray-50` viền `stroke/gray-low200` bo 12, các tab cao 36 đệm 12, cách 2; tab đang chọn nền
 * trắng viền `gray-low300` bóng xs, chữ 14/20 semibold `text/gray/medium`, tab khác chữ
 * `text/gray/low`. Chấm màu 6 trước nhãn; số đếm là viên "_Badge" sau nhãn (vàng ở tab đang chọn).
 *
 * Cuộn ngang khi không đủ chỗ - khung viền ôm theo nội dung, không kéo hết bề ngang.
 */
function ChipTabsImpl<V extends string>({
  label,
  items,
  value,
  onSelect,
  gutter,
}: {
  /** Tên của cả dải cho trình đọc màn hình. */
  label: string;
  items: readonly ChipTabItem<V>[];
  value: V;
  onSelect: (next: V) => void;
  /** Lề ngang của màn - dải nằm thẳng hàng với nội dung và cuộn được tới sát mép. */
  gutter: number;
}) {
  const colors = useColors();
  const contentStyle = useMemo(() => ({ paddingHorizontal: gutter }), [gutter]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentStyle}
      accessibilityLabel={label}
      accessibilityRole="tablist"
    >
      <XStack
        ai="center"
        gap={ITEM_GAP}
        bg={colors.background}
        bw={1}
        bc={colors.border}
        br={radius.control}
      >
        {items.map((item) => (
          <ChipTab
            key={item.value}
            item={item}
            active={item.value === value}
            onSelect={onSelect as (next: string) => void}
          />
        ))}
      </XStack>
    </ScrollView>
  );
}

export const ChipTabs = memo(ChipTabsImpl) as typeof ChipTabsImpl;

const ChipTab = memo(function ChipTab({
  item,
  active,
  onSelect,
}: {
  item: ChipTabItem<string>;
  active: boolean;
  onSelect: (next: string) => void;
}) {
  const colors = useColors();
  const press = useCallback(() => onSelect(item.value), [onSelect, item.value]);
  return (
    <Pressable
      onPress={press}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.count === undefined ? item.label : `${item.label} ${item.count}`}
    >
      {({ pressed }) => (
        <XStack
          ai="center"
          jc="center"
          gap={ITEM_INNER_GAP}
          h={ITEM_HEIGHT}
          px={ITEM_PAD_X}
          br={radius.control}
          bw={1}
          bc={active ? colors.borderInput : 'transparent'}
          bg={active ? colors.surface : pressed ? colors.surfaceMuted : 'transparent'}
          style={active ? elevation.xs : undefined}
        >
          {item.dot ? <YStack w={DOT} h={DOT} br={radius.pill} bg={item.dot} /> : null}
          <Text
            col={active ? colors.textMuted : colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {item.label}
          </Text>
          {item.count !== undefined ? (
            // Bọc một lớp: `Pill` tự `alignSelf: flex-start`, khung bọc mới là thứ được căn giữa dọc.
            <YStack>
              <Pill label={String(item.count)} tone={active ? 'brand' : 'neutral'} />
            </YStack>
          ) : null}
        </XStack>
      )}
    </Pressable>
  );
});

/** Figma: tab cao 36, đệm ngang 12, trong cách 8; các tab cách 2; chấm 6. */
const ITEM_HEIGHT = 36;
const ITEM_PAD_X = 12;
const ITEM_INNER_GAP = 8;
const ITEM_GAP = 2;
const DOT = 6;
