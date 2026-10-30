import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { AuthModal } from './AuthModal';
import { AuthPanel } from './AuthPanel';
import { AuthModalProvider, AuthUrlSync, useAuthModal } from './AuthModalProvider';
import { AUTH_CONTEXT, AUTH_MODE } from '../post-auth-destination';
import { renderWithIntl } from '@/i18n/test-utils';

/**
 * Hộp tài khoản của KHÁCH — design v2 + ADR 0060.
 *
 * Khoá lại:
 *  - Đăng nhập CHỈ bằng số điện thoại + mật khẩu (không ô email, không tab OTP), Google/Facebook,
 *    "Ghi nhớ tài khoản" (nhớ SĐT, không bao giờ mật khẩu) và "Quên mật khẩu?" ngay trong hộp.
 *  - Đăng ký: SĐT · tên hiển thị · mật khẩu · xác nhận → gửi mã OTP `register` → popup "Xác minh tài
 *    khoản" → mã đúng là ĐÃ ĐĂNG NHẬP: hộp đóng thẳng, không có màn "Tạo tài khoản thành công".
 *  - Quên mật khẩu ba bước: SĐT → mã (xác minh ngay ở bước mã) → mật khẩu mới → "Thành công!" →
 *    về form đăng nhập với số điền sẵn. Không cấp phiên.
 *  - Đăng nhập/đăng ký xong KHÔNG đi `/manage`.
 */
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/',
  search: '',
}));

const api = vi.hoisted(() => ({
  register: vi.fn(),
  check: vi.fn(),
  login: vi.fn(),
  reset: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  testCodeEnabled: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock('@/services/auth.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/services/auth.service');
  return {
    ...actual,
    registerWithPassword: (...args: unknown[]) => api.register(...args),
    checkRegistration: (...args: unknown[]) => api.check(...args),
    loginWithPassword: (...args: unknown[]) => api.login(...args),
    resetPasswordWithOtp: (...args: unknown[]) => api.reset(...args),
  };
});

vi.mock('@/features/phone-verification/api', () => ({
  sendOtp: (...args: unknown[]) => api.sendOtp(...args),
  verifyOtp: (...args: unknown[]) => api.verifyOtp(...args),
  getOtpConfig: () => Promise.resolve({ testCodeEnabled: api.testCodeEnabled }),
}));

// Ép nhánh desktop (Modal). Nhánh mobile là Drawer, cùng nội dung.
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const CUSTOMER = {
  id: 'U1',
  displayName: 'Khách A',
  email: null,
  avatarUrl: null,
  phone: '0901234567',
  phoneVerified: true,
  hasPassword: true,
  tenant: null,
  platformRole: null,
  permissions: [],
};

const REMEMBER_KEY = 'xp.auth.rememberedPhone';

function renderModal(search: string, extra: React.ReactNode = null) {
  nav.search = search;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>
        {/* Giống hệt `(public)/layout.tsx`: AuthUrlSync mới là thứ đọc `?auth=` từ URL. */}
        <AuthUrlSync />
        <AuthModal />
        {extra}
      </AuthModalProvider>
    </QueryClientProvider>,
  );
}

/** Tiêu đề hiện trong cột form (chữ gốc; CSS viết hoa). */
function heading(name: string) {
  return screen.findByRole('heading', { name });
}

/**
 * Hộp nổi chứa một tiêu đề. Không tìm popup bằng `getByRole('dialog', { name })`: trong môi
 * trường test, `useId` của rc-util trả cùng một id cho mọi hộp, nên hộp chồng lên nhau mang chung
 * một `aria-labelledby` và tên của popup bị đọc thành tên của hộp bên dưới.
 */
function popupOf(title: HTMLElement): HTMLElement {
  return title.closest('.ant-modal') as HTMLElement;
}

/** Điền form đăng ký rồi bấm "Đăng ký". */
function fillRegister() {
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
  fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Khách A' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
    target: { value: 'Abcd1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng ký' }));
}

/** Đủ thủ tục: form → mã OTP được gửi → popup → gõ đủ 6 số (tự gửi). */
async function submitRegister(code = '246810') {
  fillRegister();
  const codeInput = await screen.findByLabelText('Mã xác thực gồm 6 số');
  fireEvent.change(codeInput, { target: { value: code } });
}

function submitLogin(phone: string, password = 'Abcd1234') {
  fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

function apiError(code: string, status = 400) {
  return new ApiClientError({ code, message: 'x', status });
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  api.register.mockReset().mockResolvedValue(CUSTOMER);
  api.check.mockReset().mockResolvedValue(undefined);
  api.login.mockReset().mockResolvedValue(CUSTOMER);
  api.reset.mockReset().mockResolvedValue(undefined);
  api.sendOtp
    .mockReset()
    .mockResolvedValue({ expiresAt: '2026-10-14T00:05:00.000Z', devCode: null });
  api.verifyOtp.mockReset().mockResolvedValue({ verified: true });
  api.testCodeEnabled = false;
  window.localStorage.clear();
});

afterEach(cleanup);

describe('AuthModal — mở/đóng theo URL', () => {
  it('không có ?auth= thì không hiện gì', () => {
    renderModal('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('?auth=login · ?auth=register · ?auth=forgot mở đúng chế độ', async () => {
    renderModal('auth=login');
    expect(await heading('Đăng nhập')).toBeTruthy();
    cleanup();

    renderModal('auth=register');
    expect(await heading('Đăng ký')).toBeTruthy();
    cleanup();

    renderModal('auth=forgot');
    expect(await heading('Quên mật khẩu')).toBeTruthy();
  });

  it('"Đăng ký ngay!" chuyển login → register ngay trong hộp, không rời trang', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký ngay!' }));

    // Ghi bằng `replace` (Back vẫn đóng hộp, không quay về tab kia) và vẫn ở trang chủ.
    expect(nav.replace).toHaveBeenCalledWith('/?auth=register', { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();
    expect(await heading('Đăng ký')).toBeTruthy();
  });

  it('cột ảnh: hai huy hiệu cửa hàng dẫn tới trang ứng dụng', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    const play = screen.getByRole('link', { name: /Google Play/ });
    const appStore = screen.getByRole('link', { name: /App Store/ });
    expect(play.getAttribute('href')).toBe('/app');
    expect(appStore.getAttribute('href')).toBe('/app');
  });
});

describe('AuthModal — đăng nhập chỉ bằng số điện thoại (ADR 0060)', () => {
  it('form có SĐT + mật khẩu + "Ghi nhớ tài khoản" + "Quên mật khẩu?", KHÔNG có ô email', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Ghi nhớ tài khoản' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quên mật khẩu?' })).toBeTruthy();
    expect(screen.queryByLabelText('Email hoặc số điện thoại')).toBeNull();
    expect(screen.queryByText('Đăng nhập OTP')).toBeNull();
  });

  it('Google/Facebook có logo thương hiệu và tên đọc được', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    const google = screen.getByRole('button', { name: 'Tiếp tục với Google' });
    const facebook = screen.getByRole('button', { name: 'Tiếp tục với Facebook' });
    expect(google.textContent).toContain('Google');
    expect(google.querySelectorAll('path')).toHaveLength(4);
    expect(facebook.querySelector('circle')).toBeTruthy();
  });

  it('email ở ô SĐT bị chặn tại chỗ, không gọi API', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    submitLogin('khach@xeprime.test');
    expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('SĐT chép từ danh bạ (dấu cách) được gửi ở dạng gọn', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    submitLogin('090 123 4567');
    await waitFor(() => expect(api.login).toHaveBeenCalledWith('0901234567', 'Abcd1234'));
  });

  it('không có next → đóng hộp, ở lại marketplace (KHÔNG /manage)', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('có next=/trips → quay lại đúng /trips', async () => {
    renderModal('auth=login&next=%2Ftrips');
    await heading('Đăng nhập');

    submitLogin('0901234567');
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/trips'));
  });

  it('next ra ngoài domain bị bỏ qua — không open redirect', async () => {
    renderModal('auth=login&next=https%3A%2F%2Fevil.example');
    await heading('Đăng nhập');

    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('server từ chối email (PHONE_LOGIN_REQUIRED) → câu theo MÃ lỗi', async () => {
    api.login.mockRejectedValue(apiError(API_ERROR_CODE.PHONE_LOGIN_REQUIRED));
    renderModal('auth=login');
    await heading('Đăng nhập');

    submitLogin('0901234567');
    expect(await screen.findByText('Hãy đăng nhập bằng số điện thoại và mật khẩu.')).toBeTruthy();
  });

  it('sai SĐT/mật khẩu → câu chỉ nói số điện thoại, không nhắc email', async () => {
    api.login.mockRejectedValue(apiError(API_ERROR_CODE.INVALID_CREDENTIALS, 401));
    renderModal('auth=login');
    await heading('Đăng nhập');

    submitLogin('0901234567');
    expect(await screen.findByText('Số điện thoại hoặc mật khẩu không đúng.')).toBeTruthy();
    expect(screen.queryByText(/email/i)).toBeNull();
  });
});

describe('AuthPanel — site quản trị (passwordOnly)', () => {
  it('sai định danh/mật khẩu → câu nhắc cả email, vì realm platform nhận email', async () => {
    api.login.mockRejectedValue(apiError(API_ERROR_CODE.INVALID_CREDENTIALS, 401));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithIntl(
      <QueryClientProvider client={queryClient}>
        <AuthPanel mode={AUTH_MODE.LOGIN} passwordOnly onAuthenticated={vi.fn()} />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText('Email hoặc số điện thoại'), {
      target: { value: 'admin@xeprime.vn' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Email/số điện thoại hoặc mật khẩu không đúng.'),
    ).toBeTruthy();
  });
});

describe('AuthModal — "Ghi nhớ tài khoản"', () => {
  it('tick + đăng nhập thành công ⇒ lần mở sau điền sẵn SĐT (không bao giờ mật khẩu)', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Ghi nhớ tài khoản' }));
    submitLogin('090 123 4567');
    await waitFor(() => expect(window.localStorage.getItem(REMEMBER_KEY)).toBe('0901234567'));
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('Abcd1234');
    cleanup();

    renderModal('auth=login');
    await heading('Đăng nhập');
    expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0901234567');
    expect(
      (screen.getByRole('checkbox', { name: 'Ghi nhớ tài khoản' }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it('đăng nhập HỎNG thì không nhớ gì; bỏ tick rồi đăng nhập ⇒ quên số cũ', async () => {
    api.login.mockRejectedValueOnce(apiError(API_ERROR_CODE.INVALID_CREDENTIALS, 401));
    renderModal('auth=login');
    await heading('Đăng nhập');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ghi nhớ tài khoản' }));
    submitLogin('0909999999');
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(REMEMBER_KEY)).toBeNull();
    cleanup();

    window.localStorage.setItem(REMEMBER_KEY, '0901234567');
    renderModal('auth=login');
    await heading('Đăng nhập');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ghi nhớ tài khoản' }));
    submitLogin('0901234567');
    await waitFor(() => expect(window.localStorage.getItem(REMEMBER_KEY)).toBeNull());
  });
});

describe('AuthModal — đăng ký có xác minh SĐT bằng OTP', () => {
  it('form đủ bốn ô + Google/Facebook', async () => {
    renderModal('auth=register');
    await heading('Đăng ký');

    for (const label of ['Số điện thoại', 'Tên hiển thị', 'Mật khẩu', 'Xác nhận mật khẩu']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tiếp tục với Facebook' })).toBeTruthy();
  });

  it('bấm "Đăng ký" GỬI MÃ trước rồi mở popup xác minh — chưa tạo tài khoản nào', async () => {
    renderModal('auth=register');
    await heading('Đăng ký');

    fillRegister();
    expect(await heading('Xác minh tài khoản')).toBeTruthy();
    // Số che theo bản vẽ: ba số đầu, ba số cuối.
    expect(screen.getByText('090 *** *567')).toBeTruthy();
    expect(api.sendOtp).toHaveBeenCalledWith({
      phone: '0901234567',
      purpose: PHONE_VERIFICATION_PURPOSE.REGISTER,
    });
    expect(api.register).not.toHaveBeenCalled();
  });

  it('gõ đủ mã → tạo tài khoản kèm mã và ĐĂNG NHẬP LUÔN: hộp đóng, không màn chào mừng', async () => {
    renderModal('auth=register');
    await heading('Đăng ký');

    await submitRegister('246810');

    await waitFor(() =>
      expect(api.register).toHaveBeenCalledWith({
        displayName: 'Khách A',
        phone: '0901234567',
        password: 'Abcd1234',
        code: '246810',
      }),
    );
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.queryByText('Tạo tài khoản thành công')).toBeNull();
  });

  it('đăng ký xong có next → đi thẳng tới next (không mất ý định của khách)', async () => {
    renderModal('auth=register&next=%2Ftrips');
    await heading('Đăng ký');

    await submitRegister();
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/trips'));
  });

  it('số đã có tài khoản → báo ngay ở form, không gửi mã, không mở popup', async () => {
    api.check.mockRejectedValue(apiError(API_ERROR_CODE.PHONE_TAKEN, 409));
    renderModal('auth=register');
    await heading('Đăng ký');

    fillRegister();
    expect(await screen.findByText('Số điện thoại này đã có tài khoản.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Xác minh tài khoản' })).toBeNull();
    expect(api.register).not.toHaveBeenCalled();
    expect(api.sendOtp).not.toHaveBeenCalled();
  });

  it('gửi SMS lỗi → báo ngay ở form, KHÔNG mở popup', async () => {
    api.sendOtp.mockRejectedValue(apiError(API_ERROR_CODE.OTP_TOO_MANY, 429));
    renderModal('auth=register');
    await heading('Đăng ký');

    fillRegister();
    await waitFor(() => expect(api.sendOtp).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: 'Xác minh tài khoản' })).toBeNull();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('mã sai → báo lỗi trong popup, khách gõ lại được', async () => {
    api.register.mockRejectedValueOnce(apiError(API_ERROR_CODE.OTP_INVALID));
    renderModal('auth=register');
    await heading('Đăng ký');

    await submitRegister('111111');
    expect(await screen.findByText('Mã xác minh không đúng.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Xác minh tài khoản' })).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalledWith('/', { scroll: false });
  });

  it('đóng popup ⇒ về form đăng ký, giữ nguyên thứ đã điền', async () => {
    renderModal('auth=register');
    await heading('Đăng ký');

    fillRegister();
    const popup = popupOf(await heading('Xác minh tài khoản'));
    fireEvent.click(popup.querySelector('.ant-modal-close') as HTMLElement);

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Xác minh tài khoản' })).toBeNull(),
    );
    expect((screen.getByLabelText('Tên hiển thị') as HTMLInputElement).value).toBe('Khách A');
    expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0901234567');
  });

  it('môi trường mã test: mở thẳng popup, KHÔNG tốn tin nhắn', async () => {
    api.testCodeEnabled = true;
    renderModal('auth=register');
    await heading('Đăng ký');
    // Đợi cấu hình OTP về trước khi bấm — nó quyết định có gửi SMS hay không.
    await new Promise((resolve) => setTimeout(resolve, 0));

    fillRegister();
    await heading('Xác minh tài khoản');
    expect(api.sendOtp).not.toHaveBeenCalled();
  });
});

describe('AuthModal — quên mật khẩu ba bước', () => {
  async function toCodeStep() {
    renderModal('auth=login');
    await heading('Đăng nhập');
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    await heading('Quên mật khẩu');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    await heading('Nhập mã OTP');
  }

  it('"Quên mật khẩu?" mở bước 1 ngay trong hộp, mang theo số đang gõ', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));

    expect(await heading('Quên mật khẩu')).toBeTruthy();
    expect(nav.replace).toHaveBeenCalledWith('/?auth=forgot', { scroll: false });
    expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0901234567');
  });

  it('đủ ba bước: gửi mã → xác minh mã → đặt mật khẩu → "Thành công!" → về đăng nhập, số điền sẵn', async () => {
    await toCodeStep();
    expect(api.sendOtp).toHaveBeenCalledWith({
      phone: '0901234567',
      purpose: PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET,
    });
    expect(screen.getByText('090 *** *567')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mã xác thực gồm 6 số'), {
      target: { value: '135790' },
    });
    expect(await heading('Đặt lại mật khẩu')).toBeTruthy();
    expect(api.verifyOtp).toHaveBeenCalledWith({
      phone: '0901234567',
      purpose: PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET,
      code: '135790',
    });

    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'Moi12345' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'Moi12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() =>
      expect(api.reset).toHaveBeenCalledWith({
        phone: '0901234567',
        code: '135790',
        password: 'Moi12345',
      }),
    );
    const done = popupOf(await heading('Thành công!'));
    // Không cấp phiên: không ai được đăng nhập ở bước này.
    expect(api.login).not.toHaveBeenCalled();

    fireEvent.click(within(done).getByRole('button', { name: 'Đăng nhập' }));
    expect(await heading('Đăng nhập')).toBeTruthy();
    expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0901234567');
    expect(nav.replace).toHaveBeenLastCalledWith('/?auth=login', { scroll: false });
  });

  it('mã sai → báo ngay ở bước mã, không sang bước mật khẩu', async () => {
    api.verifyOtp.mockRejectedValueOnce(apiError(API_ERROR_CODE.OTP_INVALID));
    await toCodeStep();

    fireEvent.change(screen.getByLabelText('Mã xác thực gồm 6 số'), {
      target: { value: '000000' },
    });
    expect(await screen.findByText('Mã xác minh không đúng.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nhập mã OTP' })).toBeTruthy();
    expect(api.reset).not.toHaveBeenCalled();
  });

  it('mã chết giữa chừng (quá cửa sổ) ở bước mật khẩu → về bước mã kèm câu lỗi', async () => {
    api.reset.mockRejectedValueOnce(apiError(API_ERROR_CODE.OTP_EXPIRED));
    await toCodeStep();
    fireEvent.change(screen.getByLabelText('Mã xác thực gồm 6 số'), {
      target: { value: '135790' },
    });
    await heading('Đặt lại mật khẩu');

    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'Moi12345' } });
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu'), {
      target: { value: 'Moi12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));

    expect(await heading('Nhập mã OTP')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('bấm vạch bước 1 để sửa số; cùng số trong lúc chờ gửi lại thì KHÔNG gửi mã lần hai', async () => {
    await toCodeStep();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại bước 1' }));
    expect(await heading('Quên mật khẩu')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));
    expect(await heading('Nhập mã OTP')).toBeTruthy();
    expect(api.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('dán mã có dấu cách ("135 790") vẫn đủ 6 số', async () => {
    await toCodeStep();
    fireEvent.change(screen.getByLabelText('Mã xác thực gồm 6 số'), {
      target: { value: '135 790' },
    });
    await waitFor(() =>
      expect(api.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ code: '135790' })),
    );
  });

  it('sang đăng nhập rồi quay lại "Quên mật khẩu?" với cùng số: dùng mã đã gửi, không gửi lần hai', async () => {
    await toCodeStep();
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại bước 1' }));
    await heading('Quên mật khẩu');
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại đăng nhập!' }));
    await heading('Đăng nhập');

    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    await heading('Quên mật khẩu');
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await heading('Nhập mã OTP')).toBeTruthy();
    expect(api.sendOtp).toHaveBeenCalledTimes(1);
  });

  it('"Quay lại đăng nhập!" về form đăng nhập', async () => {
    renderModal('auth=forgot');
    await heading('Quên mật khẩu');
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại đăng nhập!' }));
    expect(await heading('Đăng nhập')).toBeTruthy();
  });
});

describe('AuthModal — mở giữa luồng thuê xe', () => {
  /** Nút giả lập hộp yêu cầu thuê: mở hộp đăng nhập với ngữ cảnh `booking`. */
  function OpenFromBooking({ mode }: { mode: (typeof AUTH_MODE)[keyof typeof AUTH_MODE] }) {
    const auth = useAuthModal();
    return (
      <button type="button" onClick={() => auth.open({ mode, context: AUTH_CONTEXT.BOOKING })}>
        mở từ hộp thuê
      </button>
    );
  }

  it('nói rõ vì sao được hỏi đăng nhập', async () => {
    renderModal('', <OpenFromBooking mode={AUTH_MODE.LOGIN} />);
    fireEvent.click(screen.getByRole('button', { name: 'mở từ hộp thuê' }));
    expect(
      await screen.findByText(
        'Đăng nhập hoặc tạo tài khoản để gửi yêu cầu thuê — thông tin chuyến bạn vừa chọn vẫn được giữ.',
      ),
    ).toBeTruthy();
  });

  it('đăng ký xong thì đóng thẳng để luồng thuê đi tiếp', async () => {
    renderModal('', <OpenFromBooking mode={AUTH_MODE.REGISTER} />);
    fireEvent.click(screen.getByRole('button', { name: 'mở từ hộp thuê' }));
    await screen.findByLabelText('Tên hiển thị');

    await submitRegister();
    await waitFor(() => expect(api.register).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false }));
  });
});

describe('AuthModal — vỏ overlay & ranh giới', () => {
  it('dialog có tên khả truy cập theo chế độ đang mở', async () => {
    renderModal('auth=login');
    expect(await screen.findByRole('dialog', { name: 'Đăng nhập XePrime' })).toBeTruthy();
    cleanup();

    renderModal('auth=register');
    expect(await screen.findByRole('dialog', { name: 'Tạo tài khoản XePrime' })).toBeTruthy();
    cleanup();

    renderModal('auth=forgot');
    expect(await screen.findByRole('dialog', { name: 'Quên mật khẩu XePrime' })).toBeTruthy();
  });

  it('bấm "Đăng nhập" hai lần chỉ gọi API một lần (chặn gửi trùng)', async () => {
    renderModal('auth=login');
    await heading('Đăng nhập');

    // Giữ request treo để lần bấm thứ hai rơi đúng lúc đang gửi.
    api.login.mockReturnValue(new Promise(() => {}));
    const submit = screen.getByRole('button', { name: 'Đăng nhập' });
    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form') as HTMLFormElement);
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  /**
   * Ranh giới sản phẩm: hộp này CHỈ được mount ở `(public)/layout.tsx` (khu khách). Dù
   * `/auth/me` trả về gì, hộp khách KHÔNG đẩy ai vào `/manage`.
   */
  it('tài khoản có gian hàng (dữ liệu lạ) đăng nhập từ hộp khách KHÔNG bị đẩy vào /manage', async () => {
    api.login.mockResolvedValue({ ...CUSTOMER, tenant: { id: 'T1' } });
    renderModal('auth=login');
    await heading('Đăng nhập');

    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalledWith('/manage');
  });

  it('theo ngôn ngữ đang đọc — giao diện tiếng Anh báo lỗi bằng tiếng Anh', async () => {
    nav.search = 'auth=login';
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithIntl(
      <QueryClientProvider client={queryClient}>
        <AuthModalProvider>
          <AuthUrlSync />
          <AuthModal />
        </AuthModalProvider>
      </QueryClientProvider>,
      { locale: 'en' },
    );
    await screen.findByRole('heading', { name: 'Sign in' });

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0901' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/phone number is not valid/i)).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });
});
