import { vi } from 'vitest';

/**
 * jsdom không có `window.matchMedia`, còn Ant Design gọi nó ở khá nhiều component
 * (Modal/Drawer/Grid qua `responsiveObserver`). Thiếu polyfill thì test nào render AntD cũng
 * chết bằng `matchMedia is not a function` — lỗi hạ tầng, không liên quan gì tới thứ đang test.
 *
 * Đặt ở setup dùng chung thay vì `beforeAll` chép lại trong từng file test.
 * Mặc định `matches: false` = desktop; test nào cần mobile thì mock `@/hooks/use-media-query`.
 */
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

/**
 * jsdom cũng không có `ResizeObserver`, mà AntD dùng nó để đo (Tabs kẻ gạch tab đang chọn,
 * Table đo cột…). Stub rỗng là đủ: test không kiểm tra kích thước, chỉ cần component đừng nổ.
 */
if (!('ResizeObserver' in window)) {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
}
