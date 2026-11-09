import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  measure,
  type SharedValue,
  useAnimatedRef,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/** Nhịp như `Reveal` bên web: trượt lên ~32dp trong ~700ms, ease-out. */
const SCROLL_REVEAL_DISTANCE = 48;
/** Khối co nhẹ rồi về 1 cùng lúc trượt (không opacity — xem docblock). */
const SCROLL_REVEAL_SCALE_FROM = 0.97;
const SCROLL_REVEAL_MS = 700;
/** Khối phải lộ ra ít nhất chừng này dp ở đáy màn mới bắt đầu hiện. */
const SCROLL_REVEAL_THRESHOLD = 48;

interface ScrollRevealContextValue {
  /** `contentOffset.y` của ScrollView — ghi trong `useAnimatedScrollHandler`. */
  scrollY: SharedValue<number>;
  /** Toạ độ y của khung CHỨA các khối trong nội dung cuộn (onLayout của khung đó). */
  baseOffset?: SharedValue<number>;
}

const RevealProgressContext = createContext<SharedValue<number> | null>(null);

/**
 * Tiến độ 0→1 của `ScrollReveal` gần nhất — để phần tử CON tự animate khi khối vào màn.
 * Ngoài `ScrollReveal` (hoặc giảm chuyển động) ⇒ `null`: phần tử con hiện tĩnh.
 */
export function useRevealProgress(): SharedValue<number> | null {
  return useContext(RevealProgressContext);
}

/** Nhịp vào của phần tử con (chữ, gạch chân) — ngắn hơn khối. */
const CHILD_REVEAL_MS = 600;

/**
 * Cờ 0→1 riêng của một phần tử con: bắt đầu khi khối cha bắt đầu hiện, trễ `delay` ms. Trả
 * `null` khi không có khối cha — nơi gọi render tĩnh.
 */
export function useRevealChild(delay = 0): SharedValue<number> | null {
  const parent = useRevealProgress();
  const local = useSharedValue(parent ? 0 : 1);
  useAnimatedReaction(
    () => (parent ? parent.value > 0 : false),
    (started, prev) => {
      if (started && !prev && local.value === 0) {
        local.value = withDelay(delay, withTiming(1, { duration: CHILD_REVEAL_MS, easing: Easing.out(Easing.cubic) }));
      }
    },
    [delay],
  );
  return parent ? local : null;
}

/**
 * Style "fade + trượt lên" cho phần tử con KHÔNG có bóng (chữ, đoạn văn). Không có khối cha ⇒
 * style rỗng (tĩnh). KHÔNG dùng cho thẻ có elevation.
 */
export function useRevealFadeUp(delay = 0, distance = 14) {
  const v = useRevealChild(delay);
  return useAnimatedStyle(() =>
    v ? { opacity: v.value, transform: [{ translateY: (1 - v.value) * distance }] } : {},
  );
}

/** Chữ "fade + trượt lên" — bọc một khối chữ không có bóng trong khối `ScrollReveal`. */
export function RevealText({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const style = useRevealFadeUp(delay);
  return <Animated.View style={style}>{children}</Animated.View>;
}

const ScrollRevealContext = createContext<ScrollRevealContextValue | null>(null);

export const ScrollRevealProvider = ScrollRevealContext.Provider;

/**
 * Mặc định của prop `Screen.scrollReveal` cho cả một app: app khách bọc gốc bằng `true` để MỌI màn
 * cuộn có "khối hiện khi cuộn tới" (thẻ `Card` tự reveal). App Partner không bọc ⇒ giữ nguyên tĩnh.
 * Màn vẫn tắt riêng được bằng `scrollReveal={false}`.
 */
const ScrollRevealDefaultContext = createContext(false);
export const ScrollRevealDefaultProvider = ScrollRevealDefaultContext.Provider;
export function useScrollRevealDefault(): boolean {
  return useContext(ScrollRevealDefaultContext);
}

/** `scrollY` của trang (từ `ScrollRevealProvider`) — cho hiệu ứng con theo cuộn (parallax). Ngoài provider ⇒ `null`. */
export function useRevealScrollY(): SharedValue<number> | null {
  return useContext(ScrollRevealContext)?.scrollY ?? null;
}

/**
 * Khối HIỆN RA khi cuộn tới — chạy hoàn toàn trên luồng UI: mỗi lần cuộn, `useAnimatedReaction`
 * đo vị trí thật của khối trên màn (`measure`), mép trên lọt vào màn thì bật cờ một-lần và
 * `withTiming`. Không `setState` theo cuộn, không re-render trang.
 *
 * CHỈ `translateY`, KHÔNG opacity: khối thường chứa thẻ có bóng, mà làm mờ khối có elevation thì
 * bóng Android nhấp nháy. Khối đã nằm trong màn lúc mở thì hiện ngay (so le `index` rất ngắn).
 * Giảm chuyển động ⇒ đứng yên. Ngoài `ScrollRevealProvider` ⇒ render tĩnh.
 */
export function ScrollReveal({
  children,
  index = 0,
  onLayout: onLayoutProp,
  style: boxStyle,
}: {
  children: ReactNode;
  index?: number;
  /** Kích thước/flex của chính khung bọc - khi bọc một Ô trong lưới wrap (ô tự hiện lúc nó vào màn). */
  style?: StyleProp<ViewStyle>;
  /** Nơi gọi cần đo chính khối (vd. parallax) — nhận layout của khung ngoài, toạ độ trong vùng khối. */
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const ctx = useContext(ScrollRevealContext);
  const reduceMotion = useReducedMotion();
  const { height: viewportH } = useWindowDimensions();
  const shown = useSharedValue(0);
  const laidOut = useSharedValue(0);
  const p = useSharedValue(reduceMotion || !ctx ? 1 : 0);
  const fallbackScroll = useSharedValue(0);
  const scrollY = ctx?.scrollY ?? fallbackScroll;
  const enabled = Boolean(ctx) && !reduceMotion;
  const ref = useAnimatedRef<Animated.View>();

  /*
   * Đo VỊ TRÍ THẬT trên màn (`measure` → `pageY`) ngay trên luồng UI mỗi khi cuộn / khi vừa dựng
   * xong - không cộng dồn `onLayout` (cái đó chỉ cho toạ độ so với cha TRỰC TIẾP, các khối lồng
   * trong khung khác bị coi là "đã vào màn" lúc mở trang - lỗi 09/11/2026). Mép trên khối lọt
   * vào màn (trừ ngưỡng) ⇒ hiện, một lần.
   */
  useAnimatedReaction(
    () => scrollY.value + laidOut.value,
    () => {
      if (!enabled || shown.value === 1 || laidOut.value === 0) return;
      const m = measure(ref);
      if (!m) return;
      if (m.pageY > viewportH - SCROLL_REVEAL_THRESHOLD) return;
      shown.value = 1;
      const delay = scrollY.value < 1 ? Math.min(index, 4) * 60 : 0;
      p.value = withDelay(delay, withTiming(1, { duration: SCROLL_REVEAL_MS, easing: Easing.out(Easing.cubic) }));
    },
    [enabled, viewportH, index],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    laidOut.value = laidOut.value + 1;
    onLayoutProp?.(e);
  };
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - p.value) * SCROLL_REVEAL_DISTANCE },
      { scale: SCROLL_REVEAL_SCALE_FROM + (1 - SCROLL_REVEAL_SCALE_FROM) * p.value },
    ],
  }));

  if (!enabled) {
    return onLayoutProp || boxStyle ? (
      <Animated.View onLayout={onLayoutProp} style={boxStyle}>
        {children}
      </Animated.View>
    ) : (
      <>{children}</>
    );
  }
  return (
    <Animated.View ref={ref} onLayout={onLayout} style={[boxStyle, style]}>
      <RevealProgressContext.Provider value={p}>{children}</RevealProgressContext.Provider>
    </Animated.View>
  );
}

/**
 * Cho danh sách (`Animated.FlatList`) tự dựng offset cuộn trên luồng UI: gắn `onScroll` (kèm
 * `scrollEventThrottle={16}`) vào list và bọc list bằng `<ScrollRevealProvider value={ctx}>`.
 */
export function useScrollRevealList() {
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  const ctx = useMemo(() => ({ scrollY }), [scrollY]);
  return { onScroll, ctx };
}

/**
 * Như `useScrollRevealList` nhưng theo mặc định của app (`ScrollRevealDefaultProvider`): `ctx` là
 * `null` ở app Partner ⇒ `ScrollRevealProvider value={null}` và các hàng render tĩnh. Dùng cho màn
 * danh sách DÙNG CHUNG hai app.
 */
export function useAppScrollRevealList() {
  const enabled = useScrollRevealDefault();
  const list = useScrollRevealList();
  return { onScroll: list.onScroll, ctx: enabled ? list.ctx : null };
}

/**
 * `ScrollReveal` TỰ ĐỘNG cho component dùng chung (vd. `Card`): chỉ bật khi đang ở trong một
 * `ScrollRevealProvider` VÀ chưa nằm trong một khối reveal khác (tránh trượt chồng hai lần).
 * Ngoài provider ⇒ trả nguyên `children`, không thêm view nào.
 */
export function AutoScrollReveal({ children }: { children: ReactNode }) {
  const inScreen = useContext(ScrollRevealContext) != null;
  const nested = useContext(RevealProgressContext) != null;
  if (!inScreen || nested) return <>{children}</>;
  return <ScrollReveal>{children}</ScrollReveal>;
}
