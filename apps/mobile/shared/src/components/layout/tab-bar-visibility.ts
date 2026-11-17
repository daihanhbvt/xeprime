import { useNavigation } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Ẩn thanh tab nổi khi một màn chi tiết đang mở NGAY TRONG một tab (vd. chi tiết yêu cầu thay nội
 * dung màn Đơn thuê xe) - như màn chi tiết đơn (stack ngoài tab). Đếm số người xin ẩn để nhiều màn
 * lồng nhau không bật lại thanh quá sớm.
 */
let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Gọi trong màn cần che thanh tab - tự trả lại khi màn tháo HOẶC mất focus: màn trong một tab được
 * giữ sống sau khi quay về (không tháo), nên chỉ trả khi tháo thì thanh tab mất vĩnh viễn ở màn trước.
 */
export function useHideTabBar(active = true): void {
  const navigation = useNavigation();
  useEffect(() => {
    if (!active) return;
    let hiding = false;
    const hide = () => {
      if (hiding) return;
      hiding = true;
      hiders += 1;
      emit();
    };
    const show = () => {
      if (!hiding) return;
      hiding = false;
      hiders -= 1;
      emit();
    };
    if (navigation.isFocused()) hide();
    const offFocus = navigation.addListener('focus', hide);
    const offBlur = navigation.addListener('blur', show);
    return () => {
      offFocus();
      offBlur();
      show();
    };
  }, [active, navigation]);
}

/** Thanh tab đọc: có màn nào đang xin ẩn không. */
export function useTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hiders > 0, () => false);
}
