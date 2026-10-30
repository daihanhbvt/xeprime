import type { ConfigService } from '@nestjs/config';
import { createPrismaClient } from '@xeprime/prisma';
import { ACCOUNT_REALM, API_ERROR_CODE, AUTH_PROVIDER } from '@xeprime/types';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RequestRealmService } from '../src/modules/auth/request-realm.service';
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
 *  5. (ADR 0053) Realm của luồng ghi vào `state` lúc bắt đầu và quyết định callback + đích về:
 *     mỗi site một `redirect_uri` dưới `/api` của chính nó; site quản trị không có nút mạng xã hội.
 */
const C = ACCOUNT_REALM.CUSTOMER;
const P = ACCOUNT_REALM.PARTNER;
const prisma = createPrismaClient();
let dbAvailable = false;

const CONFIG: Record<string, string> = {
  APP_WEB_URL: 'https://xeprime.vn',
  WEB_PARTNER_URL: 'https://partner.xeprime.vn',
  WEB_ADMIN_URL: 'https://admin.xeprime.vn',
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

function socialService(config: ConfigService = configWith()): SocialAuthService {
  return new SocialAuthService(config, states, auth, new RequestRealmService(config));
}

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
      realm: P,
      redirectNext: '/xe/01H',
      client: 'web',
    });

    const first = await states.consume(state);
    expect(first.redirectNext).toBe('/xe/01H');
    // Realm sống trong `state`: callback không mang header realm đáng tin (ADR 0053).
    expect(first.realm).toBe(P);
    expect(first.codeVerifier).toHaveLength(43);

    await expect(states.consume(state)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('hai callback CHẠY SONG SONG cùng một state: đúng một cái thắng', async () => {
    const { state } = await states.issue({
      provider: AUTH_PROVIDER.GOOGLE,
      realm: C,
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
      realm: C,
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
    const service = socialService();

    const url = await service.begin({
      provider: AUTH_PROVIDER.GOOGLE,
      next: 'https://evil.example/phish',
      locale: 'vi',
      webRealm: C,
    });

    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();
    const stored = await states.consume(state as string);
    expect(stored.redirectNext).toBeNull();
  });

  maybe('state phát cho Google không dùng được ở callback của Facebook', async () => {
    const service = socialService(
      configWith({ FACEBOOK_APP_ID: 'fb-app', FACEBOOK_APP_SECRET: 'fb-secret' }),
    );
    const url = await service.begin({
      provider: AUTH_PROVIDER.GOOGLE,
      next: null,
      locale: 'vi',
      webRealm: C,
    });
    const state = new URL(url).searchParams.get('state') as string;

    await expect(
      service.complete({ provider: AUTH_PROVIDER.FACEBOOK, code: 'x', state, browserState: state }),
    ).resolves.toMatchObject({ ok: false, errorCode: API_ERROR_CODE.SOCIAL_STATE_INVALID });
  });

  /**
   * Login CSRF (ADR 0076 điều 4): kẻ xấu mở luồng bằng tài khoản Google của họ, dừng ở URL callback
   * rồi gửi link cho nạn nhân. Trình duyệt nạn nhân không có cookie gắn `state` ⇒ từ chối TRƯỚC
   * khi gọi Google, và `state` đã cháy nên link không dùng lại được.
   */
  maybe(
    'callback web thiếu/lệch cookie trình duyệt ⇒ SOCIAL_STATE_INVALID, không gọi provider',
    async () => {
      const service = socialService();
      const originalFetch = global.fetch;
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof global.fetch;
      try {
        for (const browserState of [null, 'cookie-cua-trinh-duyet-khac']) {
          const url = await service.begin({
            provider: AUTH_PROVIDER.GOOGLE,
            next: null,
            locale: 'vi',
            webRealm: C,
          });
          const state = new URL(url).searchParams.get('state') as string;

          await expect(
            service.complete({ provider: AUTH_PROVIDER.GOOGLE, code: 'x', state, browserState }),
          ).resolves.toMatchObject({ ok: false, errorCode: API_ERROR_CODE.SOCIAL_STATE_INVALID });
          // `state` đã tiêu thụ — phát lại cùng link (kể cả với cookie đúng) cũng hỏng, ngay ở
          // `consume()` (trước khi biết `next`, nên ném chứ không trả kết quả).
          await expect(
            service.complete({
              provider: AUTH_PROVIDER.GOOGLE,
              code: 'x',
              state,
              browserState: state,
            }),
          ).rejects.toMatchObject({ code: API_ERROR_CODE.SOCIAL_STATE_INVALID });
        }
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    },
  );

  /**
   * `redirectNext` chỉ biết được SAU khi tiêu thụ `state`. Nếu để lỗi bay ra bằng exception thì
   * controller mất nó — và chủ shop bấm Google ở trang đăng nhập partner sẽ hạ cánh nhầm chỗ.
   */
  maybe(
    'hỏng ở chặng đổi token VẪN mang `next` + realm về để quay lại đúng trang xuất phát',
    async () => {
      const service = socialService();
      const url = await service.begin({
        provider: AUTH_PROVIDER.GOOGLE,
        next: '/login',
        locale: 'vi',
        webRealm: P,
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
          browserState: state,
        });

        expect(result).toEqual({
          ok: false,
          errorCode: API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
          realm: P,
          redirectNext: '/login',
          // Luồng web ⇒ không có deep link nào để trả về.
          native: null,
        });
        expect(service.webRedirect(result.realm, result.redirectNext, 'X')).toContain(
          'https://partner.xeprime.vn/login',
        );
      } finally {
        global.fetch = originalFetch;
      }
    },
  );
});

describe('SocialAuthService — URL dựng ra', () => {
  const service = socialService();

  it('không bao giờ redirect ra ngoài domain của web', () => {
    expect(service.webRedirect(C, 'https://evil.example')).toBe('https://xeprime.vn/');
    expect(service.webRedirect(C, '//evil.example')).toBe('https://xeprime.vn/');
    expect(service.webRedirect(C, '/\\evil.example')).toBe('https://xeprime.vn/');
    expect(service.webRedirect(C, '/trips')).toBe('https://xeprime.vn/trips');
  });

  it('về ĐÚNG site của realm — luồng partner không bao giờ hạ cánh ở site khách', () => {
    expect(service.webRedirect(P, '/vehicles')).toBe('https://partner.xeprime.vn/vehicles');
    expect(service.webRedirect(P, null)).toBe('https://partner.xeprime.vn/');
  });

  it('chế độ path (dev): đích mặc định gồm tiền tố khu', () => {
    const dev = socialService(
      configWith({
        APP_WEB_URL: 'http://localhost:3000',
        WEB_PARTNER_URL: 'http://localhost:3000/manage',
      }),
    );
    expect(dev.webRedirect(P, null)).toBe('http://localhost:3000/manage/');
    // `next` là path HIỂN THỊ đã gồm tiền tố — ghép với origin, không nhân đôi tiền tố.
    expect(dev.webRedirect(P, '/manage/vehicles')).toBe('http://localhost:3000/manage/vehicles');
  });

  it('lỗi đi về web dưới dạng ?authError= kèm ?auth=login để mở lại hộp đăng nhập', () => {
    const url = new URL(service.webRedirect(C, null, API_ERROR_CODE.SOCIAL_CANCELLED));
    expect(url.origin).toBe('https://xeprime.vn');
    expect(url.searchParams.get('authError')).toBe(API_ERROR_CODE.SOCIAL_CANCELLED);
    expect(url.searchParams.get('auth')).toBe('login');
  });

  maybe('URL authorize mang đủ PKCE + nonce + locale', async () => {
    const url = new URL(
      await service.begin({
        provider: AUTH_PROVIDER.GOOGLE,
        next: '/trips',
        locale: 'en',
        webRealm: C,
      }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(url.searchParams.get('nonce')).toBeTruthy();
    expect(url.searchParams.get('hl')).toBe('en');
    // ADR 0053: callback web nằm dưới `/api` của CHÍNH site đó, để cookie phát ra là host-only.
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://xeprime.vn/api/auth/social/google/callback',
    );
    // `client_secret` là bí mật của server — không bao giờ được xuất hiện trong URL của trình duyệt.
    expect(url.search).not.toContain('google-secret');

    await states.consume(url.searchParams.get('state') as string);
  });

  it('locale lạ rơi về tiếng Việt thay vì làm hỏng cả luồng', async () => {
    if (!dbAvailable) return;
    const url = new URL(
      await service.begin({
        provider: AUTH_PROVIDER.GOOGLE,
        next: null,
        locale: 'de',
        webRealm: C,
      }),
    );
    expect(url.searchParams.get('hl')).toBe('vi');
    await states.consume(url.searchParams.get('state') as string);
  });

  maybe('site partner: redirect_uri riêng và state mang realm partner', async () => {
    const url = new URL(
      await service.begin({
        provider: AUTH_PROVIDER.GOOGLE,
        next: null,
        locale: 'vi',
        webRealm: P,
      }),
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://partner.xeprime.vn/api/auth/social/google/callback',
    );
    const stored = await states.consume(url.searchParams.get('state') as string);
    expect(stored.realm).toBe(P);
  });

  it('luồng web không rõ site ⇒ REALM_UNRESOLVED, không đoán realm', async () => {
    await expect(
      service.begin({ provider: AUTH_PROVIDER.GOOGLE, next: null, locale: 'vi', webRealm: null }),
    ).rejects.toMatchObject({ code: API_ERROR_CODE.REALM_UNRESOLVED });
  });

  it('site quản trị không có đăng nhập mạng xã hội — chặn trước màn đồng ý', async () => {
    await expect(
      service.begin({
        provider: AUTH_PROVIDER.GOOGLE,
        next: null,
        locale: 'vi',
        webRealm: ACCOUNT_REALM.PLATFORM,
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODE.REALM_LOGIN_METHOD_NOT_ALLOWED });
  });
});

describe('SocialAuthService — provider chưa cấu hình', () => {
  it('trả SOCIAL_NOT_CONFIGURED, không phải lỗi 500', async () => {
    // Chỉ Google có id/secret trong CONFIG ⇒ Facebook vắng mặt trong registry.
    const service = socialService();

    expect(service.isEnabled(AUTH_PROVIDER.GOOGLE)).toBe(true);
    expect(service.isEnabled(AUTH_PROVIDER.FACEBOOK)).toBe(false);

    await expect(
      service.begin({ provider: AUTH_PROVIDER.FACEBOOK, next: null, locale: 'vi', webRealm: C }),
    ).rejects.toMatchObject({ code: API_ERROR_CODE.SOCIAL_NOT_CONFIGURED });
  });

  it('khai nửa cặp cũng là chưa cấu hình — không có provider nửa vời', () => {
    const service = socialService(
      configWith({ FACEBOOK_APP_ID: 'fb-app', FACEBOOK_APP_SECRET: undefined }),
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
