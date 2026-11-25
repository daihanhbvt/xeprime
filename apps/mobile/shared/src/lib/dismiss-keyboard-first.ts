import { Keyboard } from 'react-native';

/**
 * Chạm ra ngoài một popup (lớp nền mờ): bàn phím đang mở thì CHỈ cất bàn phím, chưa đóng popup -
 * đóng luôn là mất chữ người dùng đang gõ dở (ghi chú của tấm Từ chối, ô tìm địa điểm…). Chạm lần
 * nữa (bàn phím đã tắt) mới đóng. Quy tắc chung cho MỌI popup có lớp nền chạm-để-đóng (người dùng
 * chốt 20/11/2026) - nút ✕ / Back vẫn đóng ngay.
 */
export function dismissKeyboardFirst(onClose: () => void): () => void {
  return () => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    onClose();
  };
}
