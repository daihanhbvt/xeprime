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
 * CHIP LỌC một danh sách - Figma "_Tab MB" `24547:137212` (Tổng quan › Lịch giao & nhận xe,
 * Khách hàng › Tất cả (26) · Còn nợ (16)…; quy ước designer 20/11/2026): mỗi chip cao 32, đệm
 * 8/6, bo tròn hết, cách nhau 8; chip đang chọn nền `text/gray/high` chữ trắng, chip khác nền
 * `bg/gray-50` viền `stroke/gray-low200` chữ `text/gray/medium`; chữ 12/18 medium (không đậm).
 * Số đếm nằm trong nhãn "Quá giờ (7)"; chấm màu 6 tuỳ chọn trước nhãn. Cuộn ngang khi tràn.
 *
 * CHỈ dùng khi bấm vào vẫn là CÙNG danh sách (lọc bớt). Chuyển phần/module của một đối tượng ⇒
 * `UnderlineTabs`; chọn kỳ/chế độ trong một thẻ ⇒ `look="tray"` (hoặc `SegmentedTabs`).
 *
 * `look="tray"` - khuôn cũ "Horizontal tabs" `24175:57186` (khay xám, ô nổi), giữ cho bộ chọn kỳ
 * trong thẻ: khung nền
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
  look = 'chip',
}: {
  /** `chip` (mặc định) = chip lọc danh sách; `tray` = khay chọn kỳ trong một thẻ. */
  look?: 'chip' | 'tray';
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
  if (look === 'chip') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={contentStyle}
        accessibilityLabel={label}
        accessibilityRole="tablist"
      >
        <XStack ai="center" gap={CHIP_GAP}>
          {items.map((item) => (
            <FilterChip
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

const FilterChip = memo(function FilterChip({
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
  const text = item.count === undefined ? item.label : `${item.label} (${item.count})`;
  return (
    <Pressable
      onPress={press}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={text}
    >
      {({ pressed }) => (
        <XStack
          ai="center"
          gap={CHIP_INNER_GAP}
          h={CHIP_HEIGHT}
          px={CHIP_PAD_X}
          br={radius.pill}
          bw={1}
          // Chip chọn: nền đậm phủ luôn viền (Figma không viền) - giữ bw để chip không nhảy cỡ.
          bc={active ? colors.text : colors.border}
          bg={active ? colors.text : pressed ? colors.surfaceMuted : colors.background}
        >
          {item.dot ? <YStack w={DOT} h={DOT} br={radius.pill} bg={item.dot} /> : null}
          <Text
            col={active ? colors.surface : colors.textMuted}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={1}
          >
            {text}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
});

/** Figma "_Tab MB": cao 32, đệm ngang 8, trong cách 4; các chip cách 8. */
const CHIP_HEIGHT = 32;
const CHIP_PAD_X = 8;
const CHIP_INNER_GAP = 4;
const CHIP_GAP = 8;

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
