import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/hooks/use-current-user';
import { PartnerAccountMenu } from './PartnerAccountMenu';

/**
 * Menu hồ sơ site partner — Figma `24051:85101`. Design vẽ hai biến thể (gian hàng · cá nhân); các
 * ca còn lại (nhân viên không có quyền cửa hàng, thành viên của chủ xe cá nhân) phải không có
 * lối nào dẫn tới một trang 403.
 */

const logout = vi.hoisted(() => vi.fn(async () => undefined));
const dispatch = vi.hoisted(() => vi.fn());
const permissions = vi.hoisted(() => ({ tenantView: true }));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: current.value, isLoading: false }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => permissions.tenantView, isLoading: false }),
}));
vi.mock('@/features/auth/hooks/use-portal-logout', () => ({
  usePortalLogout: () => logout,
}));
vi.mock('@/store/hooks', () => ({ useAppDispatch: () => dispatch }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const current = vi.hoisted(() => ({ value: null as unknown }));

function makeUser(tenant: Record<string, unknown> | null): CurrentUser {
  return {
    id: '01HUSER000000000000000000',
    displayName: 'Trần Quốc Bảo',
    email: 'bao@congty.vn',
    avatarUrl: 'https://cdn.example/bao.jpg',
    platformRole: null,
    tenant: tenant && {
      name: 'XePrime Sài Gòn',
      roleKey: 'shop_owner',
      logoUrl: 'https://cdn.example/logo.png',
      billingMode: 'package',
      ...tenant,
    },
  } as unknown as CurrentUser;
}

async function open(user: CurrentUser) {
  current.value = user;
  render(
    <PartnerAccountMenu user={user}>
      <button type="button">mở</button>
    </PartnerAccountMenu>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'mở' }));
  return screen.findByRole('dialog', { name: 'Menu tài khoản' });
}

beforeEach(() => {
  logout.mockReset();
  permissions.tenantView = true;
});
afterEach(cleanup);

describe('PartnerAccountMenu — gian hàng tuyến gói', () => {
  it('thẻ vàng: tên người · vai, dòng "Gian hàng" mang tên cửa hàng, có dấu tích', async () => {
    const dialog = await open(makeUser({ roleKey: 'shop_manager' }));

    expect(screen.getByText('Trần Quốc Bảo')).toBeTruthy();
    expect(screen.getByText('Gian hàng')).toBeTruthy();
    expect(screen.getByText('XePrime Sài Gòn')).toBeTruthy();
    // Dòng dưới tên chỉ còn VAI — tên gian hàng đã có dòng riêng.
    expect(screen.queryByText(/XePrime Sài Gòn ·/)).toBeNull();
    expect(dialog.querySelector('[class*="shopMark"]')).toBeTruthy();
  });

  it('thẻ và dòng đầu cùng tới Tài khoản & bảo mật; "Quản lý gian hàng" tới cửa hàng', async () => {
    await open(makeUser({}));

    const accountLinks = screen.getAllByRole('link', { name: /Tài khoản & bảo mật|Trần Quốc Bảo/ });
    for (const link of accountLinks) expect(link.getAttribute('href')).toBe('/manage/account');
    expect(screen.getByRole('link', { name: 'Quản lý gian hàng' }).getAttribute('href')).toBe(
      '/manage/shop',
    );
    expect(screen.queryByText('Quản lý cho thuê')).toBeNull();
  });

  it('bấm một dòng thì đóng cả drawer mobile — không để nó che trang vừa mở', async () => {
    await open(makeUser({}));

    fireEvent.click(screen.getByRole('link', { name: 'Quản lý gian hàng' }));

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: false }));
  });

  it('nhân viên không có quyền xem cửa hàng → không có lối "Quản lý gian hàng"', async () => {
    permissions.tenantView = false;
    await open(makeUser({ roleKey: 'shop_staff' }));

    expect(screen.queryByRole('link', { name: 'Quản lý gian hàng' })).toBeNull();
  });

  it('KHÔNG hiện email, KHÔNG còn nhãn gói của menu cũ', async () => {
    await open(makeUser({ planName: 'Ô tô 5 xe' }));

    expect(screen.queryByText('bao@congty.vn')).toBeNull();
    expect(screen.queryByText(/Ô tô 5 xe/)).toBeNull();
  });
});

describe('PartnerAccountMenu — chủ xe cá nhân (tuyến hoa hồng)', () => {
  const owner = () => makeUser({ billingMode: 'commission', serviceFeePercent: 10 });

  it('không có thẻ vàng, dòng "Gian hàng" hay dấu tích', async () => {
    const dialog = await open(owner());

    expect(screen.queryByText('Gian hàng')).toBeNull();
    expect(dialog.querySelector('[class*="shopMark"]')).toBeNull();
    expect(dialog.querySelector('[class*="identityShop"]')).toBeNull();
  });

  it('"Quản lý cho thuê" là Hồ sơ chủ xe; "Tài khoản & bảo mật" vào thẳng phần đăng nhập', async () => {
    await open(owner());

    expect(screen.getByRole('link', { name: 'Quản lý cho thuê' }).getAttribute('href')).toBe(
      '/manage/account',
    );
    expect(screen.getByRole('link', { name: 'Tài khoản & bảo mật' }).getAttribute('href')).toBe(
      '/manage/account?section=login',
    );
    expect(screen.queryByRole('link', { name: 'Quản lý gian hàng' })).toBeNull();
  });

  it('"Nâng cấp gian hàng" dẫn vào phễu nâng cấp ở Gói dịch vụ', async () => {
    await open(owner());

    expect(screen.getByRole('link', { name: 'Nâng cấp gian hàng' }).getAttribute('href')).toBe(
      '/manage/account?section=plan',
    );
  });

  it('thành viên của chủ xe cá nhân chỉ có tài khoản của chính mình', async () => {
    await open(makeUser({ billingMode: 'commission', roleKey: 'shop_staff' }));

    expect(screen.getByRole('link', { name: 'Tài khoản & bảo mật' }).getAttribute('href')).toBe(
      '/manage/account',
    );
    expect(screen.queryByRole('link', { name: 'Quản lý cho thuê' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Quản lý gian hàng' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nâng cấp gian hàng' })).toBeNull();
  });
});

describe('PartnerAccountMenu — gian hàng không có lối nâng cấp', () => {
  it('đã là gian hàng thì không mời nâng cấp', async () => {
    await open(makeUser({}));

    expect(screen.queryByRole('link', { name: 'Nâng cấp gian hàng' })).toBeNull();
  });
});

describe('PartnerAccountMenu — mở bằng rê chuột (header)', () => {
  function renderHover() {
    const user = makeUser({});
    current.value = user;
    render(
      <PartnerAccountMenu user={user} openOnHover>
        <button type="button">mở</button>
      </PartnerAccountMenu>,
    );
    return screen.getByRole('button', { name: 'mở' });
  }

  it('rê chuột vào ảnh là menu mở', async () => {
    fireEvent.mouseEnter(renderHover());

    expect(await screen.findByRole('dialog', { name: 'Menu tài khoản' })).toBeTruthy();
  });

  it('bàn phím vẫn có đường vào: Enter mở, nút báo trạng thái mở', async () => {
    const trigger = renderHover();

    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(await screen.findByRole('dialog', { name: 'Menu tài khoản' })).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('PartnerAccountMenu — chân menu', () => {
  it('có đổi ngôn ngữ VI|EN, chưa có đổi giao diện (chờ dark mode)', async () => {
    await open(makeUser({}));

    expect(screen.getByRole('group', { name: 'Ngôn ngữ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tiếng Việt' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.queryByText('Giao diện')).toBeNull();
  });

  it('đăng xuất gọi luồng dùng chung', async () => {
    await open(makeUser({}));

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
