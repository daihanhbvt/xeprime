import { configure } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * `testTimeout` ở vitest.config.ts chỉ nới đồng hồ CỦA CẢ TEST; `findBy*`/`waitFor` có đồng hồ
 * RIÊNG của testing-library và vẫn đứng ở mặc định 1s. Đó là khe hở còn lại: khi chạy cả bộ
 * song song, `findByRole(..., { name })` phải tính accessible name trên cây AntD lớn ở mỗi vòng
 * poll và chạm 1s vì MÁY BẬN, không phải vì component sai — cùng test đó xanh khi chạy riêng.
 *
 * Nới một lần ở đây, đúng lý do đã ghi cho `testTimeout`, thay vì bẻ cong từng test.
 */
configure({ asyncUtilTimeout: 5_000 });

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

/**
 * `IntersectionObserver` cũng không có trong jsdom, mà các danh sách TẢI DẦN dùng nó làm mốc
 * chạm đáy (`MarketplaceResults`, bộ chọn xe của luồng đặt hộ). Stub rỗng: test không mô phỏng
 * cuộn thật, nó gọi thẳng callback qua instance được ghi lại khi cần.
 */
if (!('IntersectionObserver' in window)) {
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  });
}
