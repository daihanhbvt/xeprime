import { useCallback, useRef, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import { duration } from '@/theme/motion';

/** Nhịp so le giữa hai mục liền nhau. */
export const REVEAL_STAGGER_MS = 80;
/** Trần độ trễ — mục thứ 20 không phải chờ cả giây mới hiện. */
export const REVEAL_MAX_DELAY_MS = 640;
/** Chỉ ~N mục đầu của danh sách so le; phần cuộn tới sau hiện ngay. */
export const LIST_REVEAL_COUNT = 8;
/** Quá quãng này kể từ lần đầu có dữ liệu thì mục mới mount (cuộn tới, làm mới) không animate nữa. */
// 2s: lượt render đầu của FlatList có thể tới sau 0,9s, khi đó thẻ hiện luôn không có hiệu ứng.
const LIST_REVEAL_WINDOW_MS = 2000;
/** Quãng trượt lên khi xuất hiện (dp). */
// 24dp + 420ms: bản 10dp/260ms quá nhẹ, người dùng không nhận ra (04/11/2026).
const REVEAL_OFFSET = 24;
const REVEAL_DURATION_MS = 420;

function revealDelay(index: number) {
  return Math.min(Math.max(index, 0) * REVEAL_STAGGER_MS, REVEAL_MAX_DELAY_MS);
}

/**
 * Hiệu ứng xuất hiện chuẩn của app: mờ dần + trượt lên ~10dp. Chạy trên luồng UI (layout
 * animation `entering`) nên chỉ chạy MỘT lần lúc mount — render lại / refetch không chạy lại.
 * Tôn trọng "Giảm chuyển động" của hệ thống.
 */
export function revealEntering(index = 0, variant: 'rise' | 'fade' = 'rise') {
  // Hai nhánh tách riêng: gọi chuỗi trên kiểu hợp FadeIn | FadeInDown làm TS hỏng `this`.
  if (variant === 'fade') {
    return FadeIn.duration(REVEAL_DURATION_MS)
      .delay(revealDelay(index))
      .reduceMotion(ReduceMotion.System);
  }
  return FadeInDown.withInitialValues({ opacity: 0, transform: [{ translateY: REVEAL_OFFSET }] })
    .duration(REVEAL_DURATION_MS)
    .delay(revealDelay(index))
    .reduceMotion(ReduceMotion.System);
}

/** Chuyển vị trí mượt khi danh sách lọc/xoá mục (dùng cho `layout` / `itemLayoutAnimation`). */
export const listLayoutTransition = LinearTransition.duration(duration.base).reduceMotion(
  ReduceMotion.System,
);

interface RevealProps {
  children: ReactNode;
  /** Thứ tự trong nhóm để so le (0 = không trễ). */
  index?: number;
  /** `fade` = chỉ mờ dần, cho khối lớn/tràn viền không nên trượt. */
  variant?: 'rise' | 'fade';
  /** Tắt hiệu ứng (vd mục danh sách cuộn tới sau) — vẫn giữ nguyên cây view. */
  disabled?: boolean;
  /** Chiếm hết chỗ còn lại (`flex: 1`) — cho khối trạng thái tự canh giữa màn. */
  fill?: boolean;
  /** Mục danh sách đi qua cổng `useListReveal` — chỉ loại này được so le vào màn. */
  listItem?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bọc một khối để nó hiện lần lượt. Không bọc ô nhập (`TextInput`) trong thứ này rồi đổi style
 * theo state — xem ghi chú ở `Screen.tsx`; `entering` chỉ chạy lúc mount nên bản thân nó an toàn.
 */
export function Reveal({
  children,
  index,
  variant = 'rise',
  disabled = false,
  listItem = false,
  fill = false,
  style,
}: RevealProps) {
  /*
   * Khối tĩnh (không `listItem`) vẫn là lớp bọc trơn — bản hiện-dần cho MỌI khối bị tắt 04/11/2026
   * ("cảm giác bị lag và render lại"). Chỉ MỤC DANH SÁCH (`listItem`, qua cổng `useListReveal`:
   * vài mục đầu, lượt dữ liệu đầu) được so le vào màn — 06/11/2026.
   */
  if (!listItem) {
    return <View style={[fill ? styles.fill : null, style]}>{children}</View>;
  }
  return (
    <Animated.View
      // Cùng MỘT kiểu view dù cổng đóng hay mở — đổi View↔Animated.View là gắn lại cả thẻ.
      // `entering` chỉ đọc lúc mount, nên cổng đóng về sau không làm gì mục đã hiện.
      entering={disabled ? undefined : revealEntering(index ?? 0, variant)}
      style={[fill ? styles.fill : null, style]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

/**
 * Cổng so le cho danh sách ảo hoá: chỉ `LIST_REVEAL_COUNT` mục đầu, và chỉ trong lượt dữ liệu
 * ĐẦU TIÊN (tính từ lúc `hasItems` lần đầu đúng — skeleton trước đó không ăn mất quãng). Mục
 * cuộn tới sau, mục của trang kế, mục về sau kéo-làm-mới đều hiện ngay, không giật khi cuộn.
 *
 * `resetKey` đổi (vd đổi bộ lọc / tab) thì mở lại cổng cho lượt dữ liệu kế — KHÔNG truyền gì
 * đổi theo kéo-làm-mới.
 *
 * Trả hàm `(index) => boolean` — `true` thì animate. Tham chiếu ổn định (dùng được trong
 * `renderItem` đã `useCallback`).
 */
export function useListReveal(hasItems: boolean, resetKey?: string) {
  const startedAt = useRef<number | null>(null);
  const lastKey = useRef(resetKey);
  if (lastKey.current !== resetKey) {
    lastKey.current = resetKey;
    startedAt.current = null;
  }
  if (hasItems && startedAt.current === null) startedAt.current = Date.now();
  return useCallback(
    (index: number) =>
      startedAt.current !== null &&
      index < LIST_REVEAL_COUNT &&
      Date.now() - startedAt.current < LIST_REVEAL_WINDOW_MS,
    [],
  );
}
