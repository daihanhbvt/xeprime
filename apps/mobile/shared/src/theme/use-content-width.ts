import { useWindowDimensions } from 'react-native';
import { CONTENT_MAX_WIDTH, TABLET_MIN_WIDTH } from './layout';

/**
 * Bề ngang của CỘT nội dung — dùng thay `useWindowDimensions().width` cho mọi phép tính cỡ của
 * khối nằm trong màn (banner, băng chuyền, ảnh, lưới).
 *
 * Bằng đúng bề ngang `ContentColumn` ở gốc app: điện thoại = cả màn, máy tính bảng = trần
 * `CONTENT_MAX_WIDTH`. Đọc thẳng cửa sổ thì trên iPad khối tính theo 1032dp trong khi chỉ được
 * vẽ trong cột hẹp hơn — tràn ra ngoài và bị cắt.
 *
 * KHÔNG dùng cho thứ cố ý phủ CẢ màn (trình xem ảnh toàn màn, pháo giấy) hay chỉ cần CHIỀU CAO.
 */
export function useContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, CONTENT_MAX_WIDTH);
}

/** Đang ở bố cục máy tính bảng (cột ≥ `TABLET_MIN_WIDTH`) — xem `theme/layout.ts`. */
export function useIsTabletLayout(): boolean {
  return useContentWidth() >= TABLET_MIN_WIDTH;
}
