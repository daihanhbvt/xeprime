import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ApiClientError, CLIENT_ERROR_CODE } from '@/lib/api-client';
import { RequireSession } from './RequireSession';

/*
 * `useNavigation` có mặt vì `useNavigateOnce` đọc `isFocused()` để chặn chạm lặp — thiếu nó thì
 * mọi màn dùng hook đều nổ ngay lúc render trong test.
 */
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ isFocused: () => true }),
}));

const SECRET = 'Dữ liệu của phiên';

async function renderGuard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactElement = withIntl(
    <QueryClientProvider client={queryClient}>
      <RequireSession>
        <Text>{SECRET}</Text>
      </RequireSession>
    </QueryClientProvider>,
  );
  return await render(ui);
}

describe('RequireSession', () => {
  it('có phiên thì render nội dung', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      id: '01JQZX0000000000000000000D',
      displayName: 'Khách',
      email: null,
      avatarUrl: null,
      phone: '0903333333',
      phoneVerified: true,
      hasPassword: true,
      tenant: null,
      platformRole: null,
      permissions: [],
    });
    const view = await renderGuard();

    expect(await view.findByText(SECRET)).toBeTruthy();
  });

  it('401 thì mời đăng nhập và KHÔNG render nội dung — deep link không lách qua được', async () => {
    /*
     * Thanh tab đã ẩn các mục cần đăng nhập, nhưng ẩn không phải chặn: `xeprime://trips` hay
     * một thông báo đẩy mở thẳng màn đó. Đây là chốt chặn cho đúng đường vòng ấy.
     */
    jest.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(
      new ApiClientError({
        code: API_ERROR_CODE.UNAUTHENTICATED,
        message: 'Chưa đăng nhập',
        status: 401,
      }),
    );
    const view = await renderGuard();

    expect(await view.findByText('Vui lòng đăng nhập để xem tài khoản của bạn.')).toBeTruthy();
    expect(view.queryByText(SECRET)).toBeNull();
  });

  it('mất mạng KHÔNG bị coi là hết phiên — cho thử lại thay vì bắt đăng nhập lại', async () => {
    jest.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(
      new ApiClientError({
        code: CLIENT_ERROR_CODE.NETWORK_ERROR,
        message: 'Request to /auth/me failed',
        status: 0,
      }),
    );
    const view = await renderGuard();

    await waitFor(() => expect(view.getByRole('button', { name: 'Thử lại' })).toBeTruthy());
    expect(view.queryByText('Vui lòng đăng nhập để xem tài khoản của bạn.')).toBeNull();
    expect(view.queryByText(SECRET)).toBeNull();
  });
});
