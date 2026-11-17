import { useState } from 'react';
import { Tabs } from 'expo-router';
import { BottomInsetConsumedContext, TabBarInsetContext } from '@/components/layout/tab-bar-inset';
import { ManageTabBar } from '@/features/shell/ManageTabBar';
import { useColors } from '@/theme/ThemeProvider';
import { duration } from '@/theme/motion';

/**
 * Các MỤC MENU của khu quản lý.
 *
 * Điều hướng theo design app Partner (Figma Partner-XePrime `Menu MB`): thanh menu dưới đáy năm ô
 * theo KHỐI của cây menu (`ManageTabBar` — Tổng quan · Vận hành · Xe & Tài xế · Doanh thu · Tài
 * khoản); ô Vận hành / Xe & Tài xế / Doanh thu mở tấm danh sách mục của khối, ô Tài khoản mở màn
 * "Tài khoản của tôi" (`more`). Ngữ nghĩa điều hướng là TAB: đổi mục là THAY màn và giữ nguyên state
 * của mục cũ, không phải chồng thêm một nấc.
 *
 * Thanh tab vẽ bằng `tabBar` riêng, KHÔNG phải thanh mặc định của react-navigation: nó đọc cây menu
 * (`manage-nav.ts`) chứ không đọc danh sách màn dưới đây.
 *
 * Chỉ những màn ĐỨNG TRONG MENU mới ở đây. Màn đi sâu (chi tiết đơn, bàn giao, quyết toán) nằm
 * ở stack bọc ngoài — lý do đầy đủ ở `../_layout.tsx`.
 *
 * **Phải khai TƯỜNG MINH từng màn**: Expo Router tự đăng ký mọi file trong nhóm này, và màn nào
 * không có `<Tabs.Screen>` sẽ vào danh sách mặc định — mất biểu tượng, tiêu đề là tên file. Danh
 * sách mục hiện cho người dùng đến từ `manage-nav.ts`, không từ cây thư mục.
 */
export default function ManageTabsLayout() {
  const colors = useColors();
  // Chiều cao thanh tab NỔI - màn bên trong chừa đúng chừng này ở cuối (như app khách).
  const [tabBarHeight, setTabBarHeight] = useState(0);
  return (
    <Tabs
      tabBar={() => <ManageTabBar onHeight={setTabBarHeight} />}
      // Thanh tab NỔI đè nội dung và tự đệm vạch home - màn bên trong không đệm thêm vạch home mà
      // chừa chiều cao thanh qua `TabBarInsetContext`.
      screenLayout={({ children }) => (
        <TabBarInsetContext.Provider value={tabBarHeight}>
          <BottomInsetConsumedContext.Provider value>{children}</BottomInsetConsumedContext.Provider>
        </TabBarInsetContext.Provider>
      )}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        transitionSpec: { animation: 'timing', config: { duration: duration.fast } },
        sceneStyle: { backgroundColor: colors.background },
        // Tab ẩn đứng yên (react-freeze): đổi sáng/tối chỉ vẽ lại tab đang xem.
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="requests" />
      {/* `/manage/trips` cũ — chỉ còn chuyển tiếp về "Đơn thuê xe" (web PR #278). */}
      <Tabs.Screen name="trips" />
      {/*
        `bookings/` KHÔNG có `_layout` riêng — cùng thủ pháp với `shop/` ở dưới: hai màn của nó
        là hai SCREEN phẳng của chính bộ tab này, nên đi từ "Tất cả đơn thuê" sang "Chờ giao xe"
        là ĐỔI mục chứ không chồng thêm một nấc lui, còn URL vẫn `/manage/bookings/awaiting-pickup`
        trùng web.

        Cả hai ở trong nhóm `(tabs)` để giữ thanh menu dưới đáy. `bookings/new` và
        `bookings/[id]` thì NGƯỢC LẠI — chúng là màn đi sâu, không có thanh menu, nên ở lại stack
        ngoài.
      */}
      <Tabs.Screen name="bookings/index" />
      <Tabs.Screen name="bookings/awaiting-pickup" />
      <Tabs.Screen name="bookings/ended" />
      <Tabs.Screen name="vehicles" />
      <Tabs.Screen name="maintenance" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="customers" />
      <Tabs.Screen name="chat" />
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
      {/* "Tài khoản & bảo mật" — hồ sơ của CON NGƯỜI đang đăng nhập (web `/account` site partner). */}
      <Tabs.Screen name="account" />
      <Tabs.Screen name="support" />
      {/*
        `support/cases` và `support/cases/[id]` là SCREEN PHẲNG của chính bộ tab này (không có
        `_layout` riêng dưới `support/`), cùng khuôn với nhóm `shop/` bên dưới: đi từ Trung tâm
        hỗ trợ sang Yêu cầu hỗ trợ là ĐỔI mục, không chồng thêm một nấc lui.
      */}
      <Tabs.Screen name="support/cases" />
      <Tabs.Screen name="support/cases/[id]" />
      {/*
        Các mục MENU của tuyến hoa hồng (Owner Lite — ADR 0053): đứng trong bộ tab như mọi mục menu
        khác, nên mở từ menu là ĐỔI mục chứ không chồng thêm một nấc lui (web: chuyển trang trong
        cùng khung). Màn dùng vỏ `manage` (`ShellPageHeader`).
      */}
      <Tabs.Screen name="registration" />
      <Tabs.Screen name="tax" />
      <Tabs.Screen name="bank-accounts" />
      <Tabs.Screen name="host-guide" />
      <Tabs.Screen name="contracts-documents" />
      <Tabs.Screen name="data-protection" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
