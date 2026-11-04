import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { duration, easing } from '@/theme/motion';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

export interface SegmentedTabItem<K extends string> {
  key: K;
  label: string;
  /** Viên đếm cạnh nhãn — bỏ trống thì không vẽ. */
  count?: number;
  /** Nhãn đọc cho trình đọc màn hình (mặc định = `label`). */
  accessibilityLabel?: string;
}

const TRAY_PAD = 4;
const TRAY_GAP = 4;

/**
 * Dải chọn PHÂN ĐOẠN — khuôn tab web `TripFilterTabs` (người dùng chốt 28/10/2026): ô chọn nền trắng viền, chữ vàng, viên
 * đếm có viền (vàng khi chọn, xám khi không). — khay xám bo tròn hết cỡ, ô đang chọn nổi nền trắng viền vàng nhạt, mỗi ô
 * một viên đếm tuỳ chọn. Khuôn chung của "Chuyến hiện tại / Lịch sử" và "Tất cả / Chưa đọc"
 * (người dùng chốt 28/10/2026) — đổi một chỗ, hai màn đổi theo.
 *
 * Nền ô chọn là MỘT chỉ báo trượt (luồng UI) giữa các ô. Chưa đo được bề rộng khay thì nền vẽ
 * tĩnh trên ô chọn như cũ — lần render đầu không chớp.
 */
export function SegmentedTabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<SegmentedTabItem<K>>;
  value: K;
  onChange: (next: K) => void;
}) {
  const colors = useColors();
  // Giao diện tối (Figma 19879:66136): ô chưa chọn chữ xám placeholder, ô chọn nền nổi.
  const dark = useAppScheme().scheme === 'dark';
  const idleFg = dark ? colors.textPlaceholder : colors.text;
  const activeBg = dark ? colors.surfaceElevated : colors.surface;

  const [trayWidth, setTrayWidth] = useState(0);
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(
    items.findIndex((item) => item.key === value),
    0,
  );
  const segmentWidth =
    trayWidth > 0 && items.length > 0
      ? (trayWidth - TRAY_PAD * 2 - 2 - TRAY_GAP * (items.length - 1)) / items.length
      : 0;
  const measured = segmentWidth > 0;
  const offset = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!measured) return;
    const target = activeIndex * (segmentWidth + TRAY_GAP);
    // Lần đặt đầu (vừa đo xong) thì đặt thẳng — không trượt từ ô 0 sang.
    offset.value =
      reduceMotion || !placed.value
        ? target
        : withTiming(target, { duration: duration.base, easing: Easing.bezier(...easing.standard) });
    placed.value = true;
  }, [activeIndex, segmentWidth, measured, reduceMotion, offset, placed]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onTrayLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== trayWidth) setTrayWidth(next);
  };

  return (
    <XStack
      f={1}
      p={TRAY_PAD}
      gap={TRAY_GAP}
      // Figma: khay bo 12 (không viên thuốc), ô trong bo 10, ô chọn nền trắng + bóng mảnh, không viền vàng.
      br={radius.control}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surfaceMuted}
      accessibilityRole="tablist"
      onLayout={onTrayLayout}
    >
      {measured ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            { width: segmentWidth, backgroundColor: activeBg, borderColor: colors.borderSubtle },
            indicatorStyle,
          ]}
        />
      ) : null}
      {items.map((item) => {
        const active = value === item.key;
        return (
          <Pressable
            key={item.key}
            style={styles.segment}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.accessibilityLabel ?? item.label}
          >
            <XStack
              minHeight={36}
              ai="center"
              jc="center"
              gap={space.xs}
              px={space.sm}
              br={10}
              bw={1}
              bc={active && !measured ? colors.borderSubtle : 'transparent'}
              bg={active && !measured ? activeBg : 'transparent'}
            >
              <Text
                flexShrink={1}
                col={active ? colors.accentText : idleFg}
                fos={fontSize.body}
                fow={active ? fontWeight.semibold : fontWeight.medium}
                numberOfLines={1}
              >
                {item.label}
              </Text>
              {item.count != null ? (
                <YStack
                  minWidth={22}
                  h={20}
                  px={6}
                  br={radius.pill}
                  ai="center"
                  jc="center"
                  bw={1}
                  bc={active ? colors.primaryMuted : colors.border}
                  bg={active ? colors.primarySubtle : colors.surfaceMuted}
                >
                  <Text
                    col={active ? colors.accentText : colors.textMuted}
                    fos={fontSize.label}
                    fow={fontWeight.medium}
                  >
                    {item.count}
                  </Text>
                </YStack>
              ) : null}
            </XStack>
          </Pressable>
        );
      })}
    </XStack>
  );
}

const styles = StyleSheet.create({
  segment: { flex: 1 },
  // Nằm trong vùng đệm của khay (absolute tính từ mép TRONG viền 1px) — trùng khít ô đầu.
  indicator: {
    position: 'absolute',
    top: TRAY_PAD,
    bottom: TRAY_PAD,
    left: TRAY_PAD,
    borderRadius: 10,
    borderWidth: 1,
  },
});
