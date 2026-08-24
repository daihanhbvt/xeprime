import { API_ERROR_CODE } from '@xeprime/types';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  ApiClientError,
  apiGet,
  apiPost,
  apiRequest,
  CLIENT_ERROR_CODE,
  getApiBaseUrl,
  isRetriableError,
  isUnauthenticated,
} from './api-client';
import {
  addErrorInterceptor,
  addRequestInterceptor,
  type HttpRequestContext,
} from './http-interceptors';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));

const constantsMock = Constants as { expoConfig: { hostUri?: string } | null };

function mockFetch(status: number, body: unknown): jest.Mock {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  };
  const fetchMock = jest.fn().mockResolvedValue(response);
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('getApiBaseUrl', () => {
  it('suy host từ Expo dev server để thiết bị thật gọi được máy dev', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.7:8081' };
    expect(getApiBaseUrl()).toBe('http://192.168.1.7:4000');
  });

  it('lùi về localhost khi không chạy qua dev server', () => {
    constantsMock.expoConfig = null;
    expect(getApiBaseUrl()).toBe('http://localhost:4000');
  });

  it('đổi loopback thành 10.0.2.2 trên emulator Android — localhost ở đó là chính máy ảo', () => {
    constantsMock.expoConfig = { hostUri: 'localhost:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(getApiBaseUrl()).toBe('http://10.0.2.2:4000');
  });

  it('giữ nguyên IP LAN trên Android (thiết bị thật, không phải emulator)', () => {
    constantsMock.expoConfig = { hostUri: '192.168.1.183:8081' };
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(getApiBaseUrl()).toBe('http://192.168.1.183:4000');
  });
});

describe('apiRequest', () => {
  beforeEach(() => {
    constantsMock.expoConfig = { hostUri: 'localhost:8081' };
  });

  it('bóc lớp bọc { data } của ADR 0007', async () => {
    mockFetch(200, { data: { id: 'u1' } });
    await expect(apiGet<{ id: string }>('/auth/me')).resolves.toEqual({ id: 'u1' });
  });

  // CHÚ Ý: test này KHÔNG chứng minh cookie phiên được gửi đi. React Native bỏ qua
  // `credentials` — cookie do cookie store của hệ điều hành quyết định (Android
  // ForwardingCookieHandler, iOS NSHTTPCookieStorage). Nó chỉ chốt rằng wrapper không
  // đánh rơi cờ này khi chạy trên `expo start --web`, nơi `credentials` mới có tác dụng.
  it('truyền cờ credentials để bản web của Expo gửi kèm cookie', async () => {
    const fetchMock = mockFetch(200, { data: null });
    await apiGet('/auth/me');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('ném ApiClientError mang MÃ lỗi của backend', async () => {
    mockFetch(401, {
      error: { code: API_ERROR_CODE.INVALID_CREDENTIALS, message: 'Sai mật khẩu' },
    });

    const error = await apiPost('/auth/login', {}).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe(API_ERROR_CODE.INVALID_CREDENTIALS);
    expect((error as ApiClientError).status).toBe(401);
  });

  it('coi response không có { data } là vi phạm hợp đồng', async () => {
    mockFetch(200, { id: 'u1' });
    await expect(apiGet('/auth/me')).rejects.toThrow(/does not follow the \{ data \} envelope/);
  });

  it('trả undefined cho 204 No Content', async () => {
    mockFetch(204, undefined);
    await expect(apiGet('/auth/session')).resolves.toBeUndefined();
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

describe('interceptor', () => {
  it('request interceptor sửa được header trước khi fetch chạy', async () => {
    const fetchMock = mockFetch(200, { data: null });
    addRequestInterceptor((request) => ({
      ...request,
      headers: { ...request.headers, 'X-Client': 'mobile' },
    }));

    await apiGet('/auth/me');

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'X-Client': 'mobile' }),
    });
  });

  it('error interceptor nhận ApiClientError kèm path đã gọi', async () => {
    mockFetch(403, { error: { code: API_ERROR_CODE.FORBIDDEN, message: 'Không có quyền' } });
    const seen = jest.fn();
    addErrorInterceptor(seen);

    await apiGet('/vehicles').catch(() => undefined);

    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({ code: API_ERROR_CODE.FORBIDDEN }),
      expect.objectContaining({ path: '/vehicles', method: 'GET' }),
    );
  });

  it('gỡ đăng ký rồi thì interceptor không chạy nữa', async () => {
    mockFetch(200, { data: null });
    const spy = jest.fn((request: HttpRequestContext) => request);
    addRequestInterceptor(spy)();

    await apiGet('/auth/me');

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('huỷ request quá hạn và ném mã CLIENT_TIMEOUT', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(
      (_url: unknown, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    ) as unknown as typeof fetch;

    const pending = apiRequest('/slow', { timeoutMs: 5_000 }).catch((err: unknown) => err);
    // `advanceTimersByTimeAsync` chứ không bản đồng bộ: `apiRequest` chạy qua vài `await`
    // (interceptor) trước khi hẹn giờ được đặt, bản đồng bộ nhảy thời gian trước lúc đó.
    await jest.advanceTimersByTimeAsync(5_000);

    expect(await pending).toMatchObject({ code: CLIENT_ERROR_CODE.TIMEOUT, status: 0 });
  });

  it('lỗi mạng (không phải quá hạn) mang mã CLIENT_NETWORK_ERROR', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    const error = await apiGet('/auth/me').catch((err: unknown) => err);

    expect(error).toMatchObject({ code: CLIENT_ERROR_CODE.NETWORK_ERROR, status: 0 });
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
