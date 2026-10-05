import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ACCOUNT_REALM,
  ACCOUNT_REALM_HEADER,
  API_ERROR_CODE,
  USER_STATUS,
  type AccountRealm,
} from '@xeprime/types';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthGuard } from '../src/common/guards/auth.guard';
import { RealmGuard } from '../src/common/guards/realm.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { NativeSessionService } from '../src/modules/auth/native-session.service';
import {
  REALM_PROXY_SECRET_HEADER,
  RequestRealmService,
} from '../src/modules/auth/request-realm.service';
import { SessionService } from '../src/modules/auth/session.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Đăng nhập WEB theo site — ADR 0053 điều 4, qua HTTP thật (controller + guard thật, AuthService giả).
 *
 * Khoá ba điều ở tầng mà người dùng thật chạm vào:
 *  1. Realm của tài khoản đến từ SITE đang gọi (header do proxy gắn kèm khoá) — không có/không qua
 *     khoá thì REALM_UNRESOLVED, không đoán.
 *  2. Cookie phát ra mang tên của realm và HOST-ONLY (không `Domain`).
 *  3. Cookie của site này không mở được phiên ở site khác — kể cả khi gửi kèm tới đúng API.
 */
const PROXY_SECRET = 'proxy-secret-at-least-32-characters-xxxxxx';
const CONFIG: Record<string, unknown> = {
  APP_WEB_URL: 'https://xeprime.vn',
  WEB_PARTNER_URL: 'https://partner.xeprime.vn',
  WEB_ADMIN_URL: 'https://admin.xeprime.vn',
  REALM_PROXY_SECRET: PROXY_SECRET,
  SESSION_JWT_SECRET: 'test-secret-at-least-32-characters-long-xxxx',
  SESSION_COOKIE_NAME: 'xp_session',
  SESSION_COOKIE_SECURE: true,
};
const config = {
  get: (key: string) => CONFIG[key],
  getOrThrow: (key: string) => {
    if (CONFIG[key] === undefined) throw new Error(`missing ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService;

/** Hai tài khoản CÙNG số điện thoại ở hai realm — đúng ca ADR 0053 hứa tách biệt. */
const USERS: Record<string, { realm: AccountRealm }> = {
  U_CUSTOMER: { realm: ACCOUNT_REALM.CUSTOMER },
  U_PARTNER: { realm: ACCOUNT_REALM.PARTNER },
};

const site = (realm: AccountRealm, secret: string | null = PROXY_SECRET) => ({
  [ACCOUNT_REALM_HEADER]: realm,
  ...(secret === null ? {} : { [REALM_PROXY_SECRET_HEADER]: secret }),
});

describe('Đăng nhập web theo site (ADR 0053)', () => {
  let app: INestApplication;

  const auth = {
    loginWithPassword: jest.fn(async (_id: string, _pw: string, realm: AccountRealm) => ({
      userId: realm === ACCOUNT_REALM.PARTNER ? 'U_PARTNER' : 'U_CUSTOMER',
    })),
    me: jest.fn(async (userId: string) => ({ id: userId, realm: USERS[userId]?.realm })),
  };
  const prisma = {
    user: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const found = USERS[where.id];
        return found
          ? {
              id: where.id,
              realm: found.realm,
              displayName: where.id,
              email: null,
              phoneVerifiedAt: null,
              status: USER_STATUS.ACTIVE,
            }
          : null;
      }),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: ConfigService, useValue: config },
        { provide: AuthService, useValue: auth },
        { provide: PrismaService, useValue: prisma },
        { provide: NativeSessionService, useValue: {} },
        SessionService,
        RequestRealmService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RealmGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter(false));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const LOGIN = { identifier: '0901234567', password: 'matkhau123' };

  async function loginOn(realm: AccountRealm): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/login').set(site(realm)).send(LOGIN);
    expect(res.status).toBe(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0];
    if (!cookie) throw new Error('không có Set-Cookie');
    return cookie;
  }

  it('đăng nhập ở site partner: tra tài khoản TRONG realm partner, cookie mang tên realm, host-only', async () => {
    const cookie = await loginOn(ACCOUNT_REALM.PARTNER);

    expect(auth.loginWithPassword).toHaveBeenCalledWith(
      LOGIN.identifier,
      LOGIN.password,
      ACCOUNT_REALM.PARTNER,
    );
    expect(cookie).toMatch(/^xp_session_partner=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('không có header realm, hoặc header không qua khoá proxy ⇒ REALM_UNRESOLVED, không ai được đăng nhập', async () => {
    for (const headers of [
      {},
      site(ACCOUNT_REALM.PARTNER, null),
      site(ACCOUNT_REALM.PARTNER, 'x'),
    ]) {
      const res = await request(app.getHttpServer()).post('/auth/login').set(headers).send(LOGIN);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(API_ERROR_CODE.REALM_UNRESOLVED);
    }
    expect(auth.loginWithPassword).not.toHaveBeenCalled();
  });

  it('cookie của site partner mở được phiên ở site partner…', async () => {
    const cookie = await loginOn(ACCOUNT_REALM.PARTNER);
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set(site(ACCOUNT_REALM.PARTNER))
      .set('Cookie', cookie.split(';')[0]!);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('U_PARTNER');
  });

  it('…nhưng KHÔNG ở site khách hay site quản trị', async () => {
    const cookie = (await loginOn(ACCOUNT_REALM.PARTNER)).split(';')[0]!;
    for (const realm of [ACCOUNT_REALM.CUSTOMER, ACCOUNT_REALM.PLATFORM]) {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set(site(realm))
        .set('Cookie', cookie);
      expect(res.status).toBe(401);
    }
  });

  it('đổi tên cookie bằng tay cũng vô ích: token của tài khoản partner dưới tên cookie khách ⇒ 401', async () => {
    const value = (await loginOn(ACCOUNT_REALM.PARTNER)).split(';')[0]!.split('=')[1]!;
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set(site(ACCOUNT_REALM.CUSTOMER))
      .set('Cookie', `xp_session_customer=${value}`);
    expect(res.status).toBe(401);
  });

  it('đăng xuất ở site khách chỉ xoá cookie của site khách', async () => {
    const res = await request(app.getHttpServer())
      .delete('/auth/session')
      .set(site(ACCOUNT_REALM.CUSTOMER));
    expect(res.status).toBe(204);
    const cleared = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatch(/^xp_session_customer=;/);
  });
});
