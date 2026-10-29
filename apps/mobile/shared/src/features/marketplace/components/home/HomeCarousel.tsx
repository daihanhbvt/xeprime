import { Children, useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { XStack, YStack } from 'tamagui';
import { XP_TOKENS } from '@xeprime/ui';
import { layout } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { market, radius, space } from '@/theme/tokens';
/** Chấm phân trang như .dot / .dotActive web: 10px, chấm đang chọn dài 32px. */
const DOT = 10;
const DOT_ACTIVE = 32;
/** Web ở bề rộng điện thoại: 1.3 thẻ mỗi khung, cách 16px, thẻ đang xem ở GIỮA. */
const PER_VIEW = 1.3;
const MOBILE_GAP = 16;
const OVERHANG = 20;
/** Chừa chỗ dưới cho bóng/viền đáy thẻ — ScrollView ngang cắt mọi thứ tràn khỏi khung của nó. */
const SHADOW_PAD = 12;
/**
 * Số thẻ dựng THẬT mỗi bên thẻ đang xem. Ba bản nối nhau của 12 thẻ là 36 thẻ, mà màn chỉ thấy
 * ba — dựng hết thì mỗi lần đổi sáng/tối vẽ lại 36 thẻ (đo: ~1,9s của 2,7s ở bản dev). Ô ngoài
 * cửa sổ là khung rỗng cùng bề ngang nên snap/vị trí cuộn không đổi.
 */
const MOUNT_WINDOW = 2;
/**
 * Màu chấm ở giao diện TỐI — web viết cứng #717680 / #fff5e5 trong CSS module; đó đúng là
 * `color-text-tertiary` và `color-primary-light` của bảng SÁNG, nên đọc thẳng hai token đó.
 */
const DOT_DARK = {
  idle: XP_TOKENS['color-text-tertiary'],
  active: XP_TOKENS['color-primary-light'],
} as const;
/** Bề ngang một thẻ của băng chuyền trên màn rộng screenWidth — để thẻ tự tính tỉ lệ của nó. */
export function homeCarouselItemWidth(screenWidth: number): number {
  return Math.round(screenWidth / PER_VIEW - MOBILE_GAP);
}

interface HomeCarouselProps {
  children: ReactNode;
  /** Bề ngang MỘT thẻ — mặc định để lộ mép thẻ kế bên (bản vẽ mobile "thẻ ở giữa"). */
  itemWidth?: number;
  gap?: number;
  accessibilityLabel: string;
  /** Báo thẻ đang ở giữa — để khối tô nổi thẻ đó (bản vẽ mobile v2 của "Gian hàng nổi bật"). */
  onActiveChange?: (index: number) => void;
  /** Thẻ có phần nhô lên khỏi mép trên (ảnh xe của thẻ gian hàng) — chừa 20px như `.overhang` web. */
  overhang?: boolean;
}

/**
 * Băng chuyền ngang của trang chủ — bản native của `HomeCarousel` bên web ở bề rộng điện thoại:
 * mỗi lần vuốt dừng đúng một thẻ, mép thẻ kế bên lộ ra để báo còn nữa, chấm phân trang bên dưới.
 *
 * `ScrollView` chứ không `FlatList`: mọi khối dùng nó có tối đa 12 thẻ, và cả trang chủ đã nằm
 * trong một vùng cuộn dọc — ảo hoá ở đây không tiết kiệm được gì.
 *
 * Một thẻ thì không có gì để vuốt: thẻ trải hết bề ngang nội dung và không có chấm.
 */
export function HomeCarousel({
  children,
  itemWidth,
  gap = MOBILE_GAP,
  accessibilityLabel,
  onActiveChange,
  overhang = false,
}: HomeCarouselProps) {
  const colors = useColors();
  const { scheme } = useAppScheme();
  const { width } = useWindowDimensions();
  const items = Children.toArray(children);
  const count = items.length;
  const contentWidth = width - layout.screenX * 2;
  const cardWidth =
    count <= 1 ? contentWidth : Math.min(itemWidth ?? homeCarouselItemWidth(width), contentWidth);
  // Thẻ đang xem nằm GIỮA màn (web align: center), hai thẻ kề ló ra hai bên.
  const sidePad = count <= 1 ? layout.screenX : (width - cardWidth) / 2;
  const step = cardWidth + gap;
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const placed = useRef(false);
  /*
   * Web ở bề rộng điện thoại chạy Embla `loop: true, align: 'center'`: thẻ ĐẦU nằm giữa và thẻ
   * CUỐI ló ra bên trái. Không lặp thì bên trái thẻ đầu là khoảng trống, cả dải trông lệch sang
   * phải. Dựng ba bản nối nhau, đứng ở bản giữa, và sau mỗi lần dừng nhảy (không hoạt ảnh) về ô
   * tương ứng của bản giữa — vuốt mãi không chạm mép, y như vòng lặp của web.
   */
  const loop = count > 1;
  const slides = loop ? [...items, ...items, ...items] : items;
  const base = loop ? count : 0;
  const [pos, setPos] = useState(base);

  const jumpTo = useCallback(
    (index: number) => {
      setPos(index);
      scrollRef.current?.scrollTo({ x: index * step, animated: false });
    },
    [step],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Trước khi đứng vào bản giữa, offset 0 (bản ĐẦU) hoặc offset bị kẹp vì nội dung chưa đo
      // xong cho ra chỉ số lệch — chấm cuối sáng trong khi đang xem thẻ đầu.
      if (loop && !placed.current) return;
      const raw = Math.round(event.nativeEvent.contentOffset.x / Math.max(step, 1));
      const next = (((raw - base) % count) + count) % count;
      setActive(next);
      setPos(raw);
      onActiveChange?.(next);
    },
    [base, count, loop, onActiveChange, step],
  );

  const onSettle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!loop) return;
      const raw = Math.round(event.nativeEvent.contentOffset.x / Math.max(step, 1));
      if (raw < count || raw >= count * 2) jumpTo(count + (((raw % count) + count) % count));
    },
    [count, jumpTo, loop, step],
  );

  return (
    <YStack gap={space.md}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        disableIntervalMomentum
        scrollEnabled={count > 1}
        onScroll={onScroll}
        onMomentumScrollEnd={onSettle}
        // Đứng ở bản GIỮA ngay khi có kích thước (Android bỏ qua prop `contentOffset`).
        onContentSizeChange={(contentW) => {
          // Chỉ MỘT lần: nội dung đổi cỡ về sau (ảnh tải xong) không được kéo người dùng về thẻ đầu.
          // Đợi đủ bề ngang cả ba bản — sớm hơn thì Android kẹp scrollTo về một offset sai.
          if (!loop || placed.current || contentW < base * step + width) return;
          placed.current = true;
          jumpTo(base);
          setActive(0);
          onActiveChange?.(0);
        }}
        scrollEventThrottle={32}
        accessibilityLabel={accessibilityLabel}
        // Vùng cuộn tràn ra mép màn (thẻ trượt dưới lề), nhưng thẻ đầu vẫn thẳng lề nội dung.
        style={{
          marginHorizontal: -layout.screenX,
          marginTop: overhang ? -OVERHANG : 0,
          marginBottom: -SHADOW_PAD,
        }}
        contentContainerStyle={{
          paddingHorizontal: sidePad,
          paddingTop: overhang ? OVERHANG : 0,
          paddingBottom: SHADOW_PAD,
          gap,
        }}
      >
        {slides.map((child, index) => (
          <YStack key={index} w={cardWidth}>
            {Math.abs(index - pos) <= MOUNT_WINDOW ? child : null}
          </YStack>
        ))}
      </ScrollView>

      {count > 1 ? (
        <XStack
          jc="center"
          gap={space.sm}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {items.map((_, index) => (
            <YStack
              key={index}
              w={index === active ? DOT_ACTIVE : DOT}
              h={DOT}
              br={radius.pill}
              bg={
                scheme === 'dark'
                  ? index === active
                    ? DOT_DARK.active
                    : DOT_DARK.idle
                  : index === active
                    ? market.inverse
                    : colors.borderInput
              }
            />
          ))}
        </XStack>
      ) : null}
    </YStack>
  );
}
