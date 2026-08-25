import { API_ERROR_CODE } from '@xeprime/types';
import {
  getFreshAccessToken,
  recoverFromUnauthorized,
  resetAuthSessionForTest,
  signInWithPassword,
  signOut,
  subscribeSessionEnded,
} from './auth-session';
import { getSecureItem, SECURE_KEY } from './secure-storage';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: 'localhost:8081', version: '1.2.3' }, deviceName: 'iPhone 15' },
}));

interface StubResponse {
  status: number;
  body?: unknown;
  reject?: unknown;
}

function mockFetch(...responses: StubResponse[]): jest.Mock {
  const queue = [...responses];
  const fetchMock = jest.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: gọi nhiều request hơn số response đã khai');
    if (next.reject) throw next.reject;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => (next.body === undefined ? '' : JSON.stringify(next.body)),
    };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function callsTo(fetchMock: jest.Mock, path: string): unknown[][] {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith(path));
}

function bodyOf(call: unknown[] | undefined): Record<string, unknown> {
  const init = call?.[1] as { body?: string } | undefined;
  return JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
}

function tokens(suffix: string, expiresIn = 900) {
  return {
    accessToken: `access-${suffix}`,
    accessTokenExpiresIn: expiresIn,
    refreshToken: `refresh-${suffix}`,
    refreshTokenExpiresAt: '2026-10-24T00:00:00.000Z',
  };
}

function loginResponse(suffix: string, expiresIn?: number): StubResponse {
  return {
    status: 200,
    body: { data: { tokens: tokens(suffix, expiresIn), user: { id: 'u1' } } },
  };
}

const sessionExpired: StubResponse = {
  status: 401,
  body: {
    error: { code: API_ERROR_CODE.SESSION_EXPIRED, message: 'Phiên đăng nhập đã hết hạn' },
  },
};

beforeEach(() => {
  resetAuthSessionForTest();
});

describe('đăng nhập', () => {
  it('gửi tới /auth/mobile/login và trả hồ sơ người dùng kèm sẵn trong response', async () => {
    const fetchMock = mockFetch(loginResponse('1'));

    await expect(signInWithPassword('owner@xeprime.test', 'matkhau')).resolves.toEqual({
      id: 'u1',
    });
    expect(callsTo(fetchMock, '/auth/mobile/login')).toHaveLength(1);
  });

  // ADR 0017: refresh token CHỈ ở Keychain/Keystore. Access token sống 15 phút và ở lại bộ nhớ —
  // ghi nó xuống đĩa chỉ thêm một chỗ để rò.
  it('chỉ ghi refresh token xuống bộ nhớ an toàn', async () => {
    mockFetch(loginResponse('1'));

    await signInWithPassword('owner@xeprime.test', 'matkhau');

    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBe('refresh-1');
    await expect(getFreshAccessToken()).resolves.toBe('access-1');
  });

  it('khai thiết bị để người dùng nhận ra máy nào trong danh sách phiên', async () => {
    const fetchMock = mockFetch(loginResponse('1'));

    await signInWithPassword('owner@xeprime.test', 'matkhau');

    expect(bodyOf(callsTo(fetchMock, '/auth/mobile/login')[0])).toMatchObject({
      device: { deviceName: 'iPhone 15', appVersion: '1.2.3' },
    });
  });
});

describe('làm mới token', () => {
  it('mở lại app khi access token đã hết: tự đổi refresh token đang có trong máy', async () => {
    mockFetch(loginResponse('1', 0), { status: 200, body: { data: tokens('2') } });

    await signInWithPassword('owner@xeprime.test', 'matkhau');

    await expect(getFreshAccessToken()).resolves.toBe('access-2');
  });

  /*
   * Refresh token dùng MỘT lần. Không single-flight thì ba request song song cùng gửi một token,
   * server cho một cái thắng và coi hai cái sau là replay — thu hồi cả phiên, người dùng bị đá
   * ra ngoài dù chẳng làm gì sai.
   */
  it('ba lời gọi song song chỉ tạo ĐÚNG MỘT request refresh', async () => {
    const fetchMock = mockFetch(loginResponse('1', 0), { status: 200, body: { data: tokens('2') } });
    await signInWithPassword('owner@xeprime.test', 'matkhau');

    const results = await Promise.all([
      getFreshAccessToken(),
      getFreshAccessToken(),
      getFreshAccessToken(),
    ]);

    expect(results).toEqual(['access-2', 'access-2', 'access-2']);
    expect(callsTo(fetchMock, '/auth/mobile/refresh')).toHaveLength(1);
  });

  // Không ghi đè token mới thì lần refresh sau gửi token cũ ⇒ server coi là replay ⇒ mất phiên.
  it('ghi đè refresh token mới sau mỗi lần xoay', async () => {
    const fetchMock = mockFetch(
      loginResponse('1', 0),
      { status: 200, body: { data: tokens('2', 0) } },
      { status: 200, body: { data: tokens('3') } },
    );
    await signInWithPassword('owner@xeprime.test', 'matkhau');

    await getFreshAccessToken();
    await getFreshAccessToken();

    const refreshCalls = callsTo(fetchMock, '/auth/mobile/refresh');
    expect(bodyOf(refreshCalls[0])).toEqual({ refreshToken: 'refresh-1' });
    expect(bodyOf(refreshCalls[1])).toEqual({ refreshToken: 'refresh-2' });
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBe('refresh-3');
  });

  it('token còn hạn thì không gọi mạng', async () => {
    const fetchMock = mockFetch(loginResponse('1'));
    await signInWithPassword('owner@xeprime.test', 'matkhau');

    await getFreshAccessToken();

    expect(callsTo(fetchMock, '/auth/mobile/refresh')).toHaveLength(0);
  });

  it('chưa từng đăng nhập thì trả null, không gọi mạng', async () => {
    const fetchMock = mockFetch();

    await expect(getFreshAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('phiên chết', () => {
  it('server từ chối refresh token ⇒ xoá sạch và báo phiên kết thúc', async () => {
    mockFetch(loginResponse('1', 0), sessionExpired);
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const ended = jest.fn();
    subscribeSessionEnded(ended);

    await expect(getFreshAccessToken()).rejects.toMatchObject({
      code: API_ERROR_CODE.SESSION_EXPIRED,
    });

    expect(ended).toHaveBeenCalledTimes(1);
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBeNull();
  });

  // Mất sóng KHÔNG phải phiên chết. Xoá token vì mạng chập chờn là bắt người dùng đăng nhập lại
  // mỗi lần đi qua thang máy.
  it('lỗi mạng khi refresh thì GIỮ nguyên phiên', async () => {
    mockFetch(loginResponse('1', 0), { status: 0, reject: new TypeError('Network request failed') });
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const ended = jest.fn();
    subscribeSessionEnded(ended);

    await expect(getFreshAccessToken()).rejects.toBeDefined();

    expect(ended).not.toHaveBeenCalled();
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBe('refresh-1');
  });
});

/**
 * Làm mới theo `exp` chỉ bắt được lúc token hết hạn theo ĐỒNG HỒ MÁY. Server từ chối sớm hơn thế
 * khi đồng hồ máy chạy nhanh, khi đổi mật khẩu, đăng xuất từ thiết bị khác, hay bị admin khoá —
 * và khi đó 401 là tin duy nhất app nhận được.
 */
describe('phục hồi sau 401 dù token còn hạn', () => {
  it('xoay token rồi báo cho client gửi lại', async () => {
    const fetchMock = mockFetch(loginResponse('1'), { status: 200, body: { data: tokens('2') } });
    await signInWithPassword('owner@xeprime.test', 'matkhau');

    await expect(recoverFromUnauthorized()).resolves.toBe(true);

    expect(callsTo(fetchMock, '/auth/mobile/refresh')).toHaveLength(1);
    await expect(getFreshAccessToken()).resolves.toBe('access-2');
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBe('refresh-2');
  });

  it('refresh token cũng chết thì trả false và kết thúc phiên', async () => {
    mockFetch(loginResponse('1'), sessionExpired);
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const ended = jest.fn();
    subscribeSessionEnded(ended);

    await expect(recoverFromUnauthorized()).resolves.toBe(false);

    expect(ended).toHaveBeenCalledTimes(1);
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBeNull();
  });

  // Mất mạng không phải mất phiên: token phải còn nguyên cho lần thử sau.
  it('lỗi mạng thì trả false nhưng giữ nguyên phiên', async () => {
    mockFetch(loginResponse('1'), { status: 0, reject: new TypeError('Network request failed') });
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const ended = jest.fn();
    subscribeSessionEnded(ended);

    await expect(recoverFromUnauthorized()).resolves.toBe(false);

    expect(ended).not.toHaveBeenCalled();
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBe('refresh-1');
  });

  // Nhiều request cùng nhận 401 một lúc: chỉ được đúng MỘT lần xoay, nếu không server coi
  // refresh token dùng lại là dấu hiệu bị trộm và thu hồi cả phiên.
  it('ba request cùng phục hồi chỉ tạo một lần refresh', async () => {
    const fetchMock = mockFetch(loginResponse('1'), { status: 200, body: { data: tokens('2') } });
    await signInWithPassword('owner@xeprime.test', 'matkhau');

    const results = await Promise.all([
      recoverFromUnauthorized(),
      recoverFromUnauthorized(),
      recoverFromUnauthorized(),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(callsTo(fetchMock, '/auth/mobile/refresh')).toHaveLength(1);
  });

  it('chưa đăng nhập thì không gọi gì cả', async () => {
    const fetchMock = mockFetch();

    await expect(recoverFromUnauthorized()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('đăng xuất', () => {
  it('thu hồi phiên ở server rồi mới xoá ở máy', async () => {
    const fetchMock = mockFetch(loginResponse('1'), { status: 204 });
    await signInWithPassword('owner@xeprime.test', 'matkhau');
    const ended = jest.fn();
    subscribeSessionEnded(ended);

    await signOut();

    expect(bodyOf(callsTo(fetchMock, '/auth/mobile/logout')[0])).toEqual({
      refreshToken: 'refresh-1',
    });
    expect(ended).toHaveBeenCalledTimes(1);
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBeNull();
  });

  // Người dùng đã bấm đăng xuất; giữ họ lại trong app vì mạng chập chờn là tệ hơn hẳn.
  it('server không trả lời thì vẫn xoá phiên ở máy', async () => {
    mockFetch(loginResponse('1'), { status: 0, reject: new TypeError('Network request failed') });
    await signInWithPassword('owner@xeprime.test', 'matkhau');

    await expect(signOut()).resolves.toBeUndefined();

    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBeNull();
    await expect(getFreshAccessToken()).resolves.toBeNull();
  });
});
