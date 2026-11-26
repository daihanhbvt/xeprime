import { useSharedValue, withTiming } from 'react-native-reanimated';
import { useTabBarHide } from '@/components/layout/tab-bar-inset';
import { IS_PARTNER_APP } from '@/lib/app-kind';

/** Bỏ qua rung nhỏ hơn chừng này (px) để thanh không nháy khi ngón tay khựng. */
const SCROLL_SLOP = 8;
const SLIDE_MS = 220;

/**
 * Thanh menu dưới đáy app Partner kiểu Facebook (feedback thiết kế 20/11/2026, dòng 7): cuộn XUỐNG
 * thì trượt mất, cuộn LÊN (hoặc về đầu trang) thì hiện lại - MỌI màn, không riêng Tổng quan.
 *
 * Trả về một hàm `(y) => void` gọi được cả trong worklet cuộn (Reanimated) lẫn trên luồng JS;
 * `null` khi không có thanh để ẩn (ngoài bộ tab, hoặc app khách - app khách chỉ Trang chủ ghi).
 */
export function useTabBarAutoHide(): ((y: number) => void) | null {
  const hide = useTabBarHide();
  const lastY = useSharedValue(0);
  const target = useSharedValue(0);
  if (!IS_PARTNER_APP || !hide) return null;
  return (y: number) => {
    'worklet';
    const dy = y - lastY.value;
    if (Math.abs(dy) < SCROLL_SLOP && y > 0) return;
    const next = y > SCROLL_SLOP && dy > 0 ? 1 : 0;
    if (target.value !== next) {
      target.value = next;
      hide.value = withTiming(next, { duration: SLIDE_MS });
    }
    lastY.value = y;
  };
}
