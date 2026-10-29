import { makeStyles } from './ThemeProvider';

/** Style khung màn hình dùng lại nhiều nơi — dựng một lần để `memo` bên dưới không bị trượt. */
export const useAppStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  /** Lớp phủ mờ dưới bottom sheet / modal, bắt cú chạm ra ngoài để đóng. */
  scrim: { flex: 1, backgroundColor: colors.overlay },
}));
