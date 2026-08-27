import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

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
 * `Element.scrollIntoView` cũng vắng mặt trong jsdom. Nơi nào đưa một khối vừa mở ra vào tầm
 * mắt (bảng chi tiết giá của luồng đặt xe, đáy khung chat) đều gọi nó, và thiếu nó thì test
 * chết vì "không phải là hàm" — trong khi cuộn không phải thứ test đang kiểm.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
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

/**
 * Bọc MỌI `render`/`renderHook` bằng provider đa ngữ, mặc định TIẾNG VIỆT.
 *
 * Sau khi i18n hoá, gần như component nào cũng gọi `useTranslations`/`useFormatter`, và
 * next-intl ném lỗi khi không có provider. Có ba cách xử lý và chỉ một cách đúng:
 *
 *   - Sửa 93 file test để tự bọc provider → nhiễu khổng lồ, và lần sau ai quên thì đỏ lại.
 *   - Mock `next-intl` trả về chính khoá message → test xanh cả khi bản dịch bị xoá, tức là
 *     nó khoá đúng thứ không quan trọng.
 *   - Bọc một lần ở đây bằng BÓ MESSAGE THẬT (cách này).
 *
 * Vì tiếng Việt là ngôn ngữ mặc định, mọi test đang tìm phần tử bằng nhãn tiếng Việt vẫn đúng
 * nguyên văn — không phải hạ chúng xuống selector chung chung để né bản dịch. Test nào cần
 * tiếng Anh thì dùng `renderWithIntl(ui, { locale: 'en' })` của `@/i18n/test-utils`.
 *
 * `wrapper` do test truyền vào được lồng BÊN TRONG provider, không bị thay thế.
 */
vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();
  const { IntlTestProvider } = await import('./src/i18n/test-utils');

  const withIntl = (Inner?: React.ComponentType<{ children: React.ReactNode }>) =>
    function IntlWrapper({ children }: { children: React.ReactNode }) {
      return <IntlTestProvider>{Inner ? <Inner>{children}</Inner> : children}</IntlTestProvider>;
    };

  /*
   * Chữ ký gốc của `render`/`renderHook` là generic theo bộ query tuỳ biến. Repo không dùng
   * query tuỳ biến ở đâu cả, nên bọc theo chữ ký KHÔNG generic là đủ và giữ được kiểu ở mọi
   * chỗ gọi; ép kiểu một lần ở đây thay vì dựng lại toàn bộ generic của thư viện.
   */
  const render = (
    ui: Parameters<typeof actual.render>[0],
    options?: Parameters<typeof actual.render>[1],
  ) => actual.render(ui, { ...options, wrapper: withIntl(options?.wrapper) });

  const renderHook = <TResult, TProps>(
    callback: (props: TProps) => TResult,
    options?: Parameters<typeof actual.renderHook<TResult, TProps>>[1],
  ) => actual.renderHook(callback, { ...options, wrapper: withIntl(options?.wrapper) });

  return { ...actual, render, renderHook } as typeof actual;
});

/**
 * Dọn DOM sau MỖI test, tường minh.
 *
 * Testing Library tự đăng ký việc này lúc module được nạp; nhưng ở đây module bị `vi.mock`
 * bọc lại, nên thời điểm nạp thật rơi vào lần import đầu tiên bên trong factory — có lần muộn
 * hơn lúc vitest thu thập hook. Hệ quả là DOM của test trước còn sót, và `getByRole` báo
 * "found multiple elements" một cách ngẫu nhiên. Đăng ký thêm ở đây là idempotent và biến một
 * bộ test chập chờn thành xác định.
 */
afterEach(cleanup);
