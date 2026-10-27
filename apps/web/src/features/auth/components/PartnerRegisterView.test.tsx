import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';

import { PartnerRegisterView } from './PartnerRegisterView';

/**
 * Đăng ký đối tác ở site partner (ADR 0040 · 0051 · 0053):
 *
 *   CHỌN TUYẾN ("Chủ xe" / "Gian hàng") → MỘT form của tuyến đó (tài khoản + hồ sơ, họ tên/SĐT/email
 *   hỏi đúng một lần) → bước tiếp theo của tuyến (hoa hồng → Tổng quan · gói → chọn gói).
 *
 * Khoá: thứ tự chọn-trước-điền-sau, email liên hệ bắt buộc (chỉ vào hồ sơ, không vào tài khoản), không ô nào hỏi hai lần, `registrationTrack`
 * đi trên dây, và lỗi ở bước tạo gian hàng thì thử lại KHÔNG tạo tài khoản lần hai.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }));
const state = vi.hoisted(() => ({ user: null as unknown, isLoading: false }));
const logout = vi.hoisted(() => vi.fn(async () => undefined));
const api = vi.hoisted(() => ({
  registerWithPassword: vi.fn(),
  registerShop: vi.fn(),
  fetchCurrentUser: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/manage/register',
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: state.user, isLoading: state.isLoading }),
}));

/** Cấp phiên ở bước 1 = `/auth/me` có user — đúng thứ `refreshAfterAuth` làm với cache thật. */
vi.mock('@/features/auth/hooks/use-auth-actions', () => ({
  useAuthCache: () => ({
    refreshAfterAuth: vi.fn(async (u: unknown) => {
      state.user = u;
      return u;
    }),
  }),
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({ usePortalLogout: () => logout }));

vi.mock('@/services/auth.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  registerWithPassword: api.registerWithPassword,
  fetchCurrentUser: api.fetchCurrentUser,
}));
vi.mock('@/features/shop/api', () => ({ registerShop: api.registerShop }));
vi.mock('@/features/phone-verification/api', () => ({
  sendOtp: api.sendOtp,
  verifyOtp: api.verifyOtp,
  getOtpConfig: vi.fn(async () => ({ testCodeEnabled: false })),
}));

// Lời mời vào gian hàng vẫn dùng form tài khoản thuần — thay bằng dấu hiệu.
vi.mock('./AuthPanel', () => ({ AuthPanel: () => <div data-testid="auth-panel" /> }));

vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({
    options: [{ value: '79', label: 'TP Hồ Chí Minh' }],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({
    options: [],
    items: [],
    total: 0,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: () => ({ data: { items: [], available: false }, isFetching: false }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
}));

const NO_SHOP = {
  id: 'P1',
  realm: 'partner',
  displayName: 'Nguyễn Văn A',
  phone: '0901234567',
  email: 'a@xeprime.test',
  tenant: null,
};
const COMMISSION_OWNER = {
  ...NO_SHOP,
  tenant: { id: 'T1', roleKey: TENANT_ROLE.SHOP_OWNER, billingMode: BILLING_MODE.COMMISSION },
};

const MANAGE_HOME = '/manage';
const PACKAGE_ONBOARDING = '/manage/onboarding?track=package';

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <PartnerRegisterView />
      </App>
    </QueryClientProvider>,
  );
}

async function pickProvince(): Promise<void> {
  fireEvent.mouseDown(screen.getByLabelText(/Tỉnh\/thành/));
  await waitFor(() => expect(screen.getByTitle('TP Hồ Chí Minh')).toBeTruthy());
  fireEvent.click(screen.getByTitle('TP Hồ Chí Minh'));
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Bấm "Xác thực" cạnh SĐT (gửi mã + mở popup) → gõ đủ 6 số (tự xác thực) → chờ tích xanh. */
async function enterOtp(code = '654321'): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Xác thực$/ }));
  await waitFor(() => expect(api.sendOtp).toHaveBeenCalled());
  const input = await screen.findByLabelText(/^Mã xác thực gồm/);
  fireEvent.change(input, { target: { value: code } });
  await waitFor(() => expect(screen.getAllByText(/Đã xác thực|đã được xác thực/).length).toBeGreaterThan(0));
}

async function fillAccount({
  email = 'a@xeprime.test',
  otp = true,
}: { email?: string; otp?: boolean } = {}) {
  type(/^Họ và tên/, 'Nguyễn Văn A');
  type(/^Số điện thoại/, '0901234567');
  if (otp) await enterOtp();
  type(/^Email/, email);
  type(/^Mật khẩu/, 'matkhau123');
  type(/^Nhập lại mật khẩu/, 'matkhau123');
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = '';
  state.user = null;
  state.isLoading = false;
  logout.mockReset();
  api.registerWithPassword.mockReset().mockResolvedValue(NO_SHOP);
  api.registerShop.mockReset().mockResolvedValue({ id: 'T1' });
  api.sendOtp.mockReset().mockResolvedValue({ expiresAt: '2030-01-01T00:00:00Z', devCode: null });
  api.verifyOtp.mockReset().mockResolvedValue({ verified: true });
  api.fetchCurrentUser.mockReset().mockRejectedValue(new Error('offline'));
  window.localStorage.clear();
});

afterEach(cleanup);

describe('Bước 1 — chọn tuyến TRƯỚC', () => {
  it('chưa đăng nhập: hiện hai thẻ tuyến, chưa có ô nhập nào', () => {
    renderView();

    expect(screen.getByRole('heading', { name: 'Đăng xe cá nhân' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Gian hàng Chuyên nghiệp' })).toBeTruthy();
    expect(screen.queryByLabelText(/Mật khẩu/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe(
      '/manage/login',
    );
  });

  it('hai thẻ dẫn vào form MỘT TRANG của đúng tuyến', () => {
    state.user = NO_SHOP;
    renderView();

    expect(screen.getByRole('link', { name: /Đăng xe đầu tiên/ }).getAttribute('href')).toBe(
      '/manage/register?track=commission',
    );
    expect(
      screen.getByRole('link', { name: /Tìm hiểu các gói Gian hàng/ }).getAttribute('href'),
    ).toBe('/manage/register?track=package');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('đã đăng nhập: có lối đăng xuất', () => {
    state.user = NO_SHOP;
    renderView();

    fireEvent.click(screen.getByRole('button', { name: /Đăng xuất/ }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});

describe('Bước 2 — một form, không ô nào hỏi hai lần', () => {
  it('gian hàng: họ tên, SĐT, email mỗi thứ MỘT ô; có tên gian hàng', () => {
    nav.search = 'track=package';
    renderView();

    expect(screen.getAllByLabelText(/^Họ và tên/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Số điện thoại/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Email/)).toHaveLength(1);
    expect(screen.getByLabelText(/^Tên gian hàng/)).toBeTruthy();
  });

  it('có link "Đổi cách cho thuê" khi vào thẳng; ẩn khi tới từ site khách (?from=market)', () => {
    nav.search = 'track=commission';
    renderView();
    expect(screen.getByRole('link', { name: /Đổi cách cho thuê/ })).toBeTruthy();
    cleanup();

    nav.search = 'track=commission&from=market';
    renderView();
    expect(screen.queryByRole('link', { name: /Đổi cách cho thuê/ })).toBeNull();
  });

  it('chủ xe chưa có tài khoản: họ tên chỉ hỏi một lần, KHÔNG có ô tên gian hàng', () => {
    nav.search = 'track=commission';
    renderView();

    expect(screen.getAllByLabelText(/^Họ và tên/)).toHaveLength(1);
    expect(screen.queryByLabelText(/^Tên gian hàng/)).toBeNull();
  });

  it('email BẮT BUỘC: thiếu email thì không gọi API nào', async () => {
    nav.search = 'track=commission';
    renderView();

    await fillAccount({ email: '' });
    await pickProvince();
    type(/^Địa chỉ\s*\*?\s*$/, '12 Lê Lợi');
    fireEvent.click(screen.getByRole('button', { name: /Đăng ký và tiếp tục/ }));

    await waitFor(() => expect(screen.getByText('Vui lòng nhập email')).toBeTruthy());
    expect(api.registerWithPassword).not.toHaveBeenCalled();
    expect(api.registerShop).not.toHaveBeenCalled();
  });

  it('chưa xác thực SĐT: nút đăng ký KHÔNG khoá — bấm thì mở popup OTP, đúng mã là tự đăng ký luôn', async () => {
    nav.search = 'track=commission';
    renderView();

    await fillAccount({ otp: false });
    await pickProvince();
    type(/^Địa chỉ\s*\*?\s*$/, '12 Lê Lợi');
    const submit = screen.getByRole('button', { name: /Đăng ký và tiếp tục/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(screen.queryByLabelText(/^Mã xác thực gồm/)).toBeNull();

    fireEvent.click(submit);
    await waitFor(() => expect(api.sendOtp).toHaveBeenCalledWith({ phone: '0901234567', purpose: 'register' }));
    // Chưa có mã thì chưa tạo gì.
    expect(api.registerWithPassword).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText(/^Mã xác thực gồm/), { target: { value: '654321' } });

    // Một lần bấm: xác thực xong là form tự gửi tiếp, không phải bấm lại.
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(MANAGE_HOME));
    expect(api.verifyOtp).toHaveBeenCalledWith({
      phone: '0901234567',
      purpose: 'register',
      code: '654321',
    });
    expect(api.registerWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '0901234567', code: '654321' }),
    );
    expect(api.registerShop).toHaveBeenCalledTimes(1);
  });

  it('popup mở từ nút đăng ký bị ĐÓNG: không gửi gì; xác thực sau đó bằng nút "Xác thực" KHÔNG tự đăng ký', async () => {
    nav.search = 'track=commission';
    renderView();

    await fillAccount({ otp: false });
    await pickProvince();
    type(/^Địa chỉ\s*\*?\s*$/, '12 Lê Lợi');
    fireEvent.click(screen.getByRole('button', { name: /Đăng ký và tiếp tục/ }));
    await screen.findByLabelText(/^Mã xác thực gồm/);
    fireEvent.click(screen.getByRole('button', { name: /Huỷ/ }));

    fireEvent.click(screen.getAllByRole('button', { name: /Xác thực$/ })[0]!);
    fireEvent.change(await screen.findByLabelText(/^Mã xác thực gồm/), { target: { value: '654321' } });
    await waitFor(() => expect(screen.getAllByText(/Đã xác thực/).length).toBeGreaterThan(0));
    expect(api.registerWithPassword).not.toHaveBeenCalled();
  });

  it('đã xác thực ⇒ SĐT chốt lại (hiện dạng chữ kèm tích xanh, không còn ô nhập)', async () => {
    nav.search = 'track=commission';
    renderView();

    await fillAccount();
    expect(screen.queryByLabelText(/^Số điện thoại/)).toBeNull();
    expect(screen.getAllByText('0901234567').length).toBeGreaterThan(0);
  });

  it('chủ xe: tạo tài khoản (KHÔNG email — email chỉ là liên hệ) → tạo hồ sơ tuyến hoa hồng → Tổng quan', async () => {
    nav.search = 'track=commission';
    renderView();

    await fillAccount();
    await pickProvince();
    type(/^Địa chỉ\s*\*?\s*$/, '12 Lê Lợi');
    fireEvent.click(screen.getByRole('button', { name: /Đăng ký và tiếp tục/ }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(MANAGE_HOME));
    expect(api.registerWithPassword).toHaveBeenCalledWith({
      displayName: 'Nguyễn Văn A',
      phone: '0901234567',
      password: 'matkhau123',
      code: '654321',
    });
    // Mã gửi bằng luồng OTP dùng chung, mục đích `register` (ADR 0060).
    expect(api.sendOtp).toHaveBeenCalledWith({ phone: '0901234567', purpose: 'register' });
    expect(api.registerShop.mock.calls[0]![0]).toMatchObject({
      // Họ tên chính là tên hồ sơ chủ xe — không hỏi lại.
      name: 'Nguyễn Văn A',
      registrationTrack: 'commission',
      provinceCode: '79',
      addressLine: '12 Lê Lợi',
      phone: '0901234567',
      // Email LIÊN HỆ chỉ đi vào hồ sơ gian hàng.
      email: 'a@xeprime.test',
    });
  });

  it('gian hàng: gửi `registrationTrack: package` rồi sang bước chọn gói + thanh toán', async () => {
    nav.search = 'track=package';
    renderView();

    await fillAccount();
    type(/^Tên gian hàng/, 'Gian hàng Bình Minh');
    await pickProvince();
    type(/^Địa chỉ\s*\*?\s*$/, '12 Lê Lợi');
    fireEvent.click(screen.getByRole('button', { name: /Đăng ký gian hàng/ }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(PACKAGE_ONBOARDING));
    expect(api.registerShop.mock.calls[0]![0]).toMatchObject({
      name: 'Gian hàng Bình Minh',
      registrationTrack: 'package',
    });
  });

  it('tạo gian hàng HỎNG sau khi tài khoản đã tạo: thử lại KHÔNG tạo tài khoản lần hai', async () => {
    nav.search = 'track=package';
    api.registerShop
      .mockRejectedValueOnce(new Error('mạng hỏng'))
      .mockResolvedValueOnce({ id: 'T1' });
    const view = renderView();

    await fillAccount();
    type(/^Tên gian hàng/, 'Gian hàng Bình Minh');
    await pickProvince();
    type(/^Địa chỉ\s*\*?\s*$/, '12 Lê Lợi');
    fireEvent.click(screen.getByRole('button', { name: /Đăng ký gian hàng/ }));
    await waitFor(() => expect(api.registerShop).toHaveBeenCalledTimes(1));

    // Phiên đã có: lần render sau bỏ phần tài khoản, giữ nguyên thứ đã gõ.
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <App>
          <PartnerRegisterView />
        </App>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByLabelText(/^Mật khẩu/)).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Đăng ký gian hàng/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith(PACKAGE_ONBOARDING));
    expect(api.registerWithPassword).toHaveBeenCalledTimes(1);
    expect(api.registerShop).toHaveBeenCalledTimes(2);
  });

  it('đã đăng nhập, chưa có gian hàng: không có phần tài khoản, điền sẵn từ tài khoản', () => {
    state.user = NO_SHOP;
    nav.search = 'track=commission';
    renderView();

    expect(screen.queryByLabelText(/^Mật khẩu/)).toBeNull();
    expect((screen.getByLabelText(/^Họ và tên/) as HTMLInputElement).value).toBe('Nguyễn Văn A');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('a@xeprime.test');
  });
});

describe('Lời mời và gian hàng đã có', () => {
  it('?next= là lời mời: form tạo tài khoản như cũ (AuthPanel), không OTP/email, không hồ sơ', () => {
    nav.search = `next=${encodeURIComponent('/manage/invites/tok-1')}`;
    renderView();

    expect(screen.getByTestId('auth-panel')).toBeTruthy();
    expect(screen.queryByLabelText(/^Mã xác thực/)).toBeNull();
    expect(screen.queryByLabelText(/Tỉnh\/thành/)).toBeNull();
  });

  it('?next= khi đã đăng nhập ⇒ về đúng lời mời', async () => {
    state.user = NO_SHOP;
    nav.search = `next=${encodeURIComponent('/manage/invites/tok-1')}`;
    renderView();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage/invites/tok-1'));
  });

  it('đã có gian hàng ⇒ về trang chủ theo tuyến, bỏ qua ?track=', async () => {
    state.user = COMMISSION_OWNER;
    nav.search = 'track=package';
    renderView();

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage'));
  });
});
