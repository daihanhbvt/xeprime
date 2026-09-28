import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';

const THUMB = 22;
const TRACK_HEIGHT = 4;

/**
 * Cứ bao nhiêu nhịp kéo thì mới đổi NHÃN một lần — cùng lý do như `RangeSlider`.
 *
 * Cử chỉ chạm bắn khoảng 60 nhịp mỗi giây. Núm chạy trên luồng UI nên nó không quan tâm, nhưng
 * mỗi lần đổi chữ là một lần React dựng lại. Cứ 6 nhịp một lần ra khoảng 10 lần/giây — vừa đủ
 * thấy số đang chạy mà không đốt máy.
 */
const LABEL_EVERY_NTH_MOVE = 6;

export interface SliderTick {
  readonly value: number;
  readonly label: string;
}

/**
 * Thanh chọn MỘT giá trị theo nấc — bản một núm của [`RangeSlider`](./RangeSlider.tsx).
 *
 * Tách thành component riêng chứ không thêm cờ `single` vào `RangeSlider`: cái kia có nguyên
 * một máy trạng thái cho việc "đang nắm núm nào" và luật cho phép hai núm vượt qua nhau — với
 * một núm thì toàn bộ phần đó là mã chết, và một cờ chỉ làm cả hai đường khó đọc hơn.
 *
 * Ba luật hành vi giữ nguyên của `RangeSlider`, vì chúng là kinh nghiệm đã trả giá:
 *
 * 1. **Vị trí theo TOẠ ĐỘ TUYỆT ĐỐI của ngón tay**, không cộng dồn quãng dịch — cộng dồn thì mỗi
 *    lần làm tròn theo `step` đọng lại sai số, kéo vài lượt là núm trôi khỏi ngón tay.
 * 2. **Vùng chạm ở ĐƯỜNG RAY**, không ở núm: núm đang dịch chuyển nên vùng chạm chạy theo nó,
 *    chạm hụt là chuyện thường.
 * 3. **Đường đi lúc kéo KHÔNG chạm vào React** — vị trí sống ở shared value, Reanimated dời node
 *    trên luồng UI. React chỉ thức dậy lúc đặt tay, thả tay, và ở nhãn đã hãm nhịp.
 *
 * Khác `RangeSlider` một chỗ: chạm vào ray ĐƯA núm tới đó luôn. Với một núm thì không có gì để
 * chọn nhầm, nên bắt người dùng phải tìm đúng núm rồi mới kéo là bắt làm thừa một việc.
 */
export const StepSlider = memo(function StepSlider({
  min,
  max,
  step,
  value,
  onChange,
  onSlide,
  ticks,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  /**
   * Gọi khi THẢ TAY — không phải theo từng nhịp kéo.
   *
   * Đây là chỗ bảo vệ nơi gọi: một lần kéo bắn khoảng 60 nhịp, và nếu mỗi nhịp đều đi ra ngoài
   * thì mọi thứ móc vào giá trị đó cùng chạy theo — ở luồng đặt xe, `pickupAt` đổi là khoá truy
   * vấn báo giá đổi, tức là một request mỗi lần ngón tay nhích.
   */
  onChange: (next: number) => void;
  /**
   * Giá trị đang kéo, đã HÃM NHỊP (~10 lần/giây).
   *
   * Chỉ dành cho thứ rẻ tiền và phải chạy theo ngón tay — một dòng chữ chẳng hạn. Nơi gọi tự
   * chịu trách nhiệm giữ nó rẻ; thứ gì đắt thì móc vào `onChange`.
   */
  onSlide?: (next: number) => void;
  /** Mốc hiện dưới ray. Mốc trùng giá trị đang chọn được tô đậm. */
  ticks?: readonly SliderTick[];
}) {
  const [width, setWidth] = useState(0);

  const span = Math.max(max - min, 1);
  const usable = Math.max(width - THUMB, 1);

  const offset = useSharedValue(((value - min) / span) * usable);

  /** Mép trái của ray trong toạ độ MÀN HÌNH, chốt lúc đặt tay xuống. */
  const trackLeft = useSharedValue(0);
  const moves = useSharedValue(0);

  /**
   * Đang nắm núm hay không — ô nhớ NGOÀI React.
   *
   * Effect đồng bộ núm theo prop phải im lặng suốt lần kéo, mà một `useState` đặt lúc đặt tay
   * xuống thì chỉ tới được ở render kế tiếp — muộn hơn vài nhịp kéo đầu tiên.
   */
  const dragging = useRef(false);

  const snap = useCallback(
    (raw: number) => {
      const ratio = Math.min(Math.max(raw / usable, 0), 1);
      return Math.min(max, Math.max(min, Math.round((min + ratio * span) / step) * step));
    },
    [usable, span, min, max, step],
  );

  const commit = useCallback(
    (raw: number) => {
      const next = snap(raw);
      if (next !== value) onChange(next);
    },
    [snap, value, onChange],
  );

  const preview = useCallback(
    (raw: number) => {
      const next = snap(raw);
      if (next !== value) onSlide?.(next);
    },
    [snap, value, onSlide],
  );

  /*
   * `PanResponder` dựng ngay trong thân render (không `useMemo`): nó phải nhìn thấy `value` và
   * `usable` mới nhất, mà cả hai đổi theo từng nhịp. Chi phí là một object mỗi lần render —
   * rẻ hơn nhiều so với một bộ nhận cử chỉ đọc giá trị của render cũ.
   */
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event: GestureResponderEvent) => {
      const left = event.nativeEvent.pageX - event.nativeEvent.locationX;
      trackLeft.value = left;
      moves.value = 0;
      dragging.current = true;
      const raw = event.nativeEvent.pageX - left - THUMB / 2;
      offset.value = Math.min(Math.max(raw, 0), usable);
      preview(raw);
    },
    onPanResponderMove: (event: GestureResponderEvent, _state: PanResponderGestureState) => {
      const raw = event.nativeEvent.pageX - trackLeft.value - THUMB / 2;
      offset.value = Math.min(Math.max(raw, 0), usable);
      moves.value += 1;
      if (moves.value % LABEL_EVERY_NTH_MOVE === 0) preview(raw);
    },
    onPanResponderRelease: (event: GestureResponderEvent) => {
      const raw = event.nativeEvent.pageX - trackLeft.value - THUMB / 2;
      commit(raw);
      /* Về đúng nấc sau khi thả — núm không được đứng lơ lửng giữa hai mốc. */
      offset.value = ((snap(raw) - min) / span) * usable;
      dragging.current = false;
    },
  });

  /*
   * Ngoài lúc kéo, núm bám theo PROP.
   *
   * Không có vế này thì "Bây giờ" (hay bất kỳ ai đổi giá trị từ bên ngoài) làm chữ nhảy còn núm
   * đứng yên — hai thứ nói hai con số khác nhau. Bỏ qua trong lúc kéo, nếu không mỗi lần
   * `onChange` bắn về là núm bị giật ngược lại vị trí đã làm tròn.
   */
  useEffect(() => {
    if (dragging.current) return;
    offset.value = ((value - min) / span) * usable;
    // `offset` là shared value — ổn định theo hợp đồng, đưa vào deps thì lint báo "modifying a
    // value previously passed as an argument to a hook".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, span, usable]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: offset.value + THUMB / 2 }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth(next);
    offset.value = ((value - min) / span) * Math.max(next - THUMB, 1);
  };

  return (
    <YStack gap={space.xs}>
      {ticks && ticks.length > 0 ? (
        <XStack jc="space-between">
          {ticks.map((tick) => {
            const active = tick.value === value;
            return (
              <Text
                key={tick.value}
                col={active ? colors.primaryActive : colors.textMuted}
                fos={fontSize.label}
                fow={active ? fontWeight.bold : fontWeight.regular}
              >
                {tick.label}
              </Text>
            );
          })}
        </XStack>
      ) : null}

      {/* Vùng chạm cao bằng ngưỡng chạm, còn ray thì mảnh — ray mảnh mà bắt chạm là chạm hụt. */}
      <YStack h={sizing.touchTarget} jc="center" onLayout={onLayout} {...responder.panHandlers}>
        <YStack h={TRACK_HEIGHT} br={TRACK_HEIGHT} bg={colors.border} jc="center">
          <Animated.View
            style={[
              { height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT, backgroundColor: colors.primary },
              fillStyle,
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                width: THUMB,
                height: THUMB,
                borderRadius: radius.pill,
                backgroundColor: colors.primary,
              },
              thumbStyle,
            ]}
          />
        </YStack>
      </YStack>
    </YStack>
  );
});
