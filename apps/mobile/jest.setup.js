const { resetInterceptors } = require('./src/lib/http-interceptors');

// Registry interceptor là state toàn cục của module — rò một cái là hỏng file test khác,
// và lỗi sẽ hiện ra ở nơi không liên quan.
afterEach(() => {
  resetInterceptors();
});

// Log của app không phải kết quả test; để nguyên thì mỗi lần chạy có một trang stack trace
// trông như lỗi. Test nào cần kiểm log thì tự `jest.requireActual`.
jest.mock('@/lib/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
