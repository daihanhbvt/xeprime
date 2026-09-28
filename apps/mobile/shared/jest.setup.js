// Keychain/Keystore không tồn tại trên Node. Bản trong bộ nhớ giữ đúng ngữ nghĩa "ghi rồi đọc
// lại được", nên test vòng đời token chạy thật chứ không phải mock từng lời gọi.
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    getItemAsync: async (key) => store.get(key) ?? null,
    setItemAsync: async (key, value) => {
      store.set(key, value);
    },
    deleteItemAsync: async (key) => {
      store.delete(key);
    },
    __reset: () => store.clear(),
  };
});

/**
 * `react-native-webview` là một MODULE NATIVE: import nó trong jest làm
 * `TurboModuleRegistry.getEnforcing('RNCWebViewModule')` ném ngay lúc nạp file, nên cả suite chết
 * trước khi chạy một test nào — kể cả những suite chỉ tình cờ nằm cùng cây import (ô địa chỉ kéo
 * theo tấm chỉnh ghim, và từ đó là mọi màn có ô địa chỉ).
 *
 * Bản giả là một `View` mang đủ props: test khẳng định được rằng bản đồ ĐƯỢC dựng, còn thứ bên
 * trong nó là một trang HTML chạy trong tiến trình khác và không có gì để jest kiểm.
 */
jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View, default: View };
});

/**
 * `expo-location` cũng là module native. `src/lib/device-location.ts` đã `require` nó một cách
 * lười và bọc try/catch, nhưng trong jest lời require đó THÀNH CÔNG rồi mới ném ở tầng
 * TurboModule — tức là lỗi rơi ra ngoài lớp bảo vệ, giữa một effect.
 *
 * Bản giả nói "chưa quyết" và không có vị trí nào: đúng trạng thái của một máy vừa cài, và là
 * trạng thái mà mọi test không nói gì về vị trí NÊN thấy. Test nào cần vị trí thì tự `jest.mock`
 * lại `@/lib/device-location` ở file của nó.
 */
jest.mock('expo-location', () => ({
  Accuracy: { Low: 1, Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => null),
}));

// Log của app không phải kết quả test; để nguyên thì mỗi lần chạy có một trang stack trace
// trông như lỗi. Test nào cần kiểm log thì tự `jest.requireActual`.
jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

afterEach(() => {
  // CỐ Ý không đụng tới `@/lib/auth-session` ở đây: require nó trong setup sẽ nạp module TRƯỚC
  // khi `jest.mock('expo-constants')` của file test kịp có hiệu lực. File test nào dùng kho
  // token thì tự gọi `resetAuthSessionForTest()`.
  jest.requireMock('expo-secure-store').__reset();
});

/**
 * Ngưỡng chờ mặc định của `waitFor`/`findBy*` — 1s của RNTL hợp với một component trần, không
 * hợp với suite này.
 *
 * Mỗi test ở đây dựng cả cây provider (Redux + React Query + intl) rồi chờ 2–3 truy vấn giả
 * lắng xuống; jest chạy song song nhiều worker nên một worker đang tải nặng có thể vượt 1s và
 * biến một màn hình ĐÚNG thành một test đỏ ngẫu nhiên. Nới ở MỘT chỗ thay vì rắc `{ timeout }`
 * vào từng chỗ chờ.
 *
 * Đây là biên an toàn, KHÔNG phải cách chữa một test đỏ: `waitFor` trả về ngay khi điều kiện
 * đúng, nên test xanh không chậm đi một mili-giây nào — nhưng một test chờ nhầm thứ (chờ tiêu
 * đề khối trong khi cần chờ HÀNG dữ liệu) thì chờ bao lâu cũng vẫn sai. Gặp đỏ ngẫu nhiên thì
 * soi lại chỗ neo trước, đừng tăng số này.
 *
 * Và đừng chạm ngưỡng 5s mặc định của jest: bằng nhau thì jest hết giờ TRƯỚC, nuốt mất câu
 * "Unable to find …" và để lại đúng một dòng "Exceeded timeout" không nói được gì.
 */
require('@testing-library/react-native').configure({ asyncUtilTimeout: 3000 });
