import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import * as otpApi from '@/features/phone-verification/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { OtpLoginForm } from './OtpLoginForm';

const DEMO_USER: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000A',
  displayName: 'Khách demo',
  email: null,
  avatarUrl: null,
  phone: '0901234567',
  phoneVerified: true,
  hasPassword: false,
  tenant: null,
  platformRole: null,
  permissions: [],
};

function renderForm(onSuccess = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <OtpLoginForm onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return render(ui);
}

function stubSendOtp(devCode: string | null = null) {
  return jest
    .spyOn(otpApi, 'sendOtp')
    .mockResolvedValue({ expiresAt: '2026-08-26T10:00:00.000Z', devCode });
}

describe('OtpLoginForm', () => {
  it('chặn gửi mã khi SĐT không hợp lệ', async () => {
    const sendOtp = stubSendOtp();
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '12345');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));

    expect(await view.findByText('Số điện thoại không hợp lệ')).toBeTruthy();
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('gửi mã với purpose=login rồi đăng nhập khi nhập đủ 6 số', async () => {
    const sendOtp = stubSendOtp();
    const login = jest.spyOn(authApi, 'loginWithOtp').mockResolvedValue(DEMO_USER);
    const onSuccess = jest.fn();
    const view = await renderForm(onSuccess);

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '  0901000003  ');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));

    // `purpose` phải là `login`: mã phát cho mục đích khác mà dùng để đăng nhập là dùng chéo,
    // và backend từ chối đúng vì thế.
    await waitFor(() =>
      expect(sendOtp).toHaveBeenCalledWith({
        phone: '0901000003',
        purpose: PHONE_VERIFICATION_PURPOSE.LOGIN,
      }),
    );

    // Gõ đủ 6 số là đăng nhập luôn — không bắt bấm thêm nút sau khi đã gõ xong.
    await fireEvent.changeText(await view.findByLabelText('OTP'), '123456');

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('0901000003', '123456'),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('bỏ ký tự không phải số khi dán mã từ tin nhắn', async () => {
    stubSendOtp();
    const login = jest.spyOn(authApi, 'loginWithOtp').mockResolvedValue(DEMO_USER);
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '0901000003');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));

    await fireEvent.changeText(await view.findByLabelText('OTP'), '123-456');

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith('0901000003', '123456'),
    );
  });

  it('hiện mã dev khi backend trả devCode', async () => {
    stubSendOtp('467062');
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '0901000003');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));

    expect(
      await view.findByText('Mã dev: 467062 — chỉ hiện ở môi trường phát triển.'),
    ).toBeTruthy();
  });

  it('server còn khoá thì nút đếm ngược theo ĐÚNG số giây server báo', async () => {
    /*
     * Đóng app rồi mở lại: đồng hồ trong máy về 0 còn server vẫn nhớ lần gửi trước. Nút phải
     * nói ra thời gian còn phải đợi, không phải mở ra rồi lại lỗi.
     */
    jest.spyOn(otpApi, 'sendOtp').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.OTP_COOLDOWN,
        message: 'Vui lòng đợi 26s trước khi gửi lại mã',
        status: 429,
      }),
    );
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '0901000003');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));

    // Toast hiện NGUYÊN VĂN câu của backend — giống `getErrorMessage` của web, và đó là chỗ
    // duy nhất có con số giây thật.
    expect(await view.findByText('Vui lòng đợi 26s trước khi gửi lại mã')).toBeTruthy();

    // 26 là con số của SERVER, không phải chu kỳ 60 giây mặc định của client.
    expect(await view.findByRole('button', { name: 'Gửi lại (26s)' })).toBeTruthy();
  });

  it('hiện NGUYÊN VĂN câu của backend khi nhập sai mã', async () => {
    stubSendOtp();
    jest.spyOn(authApi, 'loginWithOtp').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.OTP_INVALID,
        message: 'Mã xác minh không đúng',
        status: 400,
      }),
    );
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '0901000003');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));
    await fireEvent.changeText(await view.findByLabelText('OTP'), '000000');

    expect(await view.findByText('Mã xác minh không đúng')).toBeTruthy();
  });
});
