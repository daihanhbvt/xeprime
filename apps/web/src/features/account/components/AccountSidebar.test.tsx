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

    expect(screen.getByText('Tài khoản của tôi')).toBeTruthy();
    expect(screen.getByText('Chuyến của tôi')).toBeTruthy();
    expect(screen.getByText('Giấy tờ & Xác minh')).toBeTruthy();
  });

  it('mục chưa dựng KHÔNG phải liên kết và có nhãn "Sắp có"', () => {
    render(<AccountSidebar />);

    expect(screen.queryByRole('link', { name: /Lịch sử thanh toán/ })).toBeNull();
    expect(screen.getByText('Lịch sử thanh toán')).toBeTruthy();
    expect(screen.getAllByText('Sắp có').length).toBeGreaterThan(0);
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
