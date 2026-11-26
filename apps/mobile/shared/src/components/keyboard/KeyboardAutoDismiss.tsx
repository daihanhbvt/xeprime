import { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { usePathname } from 'expo-router';

/**
 * Chuyển màn là CẤT bàn phím - đặt MỘT lần ở layout gốc của cả hai app (người dùng 25/11/2026).
 *
 * Lỗi nó chữa: nhập xong, bấm Lưu/Duyệt/Huỷ → thao tác thành công và app lùi/đi sang màn khác,
 * nhưng ô nhập vừa bị gỡ khỏi cây khi còn tiêu điểm nên Android KHÔNG tự đóng bàn phím - nó nằm
 * lại che màn mới và người dùng không biết đường tắt. `Keyboard.dismiss()` là no-op khi không có
 * bàn phím, nên gọi ở mọi lần đổi đường dẫn là an toàn.
 *
 * Ba lớp cùng nhau (đủ cho mọi đường): nút bấm (`Button`/`ActionSheetButtons`) cất trước khi chạy;
 * mutation THÀNH CÔNG (`query-client`) cất sau khi xong; tấm trượt đóng (`BottomSheet`) và đổi
 * màn (component này) cất khi cảnh đổi.
 */
export function KeyboardAutoDismiss() {
  const pathname = usePathname();
  useEffect(() => {
    Keyboard.dismiss();
  }, [pathname]);
  return null;
}
