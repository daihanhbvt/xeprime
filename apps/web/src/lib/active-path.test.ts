import { describe, expect, it } from 'vitest';

import { isActivePath } from './active-path';

/**
 * Phép so "đang ở trang này" dùng chung cho thanh điều hướng và chân trang. Nó quyết định một
 * thứ người dùng nhìn thấy trên MỌI trang công khai, nên các cạnh của nó được khoá lại ở đây.
 */
describe('isActivePath', () => {
  it('khớp đúng chính nó', () => {
    expect(isActivePath('/about', '/about')).toBe(true);
    expect(isActivePath('/legal/terms', '/legal/terms')).toBe(true);
  });

  it('không khớp một trang khác', () => {
    expect(isActivePath('/about', '/app')).toBe(false);
    expect(isActivePath('/legal/terms', '/legal/privacy')).toBe(false);
  });

  /** Đang đọc một văn bản pháp lý thì mục "Pháp lý" cũng là đang xem. */
  it('khớp trang con', () => {
    expect(isActivePath('/legal/terms', '/legal')).toBe(true);
    expect(isActivePath('/account/vehicles', '/account')).toBe(true);
  });

  /**
   * Thiếu dấu `/` ở cuối thì `/app` khớp luôn `/application` — một mục sáng lên ở trang chẳng
   * liên quan gì, và là kiểu lỗi chỉ xuất hiện khi ai đó thêm route mới nhiều tháng sau.
   */
  it('KHÔNG khớp một đường dẫn chỉ trùng tiền tố chuỗi', () => {
    expect(isActivePath('/application', '/app')).toBe(false);
    expect(isActivePath('/legal-notice', '/legal')).toBe(false);
  });

  /** Trang chủ chỉ khớp chính nó — nếu không thì nó sáng ở mọi trang của site. */
  it('trang chủ khớp tuyệt đối', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/about', '/')).toBe(false);
    expect(isActivePath('/legal/terms', '/')).toBe(false);
  });

  /** Lý do đầy đủ ở docblock của `isActivePath`: đọc query sẽ huỷ prerender tĩnh của chân trang. */
  it('link mang query không bao giờ là "đang xem"', () => {
    expect(isActivePath('/search', '/search?serviceType=self_drive')).toBe(false);
    expect(isActivePath('/search', '/search')).toBe(true);
  });

  it('bỏ qua fragment', () => {
    expect(isActivePath('/about', '/about#about-money')).toBe(true);
  });

  it('chưa biết pathname thì không mục nào đang xem', () => {
    expect(isActivePath(null, '/about')).toBe(false);
    expect(isActivePath(undefined, '/about')).toBe(false);
  });
});
