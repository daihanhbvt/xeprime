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
  openRenterTripCount: 0,
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

/** Nhãn khả truy cập của ô mã — nay lấy từ Auth.otp.codeAria, không còn chuỗi thô "OTP". */
const OTP_ARIA = 'Mã xác thực gồm 6 số';

/*
 * Mọi test phải mock otp-config: không mock thì hook gọi API thật. Mặc định TẮT mã test
 * (production) — các test luồng thường ở dưới giữ nguyên nghĩa.
 */
let otpConfig: jest.SpyInstance;
beforeEach(() => {
  otpConfig = jest.spyOn(otpApi, 'getOtpConfig').mockResolvedValue({ testCodeEnabled: false });
});
afterEach(() => jest.restoreAllMocks());

describe('OtpLoginForm — mã OTP test (dev/staging)', () => {
  it('production: ô mã chỉ hiện SAU khi gửi mã', async () => {
    const view = await renderForm();
    await waitFor(() => expect(otpConfig).toHaveBeenCalled());

    expect(view.queryByLabelText(OTP_ARIA)).toBeNull();
    expect(view.getByRole('button', { name: 'Gửi mã xác thực' })).toBeTruthy();
  });

  it('môi trường có mã test: gõ mã là đăng nhập, KHÔNG gửi SMS nào', async () => {
    otpConfig.mockResolvedValue({ testCodeEnabled: true });
    const sendOtp = stubSendOtp();
    const login = jest.spyOn(authApi, 'loginWithOtp').mockResolvedValue(DEMO_USER);
    const onSuccess = jest.fn();
    const view = await renderForm(onSuccess);

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '0901000003');
    await fireEvent.changeText(await view.findByLabelText(OTP_ARIA), '123456');

    await waitFor(() => expect(login).toHaveBeenCalledWith('0901000003', '123456', undefined));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('môi trường có mã test: SĐT chưa hợp lệ thì chưa đăng nhập được', async () => {
    otpConfig.mockResolvedValue({ testCodeEnabled: true });
    const login = jest.spyOn(authApi, 'loginWithOtp').mockResolvedValue(DEMO_USER);
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '12345');
    await fireEvent.changeText(await view.findByLabelText(OTP_ARIA), '123456');

    expect(view.getByRole('button', { name: 'Đăng nhập' })).toBeDisabled();
    expect(login).not.toHaveBeenCalled();
  });

  it('lỗi tải cấu hình ⇒ rơi về luồng chuẩn (gửi mã trước)', async () => {
    otpConfig.mockRejectedValue(new Error('network'));
    const view = await renderForm();
    await waitFor(() => expect(otpConfig).toHaveBeenCalled());

    expect(view.queryByLabelText(OTP_ARIA)).toBeNull();
  });
});

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
    await fireEvent.changeText(await view.findByLabelText(OTP_ARIA), '123456');

    await waitFor(() => expect(login).toHaveBeenCalledWith('0901000003', '123456', undefined));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('bỏ ký tự không phải số khi dán mã từ tin nhắn', async () => {
    stubSendOtp();
    const login = jest.spyOn(authApi, 'loginWithOtp').mockResolvedValue(DEMO_USER);
    const view = await renderForm();

    await fireEvent.changeText(view.getByPlaceholderText('0901234567'), '0901000003');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi mã xác thực' }));

    await fireEvent.changeText(await view.findByLabelText(OTP_ARIA), '123-456');

    await waitFor(() => expect(login).toHaveBeenCalledWith('0901000003', '123456', undefined));
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

    // Câu NGUYÊN VĂN của server — đúng `PhoneLoginForm`/`usePhoneVerify` bên web, hai chỗ đó dùng
    // `getErrorMessage` chứ không dịch theo mã.
    expect(await view.findByText('Vui lòng đợi 26s trước khi gửi lại mã')).toBeTruthy();

    // 26 là con số của SERVER, không phải chu kỳ 60 giây mặc định của client.
    expect(await view.findByRole('button', { name: 'Gửi lại (26s)' })).toBeTruthy();
  });

  it('nhập sai mã: hiện câu nguyên văn của server, như web (getErrorMessage)', async () => {
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
    await fireEvent.changeText(await view.findByLabelText(OTP_ARIA), '000000');

    expect(await view.findByText('Mã xác minh không đúng')).toBeTruthy();
  });
});
