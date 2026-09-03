import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';
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
      <LoginForm onSuccess={onSuccess} onForgotPassword={jest.fn()} />
    </QueryClientProvider>,
  );
  return render(ui);
}

describe('LoginForm', () => {
  it('khoá nút khi form chưa hợp lệ, mở ra khi đã đủ — không gọi API ở giữa', async () => {
    const login = jest.spyOn(authApi, 'loginWithPassword');
    const view = await renderLoginForm();

    /*
     * Hợp đồng là KHOÁ NÚT, không phải hiện lỗi sau khi bấm: `mode: 'onChange'` cho `isValid`
     * đúng ngay từ lần gõ đầu, nên người dùng không bao giờ gửi được một form rỗng — và cũng
     * không bị mắng vì một việc họ chưa làm.
     */
    const submit = view.getByRole('button', { name: 'Đăng nhập' });
    expect(submit.props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(submit);
    expect(login).not.toHaveBeenCalled();

    await fireEvent.changeText(
      view.getByPlaceholderText('Nhập email hoặc số điện thoại'),
      'owner@xeprime.test',
    );
    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu'), 'Abcd1234');

    await waitFor(() =>
      expect(
        view.getByRole('button', { name: 'Đăng nhập' }).props.accessibilityState.disabled,
      ).toBe(false),
    );
  });

  it('gọi /auth/mobile/login với giá trị đã nhập rồi báo thành công', async () => {
    const login = jest.spyOn(authApi, 'loginWithPassword').mockResolvedValue(DEMO_USER);
    const onSuccess = jest.fn();
    const view = await renderLoginForm(onSuccess);

    await fireEvent.changeText(
      view.getByPlaceholderText('Nhập email hoặc số điện thoại'),
      '  owner@xeprime.test  ',
    );
    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu'), 'Abcd1234');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));

    // Schema trim `identifier` — server không phải nhận khoảng trắng thừa của bàn phím ảo.
    await waitFor(() => expect(login).toHaveBeenCalledWith('owner@xeprime.test', 'Abcd1234'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('hiện nhãn dạng câu kèm dấu bắt buộc, KHÔNG viết hoa toàn bộ', async () => {
    const view = await renderLoginForm();

    /*
     * Chuỗi so sánh gồm cả dấu sao: nó là một `Text` LỒNG bên trong nhãn, nên nội dung phẳng ra
     * thành "Mật khẩu *" chứ không phải hai node rời.
     */
    expect(view.getByText('Email hoặc số điện thoại *')).toBeTruthy();
    expect(view.getByText('Mật khẩu *')).toBeTruthy();

    // `TextField` từng gọi `toLocaleUpperCase()` lên chuỗi dịch — đây là chốt chặn cho việc đó.
    expect(view.queryByText('EMAIL HOẶC SỐ ĐIỆN THOẠI *')).toBeNull();
    expect(view.queryByText('MẬT KHẨU *')).toBeNull();
  });

  it('lỗi MẠNG thì dịch từ mã, KHÔNG hiện chuỗi log của client', async () => {
    /*
     * `status: 0` = request chưa từng tới server, nên `message` là chuỗi log do chính client
     * dựng ("Request to /auth/mobile/login failed"). Web hiện luôn chuỗi đó; app thì không.
     */
    jest.spyOn(authApi, 'loginWithPassword').mockRejectedValue(
      new ApiClientError({
        code: CLIENT_ERROR_CODE.NETWORK_ERROR,
        message: 'Request to /auth/mobile/login failed',
        status: 0,
      }),
    );
    const view = await renderLoginForm();

    await fireEvent.changeText(
      view.getByPlaceholderText('Nhập email hoặc số điện thoại'),
      'owner@xeprime.test',
    );
    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu'), 'Abcd1234');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await view.findByText('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'),
    ).toBeTruthy();
    expect(view.queryByText(/Request to/)).toBeNull();
  });

  it('hiện NGUYÊN VĂN câu của backend khi sai mật khẩu — giống getErrorMessage của web', async () => {
    jest.spyOn(authApi, 'loginWithPassword').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.INVALID_CREDENTIALS,
        message: 'Sai thông tin đăng nhập',
        status: 401,
      }),
    );
    const view = await renderLoginForm();

    await fireEvent.changeText(
      view.getByPlaceholderText('Nhập email hoặc số điện thoại'),
      'owner@xeprime.test',
    );
    await fireEvent.changeText(view.getByPlaceholderText('Nhập mật khẩu'), 'saibet123');
    await fireEvent.press(view.getByRole('button', { name: 'Đăng nhập' }));

    expect(await view.findByText('Sai thông tin đăng nhập')).toBeTruthy();
  });
});
