import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/**
 * Màn chứa component này có đang ĐƯỢC TIÊU ĐIỂM không.
 *
 * Khác `navigation.isFocused()` ở chỗ nó là GIÁ TRỊ, không phải một phép hỏi: đọc `isFocused()`
 * trong lúc render thì React không có cách nào biết để vẽ lại khi tiêu điểm đổi, nên màn sẽ đứng
 * nguyên ở trạng thái cũ. Hook này đổi tiêu điểm thành state, nên giao diện bám theo được.
 *
 * Hai chỗ cần đúng thứ này, và đó là lý do nó rời ra khỏi `use-now`:
 *   - dừng việc chạy nền khi người dùng rời màn (đồng hồ đếm ngược của hộp thư yêu cầu);
 *   - **ẩn một tấm trượt trong lúc đi sang màn khác rồi trả lại nguyên vẹn khi quay về** — một
 *     `Modal` của React Native nằm trên MỌI thứ, kể cả màn vừa được đẩy lên, nên nó buộc phải
 *     biến mất lúc rời màn; nhưng "biến mất" khác hẳn "bị đóng".
 *
 * Khởi tạo `false` chứ không `true`: `useFocusEffect` chạy ngay sau lần commit đầu nếu màn đang
 * focus, nên giá trị đúng có ngay ở khung hình kế tiếp — còn khởi tạo `true` thì một màn dựng sẵn
 * ở nền (tab chưa mở) sẽ tự nhận mình đang focus cho tới lúc có sự kiện đầu tiên.
 */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return focused;
}
