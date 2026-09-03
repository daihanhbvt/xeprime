import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { ResetPasswordScreen } from './ResetPasswordScreen';

type View = Awaited<ReturnType<typeof render>>;

async function renderScreen(
  token: string | null,
  handlers: Partial<{
    onRequestNewLink: jest.Mock;
    onBackToLogin: jest.Mock;
  }> = {},
) {
  const props = {
    onRequestNewLink: jest.fn(),
    onBackToLogin: jest.fn(),
    ...handlers,
  };
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <ResetPasswordScreen token={token} {...props} />
    </QueryClientProvider>,
  );
  return { view: await render(ui), props };
}

async function fillNewPassword(view: View, password = 'Abcd1234') {
  await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu mới'), password);
  await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), password);
}

describe('ResetPasswordScreen', () => {
  it('thiếu token: hiện "liên kết không hợp lệ" và mời xin liên kết mới — không có form', async () => {
    const onRequestNewLink = jest.fn();
    const { view } = await renderScreen(null, { onRequestNewLink });

    expect(await view.findByText('Liên kết không hợp lệ')).toBeTruthy();
    expect(view.queryByPlaceholderText('Nhập mật khẩu mới')).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Yêu cầu liên kết mới' }));
    expect(onRequestNewLink).toHaveBeenCalled();
  });

  it('khoá nút cho tới khi hai ô mật khẩu khớp nhau', async () => {
    const { view } = await renderScreen('token-hop-le');
    const submit = () => view.getByRole('button', { name: 'Đặt lại mật khẩu' });

    expect(submit().props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu mới'), 'Abcd1234');
    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd9999');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(false));
  });

  it('gửi token của deep link kèm mật khẩu mới, rồi dẫn về đăng nhập', async () => {
    const reset = jest.spyOn(authApi, 'resetPasswordWithToken').mockResolvedValue(undefined);
    const onBackToLogin = jest.fn();
    const { view } = await renderScreen('token-hop-le', { onBackToLogin });

    await fillNewPassword(view);
    await fireEvent.press(view.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    await waitFor(() => expect(reset).toHaveBeenCalledWith('token-hop-le', 'Abcd1234'));

    /*
     * KHÔNG tự đăng nhập sau khi đổi: backend chỉ ghi mật khẩu, không phát phiên (web cũng vậy).
     * Màn xác nhận dẫn về đăng nhập — đó là toàn bộ hợp đồng của bước này.
     */
    expect(await view.findByText('Đã đổi mật khẩu')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));
    expect(onBackToLogin).toHaveBeenCalled();
  });

  it('token hết hạn: hiện câu của backend, giữ nguyên form để thử liên kết khác', async () => {
    jest.spyOn(authApi, 'resetPasswordWithToken').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.INVALID_RESET_TOKEN,
        message: 'Liên kết đặt lại không hợp lệ hoặc đã hết hạn',
        status: 400,
      }),
    );
    const { view } = await renderScreen('token-het-han');

    await fillNewPassword(view);
    await fireEvent.press(view.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    expect(await view.findByText('Liên kết đặt lại không hợp lệ hoặc đã hết hạn')).toBeTruthy();
    expect(view.queryByText('Đã đổi mật khẩu')).toBeNull();
  });
});
