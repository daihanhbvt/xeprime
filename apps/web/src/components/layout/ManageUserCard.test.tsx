import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageUserCard } from './ManageUserCard';

/**
 * Thẻ người dùng ở chân sidebar.
 *
 * Hai điều tuyệt đối: **không lộ dữ liệu liên hệ** (vỏ portal hiện trên mọi trang, kể cả lúc
 * chia sẻ màn hình) và **thu gọn vẫn còn danh tính** — nếu thu gọn xong không ai biết mình
 * đang đăng nhập bằng tài khoản nào thì đó là mất chức năng, không phải tiết kiệm chỗ.
 */

const logout = vi.hoisted(() => vi.fn(async () => undefined));
const user = vi.hoisted(() => ({
  value: null as null | {
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    platformRole: string | null;
    tenant: { roleKey: string } | null;
  },
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isLoading: false }),
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({
  usePortalLogout: () => logout,
}));

function setUser(over: Partial<NonNullable<typeof user.value>> = {}) {
  user.value = {
    displayName: 'Nguyễn Văn A',
    email: 'a@congty.vn',
    avatarUrl: null,
    platformRole: null,
    tenant: { roleKey: 'shop_owner' },
    ...over,
  };
}

beforeEach(() => {
  logout.mockReset();
  setUser();
});

afterEach(cleanup);

describe('ManageUserCard — danh tính', () => {
  it('hiện tên hiển thị', () => {
    render(<ManageUserCard />);

    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
  });

  it('KHÔNG hiện email hay dữ liệu liên hệ', () => {
    render(<ManageUserCard />);

    expect(screen.queryByText('a@congty.vn')).toBeNull();
  });

  it('chưa có user thì không dựng gì', () => {
    user.value = null;
    const { container } = render(<ManageUserCard />);

    expect(container.textContent).toBe('');
  });

  it('tên rất dài vẫn giữ được bản đầy đủ ở `title`', () => {
    const long = 'Nguyễn Trần Hoàng Minh Anh Tuấn Kiệt Đại Phát';
    setUser({ displayName: long });
    render(<ManageUserCard />);

    expect(screen.getByText(long).getAttribute('title')).toBe(long);
  });

  it('không có tên thì lùi về email, vẫn không rỗng', () => {
    setUser({ displayName: '' });
    render(<ManageUserCard />);

    expect(screen.getByText('a@congty.vn')).toBeTruthy();
  });
});

describe('ManageUserCard — ngữ cảnh vai trò', () => {
  it('vai trò gian hàng hiện bằng nhãn tiếng Việt, không phải khoá kỹ thuật', () => {
    render(<ManageUserCard />);

    expect(screen.getByText('Chủ gian hàng')).toBeTruthy();
    expect(screen.queryByText('shop_owner')).toBeNull();
  });

  it('vai trò gian hàng ĐƯỢC ƯU TIÊN khi user có cả hai scope', () => {
    setUser({ platformRole: 'platform_admin', tenant: { roleKey: 'shop_manager' } });
    render(<ManageUserCard />);

    expect(screen.getByText('Quản lý gian hàng')).toBeTruthy();
  });

  it('không thuộc gian hàng nào thì hiện vai trò nền tảng', () => {
    setUser({ tenant: null, platformRole: 'platform_admin' });
    render(<ManageUserCard />);

    expect(screen.getByText('Super Admin')).toBeTruthy();
    expect(screen.queryByText(/gian hàng/i)).toBeNull();
  });

  it('nhân viên nền tảng hiện đúng nhãn của mình', () => {
    setUser({ tenant: null, platformRole: 'platform_staff' });
    render(<ManageUserCard />);

    expect(screen.getByText('Nhân viên nền tảng')).toBeTruthy();
  });

  it('vai trò lạ không làm vỡ thẻ', () => {
    setUser({ tenant: { roleKey: 'role_moi_toanh' }, platformRole: null });
    render(<ManageUserCard />);

    expect(screen.getByText('role_moi_toanh')).toBeTruthy();
  });
});

describe('ManageUserCard — thu gọn', () => {
  it('ẩn tên và huy hiệu vai trò để vừa cột 64px', () => {
    render(<ManageUserCard collapsed />);

    expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
    expect(screen.queryByText('Chủ gian hàng')).toBeNull();
  });

  it('nhưng danh tính vẫn đọc được — avatar mang tên và vai trò', () => {
    render(<ManageUserCard collapsed />);

    expect(screen.getByRole('img', { name: 'Nguyễn Văn A · Chủ gian hàng' })).toBeTruthy();
  });

  it('vẫn còn nút đăng xuất có tên', () => {
    render(<ManageUserCard collapsed />);

    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });
});

describe('ManageUserCard — đăng xuất', () => {
  it('nút đăng xuất có tên truy cập được', () => {
    render(<ManageUserCard />);

    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });

  it('gọi ĐÚNG luồng dùng chung, không tự dựng lại ba bước', async () => {
    render(<ManageUserCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('bản thu gọn dùng CÙNG một luồng', async () => {
    render(<ManageUserCard collapsed />);

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
