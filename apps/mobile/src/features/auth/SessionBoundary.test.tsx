import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { API_ERROR_CODE } from '@xeprime/types';
import { Text } from 'react-native';
import { apiGet } from '@/lib/api-client';
import { SessionBoundary } from './SessionBoundary';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost:8081' } },
}));

function mockUnauthorized(): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    text: async () =>
      JSON.stringify({ error: { code: API_ERROR_CODE.UNAUTHENTICATED, message: 'hết phiên' } }),
  }) as unknown as typeof fetch;
}

async function mountBoundary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reset = jest.spyOn(queryClient, 'resetQueries');

  await render(
    <QueryClientProvider client={queryClient}>
      <SessionBoundary>
        <Text>nội dung</Text>
      </SessionBoundary>
    </QueryClientProvider>,
  );

  return { reset };
}

describe('SessionBoundary', () => {
  it('401 từ endpoint bất kỳ dọn cache của phiên', async () => {
    const { reset } = await mountBoundary();
    mockUnauthorized();

    await apiGet('/vehicles').catch(() => undefined);

    await waitFor(() => expect(reset).toHaveBeenCalled());
  });

  // Không có chặn này thì `/auth/me` trả 401 sẽ tự làm mình chạy lại, thành vòng lặp vô hạn.
  it('401 từ chính endpoint auth KHÔNG kích hoạt dọn cache', async () => {
    const { reset } = await mountBoundary();
    mockUnauthorized();

    await apiGet('/auth/me').catch(() => undefined);

    expect(reset).not.toHaveBeenCalled();
  });

  it('lỗi khác 401 không đụng tới cache', async () => {
    const { reset } = await mountBoundary();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        JSON.stringify({ error: { code: API_ERROR_CODE.FORBIDDEN, message: 'không có quyền' } }),
    }) as unknown as typeof fetch;

    await apiGet('/vehicles').catch(() => undefined);

    expect(reset).not.toHaveBeenCalled();
  });
});
