import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CONTENT_MAX_WIDTH } from '@/theme/layout';
import { makeStyles } from '@/theme/ThemeProvider';

/**
 * Cột nội dung của cả app — bọc navigator gốc ở `app/_layout.tsx` của CẢ HAI app.
 *
 * Điện thoại: cột = cả màn, không đổi gì. Máy tính bảng: mọi màn, thanh tiêu đề, thanh tab và
 * danh sách nằm trong một cột giữa rộng tối đa `CONTENT_MAX_WIDTH`, hai bên là nền trang. Đặt ở
 * GỐC thay vì từng màn: ~25 màn dựng danh sách riêng (`FlatList`) không đi qua `Screen`, sửa từng
 * màn là chắc chắn sót.
 *
 * Hai thứ cột này KHÔNG với tới được, phải tự lo: khối tự tính cỡ theo bề ngang (dùng
 * `useContentWidth`), và `Modal` (cửa sổ riêng — dùng `modalColumn`).
 */
export function ContentColumn({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.outer}>
      <View style={styles.column}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  outer: { flex: 1, backgroundColor: colors.background },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
}));
