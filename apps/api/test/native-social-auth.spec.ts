import { createHash, randomBytes } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId } from '@xeprime/prisma';
import { API_ERROR_CODE, AUTH_PROVIDER, USER_STATUS } from '@xeprime/types';
import type { AuthService } from '../src/modules/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { NativeAuthCodeService } from '../src/modules/auth/social/native-auth-code.service';
import { OauthStateService } from '../src/modules/auth/social/oauth-state.service';
import { SocialAuthService } from '../src/modules/auth/social/social-auth.service';

/**
 * Đăng nhập mạng xã hội cho APP NATIVE — ADR 0019 mục "Chỗ cắm cho app native" + ADR 0017.
 *
 * Web kết thúc luồng bằng `Set-Cookie`; app native không dùng cookie, nên callback phải phát một
 * **one-time code** rồi trả về deep link. Bộ test này khoá ba thứ, và cả ba đều là lỗ hổng thật
 * nếu làm sai:
 *
 *  1. `redirect_uri` do CLIENT gửi ⇒ phải khớp allowlist, nếu không one-time code được giao
 *     thẳng cho app của kẻ tấn công;
 *  2. PKCE app↔backend là BẮT BUỘC — trên Android custom scheme không độc quyền, nên deep link
 *     bị cướp được; code không kèm `code_verifier` phải vô dụng;
 *  3. code dùng ĐÚNG MỘT LẦN và hết hạn thật.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
let dbAvailable = false;

const DEEP_LINK = 'xeprime://auth/callback';
const EXPO_DEV_LINK = 'exp://192.168.1.210:8081/--/auth/callback';

const CONFIG: Record<string, unknown> = {
  APP_WEB_URL: 'https://xeprime.vn',
  API_PUBLIC_URL: 'https://api.xeprime.vn',
  GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
  MOBILE_AUTH_REDIRECT_URIS: [DEEP_LINK, EXPO_DEV_LINK],
};

const config = {
  get: (key: string) => CONFIG[key],
  getOrThrow: (key: string) => {
    const value = CONFIG[key];
    if (value === undefined) throw new Error(`missing ${key}`);
    return value;
  },
} as unknown as ConfigService;

const states = new OauthStateService(asService);
const codes = new NativeAuthCodeService(asService);
const auth = { upsertUserFromIdentity: jest.fn() } as unknown as AuthService;
const social = new SocialAuthService(config, states, auth);

/** PKCE S256 như app sẽ làm: verifier ngẫu nhiên, challenge = base64url(sha256(verifier)). */
function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

const createdUserIds: string[] = [];

async function makeUser(): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, displayName: 'Khách native', status: USER_STATUS.ACTIVE },
  });
  createdUserIds.push(id);
  return id;
}

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
  if (dbAvailable && createdUserIds.length > 0) {
    // native_auth_codes cascade theo user.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.oauthState.deleteMany({ where: { client: 'native' } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('resolveNativeContext — allowlist deep link', () => {
  it('không có `client=native` thì đây là luồng web, trả null', () => {
    expect(
      social.resolveNativeContext({
        client: undefined,
        codeChallenge: undefined,
        redirectUri: undefined,
      }),
    ).toBeNull();
    expect(
      social.resolveNativeContext({ client: 'web', codeChallenge: 'x', redirectUri: DEEP_LINK }),
    ).toBeNull();
  });

  it('nhận deep link nằm trong allowlist — cả bản production lẫn bản Expo dev', () => {
    const { challenge } = pkce();

    for (const uri of [DEEP_LINK, EXPO_DEV_LINK]) {
      expect(
        social.resolveNativeContext({
          client: 'native',
          codeChallenge: challenge,
          redirectUri: uri,
        }),
      ).toEqual({ redirectUri: uri, codeChallenge: challenge });
    }
  });

  it('TỪ CHỐI deep link lạ — đây là chỗ one-time code bị giao cho app của kẻ tấn công', () => {
    const { challenge } = pkce();

    expect(() =>
      social.resolveNativeContext({
        client: 'native',
        codeChallenge: challenge,
        redirectUri: 'evil://auth/callback',
      }),
    ).toThrow(expect.objectContaining({ code: API_ERROR_CODE.SOCIAL_STATE_INVALID }));
  });

  it('TỪ CHỐI khi thiếu code_challenge — PKCE là bắt buộc với client native', () => {
    expect(() =>
      social.resolveNativeContext({
        client: 'native',
        codeChallenge: undefined,
        redirectUri: DEEP_LINK,
      }),
    ).toThrow(expect.objectContaining({ code: API_ERROR_CODE.SOCIAL_STATE_INVALID }));

    // Chuỗi rỗng/ngắn cũng không được coi là "có" — nếu không, một app gửi '' sẽ tạo ra một
    // "PKCE" mà mọi verifier đều khớp.
    expect(() =>
      social.resolveNativeContext({
        client: 'native',
        codeChallenge: 'qua-ngan',
        redirectUri: DEEP_LINK,
      }),
    ).toThrow(expect.objectContaining({ code: API_ERROR_CODE.SOCIAL_STATE_INVALID }));
  });
});

describe('nativeRedirect — URL trả về app', () => {
  it('ghép code vào custom scheme mà không phá scheme', () => {
    const url = social.nativeRedirect(
      { redirectUri: DEEP_LINK, codeChallenge: 'x' },
      { code: 'abc' },
    );
    expect(url.startsWith('xeprime://auth/callback?')).toBe(true);
    expect(new URL(url).searchParams.get('code')).toBe('abc');
  });

  it('lỗi cũng về deep link — app phải biết luồng đã hỏng, không treo ở trình duyệt', () => {
    const url = social.nativeRedirect(
      { redirectUri: DEEP_LINK, codeChallenge: 'x' },
      { error: API_ERROR_CODE.SOCIAL_CANCELLED },
    );
    expect(new URL(url).searchParams.get('error')).toBe(API_ERROR_CODE.SOCIAL_CANCELLED);
    expect(new URL(url).searchParams.get('code')).toBeNull();
  });
});

describe('oauth_states — mang được ngữ cảnh native qua hai chặng', () => {
  maybe('begin(native) lưu challenge + deep link, consume trả lại đúng chúng', async () => {
    const { challenge } = pkce();

    const url = await social.begin({
      provider: AUTH_PROVIDER.GOOGLE,
      next: null,
      locale: 'vi',
      native: { redirectUri: DEEP_LINK, codeChallenge: challenge },
    });
    const state = new URL(url).searchParams.get('state') as string;

    const stored = await states.consume(state);
    expect(stored.client).toBe('native');
    expect(stored.appCodeChallenge).toBe(challenge);
    expect(stored.appRedirectUri).toBe(DEEP_LINK);
    // PKCE với PROVIDER là một cặp khác hẳn — hai lớp không được lẫn vào nhau.
    expect(stored.codeVerifier).not.toBe(challenge);
  });

  maybe('luồng web KHÔNG ghi hai cột đó (CHECK ở DB giữ bất biến này)', async () => {
    const url = await social.begin({ provider: AUTH_PROVIDER.GOOGLE, next: null, locale: 'vi' });
    const state = new URL(url).searchParams.get('state') as string;

    const stored = await states.consume(state);
    expect(stored.client).toBe('web');
    expect(stored.appCodeChallenge).toBeNull();
    expect(stored.appRedirectUri).toBeNull();
  });
});

describe('NativeAuthCodeService — one-time code + PKCE', () => {
  maybe('đổi được đúng một lần, và trả về đúng user', async () => {
    const userId = await makeUser();
    const { verifier, challenge } = pkce();

    const code = await codes.issue({ userId, codeChallenge: challenge });

    await expect(codes.consume(code, verifier)).resolves.toEqual({ userId });
    await expect(codes.consume(code, verifier)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('code bị CƯỚP ở deep link mà không có verifier ⇒ vô dụng', async () => {
    const userId = await makeUser();
    const { challenge } = pkce();
    const code = await codes.issue({ userId, codeChallenge: challenge });

    // Kẻ tấn công có `code` (đăng ký cùng custom scheme trên Android) nhưng verifier là của nó.
    const attacker = pkce();
    await expect(codes.consume(code, attacker.verifier)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('đoán sai verifier ĐỐT LUÔN mã — không cho thử lần hai', async () => {
    const userId = await makeUser();
    const { verifier, challenge } = pkce();
    const code = await codes.issue({ userId, codeChallenge: challenge });

    await expect(codes.consume(code, pkce().verifier)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
    // Ngay cả app thật, với verifier ĐÚNG, cũng không dùng lại được mã đó nữa.
    await expect(codes.consume(code, verifier)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('hai lần đổi CHẠY SONG SONG: đúng một cái thắng', async () => {
    const userId = await makeUser();
    const { verifier, challenge } = pkce();
    const code = await codes.issue({ userId, codeChallenge: challenge });

    const results = await Promise.allSettled([
      codes.consume(code, verifier),
      codes.consume(code, verifier),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  maybe('code hết hạn bị từ chối', async () => {
    const userId = await makeUser();
    const { verifier, challenge } = pkce();
    const code = await codes.issue({ userId, codeChallenge: challenge });

    const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
    await prisma.nativeAuthCode.update({
      where: { codeHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(codes.consume(code, verifier)).rejects.toMatchObject({
      code: API_ERROR_CODE.SOCIAL_STATE_INVALID,
    });
  });

  maybe('code TRẦN không bao giờ nằm trong DB — chỉ hash của nó', async () => {
    const userId = await makeUser();
    const { challenge } = pkce();
    const code = await codes.issue({ userId, codeChallenge: challenge });

    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM native_auth_codes WHERE code_hash = ${code}
    `;
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });
});
