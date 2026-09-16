import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageUserCard } from './ManageUserCard';

/**
 * Thẻ ở chân sidebar — danh tính KHU LÀM VIỆC, và lối vào menu tài khoản.
 *
 * Ba điều tuyệt đối:
 *
 *  1. **Hình nổi bật là LOGO GIAN HÀNG**, fallback chữ cái đầu của TÊN GIAN HÀNG (16/09/2026).
 *     Trước đợt này thẻ mang avatar cá nhân còn topbar mang chữ cái đầu tên gian hàng — hai hình
 *     đại diện cho hai thứ khác nhau trên cùng một màn hình.
 *  2. **Không lộ dữ liệu liên hệ** — vỏ portal hiện trên mọi trang, kể cả lúc chia sẻ màn hình.
 *  3. **Thu gọn vẫn còn danh tính** — thu gọn xong mà không ai biết mình đang đứng ở gian hàng
 *     nào thì đó là mất chức năng, không phải tiết kiệm chỗ.
 */

const logout = vi.hoisted(() => vi.fn(async () => undefined));
const user = vi.hoisted(() => ({
  value: null as null | {
    id: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    platformRole: string | null;
    tenant: { name: string; roleKey: string; logoUrl: string | null } | null;
  },
}));
/** Số chuyến ĐI THUÊ chưa khép — quyết định mục "Chuyến tôi đi thuê" có mặt hay không. */
const trips = vi.hoisted(() => ({ current: 0 }));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isLoading: false }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true, hasAny: () => true, isLoading: false }),
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({
  usePortalLogout: () => logout,
}));

vi.mock('@/features/trips/hooks', () => ({
  useTrips: () => ({ data: { counts: { current: trips.current } } }),
}));

function setUser(over: Partial<NonNullable<typeof user.value>> = {}) {
  user.value = {
    id: '01HUSER000000000000000000',
    displayName: 'Nguyễn Văn A',
    email: 'a@congty.vn',
    avatarUrl: null,
    platformRole: null,
    tenant: { name: 'Thuê Xe Minh Anh', roleKey: 'shop_owner', logoUrl: null },
    ...over,
  };
}

beforeEach(() => {
  logout.mockReset();
  trips.current = 0;
  setUser();
});

afterEach(cleanup);

describe('ManageUserCard — danh tính khu làm việc', () => {
  it('hiện TÊN GIAN HÀNG, không phải tên người đăng nhập', () => {
    render(<ManageUserCard />);

    expect(screen.getByText('Thuê Xe Minh Anh')).toBeTruthy();
    // Tên người vẫn còn, nhưng nằm trong menu — xem nhóm test "menu tài khoản".
    expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
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

  it('tên gian hàng rất dài vẫn giữ được bản đầy đủ ở `title`', () => {
    const long = 'Công ty TNHH Dịch vụ Cho thuê Xe Du lịch Minh Anh Phát Đạt';
    setUser({ tenant: { name: long, roleKey: 'shop_owner', logoUrl: null } });
    render(<ManageUserCard />);

    expect(screen.getByText(long).getAttribute('title')).toBe(long);
  });

  /* Nhân sự nền tảng không đứng trong gian hàng nào — khi đó danh tính khu làm việc là họ. */
  it('không thuộc gian hàng nào thì lùi về tên người, vẫn không rỗng', () => {
    setUser({ tenant: null, platformRole: 'platform_admin' });
    render(<ManageUserCard />);

    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
  });
});

describe('ManageUserCard — ngữ cảnh vai trò', () => {
  it('vai trò gian hàng hiện bằng nhãn tiếng Việt, không phải khoá kỹ thuật', () => {
    render(<ManageUserCard />);

    expect(screen.getByText('Chủ gian hàng')).toBeTruthy();
    expect(screen.queryByText('shop_owner')).toBeNull();
  });

  it('vai trò gian hàng ĐƯỢC ƯU TIÊN khi user có cả hai scope', () => {
    setUser({
      platformRole: 'platform_admin',
      tenant: { name: 'Thuê Xe Minh Anh', roleKey: 'shop_manager', logoUrl: null },
    });
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
    setUser({
      tenant: { name: 'Thuê Xe Minh Anh', roleKey: 'role_moi_toanh', logoUrl: null },
      platformRole: null,
    });
    render(<ManageUserCard />);

    expect(screen.getByText('role_moi_toanh')).toBeTruthy();
  });
});

describe('ManageUserCard — thu gọn', () => {
  it('ẩn tên và huy hiệu vai trò để vừa cột 64px', () => {
    render(<ManageUserCard collapsed />);

    expect(screen.queryByText('Thuê Xe Minh Anh')).toBeNull();
    expect(screen.queryByText('Chủ gian hàng')).toBeNull();
  });

  it('nhưng danh tính vẫn đọc được — nút mang tên gian hàng và vai trò', () => {
    render(<ManageUserCard collapsed />);

    expect(
      screen.getByRole('button', { name: 'Menu tài khoản: Thuê Xe Minh Anh · Chủ gian hàng' }),
    ).toBeTruthy();
  });
});

describe('ManageUserCard — menu tài khoản', () => {
  /** Mở menu và chờ nó dựng — menu của AntD chỉ dựng sau khi bấm. */
  async function openMenu(collapsed = false) {
    render(<ManageUserCard collapsed={collapsed} />);
    fireEvent.click(screen.getByRole('button', { name: /^Menu tài khoản/ }));
    await screen.findByText('Đăng xuất');
  }

  it('thẻ là lối vào menu, không phải khối tĩnh', () => {
    render(<ManageUserCard />);

    expect(screen.getByRole('button', { name: /^Menu tài khoản/ })).toBeTruthy();
  });

  /*
   * Ai đang đăng nhập KHÔNG biến mất khi thẻ chuyển sang mang tên gian hàng — nó về đúng chỗ
   * cần thiết: dòng ngữ cảnh ở đầu menu, quan trọng khi nhiều nhân viên dùng chung một máy.
   */
  it('đầu menu nói rõ đang đăng nhập bằng tài khoản nào', async () => {
    await openMenu();

    expect(screen.getByText('Đăng nhập: Nguyễn Văn A')).toBeTruthy();
  });

  it('menu chứa bảo mật tài khoản, cài đặt gian hàng và đăng xuất', async () => {
    await openMenu();

    // Bảo mật của người đang ở trong cổng quản lý nằm TRONG cổng đó, không phải ở khu khách:
    // `/account` đã đóng với thành viên gian hàng tuyến gói.
    expect(screen.getByRole('link', { name: 'Bảo mật tài khoản' }).getAttribute('href')).toBe(
      '/manage/security',
    );
    expect(screen.getByRole('link', { name: 'Cài đặt gian hàng' }).getAttribute('href')).toBe(
      '/manage/shop',
    );
    expect(screen.getByText('Đăng xuất')).toBeTruthy();
  });

  it('không thuộc gian hàng nào → không có mục "Cài đặt gian hàng" dẫn tới 403', async () => {
    setUser({ tenant: null, platformRole: 'platform_admin' });
    await openMenu();

    expect(screen.queryByRole('link', { name: 'Cài đặt gian hàng' })).toBeNull();
  });

  /*
   * "Chuyến tôi đi thuê" là dấu vết của một lần CHUYỂN TUYẾN, không phải chức năng thường trực:
   * gian hàng chưa bao giờ đi thuê thì không bao giờ thấy nó, và nó biến mất khi chuyến cuối
   * khép lại. Một mục rỗng vĩnh viễn dựng lại đúng thứ việc tách tuyến vừa gỡ bỏ.
   */
  it('KHÔNG có mục chuyến đi thuê khi không còn chuyến nào', async () => {
    await openMenu();

    expect(screen.queryByRole('link', { name: 'Chuyến tôi đi thuê' })).toBeNull();
  });

  it('còn chuyến đi thuê chưa khép → mục đó xuất hiện, trỏ đúng lối chuyển tiếp', async () => {
    trips.current = 2;
    await openMenu();

    expect(screen.getByRole('link', { name: 'Chuyến tôi đi thuê' }).getAttribute('href')).toBe(
      '/manage/account/trips',
    );
  });

  it('đăng xuất gọi ĐÚNG luồng dùng chung, không tự dựng lại ba bước', async () => {
    await openMenu();

    fireEvent.click(screen.getByText('Đăng xuất'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('bản thu gọn dùng CÙNG một menu', async () => {
    await openMenu(true);

    fireEvent.click(screen.getByText('Đăng xuất'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
