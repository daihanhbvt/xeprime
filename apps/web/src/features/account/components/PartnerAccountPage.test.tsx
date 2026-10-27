import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';

import { PartnerAccountPage } from './PartnerAccountPage';

/**
 * TRANG TÀI KHOẢN & BẢO MẬT (site partner) — gộp "Hồ sơ cá nhân" và "Bảo mật tài khoản" (05/10/2026).
 *
 * Bộ này khoá những gì làm nên lần gộp:
 *
 *  1. **Bốn section, theo thứ tự**: hồ sơ → đăng nhập → mật khẩu → xoá tài khoản; mục lục trỏ
 *     đúng bốn đích. Email/SĐT xuất hiện ĐÚNG MỘT lần — lý do gộp là hai trang từng cùng hiện chúng.
 *  2. **Cấp tiêu đề**: một `h1` (tiêu đề trang), bốn section là `h2`, khối con nhúng là `h3`.
 *  3. **Xoá tài khoản khép mặc định**: form xác nhận không nằm phơi giữa trang; bấm mới mở.
 *  4. **Không có gì của GIAN HÀNG**: tên/logo/SĐT liên hệ của gian hàng sống ở Cài đặt gian hàng —
 *     trang này chỉ trỏ tới đó.
 */

const profile = vi.hoisted(() => ({
  data: {
    id: '01HUSER000000000000000000',
    displayName: 'Phạm Đức Việt',
    email: 'owner.hanoi@xeprime.test',
    phone: '0903000001',
    emailVerified: true,
    phoneVerified: false,
    avatarUrl: null,
  } as unknown,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));
vi.mock('@/features/account/hooks/use-account', () => ({
  useMyProfile: () => profile,
  useUpdateMyProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

const user = vi.hoisted(() => ({
  value: null as unknown,
}));
vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true, hasAny: () => true, isLoading: false }),
}));

const search = vi.hoisted(() => ({ value: '' }));
const replace = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: replace }),
  usePathname: () => '/manage/account',
  useSearchParams: () => new URLSearchParams(search.value),
}));

// Khối "ảnh hưởng của việc đóng tài khoản" đọc ví, lệnh rút và chuyến đi thuê.
vi.mock('@/features/wallet/hooks', () => ({
  useWalletSummary: () => ({
    data: { available: '0', pending: '0' },
    isLoading: false,
    isError: false,
  }),
  useWithdrawals: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/features/trips/hooks', () => ({
  useTrips: () => ({ data: { counts: { current: 0 } }, isLoading: false, isError: false }),
}));
const supportCases = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('@/features/support-cases/hooks/use-support-cases', () => ({
  useSupportCases: () => ({ data: supportCases, isLoading: false, isError: false }),
  useOpenSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
}));

function setUser(track: 'package' | 'commission') {
  user.value = {
    id: '01HUSER000000000000000000',
    displayName: 'Phạm Đức Việt',
    hasPassword: true,
    platformRole: null,
    tenant: {
      name: 'Việt Car Hà Nội',
      roleKey: TENANT_ROLE.SHOP_OWNER,
      logoUrl: null,
      billingMode: track === 'package' ? BILLING_MODE.PACKAGE : BILLING_MODE.COMMISSION,
      onboardingState:
        track === 'package'
          ? SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE
          : SHOP_ONBOARDING_STATE.COMMISSION,
    },
  };
}

/**
 * `QueryClientProvider` thật: `ChangePasswordForm` gọi `useQueryClient()` để làm mới `auth.me`
 * sau khi đổi mật khẩu. Mọi query thật đã bị chặn ở tầng hook phía trên.
 */
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <App>
        <PartnerAccountPage />
      </App>
    </QueryClientProvider>,
  );
}

const section = (id: string) => within(document.getElementById(`account-section-${id}`)!);

beforeEach(() => {
  profile.isPending = false;
  profile.isError = false;
  supportCases.items = [];
  search.value = '';
  setUser('package');
});

afterEach(cleanup);

describe('Tài khoản & bảo mật — bốn section', () => {
  it('đúng một h1, bốn h2 theo thứ tự hồ sơ → đăng nhập → mật khẩu → xoá', () => {
    renderPage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe('Tài khoản & bảo mật');

    const h2s = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(h2s).toEqual(['Hồ sơ cá nhân', 'Thông tin đăng nhập', 'Mật khẩu', 'Xoá tài khoản']);
  });

  it('mục lục trỏ đúng bốn đích trong trang', () => {
    renderPage();

    const nav = within(screen.getByRole('navigation', { name: 'Các phần của trang tài khoản' }));
    const hrefs = nav.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '#account-section-profile',
      '#account-section-login',
      '#account-section-password',
      '#account-section-delete',
    ]);
  });

  /* Lý do gộp: hai trang cũ cùng hiện email/SĐT. Nay mỗi thứ chỉ một lần, ở section đăng nhập. */
  it('email và SĐT xuất hiện đúng một lần, kèm tình trạng xác minh và lối đổi', () => {
    renderPage();

    expect(screen.getAllByText('owner.hanoi@xeprime.test')).toHaveLength(1);
    expect(screen.getAllByText('0903000001')).toHaveLength(1);

    const login = section('login');
    expect(login.getByText('Đã xác minh')).toBeTruthy();
    expect(login.getByText('Chưa xác minh')).toBeTruthy();
    expect(login.getByRole('button', { name: /Đổi Email/ })).toBeTruthy();
    expect(login.getByRole('button', { name: /Đổi Số điện thoại/ })).toBeTruthy();
  });

  it('hồ sơ: sửa được tên + ảnh, nút Lưu chỉ sáng khi có thay đổi', () => {
    renderPage();

    const profileSection = section('profile');
    const save = profileSection.getByRole('button', { name: /Lưu thay đổi/ });
    expect(save).toHaveProperty('disabled', true);

    fireEvent.change(profileSection.getByLabelText(/Họ tên hiển thị/), {
      target: { value: 'Việt Phạm' },
    });
    expect(save).toHaveProperty('disabled', false);
    // Thẻ xem trước đi theo ô đang gõ, không đợi lưu.
    expect(profileSection.getByText('Việt Phạm')).toBeTruthy();
  });

  it('mật khẩu: form nhúng, không tự dựng tiêu đề trang thứ hai', () => {
    renderPage();

    const password = section('password');
    expect(password.getByLabelText(/Mật khẩu hiện tại/)).toBeTruthy();
    expect(screen.queryByText('Cập nhật bảo mật')).toBeNull();
  });
});

describe('Tài khoản & bảo mật — xoá tài khoản khép mặc định', () => {
  it('chỉ một dòng giới thiệu + nút; bấm mới hiện ảnh hưởng và form xác nhận', () => {
    renderPage();

    const del = section('delete');
    expect(del.queryByRole('checkbox')).toBeNull();
    expect(del.queryByText('Trước khi gửi yêu cầu, hãy xem phần này')).toBeNull();

    fireEvent.click(del.getByRole('button', { name: 'Yêu cầu xoá tài khoản' }));

    expect(del.getByText('Trước khi gửi yêu cầu, hãy xem phần này')).toBeTruthy();
    expect(del.getByRole('checkbox')).toBeTruthy();
    expect(
      del.getByRole('heading', { level: 3, name: 'Xác nhận gửi yêu cầu xoá tài khoản' }),
    ).toBeTruthy();

    // "Để sau" khép lại — không để form mở dở giữa trang.
    fireEvent.click(del.getByRole('button', { name: 'Để sau' }));
    expect(del.queryByRole('checkbox')).toBeNull();
  });

  it('đang có yêu cầu chờ: hiện trạng thái thẳng, không bắt bấm mở', () => {
    supportCases.items = [
      { id: 'case-1', code: 'SC-0001', status: 'open', createdAt: '2026-10-01T03:00:00.000Z' },
    ];
    renderPage();

    const del = section('delete');
    expect(
      del.getByRole('heading', { level: 3, name: 'Yêu cầu của bạn đang được xử lý' }),
    ).toBeTruthy();
    expect(del.queryByRole('button', { name: 'Yêu cầu xoá tài khoản' })).toBeNull();
  });
});

describe('Tài khoản & bảo mật — tách khỏi gian hàng', () => {
  it('không có hồ sơ gian hàng, gói, ví hay hoá đơn', () => {
    renderPage();

    for (const text of [
      'Thông tin hiển thị',
      'Gói & hạn mức',
      'Tài khoản nhận tiền',
      'Logo gian hàng',
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it('gian hàng tuyến gói: chỉ trỏ tới Cài đặt gian hàng', () => {
    renderPage();

    const link = section('profile').getByRole('link', { name: 'Mở Cài đặt gian hàng' });
    expect(link.getAttribute('href')).toBe('/manage/shop');
  });
});

describe('Tài khoản & bảo mật — trạng thái tải', () => {
  it('đang tải: không dựng section nào', () => {
    profile.isPending = true;
    renderPage();

    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('lỗi: nói rõ và có nút thử lại', () => {
    profile.isError = true;
    renderPage();

    expect(screen.getByText('Không tải được thông tin tài khoản')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }));
    expect(profile.refetch).toHaveBeenCalled();
  });
});
