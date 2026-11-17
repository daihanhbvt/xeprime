import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';

import { PartnerAccountPage } from './PartnerAccountPage';

/**
 * TRANG TÀI KHOẢN & BẢO MẬT (site partner) - design `24131:71661` (17/11/2026).
 *
 * Bộ này khoá những gì bản vẽ và người dùng đã chốt:
 *
 *  1. **Một trang gọn, không mục lục**: thẻ hồ sơ bên trái, "Thông tin đăng nhập" + "Mật khẩu" bên
 *     phải; email/SĐT xuất hiện ĐÚNG MỘT lần.
 *  2. **Xác minh / đổi**: định danh chưa xác minh có thêm nút "Xác minh" - mở hộp gửi mã thẳng tới
 *     chính định danh đó; "Thay đổi" mở hộp nhập định danh mới.
 *  3. **Mật khẩu**: luật thật của server (không "ký tự đặc biệt"), thanh độ mạnh, "Quên mật khẩu"
 *     dẫn về luồng của site partner - vắng với tài khoản nhân viên do gian hàng cấp.
 *  4. **Xoá tài khoản** là một dòng chữ mở hộp yêu cầu xoá dùng chung.
 *  5. **Không có gì của GIAN HÀNG**: chỉ trỏ tới Cài đặt gian hàng.
 */

const profile = vi.hoisted(() => ({
  data: {
    id: '01HUSER000000000000000000',
    displayName: 'Phạm Đức Việt',
    email: 'owner.hanoi@xeprime.test',
    phone: '0903000001',
    emailVerified: false,
    phoneVerified: true,
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

const sendEmailOtp = vi.hoisted(() => vi.fn());
vi.mock('@/features/account/api', () => ({
  sendMyEmailOtp: sendEmailOtp,
  sendMyPhoneOtp: vi.fn(() => Promise.resolve({ expiresAt: '2026-11-17T03:00:00.000Z' })),
  verifyMyEmail: vi.fn(),
  verifyMyPhone: vi.fn(),
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/manage/account',
  useSearchParams: () => new URLSearchParams(''),
}));

// Hộp yêu cầu xoá đọc ví, lệnh rút và chuyến đi thuê.
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
vi.mock('@/features/support-cases/hooks/use-support-cases', () => ({
  useSupportCases: () => ({ data: { items: [] }, isLoading: false, isError: false }),
  useOpenSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
}));

function setUser(
  track: 'package' | 'commission',
  extra: { managedAccount?: boolean; roleKey?: string } = {},
) {
  user.value = {
    id: '01HUSER000000000000000000',
    displayName: 'Phạm Đức Việt',
    hasPassword: true,
    managedAccount: extra.managedAccount ?? false,
    platformRole: null,
    tenant: {
      name: 'Việt Car Hà Nội',
      roleKey: extra.roleKey ?? TENANT_ROLE.SHOP_OWNER,
      logoUrl: null,
      planName: track === 'package' ? 'Gói ô tô 10 xe' : null,
      billingMode: track === 'package' ? BILLING_MODE.PACKAGE : BILLING_MODE.COMMISSION,
      onboardingState:
        track === 'package'
          ? SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE
          : SHOP_ONBOARDING_STATE.COMMISSION,
    },
  };
}

/** `QueryClientProvider` thật: các hook form gọi `useQueryClient()` để làm mới `auth.me`. */
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

const card = (title: string) =>
  within(screen.getByRole('heading', { level: 2, name: title }).closest('section')!);

beforeEach(() => {
  profile.isPending = false;
  profile.isError = false;
  sendEmailOtp.mockReset();
  sendEmailOtp.mockResolvedValue({ expiresAt: '2026-11-17T03:00:00.000Z' });
  setUser('package');
});

afterEach(cleanup);

describe('Tài khoản & bảo mật - bố cục', () => {
  it('một h1, hai thẻ h2 (đăng nhập → mật khẩu), không mục lục', () => {
    renderPage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe('Tài khoản và bảo mật');

    const h2s = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(h2s).toEqual(['Thông tin đăng nhập', 'Mật khẩu']);
    expect(screen.queryByRole('navigation', { name: 'Các phần của trang tài khoản' })).toBeNull();
  });

  it('thẻ hồ sơ: vai, gian hàng · gói, ô họ tên; Lưu chỉ sáng khi có thay đổi', () => {
    renderPage();

    const profileCard = within(screen.getByRole('region', { name: 'Hồ sơ cá nhân' }));
    expect(profileCard.getByText('Chủ gian hàng')).toBeTruthy();
    expect(profileCard.getByText('Việt Car Hà Nội')).toBeTruthy();
    expect(profileCard.getByText('Gói ô tô 10 xe')).toBeTruthy();
    expect(profileCard.getByRole('button', { name: 'Đổi ảnh đại diện' })).toBeTruthy();

    const save = profileCard.getByRole('button', { name: /Lưu thay đổi/ });
    expect(save).toHaveProperty('disabled', true);
    expect(profileCard.queryByRole('button', { name: 'Huỷ' })).toBeNull();

    fireEvent.change(profileCard.getByLabelText(/Họ & tên hiển thị/), {
      target: { value: 'Việt Phạm' },
    });
    expect(save).toHaveProperty('disabled', false);
    // Thẻ danh tính đi theo ô đang gõ, không đợi lưu; có thay đổi mới có "Hủy".
    expect(profileCard.getByText('Việt Phạm')).toBeTruthy();
    expect(profileCard.getByRole('button', { name: 'Huỷ' })).toBeTruthy();
  });

  it('gian hàng tuyến gói: chỉ trỏ tới Cài đặt gian hàng, không có gì của gian hàng', () => {
    renderPage();

    const link = screen.getByRole('link', { name: /Xem cài đặt gian hàng/ });
    expect(link.getAttribute('href')).toBe('/manage/shop');
    for (const text of ['Thông tin hiển thị', 'Gói & hạn mức', 'Tài khoản nhận tiền']) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it('chủ xe tuyến hoa hồng: không dòng gian hàng, dẫn sang Hồ sơ chủ xe', () => {
    setUser('commission');
    renderPage();

    expect(screen.queryByText('Việt Car Hà Nội')).toBeNull();
    const link = screen.getByRole('link', { name: /Xem hồ sơ chủ xe/ });
    expect(link.getAttribute('href')).toBe('/manage/shop');
  });
});

describe('Tài khoản & bảo mật - thông tin đăng nhập', () => {
  it('email và SĐT xuất hiện đúng một lần, kèm tình trạng xác minh và lối đổi', () => {
    renderPage();

    expect(screen.getAllByText('owner.hanoi@xeprime.test')).toHaveLength(1);
    expect(screen.getAllByText('0903000001')).toHaveLength(1);

    const login = card('Thông tin đăng nhập');
    expect(login.getByText('Đã xác minh')).toBeTruthy();
    expect(login.getByText('Chưa xác minh')).toBeTruthy();
    expect(login.getByRole('button', { name: 'Đổi Email' })).toBeTruthy();
    expect(login.getByRole('button', { name: 'Đổi Số điện thoại' })).toBeTruthy();
    // "Xác minh" chỉ cạnh định danh CHƯA xác minh.
    expect(login.getByRole('button', { name: 'Xác minh Email' })).toBeTruthy();
    expect(login.queryByRole('button', { name: 'Xác minh Số điện thoại' })).toBeNull();
  });

  it('"Xác minh" gửi mã thẳng tới email hiện có, vào bước nhập mã', async () => {
    renderPage();

    fireEvent.click(card('Thông tin đăng nhập').getByRole('button', { name: 'Xác minh Email' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Xác minh email')).toBeTruthy();
    // Mã đi thẳng tới email đang có - không qua bước nhập; một lượt gửi, kể cả dưới StrictMode.
    expect(await dialog.findByText('Nhập mã xác minh')).toBeTruthy();
    expect(sendEmailOtp).toHaveBeenCalledTimes(1);
    expect(sendEmailOtp).toHaveBeenCalledWith({ email: 'owner.hanoi@xeprime.test' });
    expect(dialog.getByText('***er.hanoi@xeprime.test')).toBeTruthy();
  });

  it('"Thay đổi" mở hộp nhập số mới, nói số đang dùng', async () => {
    renderPage();

    fireEvent.click(
      card('Thông tin đăng nhập').getByRole('button', { name: 'Đổi Số điện thoại' }),
    );

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Cập nhật số điện thoại')).toBeTruthy();
    expect(dialog.getByLabelText(/Số điện thoại mới/)).toHaveProperty('value', '');
    expect(dialog.getByText('0903000001')).toBeTruthy();
    expect(dialog.getByRole('button', { name: 'Gửi mã xác thực' })).toBeTruthy();
  });
});

describe('Tài khoản & bảo mật - mật khẩu', () => {
  it('ba ô, luật thật của server, thanh độ mạnh theo ô đang gõ', () => {
    renderPage();

    const password = card('Mật khẩu');
    expect(password.getByLabelText(/Mật khẩu hiện tại/)).toBeTruthy();
    expect(password.getByText('Ít nhất 1 chữ cái')).toBeTruthy();
    expect(password.queryByText(/ký tự đặc biệt/)).toBeNull();

    fireEvent.change(password.getByLabelText(/^Mật khẩu mới/), { target: { value: 'abcdefg1' } });
    expect(password.getByText('Khá mạnh')).toBeTruthy();
    fireEvent.change(password.getByLabelText(/^Mật khẩu mới/), {
      target: { value: 'abcdefg1!' },
    });
    expect(password.getByText('Mạnh')).toBeTruthy();
  });

  it('"Cập nhật mật khẩu" chỉ sáng khi cả form hợp lệ', async () => {
    renderPage();

    const password = card('Mật khẩu');
    const submit = password.getByRole('button', { name: 'Cập nhật mật khẩu' });
    const type = (label: RegExp, value: string) =>
      fireEvent.change(password.getByLabelText(label), { target: { value } });
    const enabled = () => !(submit as HTMLButtonElement).disabled;

    expect(enabled()).toBe(false);

    type(/Mật khẩu hiện tại/, 'Abcd1234@');
    type(/^Mật khẩu mới/, 'abcdefg1');
    // Nhập lại chưa có / không khớp ⇒ vẫn mờ.
    await waitFor(() => expect(enabled()).toBe(false));
    type(/Xác nhận mật khẩu mới/, 'abcdefg2');
    await waitFor(() => expect(enabled()).toBe(false));

    type(/Xác nhận mật khẩu mới/, 'abcdefg1');
    await waitFor(() => expect(enabled()).toBe(true));

    // Mật khẩu mới rơi khỏi luật (không có chữ số) ⇒ mờ lại.
    type(/^Mật khẩu mới/, 'abcdefgh');
    await waitFor(() => expect(enabled()).toBe(false));
  });

  it('"Quên mật khẩu" dẫn về luồng của site partner', () => {
    renderPage();

    const forgot = card('Mật khẩu').getByRole('link', { name: 'Quên mật khẩu' });
    expect(forgot.getAttribute('href')).toBe('/manage/forgot-password');
  });

  it('tài khoản nhân viên do gian hàng cấp: không có "Quên mật khẩu" (chủ đặt lại cho họ)', () => {
    setUser('package', { managedAccount: true, roleKey: TENANT_ROLE.SHOP_STAFF });
    renderPage();

    expect(card('Mật khẩu').queryByRole('link', { name: 'Quên mật khẩu' })).toBeNull();
  });
});

describe('Tài khoản & bảo mật - xoá tài khoản', () => {
  it('dòng "Yêu cầu xóa tài khoản" mở hộp yêu cầu xoá', async () => {
    renderPage();

    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu xóa tài khoản/ }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('checkbox')).toBeTruthy();
  });
});

describe('Tài khoản & bảo mật - trạng thái tải', () => {
  it('đang tải: không dựng thẻ nào', () => {
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
