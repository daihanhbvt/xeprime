import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { LoginForm } from './LoginForm';

// Shape lấy từ contract OpenAPI — thiếu field nào là typecheck báo, không phải test đỏ lúc chạy.
const DEMO_USER: authApi.CurrentUser = {
  id: '01JQZX0000000000000000000A',
  displayName: 'Chủ shop demo',
  email: 'owner@xeprime.test',
  avatarUrl: null,
  phone: '0901234567',
  phoneVerified: true,
  hasPassword: true,
  tenant: null,
  platformRole: null,
  permissions: [],
};

// `render`/`fireEvent` của @testing-library/react-native v14 đều async — thiếu `await` là
// query chạy trước khi cây kịp mount.
function renderLoginForm(onSuccess = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <LoginForm onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return render(ui);
}

describe('LoginForm', () => {
  it('chặn submit rỗng bằng thông báo từ loginSchema của @xeprime/validators', async () => {
    const login = jest.spyOn(authApi, 'loginWithPassword');
    const view = await renderLoginForm();

    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));

    expect(await view.findByText('Vui lòng nhập email hoặc số điện thoại')).toBeTruthy();
    expect(view.getByText('Vui lòng nhập mật khẩu')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('gọi /auth/login với giá trị đã nhập rồi báo thành công', async () => {
    const login = jest.spyOn(authApi, 'loginWithPassword').mockResolvedValue(DEMO_USER);
    const onSuccess = jest.fn();
    const view = await renderLoginForm(onSuccess);

    await fireEvent.changeText(
      view.getByPlaceholderText('Nhập email hoặc số điện thoại'),
      '  owner@xeprime.test  ',
    );
    await fireEvent.changeText(view.getByPlaceholderText('Mật khẩu'), 'Abcd1234');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));

    // Schema trim `identifier` — server không phải nhận khoảng trắng thừa của bàn phím ảo.
    await waitFor(() => expect(login).toHaveBeenCalledWith('owner@xeprime.test', 'Abcd1234'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('hiện thông báo theo mã lỗi khi sai mật khẩu', async () => {
    jest.spyOn(authApi, 'loginWithPassword').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.INVALID_CREDENTIALS,
        message: 'Sai thông tin đăng nhập',
        status: 401,
      }),
    );
    const view = await renderLoginForm();

    await fireEvent.changeText(view.getByPlaceholderText('Nhập email hoặc số điện thoại'), 'owner@xeprime.test');
    await fireEvent.changeText(view.getByPlaceholderText('Mật khẩu'), 'saibet123');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));

    expect(await view.findByText('Email/số điện thoại hoặc mật khẩu không đúng.')).toBeTruthy();
  });
});
