import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider as ReduxProvider } from 'react-redux';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { REGISTRATION_TRACK } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import * as authApi from '@/features/auth/api';
import { locationsApi } from '@/features/locations/api';
import * as otpApi from '@/features/phone-verification/api';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { tenantsApi, type MyShop } from './api';
import { PartnerSignupScreen } from './PartnerSignupScreen';

const mockReplace = jest.fn();
const mockEnterApp = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, dismissTo: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/auth/hooks/use-enter-app', () => ({ useEnterApp: () => mockEnterApp }));

const NEW_USER: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000U',
  displayName: 'Nguyễn Văn A',
  email: 'a@xeprime.test',
  avatarUrl: null,
  phone: '0901234567',
  phoneVerified: false,
  hasPassword: true,
  tenant: null,
  openRenterTripCount: 0,
  platformRole: null,
  permissions: [],
};

async function renderScreen() {
  jest
    .spyOn(authApi, 'fetchCurrentUser')
    .mockRejectedValue(new ApiClientError({ status: 401, code: 'UNAUTHORIZED', message: 'x' }));
  jest
    .spyOn(otpApi, 'getOtpConfig')
    .mockResolvedValue({ testCodeEnabled: false } as Awaited<ReturnType<typeof otpApi.getOtpConfig>>);
  jest
    .spyOn(otpApi, 'sendOtp')
    .mockResolvedValue({ expiresAt: '2030-01-01T00:00:00Z', devCode: null } as Awaited<
      ReturnType<typeof otpApi.sendOtp>
    >);
  jest
    .spyOn(otpApi, 'verifyOtp')
    .mockResolvedValue({ verified: true } as Awaited<ReturnType<typeof otpApi.verifyOtp>>);
  jest
    .spyOn(locationsApi, 'provinces')
    .mockResolvedValue([
      { code: '48', name: 'Đà Nẵng', administrativeType: 'municipality', slug: 'da-nang' },
    ]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <PartnerSignupScreen onSwitchToLogin={jest.fn()} />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

async function verifyPhone(view: Awaited<ReturnType<typeof renderScreen>>) {
  await fireEvent.press(view.getByRole('button', { name: 'Xác thực' }));
  await waitFor(() => expect(otpApi.sendOtp).toHaveBeenCalled());
  // Đủ 6 số là tự xác thực (mã `register`, ADR 0060).
  await fireEvent.changeText(await view.findByLabelText('Mã xác thực gồm 6 số'), '123456');
  await waitFor(() => expect(otpApi.verifyOtp).toHaveBeenCalled());
  await waitFor(() => expect(view.getByText('Đã xác thực')).toBeTruthy());
}

async function fillAccount(
  view: Awaited<ReturnType<typeof renderScreen>>,
  { verify = true }: { verify?: boolean } = {},
) {
  await fireEvent.changeText(view.getAllByLabelText('Họ và tên')[0]!, 'Nguyễn Văn A');
  await fireEvent.changeText(view.getByLabelText('Số điện thoại'), '0901234567');
  if (verify) await verifyPhone(view);
  await fireEvent.changeText(view.getAllByLabelText('Mật khẩu')[0]!, 'matkhau123');
  await fireEvent.changeText(view.getAllByLabelText('Nhập lại mật khẩu')[0]!, 'matkhau123');
  await fireEvent.press(view.getByLabelText('Tỉnh/thành phố'));
  await fireEvent.press(await view.findByText('TP Đà Nẵng'));
  await fireEvent.changeText(view.getByLabelText('Địa chỉ'), '12 Lê Lợi');
  await fireEvent.press(view.getByRole('checkbox'));
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockClear();
  mockEnterApp.mockClear();
});

describe('PartnerSignupScreen — đăng ký đối tác một form', () => {
  it('hiện lựa chọn tuyến TRƯỚC, chưa có form', async () => {
    const view = await renderScreen();
    expect(await view.findByText('Mở gian hàng cho thuê')).toBeTruthy();
    expect(view.getByText('Đăng xe cá nhân')).toBeTruthy();
    expect(view.queryByLabelText('Mật khẩu')).toBeNull();
  });

  it('tuyến gói: MỘT form, email bắt buộc, không bước thanh toán, xong thì vào màn chờ', async () => {
    const registerAccount = jest
      .spyOn(authApi, 'registerWithPassword')
      .mockResolvedValue(NEW_USER);
    const registerShop = jest.spyOn(tenantsApi, 'register').mockResolvedValue({} as MyShop);
    const view = await renderScreen();

    await fireEvent.press(await view.findByText('Mở gian hàng cho thuê'));
    await fireEvent.press(view.getByRole('button', { name: 'Tìm hiểu và tạo gian hàng' }));

    expect((await view.findAllByText('Đăng ký gian hàng')).length).toBeGreaterThan(0);
    // Họ tên chỉ hỏi MỘT lần.
    expect(view.getAllByLabelText('Họ và tên')).toHaveLength(1);
    expect(view.queryByText(/QR|hoá đơn|chuyển khoản/i)).toBeNull();

    await fillAccount(view);
    await fireEvent.changeText(view.getByLabelText('Tên gian hàng'), 'Gian hàng A');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng ký gian hàng' }));

    expect(await view.findByText('Vui lòng nhập email')).toBeTruthy();
    expect(registerAccount).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByLabelText('Email liên hệ'), 'a@xeprime.test');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng ký gian hàng' }));

    await waitFor(() => expect(registerShop).toHaveBeenCalled());
    expect(registerAccount.mock.calls[0]?.[0]).toMatchObject({
      displayName: 'Nguyễn Văn A',
      code: '123456',
    });
    // Email LIÊN HỆ chỉ vào hồ sơ gian hàng, không gắn vào tài khoản.
    expect(registerAccount.mock.calls[0]?.[0]).not.toHaveProperty('email');
    expect(registerShop.mock.calls[0]?.[0]).toMatchObject({
      name: 'Gian hàng A',
      registrationTrack: REGISTRATION_TRACK.PACKAGE,
      email: 'a@xeprime.test',
    });
    await waitFor(() => expect(mockEnterApp).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('tuyến hoa hồng: họ tên dùng làm tên hồ sơ, xong thì vào khu quản lý (không wizard đăng xe)', async () => {
    jest.spyOn(authApi, 'registerWithPassword').mockResolvedValue(NEW_USER);
    const registerShop = jest.spyOn(tenantsApi, 'register').mockResolvedValue({} as MyShop);
    const view = await renderScreen();

    await fireEvent.press(await view.findByRole('button', { name: 'Đăng xe đầu tiên' }));
    await fillAccount(view);
    await fireEvent.changeText(view.getByLabelText('Email liên hệ'), 'a@xeprime.test');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng ký và tiếp tục' }));

    await waitFor(() => expect(registerShop).toHaveBeenCalled());
    expect(registerShop.mock.calls[0]?.[0]).toMatchObject({
      name: 'Nguyễn Văn A',
      registrationTrack: REGISTRATION_TRACK.COMMISSION,
    });
    await waitFor(() => expect(mockEnterApp).toHaveBeenCalled());
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('PartnerSignupScreen — chưa xác thực SĐT mà bấm đăng ký', () => {
  it('nút KHÔNG khoá: bấm thì mở sheet OTP, đúng mã là tự đăng ký luôn (một lần bấm)', async () => {
    const registerAccount = jest
      .spyOn(authApi, 'registerWithPassword')
      .mockResolvedValue(NEW_USER);
    const registerShop = jest.spyOn(tenantsApi, 'register').mockResolvedValue({} as MyShop);
    const view = await renderScreen();

    await fireEvent.press(await view.findByRole('button', { name: 'Đăng xe đầu tiên' }));
    await fillAccount(view, { verify: false });
    await fireEvent.changeText(view.getByLabelText('Email liên hệ'), 'a@xeprime.test');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng ký và tiếp tục' }));

    await waitFor(() =>
      expect(otpApi.sendOtp).toHaveBeenCalledWith({ phone: '0901234567', purpose: 'register' }),
    );
    expect(registerAccount).not.toHaveBeenCalled();
    await fireEvent.changeText(await view.findByLabelText('Mã xác thực gồm 6 số'), '123456');

    await waitFor(() => expect(registerShop).toHaveBeenCalled());
    expect(registerAccount.mock.calls[0]?.[0]).toMatchObject({ code: '123456' });
  });
});
