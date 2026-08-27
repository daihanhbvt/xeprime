import { API_ERROR_CODE } from '@xeprime/types';
import {
  ApiClientError,
  apiGet,
  apiPost,
  apiRequest,
  CLIENT_ERROR_CODE,
  isRetriableError,
  isUnauthenticated,
} from './api-client';
import { resetAuthSessionForTest, signInWithPassword } from './auth-session';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost:8081', version: '1.2.3' } },
}));

interface StubResponse {
  status: number;
  body?: unknown;
}

/**
 * Hàng đợi response chứ không một giá trị cố định: các ca thật ở đây gồm NHIỀU request nối
 * nhau (đăng nhập rồi mới gọi API), và một mock trả mãi một thứ sẽ làm ca sai vẫn xanh.
 */
function mockFetch(...responses: StubResponse[]): jest.Mock {
  const queue = [...responses];
  const fetchMock = jest.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: gọi nhiều request hơn số response đã khai');
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
    };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function headersOf(fetchMock: jest.Mock, callIndex: number): Record<string, string> {
  const init = fetchMock.mock.calls[callIndex]?.[1] as { headers?: Record<string, string> };
  return init?.headers ?? {};
}

const TOKENS = {
  accessToken: 'access-1',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2026-10-24T00:00:00.000Z',
};

beforeEach(() => {
  resetAuthSessionForTest();
});

describe('apiRequest', () => {
  it('bóc lớp bọc { data } của ADR 0007', async () => {
    mockFetch({ status: 200, body: { data: { id: 'u1' } } });
    await expect(apiGet<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'u1' });
  });

  it('ném ApiClientError mang MÃ lỗi của backend', async () => {
    mockFetch({
      status: 401,
      body: { error: { code: API_ERROR_CODE.INVALID_CREDENTIALS, message: 'Sai mật khẩu' } },
    });

    const error = await apiPost('/auth/login', {}).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe(API_ERROR_CODE.INVALID_CREDENTIALS);
    expect((error as ApiClientError).status).toBe(401);
  });

  it('coi response không có { data } là vi phạm hợp đồng', async () => {
    mockFetch({ status: 200, body: { id: 'u1' } });
    await expect(apiGet('/auth/me')).rejects.toThrow(/does not follow the \{ data \} envelope/);
  });

  it('trả undefined cho 204 No Content', async () => {
    mockFetch({ status: 204 });
    await expect(apiGet('/auth/mobile/logout')).resolves.toBeUndefined();
  });
});

describe('Bearer — ADR 0017', () => {
  it('gắn access token vào mọi request sau khi đăng nhập', async () => {
    const fetchMock = mockFetch(
      { status: 200, body: { data: { tokens: TOKENS, user: { id: 'u1' } } } },
      { status: 200, body: { data: { id: 'u1' } } },
    );

    await signInWithPassword('owner@xeprime.test', 'matkhau');
    await apiGet('/auth/me');

    expect(headersOf(fetchMock, 1)).toMatchObject({ Authorization: 'Bearer access-1' });
  });

  // Web dùng cookie httpOnly (ADR 0002); RN không có cookie jar đáng tin nên native KHÔNG gửi cờ
  // này — gửi kèm là mở đường cho một nguồn danh tính thứ hai mà `AuthGuard` sẽ từ chối.
  it('không gửi cờ credentials của cookie', async () => {
    const fetchMock = mockFetch({ status: 200, body: { data: null } });

    await apiGet('/auth/me');

    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('credentials');
  });

  it('chưa đăng nhập thì đi request trần — endpoint @Public() vẫn phục vụ được', async () => {
    const fetchMock = mockFetch({ status: 200, body: { data: [] } });

    await apiGet('/listings');

    expect(headersOf(fetchMock, 0)).not.toHaveProperty('Authorization');
  });

  it('endpoint đăng nhập KHÔNG kèm danh tính — nó là chỗ danh tính được cấp', async () => {
    const fetchMock = mockFetch({
      status: 200,
      body: { data: { tokens: TOKENS, user: { id: 'u1' } } },
    });

    await signInWithPassword('owner@xeprime.test', 'matkhau');

    expect(headersOf(fetchMock, 0)).not.toHaveProperty('Authorization');
  });
});

describe('lỗi phía client', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lỗi mạng mang mã CLIENT_NETWORK_ERROR và status 0', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const error = await apiGet('/auth/me').catch((err: unknown) => err);

    expect(error).toMatchObject({ code: CLIENT_ERROR_CODE.NETWORK_ERROR, status: 0 });
  });

  it('huỷ request quá hạn và ném mã CLIENT_TIMEOUT', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    ) as unknown as typeof fetch;

    const pending = apiRequest('/slow').catch((err: unknown) => err);
    // `advanceTimersByTimeAsync` chứ không bản đồng bộ: request chạy qua vài `await` (đọc token)
    // trước khi hẹn giờ được đặt, bản đồng bộ nhảy thời gian trước lúc đó.
    await jest.advanceTimersByTimeAsync(15_000);

    expect(await pending).toMatchObject({ code: CLIENT_ERROR_CODE.TIMEOUT, status: 0 });
  });
});

describe('isUnauthenticated', () => {
  it.each([API_ERROR_CODE.UNAUTHENTICATED, API_ERROR_CODE.SESSION_EXPIRED])(
    'nhận ra %s',
    (code) => {
      expect(isUnauthenticated(new ApiClientError({ code, message: '', status: 401 }))).toBe(true);
    },
  );

  it('bỏ qua lỗi khác', () => {
    const other = new ApiClientError({
      code: API_ERROR_CODE.INVALID_CREDENTIALS,
      message: '',
      status: 401,
    });
    expect(isUnauthenticated(other)).toBe(false);
    expect(isUnauthenticated(new Error('mạng'))).toBe(false);
  });
});

describe('isRetriableError', () => {
  it.each([
    [0, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
    [404, false],
  ])('status %i → %s', (status, expected) => {
    const error = new ApiClientError({ code: 'X', message: '', status });
    expect(isRetriableError(error)).toBe(expected);
  });

  it('lỗi không rõ nguồn gốc thì cứ thử lại', () => {
    expect(isRetriableError(new Error('lạ'))).toBe(true);
  });
});
