import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import { Text } from 'react-native';
import { apiGet } from '@/lib/api-client';
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

/**
 * Hợp đồng thật của tầng 401: một endpoint BẤT KỲ trả 401 thì `useCurrentUser` phải tự chạy
 * lại và cổng chuyển sang `unauthenticated`. Test này chứng minh cả chuỗi, không chỉ việc
 * cache bị xoá.
 */
describe('phục hồi sau khi phiên hết hạn', () => {
  it('401 ở endpoint khác kéo cổng về unauthenticated', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn((url: string) => {
      calls.push(url);
      if (url.includes('/auth/me')) {
        // Lần đầu còn phiên; sau khi phiên hỏng thì chính /auth/me cũng 401.
        return Promise.resolve(
          calls.filter((c) => c.includes('/auth/me')).length === 1
            ? jsonResponse(200, { data: USER })
            : jsonResponse(401, {
                error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'hết phiên' },
              }),
        );
      }
      return Promise.resolve(
        jsonResponse(401, {
          error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'hết phiên' },
        }),
      );
    }) as unknown as typeof fetch;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = await render(
      <QueryClientProvider client={queryClient}>
        <SessionBoundary>
          <GateProbe />
        </SessionBoundary>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(view.getByText('ready')).toBeTruthy());

    await apiGet('/vehicles').catch(() => undefined);

    await waitFor(() => expect(view.getByText('unauthenticated')).toBeTruthy());
    expect(calls.filter((c) => c.includes('/auth/me')).length).toBeGreaterThan(1);
  });
});
