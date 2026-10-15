import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { AuthModal } from './AuthModal';
import { AuthModalProvider, AuthUrlSync, useAuthModal } from './AuthModalProvider';
import { AUTH_CONTEXT, AUTH_MODE } from '../post-auth-destination';
import { renderWithIntl } from '@/i18n/test-utils';

/**
 * Modal đăng nhập/đăng ký của KHÁCH — ADR 0060.
 *
 * Khoá lại:
 *  - Đăng nhập CHỈ bằng số điện thoại + mật khẩu (không ô email, không tab OTP), Google/Facebook
 *    và "Quên mật khẩu" vẫn có.
 *  - Đăng ký: SĐT · tên hiển thị · mật khẩu · nhập lại → gửi mã OTP `register` → nhập mã → tạo
 *    tài khoản. Không có mã thì không có tài khoản.
 *  - Đăng ký xong KHÔNG đi `/manage`, KHÔNG hiện form tạo gian hàng, khách được CHỌN đi đâu tiếp —
 *    trừ khi họ đang dở một yêu cầu thuê: khi đó hộp đóng thẳng để luồng thuê đi tiếp.
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
  sendOtp: vi.fn(),
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
  };
});

vi.mock('@/features/phone-verification/api', () => ({
  sendOtp: (...args: unknown[]) => api.sendOtp(...args),
  verifyOtp: vi.fn(),
  getOtpConfig: () => Promise.resolve({ testCodeEnabled: api.testCodeEnabled }),
}));

// Ép nhánh desktop (Modal). Nhánh mobile là Drawer, kiểm bằng test riêng ở dưới.
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

/**
 * Tiêu đề HIỂN THỊ trong thân modal.
 *
 * Từ Wave 1B, dialog còn mang một tiêu đề chỉ-đọc-màn-hình cùng nội dung để có tên khả truy
 * cập (trước đó modal đăng nhập không có tên — backlog D14.2). Chữ này vì thế xuất hiện hai
 * lần trong DOM; test lọc lấy bản nhìn thấy được.
 */
function visibleTitle(text: string): HTMLElement | undefined {
  return screen
    .getAllByText((_, element) => element?.textContent === text)
    .find((el) => !el.className.includes('srOnly'));
}

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

/** Điền form đăng ký (bước 1) rồi bấm "Tạo tài khoản". */
function fillRegister() {
  fireEvent.change(screen.getByLabelText('Số điện thoại'), {
    target: { value: '0901234567' },
  });
  fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Khách A' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
    target: { value: 'Abcd1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
}

/** Đủ thủ tục: form → mã OTP được gửi → gõ đủ 6 số (tự gửi). */
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

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  api.register.mockReset().mockResolvedValue(CUSTOMER);
  api.check.mockReset().mockResolvedValue(undefined);
  api.login.mockReset().mockResolvedValue(CUSTOMER);
  api.sendOtp
    .mockReset()
    .mockResolvedValue({ expiresAt: '2026-10-14T00:05:00.000Z', devCode: null });
  api.testCodeEnabled = false;
});

afterEach(cleanup);

describe('AuthModal — mở/đóng theo URL', () => {
  it('không có ?auth= thì không hiện gì', () => {
    renderModal('');
    expect(screen.queryByText('Đăng nhập XePrime')).toBeNull();
  });

  it('?auth=login mở chế độ đăng nhập; ?auth=register mở chế độ đăng ký', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());
    cleanup();

    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());
  });

  it('"Đăng ký ngay" chuyển login → register ngay trong modal, không rời trang', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Đăng ký ngay' }));

    // Ghi bằng `replace` (Back vẫn đóng modal, không quay về tab kia) và vẫn ở trang chủ.
    expect(nav.replace).toHaveBeenCalledWith('/?auth=register', { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe('AuthModal — đăng nhập chỉ bằng số điện thoại (ADR 0060)', () => {
  it('form có SĐT + mật khẩu + "Quên mật khẩu", KHÔNG có ô email hay tab OTP', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    expect(screen.getByLabelText('Số điện thoại')).toBeTruthy();
    expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' })).toBeTruthy();
    expect(screen.queryByLabelText('Email hoặc số điện thoại')).toBeNull();
    expect(screen.queryByText('Đăng nhập OTP')).toBeNull();
  });

  it('Google/Facebook nói "Đăng nhập với …" kèm logo thương hiệu', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    const google = screen.getByRole('button', { name: 'Đăng nhập với Google' });
    const facebook = screen.getByRole('button', { name: 'Đăng nhập với Facebook' });
    expect(google.querySelectorAll('path')).toHaveLength(4);
    expect(facebook.querySelectorAll('path')).toHaveLength(1);
  });

  it('email ở ô SĐT bị chặn tại chỗ, không gọi API', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('khach@xeprime.test');
    expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });

  it('SĐT chép từ danh bạ (dấu cách) được gửi ở dạng gọn', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('090 123 4567');
    await waitFor(() => expect(api.login).toHaveBeenCalledWith('0901234567', 'Abcd1234'));
  });

  it('không có next → đóng modal, ở lại marketplace (KHÔNG /manage)', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('có next=/trips → quay lại đúng /trips', async () => {
    renderModal('auth=login&next=%2Ftrips');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('0901234567');
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/trips'));
  });

  it('next ra ngoài domain bị bỏ qua — không open redirect', async () => {
    renderModal('auth=login&next=https%3A%2F%2Fevil.example');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('server từ chối email (PHONE_LOGIN_REQUIRED) → câu theo MÃ lỗi', async () => {
    api.login.mockRejectedValue(
      new ApiClientError({ code: API_ERROR_CODE.PHONE_LOGIN_REQUIRED, message: 'x', status: 400 }),
    );
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('0901234567');
    expect(await screen.findByText('Hãy đăng nhập bằng số điện thoại và mật khẩu.')).toBeTruthy();
  });
});

describe('AuthModal — đăng ký có xác minh SĐT bằng OTP', () => {
  it('form đủ bốn ô + "Đăng ký với Google/Facebook"', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    for (const label of ['Số điện thoại', 'Tên hiển thị', 'Mật khẩu', 'Nhập lại mật khẩu']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Đăng ký với Google' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng ký với Facebook' })).toBeTruthy();
  });

  it('bấm "Tạo tài khoản" GỬI MÃ trước — chưa tạo tài khoản nào', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    fillRegister();
    await screen.findByText('Xác minh số điện thoại');
    expect(api.sendOtp).toHaveBeenCalledWith({
      phone: '0901234567',
      purpose: PHONE_VERIFICATION_PURPOSE.REGISTER,
    });
    expect(api.register).not.toHaveBeenCalled();
  });

  it('gõ đủ mã → tạo tài khoản kèm mã, rồi màn chào mừng (KHÔNG /manage)', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    await submitRegister('246810');

    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());
    expect(api.register).toHaveBeenCalledWith({
      displayName: 'Khách A',
      phone: '0901234567',
      password: 'Abcd1234',
      code: '246810',
    });
    expect(nav.push).not.toHaveBeenCalledWith('/manage');
    expect(screen.queryByText('Tạo gian hàng')).toBeNull();
  });

  it('số đã có tài khoản → báo ngay ở form (bước kiểm tra), không gửi mã, không sang bước mã', async () => {
    api.check.mockRejectedValue(
      new ApiClientError({ code: API_ERROR_CODE.PHONE_TAKEN, message: 'x', status: 409 }),
    );
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    fillRegister();
    expect(await screen.findByText('Số điện thoại này đã có tài khoản.')).toBeTruthy();
    expect(screen.queryByText('Xác minh số điện thoại')).toBeNull();
    expect(api.register).not.toHaveBeenCalled();
    expect(api.sendOtp).not.toHaveBeenCalled();
  });

  it('gửi SMS lỗi / không lấy được mã → báo ngay ở form, KHÔNG sang bước mã', async () => {
    api.sendOtp.mockRejectedValue(
      new ApiClientError({ code: API_ERROR_CODE.OTP_TOO_MANY, message: 'x', status: 429 }),
    );
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    fillRegister();
    await waitFor(() => expect(api.sendOtp).toHaveBeenCalled());
    expect(screen.queryByText('Xác minh số điện thoại')).toBeNull();
    expect(api.register).not.toHaveBeenCalled();
  });

  it('mã sai → báo lỗi ở bước mã, khách gõ lại được', async () => {
    api.register.mockRejectedValueOnce(
      new ApiClientError({ code: API_ERROR_CODE.OTP_INVALID, message: 'x', status: 400 }),
    );
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    await submitRegister('111111');
    expect(await screen.findByText('Mã xác minh không đúng.')).toBeTruthy();
    expect(screen.getByText('Xác minh số điện thoại')).toBeTruthy();
  });

  it('"Sửa thông tin" quay lại form, giữ nguyên thứ đã điền', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());

    fillRegister();
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa thông tin' }));

    expect((screen.getByLabelText('Tên hiển thị') as HTMLInputElement).value).toBe('Khách A');
    expect((screen.getByLabelText('Số điện thoại') as HTMLInputElement).value).toBe('0901234567');
  });

  it('môi trường mã test: sang thẳng bước mã, KHÔNG tốn tin nhắn', async () => {
    api.testCodeEnabled = true;
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());
    // Đợi cấu hình OTP về trước khi bấm — nó quyết định có gửi SMS hay không.
    await waitFor(() => expect(api.sendOtp).not.toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    fillRegister();
    await screen.findByText('Xác minh số điện thoại');
    expect(api.sendOtp).not.toHaveBeenCalled();
  });
});

describe('AuthModal — sau khi đăng ký', () => {
  async function registered(search = 'auth=register') {
    renderModal(search);
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());
    await submitRegister();
    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());
  }

  it('hiện đúng ba hành động', async () => {
    await registered();
    expect(screen.getByRole('button', { name: /Đóng/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cập nhật tài khoản/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Trở thành chủ xe/ })).toBeTruthy();
  });

  it('"Cập nhật tài khoản" mở /account, không phải hồ sơ gian hàng', async () => {
    await registered();
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật tài khoản/ }));
    expect(nav.push).toHaveBeenCalledWith('/account');
    expect(nav.push).not.toHaveBeenCalledWith('/manage/shop');
  });

  it('"Trở thành chủ xe" mở trang CHỌN cách cho thuê của site khách, KHÔNG tự tạo gian hàng', async () => {
    await registered();
    fireEvent.click(screen.getByRole('button', { name: /Trở thành chủ xe/ }));
    // Đăng ký chủ xe là một tài khoản ĐỐI TÁC riêng ở site partner (ADR 0051 · 0053) — chế độ
    // `path` của vitest nên đích là đường dẫn tương đối của khu partner.
    expect(nav.push).toHaveBeenCalledWith('/list-your-vehicle');
    expect(nav.push).not.toHaveBeenCalledWith('/manage/onboarding');
  });

  it('"Đóng" khi không có next → ở lại trang, không điều hướng đi đâu', async () => {
    await registered();
    fireEvent.click(screen.getByRole('button', { name: /^Đóng$/ }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('có next → nút đóng thành "Tiếp tục" và đi tới next (không mất intent của khách)', async () => {
    await registered('auth=register&next=%2Ftrips');
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(nav.push).toHaveBeenCalledWith('/trips');
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

  it('đăng ký xong thì đóng thẳng — không chen màn chào mừng vào giữa luồng thuê', async () => {
    renderModal('', <OpenFromBooking mode={AUTH_MODE.REGISTER} />);
    fireEvent.click(screen.getByRole('button', { name: 'mở từ hộp thuê' }));
    await screen.findByLabelText('Tên hiển thị');

    await submitRegister();
    await waitFor(() => expect(api.register).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false }));
    expect(screen.queryByText('Tạo tài khoản thành công')).toBeNull();
  });
});

/**
 * Bổ sung ở Wave 1B: những thứ vỏ overlay chịu trách nhiệm (tên khả truy cập) và ranh giới sản
 * phẩm mà việc thay vỏ tuyệt đối không được làm xê dịch.
 */
describe('AuthModal — vỏ overlay & ranh giới (Wave 1B)', () => {
  function accessibleName(el: HTMLElement): string | null {
    const label = el.getAttribute('aria-label');
    if (label) return label;
    const id = el.getAttribute('aria-labelledby');
    if (!id) return null;
    return id
      .split(/\s+/)
      .map((x) => document.getElementById(x)?.textContent ?? '')
      .join(' ')
      .trim();
  }

  it('dialog có tên khả truy cập theo chế độ đang mở', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());
    expect(accessibleName(screen.getByRole('dialog'))).toBe('Đăng nhập XePrime');
  });

  it('chế độ đăng ký đổi luôn tên khả truy cập', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(visibleTitle('Tạo tài khoản XePrime')).toBeTruthy());
    expect(accessibleName(screen.getByRole('dialog'))).toBe('Tạo tài khoản XePrime');
  });

  it('bấm "Đăng nhập" hai lần chỉ gọi API một lần (chặn gửi trùng)', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    // Giữ request treo để lần bấm thứ hai rơi đúng lúc đang gửi.
    api.login.mockReturnValue(new Promise(() => {}));
    const submit = screen.getByRole('button', { name: 'Đăng nhập' });
    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  /**
   * Ranh giới sản phẩm: modal này CHỈ được mount ở `(public)/layout.tsx` (khu khách). Dù
   * `/auth/me` trả về gì, modal khách KHÔNG đẩy ai vào `/manage`.
   */
  it('tài khoản có gian hàng (dữ liệu lạ) đăng nhập từ modal khách KHÔNG bị đẩy vào /manage', async () => {
    api.login.mockResolvedValue({ ...CUSTOMER, tenant: { id: 'T1' } });
    renderModal('auth=login');
    await waitFor(() => expect(visibleTitle('Đăng nhập XePrime')).toBeTruthy());

    submitLogin('0901234567');
    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalledWith('/manage');
  });

  /**
   * Câu lỗi của schema từng nằm cứng bằng tiếng Việt trong `@xeprime/validators`, nên giao diện
   * tiếng Anh vẫn ăn tiếng Việt ngay khi bấm Đăng nhập. Test này khoá phần nối dây đó lại.
   */
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
    await waitFor(() => expect(visibleTitle('Sign in to XePrime')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0901' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/phone number is not valid/i)).toBeTruthy();
    expect(api.login).not.toHaveBeenCalled();
  });
});
