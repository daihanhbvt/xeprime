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
