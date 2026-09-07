import { useCallback, useMemo } from 'react';

/** Đúng hai prop mà `<Screen>` cần để có kéo-làm-mới. */
export interface ScreenRefresh {
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Kéo-làm-mới cho một màn có FORM.
 *
 * `onRefresh` LUÔN có mặt — đây là điểm quan trọng nhất của file này.
 *
 * Bản đầu trả `onRefresh: undefined` khi form bẩn, định bỏ luôn cử chỉ để nó không xoá thứ đang
 * gõ. Nhưng `<Screen>` truyền prop đó xuống `refreshControl` của `ScrollView`, và trên Android
 * React Native chỉ bọc `AndroidSwipeRefreshLayout` quanh danh sách KHI có `refreshControl` —
 * cho prop đó xuất hiện rồi biến mất là đổi cây view gốc, tức `ScrollView` bị dựng lại: ô đang
 * gõ mất tiêu điểm, bàn phím sập xuống, màn nhảy về đầu. Mà cờ `isDirty` lật đúng ở KÝ TỰ ĐẦU
 * TIÊN người dùng gõ — nên lỗi rơi vào giữa lúc nhập, chỗ khó chịu nhất.
 *
 * Thứ bảo vệ dữ liệu đang gõ giờ là `resetOptions: { keepDirtyValues: true }` của chính
 * `useForm`: dữ liệu mới về vẫn nạp vào các ô CHƯA đụng tới, còn ô đang gõ dở thì giữ nguyên.
 * Đó là cơ chế của React Hook Form, không phải thứ tôi tự canh — và nó không đụng gì tới cây
 * view, nên không có cách nào làm sập bàn phím.
 *
 * `refreshing` vẫn tắt khi form bẩn: vòng quay chỉ nên xuất hiện khi người dùng CHỦ ĐỘNG kéo,
 * không phải mỗi lần có refetch nền trong lúc họ đang nhập.
 */
export function useFormRefresh(
  isDirty: boolean,
  refreshing: boolean,
  refetch: () => void,
): ScreenRefresh {
  const onRefresh = useCallback(() => refetch(), [refetch]);

  return useMemo(
    () => ({ refreshing: refreshing && !isDirty, onRefresh }),
    [isDirty, refreshing, onRefresh],
  );
}
