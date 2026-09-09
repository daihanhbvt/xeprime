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
