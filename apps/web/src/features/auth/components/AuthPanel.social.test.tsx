import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthModal } from './AuthModal';
import { AuthModalProvider, AuthUrlSync } from './AuthModalProvider';

/**
 * Đăng nhập Google/Facebook sau ADR 0019: web KHÔNG chạy vòng OAuth nào, nó chỉ rời trang sang
 * backend. Hai điều duy nhất có thể sai ở phía web, và cả hai đều được khoá ở đây:
 *
 *  1. `next` gửi đi phải BỎ `?auth=`/`?next=`/`?authError=` — nếu không, đăng nhập xong hộp
 *     đăng nhập mở lại ngay trước mặt người vừa đăng nhập thành công;
 *  2. `?authError=` quay về phải hiện thành câu ĐÃ DỊCH, không phải mã thô.
 */
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/xe/01HZX9',
  search: '',
}));

const social = vi.hoisted(() => ({ start: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));

/*
 * Mock ở tầng `startSocialLogin` chứ không phải `window.location`: jsdom không cho thay
 * `location` (thuộc tính unforgeable), và điều đáng kiểm ở đây là THAM SỐ mà panel gửi đi —
 * việc dựng URL đã có test riêng ở `lib/social-auth-url.test.ts`.
 */
vi.mock('@/features/auth/lib/social-auth-url', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/features/auth/lib/social-auth-url',
  );
  return { ...actual, startSocialLogin: (...args: unknown[]) => social.start(...args) };
});

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));
vi.mock('@/features/phone-verification/components/PhoneLoginForm', () => ({
  PhoneLoginForm: () => null,
}));

function renderModal(search: string) {
  nav.search = search;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthModalProvider>
        <AuthUrlSync />
        <AuthModal />
      </AuthModalProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.push.mockReset();
  nav.replace.mockReset();
  social.start.mockReset();
  window.history.replaceState(null, '', '/');
});

afterEach(cleanup);

describe('AuthPanel — bấm nút mạng xã hội', () => {
  it('rời trang sang backend với `next` đã bỏ tham số điều khiển hộp đăng nhập', async () => {
    window.history.replaceState(null, '', '/xe/01HZX9?auth=login&from=home');
    renderModal('auth=login&from=home');

    const google = await screen.findByRole('button', { name: /Google/ });
    fireEvent.click(google);

    expect(social.start).toHaveBeenCalledTimes(1);
    expect(social.start).toHaveBeenCalledWith('google', {
      pathname: '/xe/01HZX9',
      search: '?auth=login&from=home',
      locale: 'vi',
    });
  });

  it('bấm lần thứ hai không tạo thêm một lần điều hướng nữa', async () => {
    renderModal('auth=login');

    const google = await screen.findByRole('button', { name: /Google/ });
    fireEvent.click(google);
    fireEvent.click(google);

    expect(social.start).toHaveBeenCalledTimes(1);
  });
});

describe('AuthPanel — lỗi mang về từ ?authError=', () => {
  it('hiện câu đã dịch, không phải mã thô', async () => {
    renderModal('auth=login&authError=SOCIAL_CANCELLED');

    await waitFor(() =>
      expect(
        screen.getByText('Bạn đã huỷ ở bước cấp quyền nên chưa đăng nhập được.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('SOCIAL_CANCELLED')).toBeNull();
  });

  it('mã lạ (backend mới hơn web) rơi về câu chung, không in mã ra màn hình', async () => {
    renderModal('auth=login&authError=SOMETHING_NEW');

    await waitFor(() => expect(screen.queryByText('SOMETHING_NEW')).toBeNull());
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('không có ?authError= thì không hiện cảnh báo nào', async () => {
    renderModal('auth=login');

    await screen.findByRole('button', { name: /Google/ });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
