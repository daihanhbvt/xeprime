import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  ACCOUNT_REALM_HEADER,
  API_ERROR_CODE,
  MOBILE_CLIENT_APP,
  USER_STATUS,
  type AccountRealm,
} from '@xeprime/types';
import jwt from 'jsonwebtoken';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { resolveOptionalUserId } from '../src/common/optional-user';
import {
  NATIVE_REVOKE_REASON,
  NativeSessionService,
} from '../src/modules/auth/native-session.service';
import { SessionService } from '../src/modules/auth/session.service';
import {
  REALM_PROXY_SECRET_HEADER,
  RequestRealmService,
} from '../src/modules/auth/request-realm.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { RequestContext } from '../src/common/types/request-context';

/**
 * Xác thực app native — ADR 0017. Chạy trên PostgreSQL THẬT (phiên và refresh token là bảng, và
 * phát hiện replay dựa vào `UNIQUE(token_hash)` + transaction — mock được thì test cũng vô nghĩa).
 *
 * Bất biến được khoá ở đây, theo đúng thứ tự rủi ro:
 *  - đường COOKIE của web không đổi hành vi (hồi quy quan trọng nhất của cả thay đổi này);
 *  - Bearer đi được vào route cần đăng nhập;
 *  - sai `typ` / sai `aud` / sai dạng header / hai credential cùng lúc ⇒ 401;
 *  - refresh xoay được, và token cũ chết ngay;
 *  - dùng lại refresh token cũ ⇒ thu hồi CẢ phiên (token family);
 *  - logout ⇒ access token còn hạn mất hiệu lực ngay;
 *  - user bị khoá ⇒ chặn dù access token chưa hết hạn;
 *  - (ADR 0053) phiên không bao giờ đi chéo realm: cookie đọc theo realm do proxy quyết, Bearer lấy
 *    realm của app đã đăng nhập và — khi đi qua `/api` của một site web — phải trùng realm của site;
 *    tài khoản lệch realm ⇒ 401 như người lạ.
 *
 * Không có DB thì tự skip, giống các spec khác trong repo.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const SECRET = 'test-secret-at-least-32-characters-long-xxxx';
const AUDIENCE = 'xeprime-mobile';
const COOKIE_BASE = 'xp_session_test';
const PROXY_SECRET = 'proxy-secret-at-least-32-characters-xxxxxx';

/** ConfigService tối thiểu: chỉ những khoá hai service thật sự đọc. */
const config = {
  get: (key: string) => (key === 'REALM_PROXY_SECRET' ? PROXY_SECRET : undefined),
  getOrThrow: (key: string) => {
    const values: Record<string, string | number | boolean> = {
      APP_WEB_URL: 'https://xeprime.vn',
      WEB_PARTNER_URL: 'https://partner.xeprime.vn',
      WEB_ADMIN_URL: 'https://admin.xeprime.vn',
      SESSION_JWT_SECRET: SECRET,
      SESSION_COOKIE_NAME: COOKIE_BASE,
      SESSION_COOKIE_SECURE: false,
      MOBILE_ACCESS_TTL_MINUTES: 15,
      MOBILE_REFRESH_TTL_DAYS: 60,
      MOBILE_JWT_AUDIENCE: AUDIENCE,
    };
    const value = values[key];
    if (value === undefined) throw new Error(`missing ${key}`);
    return value;
  },
} as unknown as ConfigService;

const sessions = new SessionService(config);
const native = new NativeSessionService(config, asService);
const realms = new RequestRealmService(config);
const guard = new AuthGuard(new Reflector(), sessions, native, realms, asService);

/** Cookie của site khách — đường web mặc định của các test cũ. */
const COOKIE_NAME = sessions.cookieName(ACCOUNT_REALM.CUSTOMER);

/**
 * Header Caddy gắn cho một request web: realm theo host + khoá proxy. Request native không có.
 * `secret: null` mô phỏng ai đó tự gửi header realm mà không biết khoá.
 */
function realmHeaders(realm: AccountRealm, secret: string | null = PROXY_SECRET) {
  return {
    [ACCOUNT_REALM_HEADER]: realm,
    ...(secret === null ? {} : { [REALM_PROXY_SECRET_HEADER]: secret }),
  };
}

/** Request giả — trả về ĐÚNG object mà guard sẽ ghi `req.user` vào. */
function mkRequest(
  init: {
    cookies?: Record<string, string>;
    authorization?: string;
    /** Realm của site web; mặc định `customer` khi request mang cookie (đường web). */
    realm?: AccountRealm | null;
    proxySecret?: string | null;
  } = {},
): RequestContext {
  const realm =
    init.realm === undefined ? (init.cookies ? ACCOUNT_REALM.CUSTOMER : null) : init.realm;
  return {
    cookies: init.cookies ?? {},
    headers: {
      ...(realm ? realmHeaders(realm, init.proxySecret) : {}),
      ...(init.authorization === undefined ? {} : { authorization: init.authorization }),
    },
  } as unknown as RequestContext;
}

/**
 * `ExecutionContext` tối thiểu.
 *
 * Nhận request THEO THAM CHIẾU, không copy: guard gắn danh tính bằng `req.user = …`, nên nếu ở
 * đây spread ra một object mới thì test không bao giờ thấy được thứ guard vừa ghi — và một guard
 * gắn sai user sẽ lọt qua bộ test này.
 *
 * Không có `@Public()` ở đâu (Reflector thật đọc metadata từ handler rỗng → undefined), nên guard
 * luôn đi vào nhánh xác thực — đúng thứ cần kiểm.
 */
function contextFor(request: RequestContext): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: <T>() => request as T }),
  } as unknown as ExecutionContext;
}

let dbAvailable = false;
const createdUserIds: string[] = [];

async function mkUser(
  status: string = USER_STATUS.ACTIVE,
  realm: AccountRealm = ACCOUNT_REALM.CUSTOMER,
): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, realm, displayName: 'Khách Native Test', status },
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
    // Xoá user → cascade native_auth_sessions → cascade native_refresh_tokens.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Mã lỗi trong response của Nest — envelope `{ code, message }` nằm ở `getResponse()`. */
function errorCodeOf(err: unknown): string | undefined {
  if (!(err instanceof UnauthorizedException)) return undefined;
  const body = err.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body
    ? String((body as { code: unknown }).code)
    : undefined;
}

async function expectUnauthorized(run: () => Promise<unknown>): Promise<UnauthorizedException> {
  try {
    await run();
  } catch (err) {
    expect(err).toBeInstanceOf(UnauthorizedException);
    return err as UnauthorizedException;
  }
  throw new Error('mong đợi UnauthorizedException nhưng lời gọi thành công');
}

/* ─────────────────────────── Web: không được đổi gì ─────────────────────────── */

describe('AuthGuard — đường cookie của web (ADR 0002) giữ nguyên', () => {
  maybe('cookie hợp lệ đi qua guard và gắn đúng user vào request', async () => {
    const userId = await mkUser();
    const { token, sessionId } = sessions.issue(userId);

    const request = mkRequest({ cookies: { [COOKIE_NAME]: token } });
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toMatchObject({ id: userId, sessionId });
  });

  maybe('không cookie, không Bearer ⇒ UNAUTHENTICATED', async () => {
    const err = await expectUnauthorized(() => guard.canActivate(contextFor(mkRequest())));
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });

  maybe('cookie của user đã bị khoá ⇒ chặn dù token còn hạn', async () => {
    const userId = await mkUser(USER_STATUS.LOCKED);
    const { token } = sessions.issue(userId);

    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ cookies: { [COOKIE_NAME]: token } }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });
});

/* ─────────────────────────── Native: Bearer ─────────────────────────── */

describe('AuthGuard — Bearer access token (ADR 0017)', () => {
  maybe('access token hợp lệ đi qua guard, sessionId là phiên native', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId, { devicePlatform: 'ios' });

    const request = mkRequest({ authorization: `Bearer ${pair.accessToken}` });
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: userId, sessionId: pair.sessionId });
  });

  maybe('scheme viết hoa/thường đều nhận (`bearer` cũng hợp lệ)', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    await expect(
      guard.canActivate(contextFor(mkRequest({ authorization: `bearer ${pair.accessToken}` }))),
    ).resolves.toBe(true);
  });

  maybe('header sai dạng ⇒ 401, KHÔNG rơi về cookie', async () => {
    const userId = await mkUser();
    const { token } = sessions.issue(userId);

    // Cookie hợp lệ có mặt, nhưng header tồn tại và sai dạng: phải từ chối, không được "cứu".
    for (const authorization of ['no-scheme-token', 'Bearer', 'Bearer ', 'Basic abc123']) {
      const err = await expectUnauthorized(() =>
        guard.canActivate(contextFor(mkRequest({ authorization }))),
      );
      expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
    }

    // …và với cookie hợp lệ kèm theo cũng vậy.
    await expectUnauthorized(() =>
      guard.canActivate(
        contextFor(
          mkRequest({ authorization: 'no-scheme-token', cookies: { [COOKIE_NAME]: token } }),
        ),
      ),
    );
  });

  maybe('cookie + Bearer cùng lúc ⇒ 401, không đoán bên nào', async () => {
    const cookieUser = await mkUser();
    const bearerUser = await mkUser();
    const { token } = sessions.issue(cookieUser);
    const pair = await native.issueSession(bearerUser);

    const err = await expectUnauthorized(() =>
      guard.canActivate(
        contextFor(
          mkRequest({
            authorization: `Bearer ${pair.accessToken}`,
            cookies: { [COOKIE_NAME]: token },
          }),
        ),
      ),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });

  maybe('session JWT của WEB dùng làm Bearer ⇒ từ chối (thiếu typ + aud)', async () => {
    const userId = await mkUser();
    // Đúng chữ ký, đúng issuer, cùng secret — chỉ thiếu `typ=access` và `aud`.
    const { token } = sessions.issue(userId);

    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${token}` }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });

  maybe('access token native KHÔNG dùng được làm cookie web (chiều ngược lại)', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    /*
     * Đối xứng với case trên, và là nửa nguy hiểm hơn: đường cookie KHÔNG tra
     * `native_auth_sessions.revoked_at`. Nếu access token native lọt qua đó thì một thiết bị đã
     * đăng xuất vẫn gọi được API tới khi token hết hạn, chỉ bằng cách đổi header sang cookie —
     * vô hiệu hoá toàn bộ việc thu hồi theo thiết bị (ADR 0017 §5).
     */
    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ cookies: { [COOKIE_NAME]: pair.accessToken } }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);

    // Và vẫn đúng sau khi thu hồi — không có đường vòng nào.
    await native.revokeByRefreshToken(pair.refreshToken);
    await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ cookies: { [COOKIE_NAME]: pair.accessToken } }))),
    );
  });

  maybe('sai `aud` ⇒ từ chối', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);
    const forged = jwt.sign({ sub: userId, sid: pair.sessionId, typ: 'access' }, SECRET, {
      expiresIn: 900,
      issuer: 'xeprime-api',
      audience: 'xeprime-somewhere-else',
    });

    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${forged}` }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });

  maybe('sai `typ` (refresh thay vì access) ⇒ từ chối', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);
    const forged = jwt.sign({ sub: userId, sid: pair.sessionId, typ: 'refresh' }, SECRET, {
      expiresIn: 900,
      issuer: 'xeprime-api',
      audience: AUDIENCE,
    });

    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${forged}` }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });

  maybe('access token hết hạn ⇒ SESSION_EXPIRED (client biết phải refresh)', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);
    const expired = jwt.sign({ sub: userId, sid: pair.sessionId, typ: 'access' }, SECRET, {
      expiresIn: -10,
      issuer: 'xeprime-api',
      audience: AUDIENCE,
    });

    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${expired}` }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.SESSION_EXPIRED);
  });

  maybe('user bị khoá ⇒ chặn dù access token CHƯA hết hạn', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    // Token phát ra lúc user còn active; khoá sau đó.
    await prisma.user.update({ where: { id: userId }, data: { status: USER_STATUS.LOCKED } });

    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${pair.accessToken}` }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.UNAUTHENTICATED);
  });
});

/* ─────────────────────────── Refresh: xoay + replay ─────────────────────────── */

describe('NativeSessionService — xoay refresh token', () => {
  maybe('refresh trả cặp MỚI và token cũ chết ngay', async () => {
    const userId = await mkUser();
    const first = await native.issueSession(userId);

    const second = await native.rotate(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.sessionId).toBe(first.sessionId);
    expect(second.accessToken).toBeTruthy();

    // Token mới dùng được…
    const third = await native.rotate(second.refreshToken);
    expect(third.refreshToken).not.toBe(second.refreshToken);
  });

  maybe('refresh cập nhật last_used_at của phiên', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    const before = await prisma.nativeAuthSession.findUniqueOrThrow({
      where: { id: pair.sessionId },
      select: { lastUsedAt: true },
    });
    expect(before.lastUsedAt).toBeNull();

    await native.rotate(pair.refreshToken);

    const after = await prisma.nativeAuthSession.findUniqueOrThrow({
      where: { id: pair.sessionId },
      select: { lastUsedAt: true },
    });
    expect(after.lastUsedAt).not.toBeNull();
  });

  maybe('DÙNG LẠI refresh token cũ ⇒ thu hồi CẢ phiên (token family)', async () => {
    const userId = await mkUser();
    const first = await native.issueSession(userId);
    const second = await native.rotate(first.refreshToken);

    // Kẻ tấn công (hoặc client lỗi) gửi lại token đã dùng.
    const err = await expectUnauthorized(() => native.rotate(first.refreshToken));
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.SESSION_EXPIRED);

    const session = await prisma.nativeAuthSession.findUniqueOrThrow({
      where: { id: first.sessionId },
      select: { revokedAt: true, revokedReason: true },
    });
    expect(session.revokedAt).not.toBeNull();
    expect(session.revokedReason).toBe(NATIVE_REVOKE_REASON.REFRESH_REUSE);

    // Token "hợp lệ" của người thật cũng chết theo — đó chính là mục đích.
    await expectUnauthorized(() => native.rotate(second.refreshToken));

    // …và access token còn hạn cũng không đi được nữa.
    await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${second.accessToken}` }))),
    );
  });

  maybe('refresh token không tồn tại ⇒ SESSION_EXPIRED, không tiết lộ gì hơn', async () => {
    const err = await expectUnauthorized(() => native.rotate('khong-phai-token-that'));
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.SESSION_EXPIRED);
  });

  maybe('refresh sau khi user bị khoá ⇒ thu hồi phiên với lý do user_disabled', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);
    await prisma.user.update({ where: { id: userId }, data: { status: USER_STATUS.LOCKED } });

    await expectUnauthorized(() => native.rotate(pair.refreshToken));

    const session = await prisma.nativeAuthSession.findUniqueOrThrow({
      where: { id: pair.sessionId },
      select: { revokedAt: true, revokedReason: true },
    });
    expect(session.revokedAt).not.toBeNull();
    expect(session.revokedReason).toBe(NATIVE_REVOKE_REASON.USER_DISABLED);
  });

  maybe('DB chỉ chứa hash, không bao giờ chứa token thô', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    const rows = await prisma.nativeRefreshToken.findMany({
      where: { sessionId: pair.sessionId },
      select: { tokenHash: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).toHaveLength(64);
    expect(rows[0]?.tokenHash).not.toBe(pair.refreshToken);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ─────────────────────────── Logout / thu hồi ─────────────────────────── */

describe('NativeSessionService — đăng xuất và thu hồi', () => {
  maybe('logout làm access token còn hạn mất hiệu lực NGAY', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    // Trước logout: đi được.
    await expect(
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${pair.accessToken}` }))),
    ).resolves.toBe(true);

    await native.revokeByRefreshToken(pair.refreshToken);

    // Sau logout: chặn, dù `exp` của token còn 15 phút.
    const err = await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${pair.accessToken}` }))),
    );
    expect(errorCodeOf(err)).toBe(API_ERROR_CODE.SESSION_EXPIRED);
  });

  maybe('logout với token lạ: im lặng thành công (không dò được token hợp lệ)', async () => {
    await expect(native.revokeByRefreshToken('token-khong-ton-tai')).resolves.toBeUndefined();
  });

  maybe('logout hai lần không lỗi (idempotent)', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    await native.revokeByRefreshToken(pair.refreshToken);
    await expect(native.revokeByRefreshToken(pair.refreshToken)).resolves.toBeUndefined();
  });

  maybe('revokeAllForUser giết mọi thiết bị', async () => {
    const userId = await mkUser();
    const phone = await native.issueSession(userId, { deviceName: 'iPhone' });
    const tablet = await native.issueSession(userId, { deviceName: 'iPad' });

    await native.revokeAllForUser(userId, NATIVE_REVOKE_REASON.USER_DISABLED);

    for (const pair of [phone, tablet]) {
      await expectUnauthorized(() =>
        guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${pair.accessToken}` }))),
      );
    }
  });

  maybe('phiên của thiết bị KHÁC không bị ảnh hưởng khi một thiết bị logout', async () => {
    const userId = await mkUser();
    const phone = await native.issueSession(userId, { deviceName: 'iPhone' });
    const tablet = await native.issueSession(userId, { deviceName: 'iPad' });

    await native.revokeByRefreshToken(phone.refreshToken);

    await expectUnauthorized(() =>
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${phone.accessToken}` }))),
    );
    await expect(
      guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${tablet.accessToken}` }))),
    ).resolves.toBe(true);
  });
});

/* ─────────────────────────── Endpoint công khai ─────────────────────────── */

describe('resolveOptionalUserId — nhận cả cookie lẫn Bearer', () => {
  const reqOf = (init: { cookies?: Record<string, string>; authorization?: string }) =>
    mkRequest(init) as unknown as Parameters<typeof resolveOptionalUserId>[0];
  const deps = { sessions, prisma: asService, realms, nativeSessions: native };

  maybe('Bearer hợp lệ ⇒ trả userId', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);

    await expect(
      resolveOptionalUserId(reqOf({ authorization: `Bearer ${pair.accessToken}` }), deps),
    ).resolves.toBe(userId);
  });

  maybe('cookie hợp lệ ⇒ trả userId (hành vi cũ, không đổi)', async () => {
    const userId = await mkUser();
    const { token } = sessions.issue(userId);

    await expect(
      resolveOptionalUserId(reqOf({ cookies: { [COOKIE_NAME]: token } }), {
        sessions,
        prisma: asService,
        realms,
      }),
    ).resolves.toBe(userId);
  });

  maybe('phiên đã thu hồi ⇒ null (không gắn hành động vào tài khoản đã đăng xuất)', async () => {
    const userId = await mkUser();
    const pair = await native.issueSession(userId);
    await native.revokeByRefreshToken(pair.refreshToken);

    await expect(
      resolveOptionalUserId(reqOf({ authorization: `Bearer ${pair.accessToken}` }), deps),
    ).resolves.toBeNull();
  });

  maybe('mọi credential hỏng ⇒ null, KHÔNG ném (bề mặt công khai)', async () => {
    const userId = await mkUser();
    const { token } = sessions.issue(userId);
    const pair = await native.issueSession(userId);

    const cases = [
      reqOf({}),
      reqOf({ authorization: 'khong-co-scheme' }),
      reqOf({ authorization: 'Bearer khong-phai-jwt' }),
      // Hai credential cùng lúc: coi như khách vãng lai thay vì đoán.
      reqOf({ cookies: { [COOKIE_NAME]: token }, authorization: `Bearer ${pair.accessToken}` }),
    ];

    for (const req of cases) {
      await expect(resolveOptionalUserId(req, deps)).resolves.toBeNull();
    }
  });

  maybe(
    'endpoint của khách yêu cầu realm customer: phiên partner coi như khách vãng lai',
    async () => {
      const partnerId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
      const pair = await native.issueSession(partnerId, {}, MOBILE_CLIENT_APP.PARTNER);

      const req = reqOf({ authorization: `Bearer ${pair.accessToken}` });
      await expect(resolveOptionalUserId(req, deps)).resolves.toBe(partnerId);
      await expect(resolveOptionalUserId(req, deps, ACCOUNT_REALM.CUSTOMER)).resolves.toBeNull();
    },
  );

  maybe(
    'Bearer app Partner đi qua site khách ⇒ null (khách vãng lai), qua site partner ⇒ có',
    async () => {
      const partnerId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
      const pair = await native.issueSession(partnerId, {}, MOBILE_CLIENT_APP.PARTNER);
      const viaSite = (realm: AccountRealm) =>
        mkRequest({
          authorization: `Bearer ${pair.accessToken}`,
          realm,
        }) as unknown as Parameters<typeof resolveOptionalUserId>[0];

      await expect(
        resolveOptionalUserId(viaSite(ACCOUNT_REALM.CUSTOMER), deps),
      ).resolves.toBeNull();
      await expect(resolveOptionalUserId(viaSite(ACCOUNT_REALM.PARTNER), deps)).resolves.toBe(
        partnerId,
      );
    },
  );
});

/* ───────────────────────── Ranh giới realm (ADR 0053) ───────────────────────── */

describe('AuthGuard — phiên không đi chéo realm', () => {
  maybe('cookie site partner của tài khoản partner ⇒ vào được, req.realm = partner', async () => {
    const userId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
    const { token } = sessions.issue(userId);
    const request = mkRequest({
      cookies: { [sessions.cookieName(ACCOUNT_REALM.PARTNER)]: token },
      realm: ACCOUNT_REALM.PARTNER,
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.realm).toBe(ACCOUNT_REALM.PARTNER);
    expect(request.user).toMatchObject({
      id: userId,
      realm: ACCOUNT_REALM.PARTNER,
      transport: 'cookie',
    });
  });

  maybe('cookie của site khách KHÔNG được đọc ở site partner (khác tên cookie)', async () => {
    const userId = await mkUser();
    const { token } = sessions.issue(userId);

    await expectUnauthorized(() =>
      guard.canActivate(
        contextFor(mkRequest({ cookies: { [COOKIE_NAME]: token }, realm: ACCOUNT_REALM.PARTNER })),
      ),
    );
  });

  maybe(
    'token của tài khoản khách đặt dưới tên cookie partner ⇒ 401 (tài khoản lệch realm)',
    async () => {
      const customerId = await mkUser();
      const { token } = sessions.issue(customerId);

      await expectUnauthorized(() =>
        guard.canActivate(
          contextFor(
            mkRequest({
              cookies: { [sessions.cookieName(ACCOUNT_REALM.PARTNER)]: token },
              realm: ACCOUNT_REALM.PARTNER,
            }),
          ),
        ),
      );
    },
  );

  maybe('header realm tự khai KHÔNG có khoá proxy ⇒ không đọc cookie nào', async () => {
    const userId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PLATFORM);
    const { token } = sessions.issue(userId);

    await expectUnauthorized(() =>
      guard.canActivate(
        contextFor(
          mkRequest({
            cookies: { [sessions.cookieName(ACCOUNT_REALM.PLATFORM)]: token },
            realm: ACCOUNT_REALM.PLATFORM,
            proxySecret: null,
          }),
        ),
      ),
    );
    await expectUnauthorized(() =>
      guard.canActivate(
        contextFor(
          mkRequest({
            cookies: { [sessions.cookieName(ACCOUNT_REALM.PLATFORM)]: token },
            realm: ACCOUNT_REALM.PLATFORM,
            // Sai khoá nhưng CÙNG độ dài — đi tới phép so thời gian hằng chứ không dừng ở độ dài.
            proxySecret: 'x'.repeat(PROXY_SECRET.length),
          }),
        ),
      ),
    );
  });

  maybe(
    'Bearer: realm là app đã đăng nhập — tài khoản khách qua phiên app Partner ⇒ 401',
    async () => {
      const customerId = await mkUser();
      const pair = await native.issueSession(customerId, {}, MOBILE_CLIENT_APP.PARTNER);

      await expectUnauthorized(() =>
        guard.canActivate(contextFor(mkRequest({ authorization: `Bearer ${pair.accessToken}` }))),
      );
    },
  );

  maybe('Bearer của app Partner cho tài khoản partner ⇒ vào được, realm = partner', async () => {
    const partnerId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
    const pair = await native.issueSession(partnerId, {}, MOBILE_CLIENT_APP.PARTNER);
    const request = mkRequest({ authorization: `Bearer ${pair.accessToken}` });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({ realm: ACCOUNT_REALM.PARTNER, transport: 'bearer' });
  });

  maybe(
    'Bearer app Partner đi qua /api của SITE KHÁCH ⇒ 401, kể cả khi tài khoản hợp lệ',
    async () => {
      const partnerId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
      const pair = await native.issueSession(partnerId, {}, MOBILE_CLIENT_APP.PARTNER);

      for (const siteRealm of [ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PLATFORM]) {
        await expectUnauthorized(() =>
          guard.canActivate(
            contextFor(
              mkRequest({ authorization: `Bearer ${pair.accessToken}`, realm: siteRealm }),
            ),
          ),
        );
      }
    },
  );

  maybe('Bearer app khách đi qua /api của site partner ⇒ 401', async () => {
    const customerId = await mkUser();
    const pair = await native.issueSession(customerId, {}, MOBILE_CLIENT_APP.CUSTOMER);

    await expectUnauthorized(() =>
      guard.canActivate(
        contextFor(
          mkRequest({ authorization: `Bearer ${pair.accessToken}`, realm: ACCOUNT_REALM.PARTNER }),
        ),
      ),
    );
  });

  maybe('Bearer đi qua /api của ĐÚNG site của realm phiên ⇒ vào được', async () => {
    const partnerId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
    const pair = await native.issueSession(partnerId, {}, MOBILE_CLIENT_APP.PARTNER);
    const request = mkRequest({
      authorization: `Bearer ${pair.accessToken}`,
      realm: ACCOUNT_REALM.PARTNER,
    });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.realm).toBe(ACCOUNT_REALM.PARTNER);
  });

  maybe(
    'header realm tự khai không có khoá proxy KHÔNG chặn được Bearer hợp lệ (host API native)',
    async () => {
      const partnerId = await mkUser(USER_STATUS.ACTIVE, ACCOUNT_REALM.PARTNER);
      const pair = await native.issueSession(partnerId, {}, MOBILE_CLIENT_APP.PARTNER);
      const request = mkRequest({
        authorization: `Bearer ${pair.accessToken}`,
        realm: ACCOUNT_REALM.CUSTOMER,
        proxySecret: null,
      });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user).toMatchObject({ realm: ACCOUNT_REALM.PARTNER, transport: 'bearer' });
    },
  );
});
