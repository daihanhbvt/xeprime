import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketFooter } from './MarketFooter';

/**
 * Chân trang khu khách (design v2, ADR 0062) — nằm trên MỌI trang công khai, nên một mục sai ở
 * đây nhân lên khắp sản phẩm. Khoá phần đã RENDER: cột, đích liên kết, mục đang xem, mạng xã hội
 * không bấm được và bộ đổi ngôn ngữ VI | EN (`constants/legal.test.ts` khoá phần dữ liệu).
 */
const state = vi.hoisted(() => ({ user: undefined as unknown, pathname: '/' }));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: state.user }) }));

vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  // Thanh điều hướng và chân trang đánh dấu mục ĐANG XEM từ pathname (`isActivePath`).
  usePathname: () => state.pathname,
}));

beforeEach(() => {
  state.user = undefined;
  state.pathname = '/';
});

afterEach(cleanup);

describe('MarketFooter — không còn dải mời đăng xe', () => {
  /**
   * Design v2 gỡ dải CTA khỏi chân trang: trang chủ đã có khối "Đăng ký trở thành đối tác" và
   * header có nút "Trở thành chủ xe" trên mọi trang. Một lời mời thứ ba ở chân trang là lặp.
   */
  it('không có liên kết "Đăng xe cho thuê" và không có nút lên đầu trang', () => {
    render(<MarketFooter />);
    expect(screen.queryByRole('link', { name: /Đăng xe cho thuê/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lên đầu trang' })).toBeNull();
  });
});

describe('MarketFooter — điều hướng', () => {
  /** Khẳng định trên TIÊU ĐỀ CỘT (h2), không phải trên chữ bất kỳ trong chân trang. */
  function columnTitles(container: HTMLElement) {
    return Array.from(container.querySelectorAll('h2')).map((h) => h.textContent?.trim());
  }

  it('đúng bốn cột của design v2: Khám phá · Về XePrime · Pháp lý · Ứng dụng XePrime', () => {
    const { container } = render(<MarketFooter />);
    expect(columnTitles(container)).toEqual([
      'Khám phá',
      'Về XePrime',
      'Pháp lý',
      'Ứng dụng XePrime',
    ]);
  });

  /** Cột "Dành cho chủ xe" đã gỡ (23/09/2026) — mục đầu của nó lặp đúng cái nút CTA. */
  it('không còn cột "Dành cho chủ xe" và mục "Quản lý xe"', () => {
    const { container } = render(<MarketFooter />);
    expect(columnTitles(container)).not.toContain('Dành cho chủ xe');
    expect(screen.queryByRole('link', { name: 'Quản lý xe' })).toBeNull();
  });

  it('mọi liên kết đã render đều có đích nội bộ, không có "#" hay trang chủ trống', () => {
    const { container } = render(<MarketFooter />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBeTruthy();
      expect(href).not.toBe('#');
      expect(href?.startsWith('/')).toBe(true);
    }
  });

  it('dẫn tới trang giới thiệu, trang ứng dụng và trung tâm trợ giúp', () => {
    const { container } = render(<MarketFooter />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    for (const href of ['/about', '/app', '/support']) {
      expect(hrefs).toContain(href);
    }
  });
});

describe('MarketFooter — mạng xã hội chưa có kênh thật', () => {
  /**
   * Bốn biểu tượng là HÌNH có tên, không phải liên kết. Nếu một ngày chúng thành `<a href="#">`
   * thì đây là chỗ bắt được: một biểu tượng bấm được mà không đi đâu là lời hứa hão.
   */
  it('không phải liên kết, và có tên đọc được', () => {
    render(<MarketFooter />);
    for (const name of ['Facebook', 'Instagram', 'X (Twitter)', 'TikTok']) {
      const el = screen.getByRole('img', { name });
      expect(el.closest('a')).toBeNull();
      expect(el.closest('button')).toBeNull();
    }
  });
});

describe('MarketFooter — mục đang xem', () => {
  /** Đọc mục mang `aria-current="page"` — đúng thứ trình đọc màn hình dùng. */
  function currentLinks(container: HTMLElement) {
    return Array.from(container.querySelectorAll('a[aria-current="page"]')).map((a) =>
      a.textContent?.trim(),
    );
  }

  it('ở trang chủ, không mục nào trong chân trang là "đang xem"', () => {
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual([]);
  });

  it('ở /legal/terms, đúng mục "Điều khoản sử dụng" được đánh dấu', () => {
    state.pathname = '/legal/terms';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual(['Điều khoản sử dụng']);
  });

  it('ở /about, đúng mục "Giới thiệu" được đánh dấu', () => {
    state.pathname = '/about';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual(['Giới thiệu']);
  });

  it('ở /app, đúng mục "Tải ứng dụng" được đánh dấu', () => {
    state.pathname = '/app';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual(['Tải ứng dụng']);
  });

  /**
   * Ba mục dịch vụ là `/search?serviceType=…` — cùng một pathname. Đánh dấu theo pathname sẽ
   * bật sáng CẢ BA cùng lúc; lý do không đọc query nằm ở docblock `isActivePath`.
   */
  it('ở /search, không mục dịch vụ nào bị bật sáng nhầm', () => {
    state.pathname = '/search';
    const { container } = render(<MarketFooter />);
    expect(currentLinks(container)).toEqual([]);
  });
});

describe('MarketFooter — đổi ngôn ngữ VI | EN', () => {
  /**
   * Header v2 không còn nút ngôn ngữ cho khách chưa đăng nhập — hai chữ ở chân trang là lối DUY
   * NHẤT của họ, nên nó phải là nút thật và nói được ngôn ngữ nào đang chọn.
   */
  it('hai nút thật, ngôn ngữ đang dùng được đánh dấu', () => {
    render(<MarketFooter />);
    const group = screen.getByRole('group', { name: 'Ngôn ngữ' });
    const vi = within(group).getByRole('button', { name: 'VI' });
    const en = within(group).getByRole('button', { name: 'EN' });
    expect(vi.getAttribute('aria-pressed')).toBe('true');
    expect(en.getAttribute('aria-pressed')).toBe('false');
  });
});
