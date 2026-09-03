import { Tabs } from 'expo-router';
import { ManageDrawerHost } from '@/features/shell/ManageDrawerHost';
import { colors } from '@/theme/tokens';
import { duration } from '@/theme/motion';

/**
 * Các MỤC MENU của khu quản lý.
 *
 * Menu là SIDEBAR (`ManageDrawerHost`), nhưng ngữ nghĩa điều hướng vẫn phải là TAB: đổi mục là
 * THAY màn và giữ nguyên state của mục cũ, không phải chồng thêm một nấc. Dùng `Stack` thì bấm
 * qua lại năm mục là năm màn xếp chồng và nút lui đi ngược cả lịch sử đó.
 *
 * Nên giữ `<Tabs>` cho phần định tuyến và tắt phần vẽ: `tabBar={() => null}`.
 *
 * Chỉ những màn ĐỨNG TRONG MENU mới ở đây. Màn đi sâu (chi tiết đơn, bàn giao, quyết toán) nằm
 * ở stack bọc ngoài — lý do đầy đủ ở `../_layout.tsx`.
 *
 * **Phải khai TƯỜNG MINH từng màn**: Expo Router tự đăng ký mọi file trong nhóm này, và màn nào
 * không có `<Tabs.Screen>` sẽ vào danh sách mặc định — mất biểu tượng, tiêu đề là tên file. Danh
 * sách mục hiện cho người dùng đến từ `manage-nav.ts`, không từ cây thư mục.
 */
export default function ManageTabsLayout() {
  return (
    <ManageDrawerHost>
      <Tabs
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          transitionSpec: { animation: 'timing', config: { duration: duration.fast } },
          sceneStyle: { backgroundColor: colors.background },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="bookings" />
        <Tabs.Screen name="more" />
        <Tabs.Screen name="handovers/missing-odometer" />
      </Tabs>
    </ManageDrawerHost>
  );
}
