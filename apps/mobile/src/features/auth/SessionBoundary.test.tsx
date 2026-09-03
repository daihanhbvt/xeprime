import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from '@/store';
import { API_ERROR_CODE } from '@xeprime/types';
import { Text } from 'react-native';
import { apiGet } from '@/lib/api-client';
import { resetAuthSessionForTest, signInWithPassword, signOut } from '@/lib/auth-session';
import { SessionBoundary } from './SessionBoundary';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost:8081' } },
}));

interface StubResponse {
  status: number;
  body?: unknown;
}

function mockFetch(...responses: StubResponse[]): void {
  const queue = [...responses];
  globalThis.fetch = jest.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: gọi nhiều request hơn số response đã khai');
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
    };
  }) as unknown as typeof fetch;
}

const LOGIN_OK: StubResponse = {
  status: 200,
  body: {
    data: {
      tokens: {
        accessToken: 'access-1',
        accessTokenExpiresIn: 900,
        refreshToken: 'refresh-1',
        refreshTokenExpiresAt: '2026-10-24T00:00:00.000Z',
      },
      user: { id: 'u1' },
    },
  },
};

async function mountBoundary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reset = jest.spyOn(queryClient, 'resetQueries');

  await render(
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionBoundary>
          <Text>nội dung</Text>
        </SessionBoundary>
      </QueryClientProvider>
    </ReduxProvider>,
  );

  return { reset };
}

beforeEach(() => {
  resetAuthSessionForTest();
});

describe('SessionBoundary', () => {
  it('đăng xuất dọn dữ liệu của phiên', async () => {
    mockFetch(LOGIN_OK, { status: 204 });
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const { reset } = await mountBoundary();

    await signOut();

    await waitFor(() => expect(reset).toHaveBeenCalled());
  });

  it('refresh token bị từ chối cũng dọn dữ liệu của phiên', async () => {
    // Đăng nhập với access token hết hạn ngay để lời gọi kế tiếp buộc phải refresh.
    mockFetch(
      {
        status: 200,
        body: {
          data: {
            tokens: {
              accessToken: 'access-1',
              accessTokenExpiresIn: 0,
              refreshToken: 'refresh-1',
              refreshTokenExpiresAt: '2026-10-24T00:00:00.000Z',
            },
            user: { id: 'u1' },
          },
        },
      },
      {
        status: 401,
        body: { error: { code: API_ERROR_CODE.SESSION_EXPIRED, message: 'hết phiên' } },
      },
    );
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const { reset } = await mountBoundary();

    await apiGet('/vehicles').catch(() => undefined);

    await waitFor(() => expect(reset).toHaveBeenCalled());
  });

  /*
   * 401 một mình KHÔNG phải phiên chết: access token sống 15 phút (ADR 0017) nên nó xảy ra suốt,
   * và client tự làm mới rồi đi tiếp. Dọn cache ở đây là đá người dùng ra khỏi app mỗi 15 phút.
   */
  it('401 khi CHƯA đăng nhập không đụng tới cache', async () => {
    mockFetch({
      status: 401,
      body: { error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'chưa đăng nhập' } },
    });
    const { reset } = await mountBoundary();

    await apiGet('/auth/me').catch(() => undefined);

    expect(reset).not.toHaveBeenCalled();
  });

  it('lỗi khác 401 không đụng tới cache', async () => {
    mockFetch({
      status: 403,
      body: { error: { code: API_ERROR_CODE.FORBIDDEN, message: 'không có quyền' } },
    });
    const { reset } = await mountBoundary();

    await apiGet('/vehicles').catch(() => undefined);

    expect(reset).not.toHaveBeenCalled();
  });
});
