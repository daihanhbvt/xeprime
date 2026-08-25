import type { CurrentUser, FetchInit, FetchResponse } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';
import { apiGet, getErrorCode } from './api-client';
import {
  getFreshAccessToken,
  resetAuthSessionForTest,
  signInWithPassword,
  signOut,
} from './auth-session';
import { getSecureItem, SECURE_KEY } from './secure-storage';

/**
 * TEST SỐNG — gọi API thật để chứng minh app native gửi đúng `Authorization: Bearer` trên dây.
 *
 * Cần: API ở http://localhost:4000 + DB đã seed (`SEED_MODE=demo`).
 * Chạy: `XP_LIVE_API=1 pnpm --filter @xeprime/mobile exec jest src/lib/live-bearer.test.ts`
 */

/** Không chạy trong `pnpm test`: cần API sống. Bật bằng `XP_LIVE_API=1`. */
const describeLive = process.env.XP_LIVE_API === '1' ? describe : describe.skip;

// Chạm trần rate limit thì phải CHỜ hết cửa sổ, nên trần thời gian của ca rộng hơn hẳn.
jest.setTimeout(120_000);

const IDENTIFIER = 'owner.saigon@xeprime.test';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Abcd1234';
const API = 'http://localhost:4000';

interface NodeIncomingMessage {
  statusCode?: number;
  setEncoding(encoding: string): void;
  on(event: 'data', listener: (chunk: string) => void): void;
  on(event: 'end', listener: () => void): void;
}

interface NodeClientRequest {
  on(event: 'error', listener: (error: Error) => void): void;
  write(chunk: string): void;
  end(): void;
}

interface NodeHttp {
  request(
    options: {
      hostname: string;
      port: string;
      path: string;
      method: string;
      headers: Record<string, string>;
    },
    callback: (response: NodeIncomingMessage) => void,
  ): NodeClientRequest;
}

/**
 * `fetch` của jest-expo là polyfill `whatwg-fetch` của React Native, chạy trên một
 * `XMLHttpRequest` đã bị mock — nó KHÔNG đi mạng được. Bản dưới đây dùng `node:http` và cắm vào
 * đúng khe `globalThis.fetch` mà `fetchWithTimeout` gọi, nên mọi tầng còn lại (kho token,
 * transport, client dùng chung, bóc envelope) vẫn là code thật của app.
 *
 * Lấy module qua `jest.requireActual` và khai kiểu ngay tại đây: app native cố ý KHÔNG nhận
 * `@types/node` — có type của Node trong tầm với là sớm muộn có người `import fs` vào mã chạy
 * trên thiết bị.
 */
const http = jest.requireActual<NodeHttp>('node:http');

function nodeFetch(url: string, init: FetchInit = {}): Promise<FetchResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text: async () => raw });
        });
      },
    );
    request.on('error', reject);
    if (init.body !== undefined) request.write(init.body);
    request.end();
  });
}

interface Sent {
  url: string;
  method: string;
  authorization: string | undefined;
  hasCredentials: boolean;
}

const sent: Sent[] = [];
const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = ((url: string, init: FetchInit = {}) => {
    sent.push({
      url,
      method: init.method ?? 'GET',
      authorization: init.headers?.Authorization,
      hasCredentials: 'credentials' in init,
    });
    return nodeFetch(url, init);
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  resetAuthSessionForTest();
});

function lastCallTo(path: string): Sent | undefined {
  return [...sent].reverse().find((call) => call.url.startsWith(`${API}${path}`));
}

function countCallsTo(path: string): number {
  return sent.filter((call) => call.url.startsWith(`${API}${path}`)).length;
}

const RATE_LIMIT_WINDOW_MS = 61_000;

/**
 * `/auth/mobile/login` bị siết 5 lần/phút — đó là cửa dò mật khẩu duy nhất của app native
 * (ADR 0017). Ba ca dưới đây tốn ba lần đăng nhập, nên chạy lại hai lượt trong cùng một phút là
 * chạm trần. Chờ hết cửa sổ rồi thử lại, thay vì để test đỏ vì một cơ chế đang chạy đúng.
 */
async function signIn(): Promise<CurrentUser> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await signInWithPassword(IDENTIFIER, PASSWORD);
    } catch (error) {
      if (getErrorCode(error) !== API_ERROR_CODE.RATE_LIMITED) throw error;
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WINDOW_MS));
    }
  }
  throw new Error('Vẫn bị rate limit sau 3 lần chờ — còn tiến trình nào khác đang gọi API?');
}

function rawPost(path: string, body: unknown): Promise<FetchResponse> {
  return nodeFetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Mỗi ca dùng MỘT phiên riêng: hai ca dưới cố ý giết phiên (đăng xuất, và phát hiện replay —
 * cái sau thu hồi CẢ phiên theo ADR 0017 §4), nên gộp chúng vào một luồng là ca sau chạy trên
 * phiên đã chết của ca trước.
 */
describeLive('app native ↔ API thật', () => {
  it('đăng nhập → gọi API bằng Bearer → tự xoay token → đăng xuất', async () => {
    /* 1. Đăng nhập */
    const user = await signIn();
    expect(user.email).toBe(IDENTIFIER);

    const loginCall = lastCallTo('/auth/mobile/login');
    expect(loginCall?.method).toBe('POST');
    // Endpoint cấp danh tính thì không kèm danh tính; native cũng không gửi cờ cookie.
    expect(loginCall?.authorization).toBeUndefined();
    expect(loginCall?.hasCredentials).toBe(false);

    /* 2. Token nằm đúng chỗ */
    const refreshToken1 = await getSecureItem(SECURE_KEY.REFRESH_TOKEN);
    expect(refreshToken1).toEqual(expect.any(String));
    const accessToken1 = await getFreshAccessToken();
    expect(accessToken1).toEqual(expect.stringMatching(/^eyJ/));
    expect(accessToken1).not.toBe(refreshToken1);

    /* 3. Request nghiệp vụ mang Bearer */
    const me = await apiGet<CurrentUser>('/auth/me');
    expect(me.email).toBe(IDENTIFIER);
    expect(lastCallTo('/auth/me')?.authorization).toBe(`Bearer ${accessToken1}`);

    /* 4. Access token hết hạn → tự xoay, KHÔNG bắt đăng nhập lại */
    // JWT chỉ phân giải tới GIÂY (`iat`/`exp`), và xoay token giữ nguyên `sid` — hai access
    // token phát trong cùng một giây cho cùng một phiên là hai chuỗi GIỐNG HỆT. Chờ qua mốc
    // giây thì phép so sánh "token đã đổi" mới nói lên điều gì.
    await new Promise((resolve) => setTimeout(resolve, 1_100));

    // `Date.now()` phải đọc TRƯỚC khi spy được cài, nếu không nó trả `undefined` và mốc hết hạn
    // thành `NaN` — mọi so sánh sau đó là false và request nào cũng kéo theo một lần refresh.
    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 900_000);
    const accessToken2 = await getFreshAccessToken();
    clock.mockRestore();

    expect(countCallsTo('/auth/mobile/refresh')).toBe(1);
    expect(accessToken2).not.toBe(accessToken1);
    const refreshToken2 = await getSecureItem(SECURE_KEY.REFRESH_TOKEN);
    expect(refreshToken2).not.toBe(refreshToken1);

    /* 5. Request tiếp theo dùng token MỚI, không refresh thêm lần nào */
    await apiGet('/auth/me');
    expect(lastCallTo('/auth/me')?.authorization).toBe(`Bearer ${accessToken2}`);
    expect(countCallsTo('/auth/mobile/refresh')).toBe(1);

    /* 6. Đăng xuất thu hồi phiên ở SERVER, không chỉ xoá ở máy */
    await signOut();
    expect(lastCallTo('/auth/mobile/logout')?.method).toBe('POST');
    await expect(getSecureItem(SECURE_KEY.REFRESH_TOKEN)).resolves.toBeNull();
    await expect(getFreshAccessToken()).resolves.toBeNull();
    expect((await rawPost('/auth/mobile/refresh', { refreshToken: refreshToken2 })).status).toBe(
      401,
    );

    /* 7. Hết phiên thì request đi trần và bị chặn */
    const denied = await apiGet('/auth/me').catch((error: unknown) => error);
    expect(denied).toMatchObject({ code: API_ERROR_CODE.UNAUTHENTICATED, status: 401 });
    expect(lastCallTo('/auth/me')?.authorization).toBeUndefined();
  });

  it('gửi lại refresh token đã xoay ⇒ server thu hồi CẢ phiên (ADR 0017 §4)', async () => {
    await signIn();
    const oldRefreshToken = await getSecureItem(SECURE_KEY.REFRESH_TOKEN);

    const realNow = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 900_000);
    await getFreshAccessToken();
    clock.mockRestore();

    const newRefreshToken = await getSecureItem(SECURE_KEY.REFRESH_TOKEN);
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    // Token cũ bị từ chối…
    expect((await rawPost('/auth/mobile/refresh', { refreshToken: oldRefreshToken })).status).toBe(
      401,
    );
    // …và token MỚI cũng chết theo: server coi việc dùng lại là dấu hiệu token đã bị lộ.
    expect((await rawPost('/auth/mobile/refresh', { refreshToken: newRefreshToken })).status).toBe(
      401,
    );

    const denied = await apiGet('/auth/me').catch((error: unknown) => error);
    expect(denied).toMatchObject({ status: 401 });
  });

  it('access token bị sửa thì server từ chối — client không tự tin vào token của mình', async () => {
    await signIn();
    const token = await getFreshAccessToken();

    const tampered = await nodeFetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token?.slice(0, -4)}xxxx` },
    });

    expect(tampered.status).toBe(401);
    await signOut();
  });
});
