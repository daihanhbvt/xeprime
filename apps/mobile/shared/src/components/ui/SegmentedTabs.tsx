import { useMotionOff } from '@/components/motion/no-motion';
import { IS_PARTNER_APP } from '@/lib/app-kind';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { duration, easing } from '@/theme/motion';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

export interface SegmentedTabItem<K extends string> {
  key: K;
  label: string;
  /** Viên đếm cạnh nhãn — bỏ trống thì không vẽ. */
  count?: number;
  /** Nhãn đọc cho trình đọc màn hình (mặc định = `label`). */
  accessibilityLabel?: string;
  /**
   * Chỉ với `fit`: ô CO VỪA chữ (không giãn) - các ô còn lại lấy hết phần dư. Dùng khi một nhãn dài
   * bị cắt "…" (feedback 20/11/2026: "Thu chi 30 ngày" vừa chữ, "Đơn & chuyến 6 tháng" đủ chữ).
   */
  hug?: boolean;
  /**
   * Chấm trạng thái 6px SAU nhãn (Figma "_Badge" › "_Dot" của dải tab dịch vụ `24237:39612`): màu do
   * nơi gọi truyền (vd xanh = dịch vụ đang bật, đỏ = tắt). Bỏ trống thì không vẽ.
   */
  dotColor?: string;
}

const TRAY_PAD = 4;
const DOT_SIZE = 6;
const DOT_PAD_X = 2;
const DOT_OFFSET = 2;
const TRAY_GAP = 4;
/**
 * Biến thể `neutral` - "Horizontal tabs" của design v2 (Figma `24175:52486`, thẻ thu chi Tổng quan
 * Partner): khay `bg/gray-50` viền `gray-low200` bo 12, KHÔNG đệm, ô cách 2; ô chọn nền trắng viền
 * `gray-low300` bo 12 + bóng `shadow-xs`, chữ `text/gray/medium`; ô khác chữ `text/gray/low`.
 */
const NEUTRAL_PAD = 0;
const NEUTRAL_GAP = 2;

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
  // App Partner: MỌI dải tab phân đoạn dùng khuôn v2 "Horizontal tabs" (người dùng chốt 20/11/2026).
  variant = IS_PARTNER_APP ? 'neutral' : 'brand',
  fit = false,
}: {
  /** Ô rộng theo NHÃN thay vì chia đều - nhãn dài ("Chuyến & thời gian") có đủ chỗ. */
  fit?: boolean;
  items: ReadonlyArray<SegmentedTabItem<K>>;
  value: K;
  onChange: (next: K) => void;
  /** `brand` (mặc định) = khuôn TripFilterTabs; `neutral` = tab xám của design v2. */
  variant?: 'brand' | 'neutral';
}) {
  const colors = useColors();
  const neutral = variant === 'neutral';
  const pad = neutral ? NEUTRAL_PAD : TRAY_PAD;
  const gap = neutral ? NEUTRAL_GAP : TRAY_GAP;
  const segmentRadius = neutral ? radius.control : 10;
  // Giao diện tối (Figma 19879:66136): ô chưa chọn chữ xám placeholder, ô chọn nền nổi.
  const dark = useAppScheme().scheme === 'dark';
  const idleFg = dark ? colors.textPlaceholder : colors.text;
  const activeBg = dark ? colors.surfaceElevated : colors.surface;

  const [trayWidth, setTrayWidth] = useState(0);
  // Máy bật Giảm chuyển động hoặc màn tắt hiệu ứng (`NoMotionScope`) ⇒ vạch chỉ đặt thẳng.
  const reduceMotion = useMotionOff();
  const activeIndex = Math.max(
    items.findIndex((item) => item.key === value),
    0,
  );
  const segmentWidth =
    trayWidth > 0 && items.length > 0
      ? (trayWidth - pad * 2 - 2 - gap * (items.length - 1)) / items.length
      : 0;
  // `fit`: vị trí/bề rộng từng ô đo thật (onLayout) thay vì chia đều.
  const [cells, setCells] = useState<Record<number, { x: number; w: number }>>({});
  const activeCell = fit ? cells[activeIndex] : undefined;
  const indicatorWidth = fit ? (activeCell?.w ?? 0) : segmentWidth;
  const measured = fit ? activeCell !== undefined : segmentWidth > 0;
  const offset = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!measured) return;
    const target = fit ? (activeCell?.x ?? 0) - pad : activeIndex * (segmentWidth + gap);
    // Lần đặt đầu (vừa đo xong) thì đặt thẳng — không trượt từ ô 0 sang.
    offset.value =
      reduceMotion || !placed.value
        ? target
        : withTiming(target, { duration: duration.base, easing: Easing.bezier(...easing.standard) });
    placed.value = true;
  }, [activeIndex, segmentWidth, gap, measured, reduceMotion, offset, placed, fit, activeCell, pad]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onTrayLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== trayWidth) setTrayWidth(next);
  };

  return (
    <XStack
      f={1}
      p={pad}
      gap={gap}
      // Figma: khay bo 12 (không viên thuốc), ô trong bo 10, ô chọn nền trắng + bóng mảnh, không viền vàng.
      br={radius.control}
      bw={1}
      bc={neutral ? colors.border : colors.borderSubtle}
      bg={neutral ? colors.background : colors.surfaceMuted}
      accessibilityRole="tablist"
      onLayout={onTrayLayout}
    >
      {measured ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: neutral ? indicatorWidth + 2 : indicatorWidth,
              backgroundColor: activeBg,
              // Neutral (Figma `24175:52486`): ô chọn viền `stroke/gray-low300` + bóng xs, ĐÈ lên viền
              // khay (lệch -1) nên cạnh ô chỉ thấy MỘT nét đậm, không hai nét sát nhau (20/11/2026).
              borderColor: neutral ? colors.borderInput : colors.borderSubtle,
              top: neutral ? -1 : pad,
              bottom: neutral ? -1 : pad,
              left: neutral ? -1 : pad,
              borderRadius: segmentRadius,
            },
            // Figma `shadow-xs` ĐÚNG số (0 1 2 /5%) - `elevation.xs` của Android đọc thành viền đáy đậm.
            neutral ? FIGMA_SHADOW_XS : null,
            indicatorStyle,
          ]}
        />
      ) : null}
      {items.map((item, index) => {
        const active = value === item.key;
        return (
          <Pressable
            key={item.key}
            style={fit ? (item.hug ? styles.segmentHug : styles.segmentFit) : styles.segment}
            {...(fit
              ? {
                  onLayout: (e: LayoutChangeEvent) => {
                    const { x, width } = e.nativeEvent.layout;
                    setCells((prev) =>
                      prev[index]?.x === x && prev[index]?.w === width ? prev : { ...prev, [index]: { x, w: width } },
                    );
                  },
                }
              : {})}
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
              px={neutral ? space.xs : space.sm}
              br={segmentRadius}
              bw={1}
              bc={active && !measured ? (neutral ? colors.borderInput : colors.borderSubtle) : 'transparent'}
              bg={active && !measured ? activeBg : 'transparent'}
            >
              <Text
                flexShrink={1}
                col={
                  neutral ? (active ? colors.textMuted : colors.placeholder) : active ? colors.accentText : idleFg
                }
                fos={fontSize.body}
                {...(neutral ? { lh: typeScale.body.lineHeight } : {})}
                fow={neutral || active ? fontWeight.semibold : fontWeight.medium}
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
              {item.dotColor ? (
                // Figma: viên "_Badge" đệm 8/2 bọc chấm 6 - cách nhãn 8 (khoảng `gap` 4 + lề 4).
                <YStack ml={DOT_OFFSET} px={DOT_PAD_X} py={2}>
                  <YStack w={DOT_SIZE} h={DOT_SIZE} br={radius.pill} bg={item.dotColor} />
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
  segmentFit: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  segmentHug: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  // Nằm trong vùng đệm của khay (absolute tính từ mép TRONG viền 1px) — trùng khít ô đầu.
  indicator: {
    position: 'absolute',
    borderWidth: 1,
  },
});

const FIGMA_SHADOW_XS = { boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)' } as const;
