import { Stack } from 'expo-router';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { ScopeGuard } from '@/features/shell/ScopeGuard';
import { useTrackScopeRoute } from '@/features/shell/use-track-scope-route';
import { colors } from '@/theme/tokens';

/**
 * NAVIGATOR B — khu quản lý gian hàng.
 *
 * Navigator riêng, độc lập với bộ tab của khách: expo-router chỉ dựng một navigation container
 * cho cả app, nên "hai navigator" ở đây nghĩa là hai cây con có `_layout` riêng cùng nằm dưới
 * `Stack` gốc — không phải hai container.
 *
 * `manage` là segment THẬT trong URL (không ngoặc), cố ý trùng web: `/manage/bookings` bên web
 * và `xeprime://manage/bookings` bên app trỏ cùng một chỗ, nên thông báo đẩy chỉ cần mang URL.
 *
 * **Một STACK bọc ngoài bộ tab.** Các mục của menu là TAB (xem `(tabs)/_layout.tsx`), nhưng màn
 * đi sâu — chi tiết đơn, biên bản bàn giao, quyết toán — thì không được nằm trong tab nào: mở
 * chi tiết đơn từ hộp thư yêu cầu (một tab khác) thì expo-router chuyển tab và đặt chi tiết làm
 * mục DUY NHẤT của stack đó, nên bấm lui rơi lên tầng tab và đưa người dùng về một màn họ chưa
 * từng mở. Ở stack ngoài thì lui luôn trả về đúng màn vừa rời, còn nguyên bộ lọc và vị trí cuộn.
 *
 * Nhóm `(tabs)` có ngoặc nên KHÔNG hiện trong URL: `/manage`, `/manage/requests`,
 * `/manage/bookings` giữ nguyên như cũ và như web.
 */
export default function ManageLayout() {
  useTrackScopeRoute(APP_SCOPE.MANAGE);

  return (
    <ScopeGuard>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </ScopeGuard>
  );
}
