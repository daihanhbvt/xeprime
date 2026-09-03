import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { SetPasswordScreen } from './SetPasswordScreen';

function renderScreen(onDone = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <SetPasswordScreen onDone={onDone} />
    </QueryClientProvider>,
  );
  return render(ui);
}

describe('SetPasswordScreen', () => {
  it('"Bỏ qua" vào thẳng app mà KHÔNG gọi API — đặt mật khẩu là gợi ý, không phải cổng', async () => {
    const setPassword = jest.spyOn(authApi, 'setAccountPassword');
    const onDone = jest.fn();
    const view = await renderScreen(onDone);

    await fireEvent.press(view.getByRole('button', { name: 'Bỏ qua, tiếp tục' }));

    expect(onDone).toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('khoá nút đặt mật khẩu tới khi hai ô khớp nhau', async () => {
    const onDone = jest.fn();
    const view = await renderScreen(onDone);
    const submit = () => view.getByRole('button', { name: 'Đặt mật khẩu' });

    expect(submit().props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu mới'), 'Abcd1234');
    // Nhập lại KHÁC — schema chặn, nút vẫn khoá.
    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd9999');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(true));

    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
    await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(false));
  });

  it('đặt mật khẩu thành công thì vào app', async () => {
    const setPassword = jest.spyOn(authApi, 'setAccountPassword').mockResolvedValue(undefined);
    const onDone = jest.fn();
    const view = await renderScreen(onDone);

    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu mới'), 'Abcd1234');
    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
    await fireEvent.press(view.getByRole('button', { name: 'Đặt mật khẩu' }));

    await waitFor(() => expect(setPassword).toHaveBeenCalledWith('Abcd1234'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('API hỏng thì ở lại màn, không đẩy người dùng đi tiếp', async () => {
    jest.spyOn(authApi, 'setAccountPassword').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Dữ liệu không hợp lệ',
        status: 400,
      }),
    );
    const onDone = jest.fn();
    const view = await renderScreen(onDone);

    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu mới'), 'Abcd1234');
    await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
    await fireEvent.press(view.getByRole('button', { name: 'Đặt mật khẩu' }));

    await waitFor(() => expect(view.getByText('Dữ liệu không hợp lệ')).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
