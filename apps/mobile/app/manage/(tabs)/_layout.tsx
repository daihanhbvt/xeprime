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
        <Tabs.Screen name="vehicles" />
        <Tabs.Screen name="maintenance" />
        <Tabs.Screen name="calendar" />
        <Tabs.Screen name="customers" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="subscription" />
        <Tabs.Screen name="balance" />
        <Tabs.Screen name="finance" />
        <Tabs.Screen name="receipts" />
        <Tabs.Screen name="debts" />
        {/*
          Nhóm Gian hàng: `shop/` KHÔNG có `_layout` riêng, nên năm màn của nó là năm SCREEN phẳng
          của chính bộ tab này (`shop/index`, `shop/branches`, `shop/policies`,
          `shop/payment-settings`, `shop/seller-profile`) — không phải một
          navigator lồng. Nhờ vậy đi từ Chi nhánh sang Chính sách là ĐỔI mục, không chồng thêm
          một nấc lui; còn URL vẫn là `/manage/shop/branches`, trùng web để deep link ánh xạ 1-1.
        */}
        <Tabs.Screen name="shop/index" />
        <Tabs.Screen name="shop/branches" />
        <Tabs.Screen name="shop/policies" />
        <Tabs.Screen name="shop/payment-settings" />
        <Tabs.Screen name="shop/seller-profile" />
        <Tabs.Screen name="members" />
        <Tabs.Screen name="drivers" />
        {/*
          "Tài khoản & bảo mật" (ADR 0038 điều 7) và lối chuyển tiếp của nó — SCREEN PHẲNG của
          chính bộ tab này, cùng khuôn với nhóm `shop/` và `support/`. `account/trips` không có
          mục menu nào dẫn tới: lối vào duy nhất là thẻ theo ngữ cảnh trong `account`.
        */}
        <Tabs.Screen name="account" />
        <Tabs.Screen name="account/trips" />
        <Tabs.Screen name="support" />
        {/*
          `support/cases` và `support/cases/[id]` là SCREEN PHẲNG của chính bộ tab này (không có
          `_layout` riêng dưới `support/`), cùng khuôn với nhóm `shop/` bên dưới: đi từ Trung tâm
          hỗ trợ sang Yêu cầu hỗ trợ là ĐỔI mục, không chồng thêm một nấc lui.
        */}
        <Tabs.Screen name="support/cases" />
        <Tabs.Screen name="support/cases/[id]" />
        <Tabs.Screen name="more" />
      </Tabs>
    </ManageDrawerHost>
  );
}
