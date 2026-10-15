import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import * as otpApi from '@/features/phone-verification/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { RegisterForm } from './RegisterForm';

const NEW_USER: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000B',
  displayName: 'Khách mới',
  email: null,
  avatarUrl: null,
  phone: '0901234567',
  // Đăng ký đi qua OTP `register` nên tài khoản ra đời với SĐT đã xác minh (ADR 0060).
  phoneVerified: true,
  hasPassword: true,
  tenant: null,
  openRenterTripCount: 0,
  platformRole: null,
  permissions: [],
};

function mockOtp() {
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
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockOtp();
  jest.spyOn(authApi, 'checkRegistration').mockResolvedValue(undefined);
});

function renderForm(onSuccess = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <RegisterForm onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return render(ui);
}

type View = Awaited<ReturnType<typeof render>>;

/** Bốn ô hợp lệ (bước form). */
async function fillValidForm(view: View) {
  await fireEvent.changeText(view.getByPlaceholderText('Nhập họ và tên'), 'Khách mới');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập số điện thoại'), '0901234567');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu'), 'Abcd1234');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
}

/** "Tạo tài khoản" → gửi mã `register` → bước nhập mã → gõ đủ 6 số. */
async function submitWithCode(view: View, code = '123456') {
  await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));
  await waitFor(() =>
    expect(otpApi.sendOtp).toHaveBeenCalledWith({ phone: '0901234567', purpose: 'register' }),
  );
  await fireEvent.changeText(await view.findByLabelText('Mã xác thực gồm 6 số'), code);
}

describe('RegisterForm — giống luồng đăng ký của web (ADR 0060)', () => {
  it('khoá nút cho tới khi cả bốn ô hợp lệ', async () => {
    const view = await renderForm();
    const submit = () => view.getByRole('button', { name: 'Tạo tài khoản' });

    expect(submit().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(submit());
    expect(otpApi.sendOtp).not.toHaveBeenCalled();

    await fillValidForm(view);
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(false));
  });

  it('nhập lại mật khẩu KHÁC thì nút vẫn khoá', async () => {
    const view = await renderForm();

    await fillValidForm(view);
    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd9999');

    await waitFor(() =>
      expect(
        view.getByRole('button', { name: 'Tạo tài khoản' }).props.accessibilityState.disabled,
      ).toBe(true),
    );
  });

  it('"Tạo tài khoản" chỉ gửi mã và sang bước "Xác minh số điện thoại", CHƯA tạo tài khoản', async () => {
    const register = jest.spyOn(authApi, 'registerWithPassword');
    const view = await renderForm();

    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await view.findByText('Xác minh số điện thoại')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Xác nhận và tạo tài khoản' })).toBeTruthy();
    expect(register).not.toHaveBeenCalled();
  });

  it('nhập đủ mã → tạo tài khoản kèm mã, KHÔNG gửi confirmPassword', async () => {
    const register = jest.spyOn(authApi, 'registerWithPassword').mockResolvedValue(NEW_USER);
    const onSuccess = jest.fn();
    const view = await renderForm(onSuccess);

    await fillValidForm(view);
    await submitWithCode(view);

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        displayName: 'Khách mới',
        phone: '0901234567',
        password: 'Abcd1234',
        code: '123456',
      }),
    );
    // `onSuccess` đi thẳng vào option của `mutate` — chỉ đối số ĐẦU là hợp đồng của form.
    await waitFor(() => expect(onSuccess.mock.calls[0]?.[0]).toEqual(NEW_USER));
  });

  it('"Sửa thông tin" quay lại form, giữ nguyên thứ đã điền', async () => {
    const view = await renderForm();

    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));
    await view.findByText('Xác minh số điện thoại');
    await fireEvent.press(view.getByRole('button', { name: 'Sửa thông tin' }));

    expect(view.getByPlaceholderText('Nhập họ và tên').props.value).toBe('Khách mới');
  });

  it('SĐT đã có tài khoản: bước KIỂM TRA báo theo MÃ lỗi, không gửi mã, ở lại form', async () => {
    jest.spyOn(authApi, 'checkRegistration').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.PHONE_TAKEN,
        message: 'Số điện thoại đã được sử dụng',
        status: 409,
      }),
    );
    const onSuccess = jest.fn();
    const view = await renderForm(onSuccess);

    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    // Câu hiện ra đi theo MÃ lỗi (`Errors.code.*`), không theo `message` tiếng Việt của backend.
    expect(await view.findByText('Số điện thoại này đã có tài khoản.')).toBeTruthy();
    expect(view.queryByText('Xác minh số điện thoại')).toBeNull();
    expect(otpApi.sendOtp).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('gửi SMS lỗi / không lấy được mã: báo ngay ở bước tạo tài khoản, KHÔNG sang bước mã', async () => {
    jest.spyOn(otpApi, 'sendOtp').mockRejectedValue(
      new ApiClientError({ code: API_ERROR_CODE.OTP_TOO_MANY, message: 'x', status: 429 }),
    );
    const view = await renderForm();

    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() => expect(otpApi.sendOtp).toHaveBeenCalled());
    expect(view.queryByText('Xác minh số điện thoại')).toBeNull();
    expect(view.getByRole('button', { name: 'Tạo tài khoản' })).toBeTruthy();
  });
});
