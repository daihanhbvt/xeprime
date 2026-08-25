import { Stack } from 'expo-router';

/**
 * Cổng vào của mọi màn cần đăng nhập.
 *
 * Guard đang TẮT có chủ đích: base chưa gọi API nào lúc khởi động, `/home` vào thẳng bằng nút.
 * Bật lại = thay thân hàm bằng `useSessionGate()` — hook, test và tầng 401 ở
 * `src/features/auth/` vẫn nguyên vẹn, xem README mục 5.
 */
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
