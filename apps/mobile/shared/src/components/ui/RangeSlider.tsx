import { memo, useCallback, useState } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { Text, YStack } from 'tamagui';
import { colors, fontSize, radius, sizing, space } from '@/theme/tokens';

const THUMB = 22;
const TRACK_HEIGHT = 4;

/**
 * Cứ bao nhiêu nhịp kéo thì mới đổi NHÃN một lần.
 *
 * Cử chỉ chạm bắn khoảng 60 nhịp mỗi giây. Hai cái núm chạy trên luồng UI nên chúng không quan
 * tâm, nhưng mỗi lần đổi chữ dưới thanh là một lần React dựng lại. Chữ nhấp nháy nhanh hơn mắt
 * đọc được thì chẳng ai đọc, mà máy vẫn phải trả giá — cứ 6 nhịp một lần ra khoảng 10 lần/giây,
 * vừa đủ thấy số đang chạy.
 *
 * Đếm NHỊP chứ không đo thời gian: `Date.now()` gọi trong thân render bị quy tắc thuần khiết
 * của React Compiler chặn, mà bộ nhận cử chỉ thì buộc phải dựng ở đó (xem ghi chú bên dưới).
 */
const LABEL_EVERY_NTH_MOVE = 6;

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  /**
   * Gọi khi THẢ TAY, không phải theo từng pixel kéo — nơi gọi không bị dựng lại vài chục lần
   * một giây chỉ vì ngón tay đang di chuyển. Luôn nhận cặp đã sắp: nhỏ trước, lớn sau.
   */
  onChange: (next: [number, number]) => void;
  /** Dòng chữ dưới thanh, dựng từ giá trị đang kéo (đã sắp). */
  caption?: (value: [number, number]) => string;
  label?: string;
}

/**
 * Thanh chọn KHOẢNG hai đầu — cùng hành vi với `Slider range` của AntD bên web.
 *
 * Không dùng `@react-native-community/slider` (native module, vắng trong Expo Go) và app cũng
 * không có `react-native-gesture-handler`, nên cử chỉ đến từ `PanResponder`.
 *
 * Ba luật mượn thẳng từ web:
 *
 * 1. **Hai núm ĐƯỢC vượt qua nhau.** Núm đang nắm đi tới đúng chỗ ngón tay kể cả khi vượt qua
 *    núm kia; thứ tự chỉ sắp lại lúc chốt. Kéo núm sau về 650 trong khi núm trước ở 850 thì ra
 *    khoảng 650–850. Kẹp không cho vượt là lỗi cũ: núm bị nắm dính cứng vào núm kia, nhìn hệt
 *    như núm kia đang nhảy lung tung.
 * 2. **Vị trí theo TOẠ ĐỘ TUYỆT ĐỐI của ngón tay**, không cộng dồn quãng dịch. Cộng dồn thì mỗi
 *    lần làm tròn theo `step` đọng lại một chút sai số, kéo vài lượt là núm trôi khỏi ngón tay.
 *
 * Một chỗ CỐ Ý khác web: **chạm vào ray KHÔNG làm núm nhảy tới đó.** Trên chuột thì nết ấy tiện;
 * trên điện thoại thì mỗi lần định cầm lấy một núm, nó đã tự chạy tới chỗ ngón tay mất rồi. Ở
 * đây cú chạm chỉ CHỌN núm gần nhất, còn núm chỉ dịch đúng bằng quãng ngón tay dịch.
 *
 * Vùng chạm nằm ở ĐƯỜNG RAY chứ không phải ở từng núm: núm đang dịch chuyển nên vùng chạm chạy
 * theo, chạm hụt là thường; và hai núm chồng lên nhau ở hai biên nên cú chạm rơi vào nhầm núm.
 * Đường ray đứng yên nhận cú chạm, còn "kéo núm nào" quyết định MỘT lần lúc đặt tay xuống.
 *
 * Vì sao nó không giật: đường đi lúc kéo KHÔNG chạm vào React. Vị trí hai núm sống ở shared
 * value, mỗi sự kiện chạm chỉ ghi một con số rồi Reanimated dời node trên luồng UI. React chỉ
 * bị đánh thức ở ba chỗ, tất cả đều thưa: đặt tay xuống, thả tay ra, và nhãn dưới thanh (đã hãm
 * nhịp). Bộ nhận cử chỉ cũng được ghi nhớ theo thang đo nên không bị dựng lại mỗi lần đổi chữ.
 */
function RangeSliderImpl({ min, max, step, value, onChange, caption, label }: RangeSliderProps) {
  const [width, setWidth] = useState(0);
  /** Bản sao THƯA của hai shared value, chỉ để có chữ mà vẽ. */
  const [shown, setShown] = useState<[number, number]>(value);
  const [dragging, setDragging] = useState(false);

  const span = Math.max(max - min, 1);
  const usable = Math.max(width - THUMB, 1);

  /*
   * Vị trí của HAI CÁI NÚM, theo thứ tự cầm nắm — không phải "nhỏ" và "lớn".
   * Chúng được phép vượt qua nhau; ai nhỏ hơn chỉ có nghĩa lúc chốt giá trị.
   */
  const first = useSharedValue(value[0]);
  const second = useSharedValue(value[1]);

  /**
   * Núm đang bị kéo, chốt MỘT lần lúc đặt tay xuống.
   *
   * Phải là ô nhớ ngoài React: bộ nhận cử chỉ xử lý trọn một lần kéo, nên `useState` đặt lúc
   * bắt đầu không bao giờ tới được các nhịp kéo sau của cùng lần đó — chúng vẫn đọc giá trị của
   * render cũ, và nắm núm sau mà thứ chạy lại là núm trước.
   */
  const activeEdge = useSharedValue<0 | 1>(0);

  /**
   * Mép trái của đường ray trong toạ độ MÀN HÌNH, chốt lúc đặt tay xuống.
   *
   * Các nhịp kéo chỉ có toạ độ màn hình là đáng tin; `locationX` của chúng thì tuỳ nền tảng mà
   * quy chiếu theo view nào, và đó là chỗ sinh ra cảnh "nắm núm này nhưng núm kia chạy". Lấy
   * `pageX - locationX` ngay ở nhịp đầu là có mốc chắc chắn cho cả lần kéo.
   */
  const trackOrigin = useSharedValue(0);
  /** Khoảng lệch ngón tay ↔ núm lúc đặt tay xuống — thứ giữ cho núm không nhảy khi vừa chạm. */
  const grabOffset = useSharedValue(0);
  /** Đếm nhịp kéo, để hãm nhịp đổi nhãn — xem {@link LABEL_EVERY_NTH_MOVE}. */
  const moveTick = useSharedValue(0);

  /*
   * Đồng bộ giá trị từ NGOÀI vào — làm ngay trong render, và chỉ khi không có ngón tay nào đang
   * đặt lên thanh.
   *
   * Theo dõi cả BIÊN chứ không riêng giá trị: biên giá đến từ facet nên nó đổi sau lần render
   * đầu (trước đó là trần dự phòng). Chỉ canh `value` thì giá trị không đổi nhưng thang đo đã
   * khác, và núm đứng lại ở toạ độ tính theo thang cũ — trôi ra ngoài bề rộng rồi mất hút.
   */
  const [last, setLast] = useState<[number, number, number, number]>([
    value[0],
    value[1],
    min,
    max,
  ]);
  if (
    !dragging &&
    (last[0] !== value[0] || last[1] !== value[1] || last[2] !== min || last[3] !== max)
  ) {
    setLast([value[0], value[1], min, max]);
    setShown(value);
    first.value = value[0];
    second.value = value[1];
  }

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width),
    [],
  );

  /*
   * Bộ nhận cử chỉ dựng THẲNG trong render, không `useMemo`.
   *
   * `PanResponder.create` chỉ gói mấy closure vào một object — rẻ, và nó chạy đúng một lần cho
   * mỗi lần render (mà render lúc kéo đã bị hãm còn ~8 lần/giây). Bọc `useMemo` thì eslint chặn
   * ngay: ghi vào shared value bên trong một hook ghi nhớ là đúng thứ quy tắc immutability của
   * React Compiler cấm, và né nó bằng ref lại vướng `react-hooks/refs`.
   */
  const responder = (() => {
    /** Toạ độ trên ray → giá trị đã làm tròn theo `step` và kẹp trong biên. */
    const valueAt = (x: number) => {
      const raw = min + ((x - THUMB / 2) / usable) * span;
      return Math.min(max, Math.max(min, Math.round(raw / step) * step));
    };

    /** Đẩy giá trị hiện tại lên nhãn. `force` bỏ qua nhịp hãm (lúc đặt tay và lúc thả). */
    const syncLabel = (force: boolean) => {
      moveTick.value += 1;
      if (!force && moveTick.value % LABEL_EVERY_NTH_MOVE !== 0) return;
      setShown((prev) =>
        prev[0] === first.value && prev[1] === second.value ? prev : [first.value, second.value],
      );
    };

    const moveTo = (x: number) => {
      const next = valueAt(x);
      if (activeEdge.value === 0) first.value = next;
      else second.value = next;
      syncLabel(false);
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Vùng cuộn của tấm Bộ lọc không được cướp cú kéo giữa chừng.
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: (event: GestureResponderEvent) => {
        const { pageX, locationX } = event.nativeEvent;
        trackOrigin.value = pageX - locationX;

        const touched = valueAt(locationX);

        /*
         * Núm nào gần điểm chạm hơn thì đi theo. Bằng nhau thì chọn theo PHÍA chạm: lúc hai núm
         * trùng nhau mà luôn chọn núm trước thì không kéo sang phải được, thanh trông như chết.
         */
        const dFirst = Math.abs(touched - first.value);
        const dSecond = Math.abs(touched - second.value);
        const edge: 0 | 1 =
          dFirst === dSecond ? (touched > first.value ? 1 : 0) : dFirst < dSecond ? 0 : 1;
        activeEdge.value = edge;

        /*
         * Khoảng lệch giữa ngón tay và núm lúc đặt tay xuống, giữ nguyên suốt lần kéo.
         *
         * Nhờ nó mà CHẠM KHÔNG LÀM NÚM NHẢY: núm chỉ dịch đúng bằng quãng ngón tay dịch. Trước
         * đây tôi bê nguyên nết "bấm vào ray là nhảy tới đó" của web sang — trên chuột thì tiện,
         * trên điện thoại thì mỗi lần định CẦM lấy núm là nó đã tự chạy tới chỗ ngón tay mất rồi.
         *
         * Vẫn không có chuyện trôi dồn: mỗi nhịp tính từ toạ độ TUYỆT ĐỐI của ngón tay trừ đi
         * một khoảng lệch CỐ ĐỊNH, không phải cộng dồn từng quãng dịch nhỏ.
         */
        const handleValue = edge === 0 ? first.value : second.value;
        grabOffset.value = locationX - (((handleValue - min) / span) * usable + THUMB / 2);

        setDragging(true);
      },

      onPanResponderMove: (_event, gesture: PanResponderGestureState) =>
        moveTo(gesture.moveX - trackOrigin.value - grabOffset.value),

      onPanResponderRelease: () => {
        setDragging(false);
        syncLabel(true);
        // Sắp lại ở đây, và chỉ ở đây: bên ngoài luôn nhận nhỏ trước, lớn sau.
        onChange([Math.min(first.value, second.value), Math.max(first.value, second.value)]);
      },
      onPanResponderTerminate: () => setDragging(false),
    });
  })();

  const firstStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: ((first.value - min) / span) * usable }] }),
    [min, span, usable],
  );
  const secondStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: ((second.value - min) / span) * usable }] }),
    [min, span, usable],
  );
  // Vệt tô nằm GIỮA hai núm, bất kể núm nào đang ở bên nào.
  const fillStyle = useAnimatedStyle(() => {
    const a = ((first.value - min) / span) * usable;
    const b = ((second.value - min) / span) * usable;
    return { transform: [{ translateX: Math.min(a, b) + THUMB / 2 }], width: Math.abs(b - a) };
  }, [min, span, usable]);

  return (
    <YStack gap={space.xs}>
      <YStack
        {...responder.panHandlers}
        h={sizing.touchTarget}
        jc="center"
        onLayout={onLayout}
        accessibilityRole="adjustable"
        {...(label ? { accessibilityLabel: label } : {})}
      >
        <YStack h={TRACK_HEIGHT} br={radius.pill} bg={colors.border} />

        {width > 0 ? (
          <>
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  height: TRACK_HEIGHT,
                  borderRadius: TRACK_HEIGHT,
                  backgroundColor: colors.primary,
                },
                fillStyle,
              ]}
            />
            <Thumb style={firstStyle} />
            <Thumb style={secondStyle} />
          </>
        ) : null}
      </YStack>

      {caption ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
          {caption([Math.min(shown[0], shown[1]), Math.max(shown[0], shown[1])])}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * Bọc `memo`: tấm Bộ lọc dựng lại mỗi lần chạm vào một chip facet bất kỳ, mà thanh này không
 * liên quan gì tới những chiều đó.
 */
export const RangeSlider = memo(RangeSliderImpl);

/**
 * Núm tròn — thuần trang trí.
 *
 * `pointerEvents="none"`: cú chạm phải rơi xuống đường ray bên dưới, nếu không núm (đang dịch
 * chuyển) sẽ nuốt mất cú chạm và mốc toạ độ tính ra sai.
 */
const Thumb = memo(function Thumb({ style }: { style: AnimatedStyle<ViewStyle> }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: colors.surface,
          borderWidth: 2,
          borderColor: colors.primary,
        },
        style,
      ]}
    />
  );
});
