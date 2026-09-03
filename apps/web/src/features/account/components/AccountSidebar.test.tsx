import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountSidebar } from './AccountSidebar';

/**
 * Menu khu tài khoản.
 *
 * Điều quan trọng nhất ở đây là **mục "sắp có" không được là một liên kết**: link mờ đi vẫn
 * bấm được, vẫn tab tới được và vẫn dẫn người dùng tới một trang trống — tức là vẫn hứa một
 * thứ chưa có. Không có link thì không có đường tới đó.
 */

const logout = vi.hoisted(() => vi.fn(async () => undefined));
const pathname = vi.hoisted(() => ({ value: '/account' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

vi.mock('@/features/auth/hooks/use-market-logout', () => ({
  useMarketLogout: () => logout,
}));

beforeEach(() => {
  logout.mockReset();
  pathname.value = '/account';
});

afterEach(cleanup);

describe('AccountSidebar', () => {
  it('hiện đủ các mục của menu tài khoản', () => {
    render(<AccountSidebar />);

    expect(screen.getByRole('heading', { name: 'Cá nhân' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Thuê xe' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Thiết lập' })).toBeTruthy();
    expect(screen.getByText('Tài khoản của tôi')).toBeTruthy();
    expect(screen.getByText('Chuyến của tôi')).toBeTruthy();
    expect(screen.getByText('Hỗ trợ')).toBeTruthy();
  });

  /**
   * Đảo ngược bài test cũ ("mục chưa dựng KHÔNG phải liên kết và có nhãn Sắp có").
   *
   * Bảy mục "Sắp có" đã bị gỡ ngày 03/09/2026 (R1 — ẩn menu placeholder chưa có luồng). Điều
   * cần khoá bây giờ mạnh hơn hẳn: menu không được chứa mục nào KHÔNG bấm được. Một mục hiện
   * ra mà không đi đâu được là một lời hứa, và bảy lời hứa thì không còn là bản đồ.
   */
  it('mọi mục trong menu đều là liên kết bấm được — không còn nhãn "Sắp có"', () => {
    const { container } = render(<AccountSidebar />);

    const items = container.querySelectorAll('nav li');
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.querySelector('a')).not.toBeNull();
    }
    expect(screen.queryByText('Sắp có')).toBeNull();
    expect(screen.queryByText('Lịch sử thanh toán')).toBeNull();
  });

  it('mục đã dựng là liên kết thật', () => {
    render(<AccountSidebar />);

    const trips = screen.getByRole('link', { name: /Chuyến của tôi/ });
    expect(trips.getAttribute('href')).toBe('/trips');
  });

  it('đánh dấu mục đang mở bằng aria-current', () => {
    pathname.value = '/trips';
    render(<AccountSidebar />);

    expect(screen.getByRole('link', { name: /Chuyến của tôi/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      screen.getByRole('link', { name: /Tài khoản của tôi/ }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('đăng xuất đi qua hook dùng chung, không tự gọi API', () => {
    render(<AccountSidebar />);

    fireEvent.click(screen.getByText('Đăng xuất'));

    return waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
