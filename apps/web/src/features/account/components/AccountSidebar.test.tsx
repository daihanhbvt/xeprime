import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

import { AccountSidebar } from './AccountSidebar';

/**
 * Menu tài khoản của site KHÁCH.
 *
 * Từ ADR 0053 tài khoản khách không có gian hàng: menu MỘT hình dạng cho mọi khách. Bộ này khoá ba
 * điều: không mục chủ xe nào sống lại ở đây (chúng đã sang site partner), mọi mục BẤM ĐƯỢC, và mục
 * đang mở sáng đúng — kể cả route ngoài `/account`.
 */

const logout = vi.hoisted(() => vi.fn(async () => undefined));
const pathname = vi.hoisted(() => ({ value: '/account' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

vi.mock('@/features/auth/hooks/use-market-logout', () => ({
  useMarketLogout: () => logout,
}));

function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    realm: 'customer',
    displayName: 'Minh Đức',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: false,
    hasPassword: true,
    tenant: null,
    platformRole: null,
    permissions: [],
    ...overrides,
  } as CurrentUser;
}

beforeEach(() => {
  logout.mockReset();
  pathname.value = '/account';
});

afterEach(cleanup);

describe('AccountSidebar — tài khoản khách', () => {
  it('hiện menu cá nhân, KHÔNG có mục quản lý xe nào', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.getByText('Tài khoản của tôi')).toBeTruthy();
    expect(screen.getByText('Chuyến của tôi')).toBeTruthy();
    expect(screen.getByText('Đổi mật khẩu')).toBeTruthy();
    expect(screen.getByText('Yêu cầu xoá tài khoản')).toBeTruthy();

    expect(screen.queryByText('Danh sách xe')).toBeNull();
    expect(screen.queryByText('Lịch xe')).toBeNull();
    expect(screen.queryByText('Thông tin khai thuế')).toBeNull();
    expect(screen.queryByText('Hồ sơ đăng ký')).toBeNull();
  });

  it('"Trở thành chủ xe" dẫn tới trang giới thiệu đăng xe (mở form đăng ký đối tác)', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.getByRole('link', { name: /Trở thành chủ xe/ }).getAttribute('href')).toBe(
      ROUTES.LIST_YOUR_VEHICLE.ROOT,
    );
  });

  it('không mục nào trỏ thẳng vào site partner', () => {
    const { container } = render(<AccountSidebar user={user()} />);

    const toPartner = [...container.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href.startsWith(ROUTES.MANAGE.ROOT));
    expect(toPartner).toEqual([]);
  });
});

describe('AccountSidebar — hành vi chung', () => {
  it('mọi mục trong menu đều là liên kết bấm được — không có mục "Sắp có"', () => {
    const { container } = render(<AccountSidebar user={user()} />);

    const items = container.querySelectorAll('nav li');
    expect(items.length).toBeGreaterThan(0);
    for (const li of items) {
      expect(li.querySelector('a')).not.toBeNull();
    }
    expect(screen.queryByText('Sắp có')).toBeNull();
  });

  it('mục đã dựng là liên kết thật', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.getByRole('link', { name: /Chuyến của tôi/ }).getAttribute('href')).toBe('/trips');
  });

  it('đánh dấu mục đang mở bằng aria-current, kể cả route ngoài /account', () => {
    pathname.value = '/trips';
    render(<AccountSidebar user={user()} />);

    expect(screen.getByRole('link', { name: /Chuyến của tôi/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      screen.getByRole('link', { name: /Tài khoản của tôi/ }).getAttribute('aria-current'),
    ).toBeNull();
  });

  it('trang con vẫn sáng đúng mục cha', () => {
    pathname.value = `${ROUTES.ACCOUNT.PAYMENTS}/01P`;
    render(<AccountSidebar user={user()} />);

    expect(
      screen.getByRole('link', { name: /Lịch sử thanh toán/ }).getAttribute('aria-current'),
    ).toBe('page');
  });

  /*
   * ĐĂNG XUẤT KHÔNG ở menu này — nó ở menu avatar trên header, thứ đứng trên mọi trang của khu
   * này. Hai nút đăng xuất trên cùng một màn là hai luồng phải giữ cho giống nhau.
   */
  it('KHÔNG có nút đăng xuất — lối đó nằm ở menu avatar trên header', () => {
    render(<AccountSidebar user={user()} />);

    expect(screen.queryByText('Đăng xuất')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });
});
