import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

/**
 * `AppShell` là nơi bug gốc sống: user không có gian hàng bị render THẲNG form tạo gian hàng,
 * biến một trạng thái hợp lệ (khách thuê xe) thành thứ phải sửa ngay.
 *
 * Bộ test này khoá lại việc đó, cộng với hai lối thoát khỏi khung portal: `/manage/login` phải
 * công khai (không thì loop redirect) và `/manage/onboarding` phải tự render lấy.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/manage' }));
const state = vi.hoisted(() => ({
  user: null as unknown,
  isLoading: false,
  isError: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: state.user,
    isLoading: state.isLoading,
    isError: state.isError,
  }),
}));

vi.mock('@/services/auth.service', () => ({ destroySession: vi.fn(async () => undefined) }));

// Con của shell không thuộc phạm vi test — chặn để khỏi kéo cả cây menu/chat vào.
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('./Topbar', () => ({ Topbar: () => <div data-testid="topbar" /> }));
vi.mock('./MobileNav', () => ({ MobileNav: () => null }));

const CUSTOMER = { displayName: 'Khách A', tenant: null, platformRole: null };
const OWNER = {
  displayName: 'Chủ shop',
  tenant: { id: 'T1', name: 'Shop', slug: 's', status: 'active', roleKey: 'shop_owner' },
  platformRole: null,
};
const ADMIN = { displayName: 'Admin', tenant: null, platformRole: 'platform_admin' };

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <div data-testid="page">Nội dung trang</div>
      </AppShell>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.pathname = '/manage';
  state.user = null;
  state.isLoading = false;
  state.isError = false;
});

afterEach(cleanup);

describe('AppShell — user không có gian hàng', () => {
  it('KHÔNG tự hiện form tạo gian hàng, mà hiện màn lựa chọn', () => {
    state.user = CUSTOMER;
    renderShell();

    expect(screen.getByText('Bạn chưa có gian hàng')).toBeTruthy();
    expect(screen.getByText('Đăng ký trở thành chủ xe')).toBeTruthy();
    expect(screen.getByText('Quay lại tìm xe')).toBeTruthy();
    // Form tạo gian hàng chỉ sống ở /manage/onboarding.
    expect(screen.queryByText('Tạo gian hàng')).toBeNull();
    expect(screen.queryByText('Tên gian hàng')).toBeNull();
    // Và không render dashboard gian hàng với tenant null.
    expect(screen.queryByTestId('sidebar')).toBeNull();
  });

  it('nhân sự nền tảng không có gian hàng vẫn vào được portal', () => {
    state.user = ADMIN;
    renderShell();

    expect(screen.queryByText('Bạn chưa có gian hàng')).toBeNull();
    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('có gian hàng → khung portal đầy đủ', () => {
    state.user = OWNER;
    renderShell();

    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });
});

describe('AppShell — route thoát khỏi khung portal', () => {
  it('/manage/login render thẳng, KHÔNG đòi đăng nhập (chống loop redirect)', () => {
    nav.pathname = '/manage/login';
    state.user = null;
    renderShell();

    expect(screen.getByTestId('page')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('/manage/onboarding với user chưa có gian hàng → để page tự render, không chặn', () => {
    nav.pathname = '/manage/onboarding';
    state.user = CUSTOMER;
    renderShell();

    expect(screen.getByTestId('page')).toBeTruthy();
    expect(screen.queryByText('Bạn chưa có gian hàng')).toBeNull();
    expect(screen.queryByTestId('sidebar')).toBeNull();
  });
});

describe('AppShell — phiên hỏng', () => {
  it('/auth/me lỗi → dọn phiên và về portal login kèm next, không loop', async () => {
    nav.pathname = '/manage/vehicles';
    state.user = null;
    state.isError = true;
    renderShell();

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/manage/login?next=%2Fmanage%2Fvehicles'),
    );
  });
});
