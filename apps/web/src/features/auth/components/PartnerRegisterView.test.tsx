import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';

import { PartnerRegisterView } from './PartnerRegisterView';

/**
 * Lối vào "Trở thành chủ xe" ở site partner (ADR 0051 · 0053):
 *
 *   tạo tài khoản đối tác → "Bắt đầu cho thuê xe theo cách phù hợp với bạn" → bước đầu của tuyến
 *   (cá nhân → wizard đăng xe nhanh · gian hàng → onboarding gói).
 *
 * Khoá: ai thấy form, ai thấy trang chọn cách cho thuê, và mỗi nút / mỗi \`?track=\` đi đúng bước đầu
 * của tuyến mình — không bao giờ đưa người chọn "cá nhân" vào form tạo gian hàng.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }));
const state = vi.hoisted(() => ({ user: null as unknown, isLoading: false }));
const logout = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/manage/register',
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: state.user, isLoading: state.isLoading }),
}));

vi.mock('../hooks/use-auth-actions', () => ({
  useAuthCache: () => ({ refreshAfterAuth: vi.fn(async (u: unknown) => u) }),
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({ usePortalLogout: () => logout }));

// Form thật kéo theo social + OTP; ở đây chỉ cần biết nó CÓ hiện và gọi lại khi đăng nhập xong.
const authPanel = vi.hoisted(() => ({ onAuthenticated: null as null | ((u: unknown) => void) }));
vi.mock('./AuthPanel', () => ({
  AuthPanel: (props: { onAuthenticated: (u: unknown) => void }) => {
    authPanel.onAuthenticated = props.onAuthenticated;
    return <div data-testid="auth-panel" />;
  },
}));

const NO_SHOP = { id: 'P1', realm: 'partner', displayName: 'Chủ xe mới', tenant: null };
const COMMISSION_OWNER = {
  ...NO_SHOP,
  tenant: { id: 'T1', roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION },
};

const WIZARD = '/manage/vehicles/register?from=marketplace';
const PACKAGE_ONBOARDING = '/manage/onboarding?track=package';

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = '';
  state.user = null;
  state.isLoading = false;
  authPanel.onAuthenticated = null;
  logout.mockReset();
});

afterEach(cleanup);

describe('Chưa đăng nhập', () => {
  it('hiện form tạo tài khoản đối tác, chưa hiện trang chọn cách cho thuê', () => {
    render(<PartnerRegisterView />);

    expect(screen.getByTestId('auth-panel')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Đăng xe đầu tiên/ })).toBeNull();
  });

  it('đến từ landing công khai với ?track= → form nói rõ tuyến đã chọn', () => {
    nav.search = 'track=package';
    render(<PartnerRegisterView />);

    expect(screen.getByText(/mở gian hàng theo gói/)).toBeTruthy();
  });

  it('đăng nhập bằng tài khoản ĐÃ có gian hàng → về trang chủ theo tuyến', async () => {
    render(<PartnerRegisterView />);

    authPanel.onAuthenticated?.(COMMISSION_OWNER);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage'));
  });
});

describe('Đã có tài khoản đối tác, CHƯA có gian hàng', () => {
  it('hiện "Bắt đầu cho thuê xe theo cách phù hợp với bạn" — đúng trang giới thiệu hai tuyến', () => {
    state.user = NO_SHOP;
    render(<PartnerRegisterView />);

    expect(
      screen.getByRole('heading', { name: 'Bắt đầu cho thuê xe theo cách phù hợp với bạn' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Đăng xe cá nhân' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mở gian hàng cho thuê' })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('"Đăng xe đầu tiên" → wizard đăng xe nhanh; "Tìm hiểu và tạo gian hàng" → onboarding gói', () => {
    state.user = NO_SHOP;
    render(<PartnerRegisterView />);

    expect(screen.getByRole('link', { name: /Đăng xe đầu tiên/ }).getAttribute('href')).toBe(WIZARD);
    expect(
      screen.getByRole('link', { name: /Tìm hiểu và tạo gian hàng/ }).getAttribute('href'),
    ).toBe(PACKAGE_ONBOARDING);
  });

  it('không có nút Quay lại (trang trước là chính form đăng ký), nhưng có lối đăng xuất', () => {
    state.user = NO_SHOP;
    render(<PartnerRegisterView />);

    expect(screen.queryByRole('button', { name: /Quay lại/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['commission', WIZARD],
    ['package', PACKAGE_ONBOARDING],
  ])('?track=%s (đã chọn ở landing công khai) → vào thẳng bước đầu của tuyến', async (track, href) => {
    state.user = NO_SHOP;
    nav.search = `track=${track}`;
    render(<PartnerRegisterView />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(href));
  });

  it('?next= là lời mời vào gian hàng → về đúng lời mời, không qua trang chọn cách cho thuê', async () => {
    state.user = NO_SHOP;
    nav.search = `next=${encodeURIComponent('/manage/invites/tok-1')}`;
    render(<PartnerRegisterView />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage/invites/tok-1'));
  });
});

describe('Đã có gian hàng', () => {
  it('không còn gì để đăng ký → về trang chủ theo tuyến, bỏ qua ?track=', async () => {
    state.user = COMMISSION_OWNER;
    nav.search = 'track=package';
    render(<PartnerRegisterView />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage'));
  });
});
