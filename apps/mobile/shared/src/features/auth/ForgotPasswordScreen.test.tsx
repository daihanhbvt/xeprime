import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';
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

describe('ForgotPasswordScreen', () => {
  it('khoá nút khi email chưa hợp lệ', async () => {
    const request = jest.spyOn(authApi, 'requestPasswordReset');
    const view = await renderScreen();
    const submit = () => view.getByRole('button', { name: 'Gửi liên kết đặt lại' });

    expect(submit().props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByPlaceholderText('ban@congty.vn'), 'khong-phai-email');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(true));
    expect(request).not.toHaveBeenCalled();

    await fireEvent.changeText(view.getByPlaceholderText('ban@congty.vn'), 'ai@xeprime.test');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(false));
  });

  it('gửi xong thì hiện màn "kiểm tra email" kèm chính địa chỉ vừa nhập', async () => {
    const request = jest.spyOn(authApi, 'requestPasswordReset').mockResolvedValue(undefined);
    const view = await renderScreen();

    await fireEvent.changeText(view.getByPlaceholderText('ban@congty.vn'), 'ai@xeprime.test');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('ai@xeprime.test'));
    expect(await view.findByText('Kiểm tra email của bạn')).toBeTruthy();
    // Địa chỉ nằm trong một `Text` LỒNG (in đậm) giữa câu — tìm theo chính chuỗi đó.
    expect(view.getByText('ai@xeprime.test')).toBeTruthy();
  });

  it('backend trả 204 cho email KHÔNG có tài khoản — màn vẫn báo đã gửi', async () => {
    /*
     * Đây là chống dò tài khoản, không phải thiếu xử lý lỗi: backend cố ý trả như nhau cho mọi
     * email (`AuthService.requestPasswordReset`). Test khoá hành vi đó lại để lần refactor sau
     * không "sửa" thành "email không tồn tại".
     */
    jest.spyOn(authApi, 'requestPasswordReset').mockResolvedValue(undefined);
    const view = await renderScreen();

    await fireEvent.changeText(
      view.getByPlaceholderText('ban@congty.vn'),
      'khong-ton-tai@xeprime.test',
    );
    await fireEvent.press(view.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    expect(await view.findByText('Kiểm tra email của bạn')).toBeTruthy();
  });

  it('lỗi mạng thì ở lại form để thử lại, không nhảy sang màn đã gửi', async () => {
    jest.spyOn(authApi, 'requestPasswordReset').mockRejectedValue(
      new ApiClientError({
        code: CLIENT_ERROR_CODE.NETWORK_ERROR,
        message: 'Request to /auth/password/forgot failed',
        status: 0,
      }),
    );
    const view = await renderScreen();

    await fireEvent.changeText(view.getByPlaceholderText('ban@congty.vn'), 'ai@xeprime.test');
    await fireEvent.press(view.getByRole('button', { name: 'Gửi liên kết đặt lại' }));

    expect(
      await view.findByText('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'),
    ).toBeTruthy();
    expect(view.queryByText('Kiểm tra email của bạn')).toBeNull();
  });
});
