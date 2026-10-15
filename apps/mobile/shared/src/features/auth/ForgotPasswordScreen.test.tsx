import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import * as otpApi from '@/features/phone-verification/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

function renderScreen(onBackToLogin = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <ForgotPasswordScreen onBackToLogin={onBackToLogin} />
    </QueryClientProvider>,
  );
  return render(ui);
}

type View = Awaited<ReturnType<typeof render>>;

beforeEach(() => {
  jest.restoreAllMocks();
  jest
    .spyOn(otpApi, 'getOtpConfig')
    .mockResolvedValue({ testCodeEnabled: false } as Awaited<ReturnType<typeof otpApi.getOtpConfig>>);
  jest
    .spyOn(otpApi, 'sendOtp')
    .mockResolvedValue({ expiresAt: '2030-01-01T00:00:00Z', devCode: null } as Awaited<
      ReturnType<typeof otpApi.sendOtp>
    >);
});

async function fillForm(view: View, confirm = 'Abcd1234') {
  await fireEvent.changeText(view.getByPlaceholderText('Nhập số điện thoại'), '0901234567');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu mới'), 'Abcd1234');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), confirm);
}

describe('ForgotPasswordScreen — một màn + sheet OTP (ADR 0060, giống web)', () => {
  it('khoá "Xác nhận" tới khi SĐT + mật khẩu mới + nhập lại đều hợp lệ', async () => {
    const view = await renderScreen();
    const submit = () => view.getByRole('button', { name: 'Xác nhận' });

    expect(submit().props.accessibilityState.disabled).toBe(true);
    await fillForm(view, 'khac9999');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(true));
    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(false));
    expect(otpApi.sendOtp).not.toHaveBeenCalled();
  });

  it('"Xác nhận" → gửi mã + sheet → đúng mã thì đặt lại, KHÔNG tự đăng nhập', async () => {
    const reset = jest.spyOn(authApi, 'resetPasswordWithOtp').mockResolvedValue(undefined);
    const onBack = jest.fn();
    const view = await renderScreen(onBack);

    await fillForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() =>
      expect(otpApi.sendOtp).toHaveBeenCalledWith({ phone: '0901234567', purpose: 'password_reset' }),
    );
    // Câu không khẳng định số có tài khoản — server trả như nhau cho mọi số.
    expect(await view.findByText(/Nếu .* đã có tài khoản/)).toBeTruthy();
    expect(reset).not.toHaveBeenCalled();
    await fireEvent.changeText(view.getByLabelText('Mã xác thực gồm 6 số'), '123456');

    await waitFor(() => expect(reset).toHaveBeenCalledWith('0901234567', '123456', 'Abcd1234'));
    expect(await view.findByText('Đã đặt lại mật khẩu')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('mã sai: ở lại sheet, báo theo MÃ lỗi, chưa sang màn xong', async () => {
    jest.spyOn(authApi, 'resetPasswordWithOtp').mockRejectedValue(
      new ApiClientError({ code: API_ERROR_CODE.OTP_INVALID, message: 'x', status: 400 }),
    );
    const view = await renderScreen();

    await fillForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Xác nhận' }));
    await fireEvent.changeText(await view.findByLabelText('Mã xác thực gồm 6 số'), '111111');

    await waitFor(() => expect(authApi.resetPasswordWithOtp).toHaveBeenCalled());
    expect(view.queryByText('Đã đặt lại mật khẩu')).toBeNull();
    expect(view.getByLabelText('Mã xác thực gồm 6 số')).toBeTruthy();
  });
});
