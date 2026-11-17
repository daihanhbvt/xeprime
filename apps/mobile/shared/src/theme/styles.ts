import { makeStyles } from './ThemeProvider';

/** Style khung màn hình dùng lại nhiều nơi — dựng một lần để `memo` bên dưới không bị trượt. */
export const useAppStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  /**
   * Lớp phủ TRONG CÂY phủ trọn khung cha (tấm trượt `presentation="overlay"`). `elevation` cao để
   * Android vẽ nó trên anh em đã có bóng (viên thanh tab nổi) - thứ tự JSX không đủ ở đó.
   */
  overlayFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100 },
  /** Lớp phủ mờ dưới bottom sheet / modal, bắt cú chạm ra ngoài để đóng. */
  scrim: { flex: 1, backgroundColor: colors.overlay },
}));
