import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PortalLoginPage from './page';

/**
 * Trang đăng nhập cổng quản lý KHÔNG được hiện form cho người đang có phiên.
 *
 * Lỗi thật (28/08/2026): chủ gian hàng / nhân sự nền tảng đang đăng nhập mà gõ tay
 * `/manage/login` thì vẫn vào được form, tức là một form chết — điền vào chỉ để đăng nhập lại
 * chính mình. Đúng hành vi là đá về portal.
 *
 * Vì sao kiểm ở CLIENT chứ không ở proxy: proxy chỉ thấy cookie có hay không, không verify
 * được (xem `proxy.ts`), nên đá theo cookie sẽ tạo vòng lặp với cookie hỏng. `/auth/me` đã
 * xác thực thật thì không có vòng lặp đó — và test cuối khoá lại đúng điều này.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const state = vi.hoisted(() => ({
  user: null as unknown,
  search: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: state.user }) }));

vi.mock('@/features/auth/hooks/use-auth-actions', () => ({
  useAuthCache: () => ({ refreshAfterAuth: vi.fn(), clearAfterLogout: vi.fn() }),
}));

// Form auth thật kéo theo cả cụm social + OTP; ở đây chỉ cần biết nó CÓ hiện hay không.
vi.mock('@/features/auth/components/AuthPanel', () => ({
  AuthPanel: () => <div data-testid="auth-panel" />,
}));

const OWNER = { id: 'U1', displayName: 'Chủ shop', tenant: { id: 'T1' }, platformRole: null };
const PLATFORM = { id: 'U2', displayName: 'Admin', tenant: null, platformRole: 'platform_admin' };

beforeEach(() => {
  nav.replace.mockReset();
  state.user = null;
  state.search = '';
});

afterEach(cleanup);

describe('/manage/login', () => {
  it('chưa đăng nhập → hiện form, không điều hướng đi đâu', () => {
    render(<PortalLoginPage />);

    expect(screen.getByTestId('auth-panel')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('chủ gian hàng đang đăng nhập → đá về /manage, KHÔNG hiện form', async () => {
    state.user = OWNER;
    render(<PortalLoginPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage'));
    expect(screen.queryByTestId('auth-panel')).toBeNull();
  });

  it('nhân sự nền tảng đang đăng nhập → đá về /manage/admin', async () => {
    state.user = PLATFORM;
    render(<PortalLoginPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage/admin'));
  });

  /** Vào bằng URL cũng phải tôn trọng `?next=` như khi đăng nhập qua form. */
  it('giữ nguyên `next` an toàn khi đá về', async () => {
    state.user = OWNER;
    state.search = 'next=%2Fmanage%2Fvehicles';
    render(<PortalLoginPage />);

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/manage/vehicles'));
  });

  /**
   * Cookie hỏng/hết hạn: `/auth/me` trả 401 nên `useCurrentUser` không có data. Trang phải đứng
   * yên ở form — đá đi lúc này chính là vòng lặp mà `proxy.ts` cố tình tránh.
   */
  it('cookie hỏng (không có /auth/me) → đứng yên ở form, không tạo vòng lặp', () => {
    state.user = null;
    state.search = 'next=%2Fmanage%2Fvehicles';
    render(<PortalLoginPage />);

    expect(screen.getByTestId('auth-panel')).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
