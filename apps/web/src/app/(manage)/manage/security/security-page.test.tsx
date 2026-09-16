import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ManageSecurityPage from './page';

/**
 * TRANG BẢO MẬT TÀI KHOẢN — ba khối, và chỉ ba (16/09/2026).
 *
 * Bộ này khoá cả hai nửa của lần tách:
 *
 *  1. **Những gì PHẢI có**: phương thức đăng nhập (email/SĐT + lối đổi qua OTP), đổi mật khẩu,
 *     và vùng nguy hiểm. Cả ba dùng lại component của khu `/account` — không clone, nên luật
 *     mật khẩu và luật xoá tài khoản chỉ có một chỗ để sửa.
 *  2. **Những gì KHÔNG được có**: hồ sơ gian hàng, logo, gói, ví, hạn mức, hoá đơn, thẻ lối vào
 *     gian hàng, ô sửa ảnh đại diện cá nhân. Trang cũ (`/manage/account`) trộn lẫn chúng, và đó
 *     là lý do nó phải tách.
 *
 * Cấp tiêu đề cũng là một ràng buộc: `h1` của trang thuộc về `ManagePageHeader`, ba khối nhúng
 * nhận `h2`. Ba `h1` trên một trang không hỏng về hình ảnh nhưng hỏng thật với trình đọc màn
 * hình — danh sách tiêu đề thành ba trang chồng lên nhau.
 */
vi.mock('next-intl/server', async () => {
  const { serverTranslationsStub } = await import('@/i18n/test-utils');
  return serverTranslationsStub('vi');
});

const profile = vi.hoisted(() => ({
  data: {
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
}));
vi.mock('@/features/account/hooks/use-account', () => ({
  useMyProfile: () => profile,
  useUpdateMyProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({
    data: {
      id: '01HUSER000000000000000000',
      displayName: 'Phạm Đức Việt',
      hasPassword: true,
      tenant: { roleKey: 'shop_owner', name: 'Việt Car Hà Nội' },
    },
  }),
}));

// Vùng nguy hiểm đọc ví, lệnh rút và chuyến đi thuê để nói ra ẢNH HƯỞNG của việc đóng tài khoản.
vi.mock('@/features/wallet/hooks', () => ({
  useWalletSummary: () => ({ data: { balance: '0', pendingWithdrawAmount: '0' }, isLoading: false, isError: false }),
  useWithdrawals: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/features/trips/hooks', () => ({
  useTrips: () => ({ data: { counts: { current: 0 } }, isLoading: false, isError: false }),
}));
vi.mock('@/features/support-cases/hooks/use-support-cases', () => ({
  useSupportCases: () => ({ data: { items: [] }, isPending: false, isError: false }),
  useOpenSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useWithdrawAccountDeletion: () => ({ mutate: vi.fn(), isPending: false }),
}));

/**
 * Trang này là Server Component async — gọi nó rồi render kết quả, thay vì để RTL tự xử lý một
 * promise (nó không làm được).
 *
 * `QueryClientProvider` thật, không mock: `ChangePasswordForm` gọi `useQueryClient()` để làm
 * mới `auth.me` sau khi đổi mật khẩu (`hasPassword` đảo sang `true`), và chặn hook đó đi là
 * chặn mất chính hành vi khiến form tự chuyển từ "đặt lần đầu" sang "đổi". Mọi query THẬT đã bị
 * chặn ở tầng hook phía trên, nên client này không phát ra request nào.
 */
async function renderPage() {
  const ui = await ManageSecurityPage();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App>{ui}</App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  profile.isPending = false;
  profile.isError = false;
});

afterEach(cleanup);

describe('Trang bảo mật — ba khối phải có', () => {
  it('phương thức đăng nhập: email và SĐT, kèm tình trạng xác minh', async () => {
    await renderPage();

    expect(screen.getByText('Phương thức đăng nhập')).toBeTruthy();
    expect(screen.getByText('owner.hanoi@xeprime.test')).toBeTruthy();
    expect(screen.getByText('0903000001')).toBeTruthy();
  });

  /*
   * Tình trạng xác minh hiện kể cả khi CHƯA xác minh. Với chủ gian hàng, chính hai dòng này là
   * thứ khối "Chủ gian hàng" ở trang Cửa hàng khoe là "đã xác minh" — không thấy khoảng cách đó
   * thì họ tưởng mình đã xong.
   */
  it('kênh chưa xác minh được nói thẳng là chưa xác minh', async () => {
    await renderPage();

    expect(screen.getByLabelText('Đã xác thực')).toBeTruthy(); // email
    expect(screen.getByText('Chưa xác thực')).toBeTruthy(); // SĐT
  });

  it('có lối ĐỔI cho từng kênh — luồng OTP dùng chung, không phải bản sao thứ hai', async () => {
    await renderPage();

    expect(screen.getByRole('button', { name: /Đổi Email/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Đổi Số điện thoại/ })).toBeTruthy();
  });

  it('có khối đổi mật khẩu', async () => {
    await renderPage();

    expect(screen.getByText('Cập nhật bảo mật')).toBeTruthy();
  });

  it('có vùng nguy hiểm — yêu cầu xoá tài khoản', async () => {
    await renderPage();

    expect(screen.getByRole('region', { name: 'Vùng nguy hiểm' })).toBeTruthy();
    expect(screen.getByText('Yêu cầu xoá tài khoản')).toBeTruthy();
  });
});

describe('Trang bảo mật — những gì KHÔNG được có', () => {
  it('không có hồ sơ gian hàng, gói, ví hay hoá đơn', async () => {
    await renderPage();

    for (const text of [
      'Thông tin hiển thị',
      'Gói & hạn mức',
      'Tài khoản nhận tiền',
      'Hoá đơn thanh toán',
      'Logo gian hàng',
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  /*
   * Ảnh đại diện CÁ NHÂN đã bỏ khỏi cổng quản lý: hình đại diện ở đây là LOGO GIAN HÀNG, nên
   * một ô sửa avatar cá nhân dựng ra tấm ảnh thứ hai mà không màn nào trong cổng hiển thị.
   */
  it('không có ô sửa ảnh đại diện cá nhân', async () => {
    await renderPage();

    expect(screen.queryByText('Ảnh đại diện')).toBeNull();
  });
});

describe('Trang bảo mật — cấp tiêu đề', () => {
  it('đúng MỘT `h1`; ba khối nhúng là `h2`', async () => {
    await renderPage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe('Bảo mật tài khoản');

    const h2s = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(h2s).toContain('Phương thức đăng nhập');
    expect(h2s).toContain('Cập nhật bảo mật');
    expect(h2s).toContain('Yêu cầu xoá tài khoản');
  });
});
