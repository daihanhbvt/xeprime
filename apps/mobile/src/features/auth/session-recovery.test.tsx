import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import { Text } from 'react-native';
import { apiGet } from '@/lib/api-client';
import { resetAuthSessionForTest, signInWithPassword } from '@/lib/auth-session';
import { SessionBoundary } from './SessionBoundary';
import { useSessionGate } from './hooks/use-session-gate';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost:8081' } },
}));

const USER = { id: 'u1', displayName: 'Chủ shop demo' };

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function GateProbe() {
  const { status } = useSessionGate();
  return <Text>{status}</Text>;
}

beforeEach(() => {
  resetAuthSessionForTest();
});

/**
 * Hợp đồng thật của tầng phiên: refresh token bị server từ chối thì cổng phải chuyển sang
 * `unauthenticated` — không cần màn hình nào tự kiểm 401. Test này chứng minh cả chuỗi, không
 * chỉ việc cache bị xoá.
 */
describe('phục hồi sau khi phiên hết hạn', () => {
  it('refresh bị từ chối kéo cổng về unauthenticated', async () => {
    let sessionAlive = true;

    globalThis.fetch = jest.fn((url: string) => {
      if (url.includes('/auth/mobile/login')) {
        // `accessTokenExpiresIn: 0` — request kế tiếp buộc phải đi qua đường refresh.
        return Promise.resolve(
          jsonResponse(200, {
            data: {
              tokens: {
                accessToken: 'access-1',
                accessTokenExpiresIn: 0,
                refreshToken: 'refresh-1',
                refreshTokenExpiresAt: '2026-10-24T00:00:00.000Z',
              },
              user: USER,
            },
          }),
        );
      }

      if (url.includes('/auth/mobile/refresh')) {
        if (!sessionAlive) {
          return Promise.resolve(
            jsonResponse(401, {
              error: { code: API_ERROR_CODE.SESSION_EXPIRED, message: 'hết phiên' },
            }),
          );
        }
        return Promise.resolve(
          jsonResponse(200, {
            data: {
              accessToken: 'access-2',
              accessTokenExpiresIn: 0,
              refreshToken: 'refresh-2',
              refreshTokenExpiresAt: '2026-10-24T00:00:00.000Z',
            },
          }),
        );
      }

      // Phiên chết thì `/auth/me` đi không kèm Bearer (không còn token để làm mới) và
      // backend trả 401 — đúng như thật.
      if (url.includes('/auth/me')) {
        return Promise.resolve(
          sessionAlive
            ? jsonResponse(200, { data: USER })
            : jsonResponse(401, {
                error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'chưa đăng nhập' },
              }),
        );
      }

      return Promise.resolve(
        jsonResponse(401, { error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'hết phiên' } }),
      );
    }) as unknown as typeof fetch;

    await signInWithPassword('owner@xeprime.test', 'matkhau');

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      <QueryClientProvider client={queryClient}>
        <SessionBoundary>
          <GateProbe />
        </SessionBoundary>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(view.getByText('ready')).toBeTruthy());

    // Phiên bị thu hồi ở server (đăng xuất từ máy khác, phát hiện replay): lời gọi tiếp theo
    // không làm mới token được nữa.
    sessionAlive = false;
    await apiGet('/vehicles').catch(() => undefined);

    await waitFor(() => expect(view.getByText('unauthenticated')).toBeTruthy());
  });
});
