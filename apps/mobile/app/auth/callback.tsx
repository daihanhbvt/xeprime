import { ScreenLoading } from '@/components/state/ScreenLoading';

/**
 * Chỗ hạ cánh của deep link `xeprime://auth/callback` — màn này KHÔNG làm gì cả, và đó là toàn
 * bộ mục đích của nó.
 *
 * Vì sao phải tồn tại: `WebBrowser.openAuthSessionAsync` bắt được URL quay về và trả nó cho
 * `signInWithSocial` — nhưng trên Android, redirect đó đồng thời đi qua hệ thống intent, nên
 * expo-router CŨNG nhận nó như một lần điều hướng. Không có file này thì đường `/auth/callback`
 * không khớp route nào và router nhảy vào `+not-found`: người dùng thấy chớp màn "Không thấy
 * trang" khoảng một giây rồi mới vào được app — đúng triệu chứng trong log.
 *
 * Không xử lý `code` ở đây. Mã đó đã nằm trong tay `signInWithSocial` qua giá trị trả về của
 * `openAuthSessionAsync`, và đọc nó lần thứ hai từ route params là hai nơi cùng tiêu một mã
 * dùng-một-lần — nơi thứ hai chắc chắn thất bại.
 *
 * `enterApp()` sẽ `dismissAll()` ngay sau khi đổi mã xong, nên màn này biến mất mà không cần
 * tự điều hướng. Hoạt cảnh của nó tắt ở `app/_layout.tsx` để không có cú trượt thừa.
 */
export default function SocialCallbackRoute() {
  return <ScreenLoading />;
}
