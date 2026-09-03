import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { RegisterForm } from './RegisterForm';

const NEW_USER: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000B',
  displayName: 'Khách mới',
  email: null,
  avatarUrl: null,
  phone: '0901234567',
  // Đăng ký bằng mật khẩu KHÔNG xác thực SĐT — web cũng vậy, và test này khoá hành vi đó lại.
  phoneVerified: false,
  hasPassword: true,
  tenant: null,
  platformRole: null,
  permissions: [],
};

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

async function fillValidForm(view: View) {
  await fireEvent.changeText(view.getByPlaceholderText('Nhập họ và tên'), 'Khách mới');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập số điện thoại'), '0901234567');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu'), 'Abcd1234');
  await fireEvent.changeText(view.getByPlaceholderText('Nhập lại mật khẩu'), 'Abcd1234');
}

describe('RegisterForm', () => {
  it('khoá nút cho tới khi cả bốn ô hợp lệ', async () => {
    const register = jest.spyOn(authApi, 'registerWithPassword');
    const view = await renderForm();
    const submit = () => view.getByRole('button', { name: 'Tạo tài khoản' });

    expect(submit().props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(submit());
    expect(register).not.toHaveBeenCalled();

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

  it('gửi đúng ba trường của web — KHÔNG gửi confirmPassword lên server', async () => {
    const register = jest.spyOn(authApi, 'registerWithPassword').mockResolvedValue(NEW_USER);
    const onSuccess = jest.fn();
    const view = await renderForm(onSuccess);

    await fillValidForm(view);
    await fireEvent.press(view.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        displayName: 'Khách mới',
        phone: '0901234567',
        password: 'Abcd1234',
      }),
    );
    // `onSuccess` đi thẳng vào option của `mutate`, nên TanStack Query gọi nó kèm
    // `(variables, context)` phía sau — chỉ đối số ĐẦU mới là hợp đồng của form.
    await waitFor(() => expect(onSuccess.mock.calls[0]?.[0]).toEqual(NEW_USER));
  });

  it('SĐT đã có tài khoản: hiện câu của backend và KHÔNG báo thành công', async () => {
    jest.spyOn(authApi, 'registerWithPassword').mockRejectedValue(
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

    expect(await view.findByText('Số điện thoại đã được sử dụng')).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
