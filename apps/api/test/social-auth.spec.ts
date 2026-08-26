import type { ConfigService } from '@nestjs/config';
import { createPrismaClient } from '@xeprime/prisma';
import { API_ERROR_CODE, AUTH_PROVIDER } from '@xeprime/types';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FacebookSocialProvider } from '../src/modules/auth/social/facebook.provider';
import { OauthStateService } from '../src/modules/auth/social/oauth-state.service';
import { SocialAuthService } from '../src/modules/auth/social/social-auth.service';
import { socialErrorCode } from '../src/modules/auth/social/social-auth.error';

/**
 * Đăng nhập mạng xã hội do backend chủ trì — ADR 0019.
 *
 * Bốn nhóm khẳng định, mỗi nhóm khoá một thứ có thể hỏng âm thầm:
 *  1. `state` dùng ĐÚNG MỘT LẦN và hết hạn thật (chạy trên PostgreSQL thật — đây là hành vi của
 *     một câu UPDATE có điều kiện, mock không chứng minh được gì).
 *  2. `next` không an toàn không bao giờ trở thành `Location` (open redirect).
 *  3. Facebook: token của app KHÁC bị từ chối (token substitution).
 *  4. Provider chưa cấu hình trả đúng mã, không phải một lỗi 500.
 */
const prisma = createPrismaClient();
let dbAvailable = false;

const CONFIG: Record<string, string> = {
  APP_WEB_URL: 'https://xeprime.vn',
  API_PUBLIC_URL: 'https://api.xeprime.vn',
  GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
};

function configWith(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = { ...CONFIG, ...overrides };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

const states = new OauthStateService(prisma as unknown as PrismaService);

/** `AuthService` giả: các test ở đây không kiểm luật nối tài khoản (đã có `auth-social.spec.ts`). */
const auth = { upsertUserFromIdentity: jest.fn() } as unknown as AuthService;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
  }
});

afterAll(async () => {
  if (dbAvailable) await prisma.oauthState.deleteMany({ where: { provider: 'google' } });
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('OauthStateService — `state` dùng đúng một lần', () => {
  maybe('lần consume thứ hai bị từ chối bằng SOCIAL_STATE_INVALID', async () => {
    const { state } = await states.issue({
      provider: AUTH_PROVIDER.GOOGLE,
      redirectNext: '/xe/01H',
      client: 'web',
    });

    const first = await states.consume(state);
    expect(first.redirectNext).toBe('/xe/01H');
    expect(first.codeVerifier).toHaveLength(43);

    await expect(states.consume(state)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('hai callback CHẠY SONG SONG cùng một state: đúng một cái thắng', async () => {
    const { state } = await states.issue({
      provider: AUTH_PROVIDER.GOOGLE,
      redirectNext: null,
      client: 'web',
    });

    // Đây là kịch bản mà `updateMany` + kiểm `count === 1` tồn tại để chặn. Đọc-rồi-ghi sẽ cho
    // CẢ HAI đi tiếp, tức một mã bị đánh cắp vẫn đổi được phiên.
    const results = await Promise.allSettled([states.consume(state), states.consume(state)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');

    expect(fulfilled).toHaveLength(1);
  });

  maybe('state hết hạn bị từ chối', async () => {
    const { state } = await states.issue({
      provider: AUTH_PROVIDER.GOOGLE,
      redirectNext: null,
      client: 'web',
    });
    // Đẩy lùi hạn thay vì chờ 10 phút.
    await prisma.oauthState.update({
      where: { state },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(states.consume(state)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('`next` KHÔNG an toàn không bao giờ được lưu', async () => {
    const service = new SocialAuthService(configWith(), states, auth);

    const url = await service.begin({
      provider: AUTH_PROVIDER.GOOGLE,
      next: 'https://evil.example/phish',
      locale: 'vi',
    });

    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();
    const stored = await states.consume(state as string);
    expect(stored.redirectNext).toBeNull();
  });

  maybe('state phát cho Google không dùng được ở callback của Facebook', async () => {
    const service = new SocialAuthService(
      configWith({ FACEBOOK_APP_ID: 'fb-app', FACEBOOK_APP_SECRET: 'fb-secret' }),
      states,
      auth,
    );
    const url = await service.begin({ provider: AUTH_PROVIDER.GOOGLE, next: null, locale: 'vi' });
    const state = new URL(url).searchParams.get('state') as string;

    await expect(
      service.complete({ provider: AUTH_PROVIDER.FACEBOOK, code: 'x', state }),
    ).resolves.toMatchObject({ ok: false, errorCode: API_ERROR_CODE.SOCIAL_STATE_INVALID });
  });

  /**
   * `redirectNext` chỉ biết được SAU khi tiêu thụ `state`. Nếu để lỗi bay ra bằng exception thì
   * controller mất nó — và chủ shop bấm Google ở `/manage/login` sẽ hạ cánh giữa marketplace.
   */
  maybe('hỏng ở chặng đổi token VẪN mang `next` về để quay lại đúng trang xuất phát', async () => {
    const service = new SocialAuthService(configWith(), states, auth);
    const url = await service.begin({
      provider: AUTH_PROVIDER.GOOGLE,
      next: '/manage/login',
      locale: 'vi',
    });
    const state = new URL(url).searchParams.get('state') as string;

    const originalFetch = global.fetch;
    // Google từ chối `code` giả → chặng exchange hỏng.
    global.fetch = (async () =>
      new Response('{}', { status: 400 })) as unknown as typeof global.fetch;

    try {
      const result = await service.complete({
        provider: AUTH_PROVIDER.GOOGLE,
        code: 'code-khong-hop-le',
        state,
      });

      expect(result).toEqual({
        ok: false,
        errorCode: API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
        redirectNext: '/manage/login',
      });
      expect(service.webRedirect(result.redirectNext, 'X')).toContain('/manage/login');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('SocialAuthService — URL dựng ra', () => {
  const service = new SocialAuthService(configWith(), states, auth);

  it('không bao giờ redirect ra ngoài domain của web', () => {
    expect(service.webRedirect('https://evil.example')).toBe('https://xeprime.vn/');
    expect(service.webRedirect('//evil.example')).toBe('https://xeprime.vn/');
    expect(service.webRedirect('/\\evil.example')).toBe('https://xeprime.vn/');
    expect(service.webRedirect('/trips')).toBe('https://xeprime.vn/trips');
  });

  it('lỗi đi về web dưới dạng ?authError= kèm ?auth=login để mở lại hộp đăng nhập', () => {
    const url = new URL(service.webRedirect(null, API_ERROR_CODE.SOCIAL_CANCELLED));
    expect(url.origin).toBe('https://xeprime.vn');
    expect(url.searchParams.get('authError')).toBe(API_ERROR_CODE.SOCIAL_CANCELLED);
    expect(url.searchParams.get('auth')).toBe('login');
  });

  maybe('URL authorize mang đủ PKCE + nonce + locale', async () => {
    const url = new URL(
      await service.begin({ provider: AUTH_PROVIDER.GOOGLE, next: '/trips', locale: 'en' }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(url.searchParams.get('hl')).toBe('en');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.xeprime.vn/auth/social/google/callback',
    );
    // `client_secret` là bí mật của server — không bao giờ được xuất hiện trong URL của trình duyệt.
    expect(url.search).not.toContain('google-secret');

    await states.consume(url.searchParams.get('state') as string);
  });

  it('locale lạ rơi về tiếng Việt thay vì làm hỏng cả luồng', async () => {
    if (!dbAvailable) return;
    const url = new URL(
      await service.begin({ provider: AUTH_PROVIDER.GOOGLE, next: null, locale: 'de' }),
    );
    expect(url.searchParams.get('hl')).toBe('vi');
    await states.consume(url.searchParams.get('state') as string);
  });
});

describe('SocialAuthService — provider chưa cấu hình', () => {
  it('trả SOCIAL_NOT_CONFIGURED, không phải lỗi 500', async () => {
    // Chỉ Google có id/secret trong CONFIG ⇒ Facebook vắng mặt trong registry.
    const service = new SocialAuthService(configWith(), states, auth);

    expect(service.isEnabled(AUTH_PROVIDER.GOOGLE)).toBe(true);
    expect(service.isEnabled(AUTH_PROVIDER.FACEBOOK)).toBe(false);

    await expect(
      service.begin({ provider: AUTH_PROVIDER.FACEBOOK, next: null, locale: 'vi' }),
    ).rejects.toMatchObject({ code: API_ERROR_CODE.SOCIAL_NOT_CONFIGURED });
  });

  it('khai nửa cặp cũng là chưa cấu hình — không có provider nửa vời', () => {
    const service = new SocialAuthService(
      configWith({ FACEBOOK_APP_ID: 'fb-app', FACEBOOK_APP_SECRET: undefined }),
      states,
      auth,
    );
    expect(service.isEnabled(AUTH_PROVIDER.FACEBOOK)).toBe(false);
  });
});

/**
 * Facebook không phải OIDC: access token nhận về không có chữ ký nào để kiểm. `debug_token` là
 * bước DUY NHẤT chứng minh token đó thuộc app của XePrime — bỏ nó đi là mở cửa token substitution.
 */
describe('FacebookSocialProvider — debug_token là cửa chặn thật', () => {
  const provider = new FacebookSocialProvider('xeprime-app-id', 'app-secret');
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockGraph(debugData: Record<string, unknown>): void {
    global.fetch = jest.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/oauth/access_token')) {
        return new Response(JSON.stringify({ access_token: 'fb-token' }), { status: 200 });
      }
      if (url.includes('/debug_token')) {
        return new Response(JSON.stringify({ data: debugData }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ id: 'fb-user-1', name: 'Khách FB', email: 'Khach@Example.com' }),
        { status: 200 },
      );
    }) as unknown as typeof global.fetch;
  }

  const exchange = () =>
    provider.exchange({
      code: 'code',
      codeVerifier: 'verifier',
      nonce: 'nonce',
      redirectUri: 'https://api.xeprime.vn/auth/social/facebook/callback',
    });

  it('từ chối token phát cho app KHÁC', async () => {
    mockGraph({ app_id: 'ke-tan-cong-app-id', is_valid: true });

    await expect(exchange()).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
    });
  });

  it('từ chối token đã hết hiệu lực', async () => {
    mockGraph({ app_id: 'xeprime-app-id', is_valid: false });

    await expect(exchange()).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
    });
  });

  it('token đúng app thì trả danh tính, và email LUÔN coi là chưa xác minh', async () => {
    mockGraph({ app_id: 'xeprime-app-id', is_valid: true });

    await expect(exchange()).resolves.toEqual({
      providerUserId: 'fb-user-1',
      provider: AUTH_PROVIDER.FACEBOOK,
      email: 'khach@example.com',
      // Graph API không cam kết email đã xác minh ⇒ không được tự nối vào tài khoản sẵn có.
      emailVerified: false,
      phone: null,
      displayName: 'Khách FB',
      avatarUrl: null,
    });
  });
});

describe('socialErrorCode — mã ổn định cho mọi kiểu hỏng', () => {
  it('lỗi lạ quy về SOCIAL_EXCHANGE_FAILED thay vì rò ra ngoài', () => {
    expect(socialErrorCode(new TypeError('undefined is not a function'))).toBe(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
    );
    expect(socialErrorCode(null)).toBe(API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED);
  });
});
