import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Chiều cao thanh tab NỔI (đè lên nội dung, kiểu Facebook — người dùng chốt 28/10/2026).
 *
 * Thanh tab không còn chiếm chỗ trong dòng chảy: nội dung cuộn xuống DƯỚI nó và vẫn nhìn thấy qua
 * hai bên viên. Màn cuộn phải chừa đúng chừng này ở cuối, không thì mục cuối nằm khuất dưới thanh.
 * Ngoài bộ tab (màn đẩy lên) giá trị là 0.
 */
export const TabBarInsetContext = createContext(0);

export function useTabBarInset(): number {
  return useContext(TabBarInsetContext);
}

/**
 * Thanh tab ẩn/hiện theo hướng cuộn (kiểu Facebook — người dùng chốt 29/10/2026): 0 = hiện,
 * 1 = trượt xuống khỏi màn. CHỈ màn Trang chủ ghi vào; layout bộ tab trả về 0 mỗi lần đổi tab, nên
 * các màn khác giữ thanh như cũ. Ngoài bộ tab giá trị là `null` — màn dùng chung tự bỏ qua.
 */
export const TabBarHideContext = createContext<SharedValue<number> | null>(null);

export function useTabBarHide(): SharedValue<number> | null {
  return useContext(TabBarHideContext);
}

