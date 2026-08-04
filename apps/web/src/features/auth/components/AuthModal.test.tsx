import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModal } from './AuthModal';
import { AuthModalProvider, AuthUrlSync } from './AuthModalProvider';

/**
 * Khoá lại hành vi trung tâm của thay đổi này: đăng ký xong KHÔNG đi `/manage`, KHÔNG hiện form
 * tạo gian hàng, và khách được CHỌN đi đâu tiếp qua đúng ba hành động.
 */
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/',
  search: '',
}));

const api = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
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
    loginWithPassword: (...args: unknown[]) => api.login(...args),
  };
});

// Ép nhánh desktop (Modal). Nhánh mobile là Drawer, kiểm bằng test riêng ở dưới.
vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false, useMediaQuery: () => false }));
// Tab OTP không thuộc phạm vi test này và kéo theo cả cụm phone-verification.
vi.mock('@/features/phone-verification/components/PhoneLoginForm', () => ({
  PhoneLoginForm: () => null,
}));

const CUSTOMER = {
  id: 'U1',
  displayName: 'Khách A',
  email: 'khach@xeprime.test',
  avatarUrl: null,
  phoneVerified: false,
  hasPassword: true,
  tenant: null,
  platformRole: null,
  permissions: [],
};

function renderModal(search: string) {
  nav.search = search;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>
        {/* Giống hệt `(public)/layout.tsx`: AuthUrlSync mới là thứ đọc `?auth=` từ URL. */}
        <AuthUrlSync />
        <AuthModal />
      </AuthModalProvider>
    </QueryClientProvider>,
  );
}

/** Điền form đăng ký rồi submit. */
async function submitRegister() {
  fireEvent.change(screen.getByLabelText('Họ tên'), { target: { value: 'Khách A' } });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'khach@xeprime.test' },
  });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
    target: { value: 'Abcd1234' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  api.register.mockReset().mockResolvedValue(CUSTOMER);
  api.login.mockReset().mockResolvedValue(CUSTOMER);
});

afterEach(cleanup);

describe('AuthModal — mở/đóng theo URL', () => {
  it('không có ?auth= thì không hiện gì', () => {
    renderModal('');
    expect(screen.queryByText('Đăng nhập XePrime')).toBeNull();
  });

  it('?auth=login mở chế độ đăng nhập; ?auth=register mở chế độ đăng ký', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(screen.getByText('Đăng nhập XePrime')).toBeTruthy());
    cleanup();

    renderModal('auth=register');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());
  });

  it('chuyển login → register ngay trong modal, không rời trang', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(screen.getByText('Đăng nhập XePrime')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    // Ghi bằng `replace` (Back vẫn đóng modal, không quay về tab kia) và vẫn ở trang chủ.
    expect(nav.replace).toHaveBeenCalledWith('/?auth=register', { scroll: false });
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe('AuthModal — sau khi đăng ký', () => {
  it('KHÔNG điều hướng /manage và KHÔNG hiện form tạo gian hàng', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());

    await submitRegister();

    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());
    expect(nav.push).not.toHaveBeenCalledWith('/manage');
    expect(screen.queryByText('Tạo gian hàng')).toBeNull();
    expect(screen.queryByText('Tên gian hàng')).toBeNull();
  });

  it('hiện đúng ba hành động', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());
    await submitRegister();
    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());

    expect(screen.getByRole('button', { name: /Đóng/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cập nhật tài khoản/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Trở thành chủ xe/ })).toBeTruthy();
  });

  it('"Cập nhật tài khoản" mở /account, không phải hồ sơ gian hàng', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());
    await submitRegister();
    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Cập nhật tài khoản/ }));
    expect(nav.push).toHaveBeenCalledWith('/account');
    expect(nav.push).not.toHaveBeenCalledWith('/manage/shop');
  });

  it('"Trở thành chủ xe" mở owner onboarding (chỉ ở đó mới có form tạo shop)', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());
    await submitRegister();
    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Trở thành chủ xe/ }));
    expect(nav.push).toHaveBeenCalledWith('/manage/onboarding');
  });

  it('"Đóng" khi không có next → ở lại trang, không điều hướng đi đâu', async () => {
    renderModal('auth=register');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());
    await submitRegister();
    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /^Đóng$/ }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('có next → nút đóng thành "Tiếp tục" và đi tới next (không mất intent của khách)', async () => {
    renderModal('auth=register&next=%2Ftrips');
    await waitFor(() => expect(screen.getByText('Tạo tài khoản XePrime')).toBeTruthy());
    await submitRegister();
    await waitFor(() => expect(screen.getByText('Tạo tài khoản thành công')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(nav.push).toHaveBeenCalledWith('/trips');
  });
});

describe('AuthModal — sau khi đăng nhập', () => {
  it('không có next → đóng modal, ở lại marketplace (KHÔNG /manage)', async () => {
    renderModal('auth=login');
    await waitFor(() => expect(screen.getByText('Đăng nhập XePrime')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Email hoặc số điện thoại'), {
      target: { value: 'khach@xeprime.test' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(api.login).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('có next=/trips → quay lại đúng /trips', async () => {
    renderModal('auth=login&next=%2Ftrips');
    await waitFor(() => expect(screen.getByText('Đăng nhập XePrime')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Email hoặc số điện thoại'), {
      target: { value: 'khach@xeprime.test' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/trips'));
  });

  it('next ra ngoài domain bị bỏ qua — không open redirect', async () => {
    renderModal('auth=login&next=https%3A%2F%2Fevil.example');
    await waitFor(() => expect(screen.getByText('Đăng nhập XePrime')).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Email hoặc số điện thoại'), {
      target: { value: 'khach@xeprime.test' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Abcd1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
  });
});
