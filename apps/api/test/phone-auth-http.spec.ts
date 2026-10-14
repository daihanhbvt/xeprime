import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ACCOUNT_REALM,
  ACCOUNT_REALM_HEADER,
  API_ERROR_CODE,
  MOBILE_CLIENT_APP,
  PHONE_VERIFICATION_PURPOSE,
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
import { MobileAuthController } from '../src/modules/auth/mobile-auth.controller';
import { NativeSessionService } from '../src/modules/auth/native-session.service';
import {
  REALM_PROXY_SECRET_HEADER,
  RequestRealmService,
} from '../src/modules/auth/request-realm.service';
import { SessionService } from '../src/modules/auth/session.service';
import { AppleIdentityVerifier } from '../src/modules/auth/social/apple-identity.verifier';
import { NativeAuthCodeService } from '../src/modules/auth/social/native-auth-code.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { PublicBookingRequestsController } from '../src/modules/booking-requests/public-booking-requests.controller';
import { MobilePhoneAuthController } from '../src/modules/phone-verification/mobile-phone-auth.controller';
import { PhoneVerificationController } from '../src/modules/phone-verification/phone-verification.controller';
import { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * CỬA VÀO tài khoản qua HTTP thật — ADR 0060 (controller + guard thật, service giả).
 *
 * Luật nằm ở service đã có spec riêng trên Postgres thật (`phone-login.spec.ts`). Ở đây khoá
 * những thứ CHỈ tầng HTTP nói được:
 *  1. Đăng ký (web + app) không đi qua được nếu thiếu mã OTP — chặn ở mép vào, trước service.
 *  2. Hai route đăng nhập OTP cũ trả 410 `OTP_LOGIN_RETIRED` và KHÔNG phát cookie/token, kể cả
 *     khi body mang một mã "đúng".
 *  3. Quên mật khẩu bằng OTP KHÔNG phát phiên, và không mở cho site quản trị.
 *  4. Gửi yêu cầu thuê cần PHIÊN KHÁCH: không phiên ⇒ 401, phiên partner ⇒ 403, không route nào
 *     ở đây còn cấp phiên cho khách vãng lai.
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

const USERS: Record<string, { realm: AccountRealm }> = {
  U_CUSTOMER: { realm: ACCOUNT_REALM.CUSTOMER },
  U_PARTNER: { realm: ACCOUNT_REALM.PARTNER },
};

const site = (realm: AccountRealm) => ({
  [ACCOUNT_REALM_HEADER]: realm,
  [REALM_PROXY_SECRET_HEADER]: PROXY_SECRET,
});

const TOKENS = {
  accessToken: 'acc',
  accessTokenExpiresIn: 900,
  refreshToken: 'ref',
  refreshTokenExpiresAt: new Date('2026-10-25T00:00:00.000Z'),
  sessionId: 'S1',
};

describe('Cửa vào tài khoản qua HTTP (ADR 0060)', () => {
  let app: INestApplication;
  let sessions: SessionService;

  const auth = {
    register: jest.fn(async () => ({ userId: 'U_CUSTOMER' })),
    loginWithPassword: jest.fn(),
    resetPasswordWithOtp: jest.fn(async () => undefined),
    otpDeliveryFor: jest.fn(async () => ({ deliver: true })),
    me: jest.fn(async (userId: string) => ({ id: userId, realm: USERS[userId]?.realm })),
  };
  const phoneVerification = {
    sendOtp: jest.fn(async () => ({
      expiresAt: new Date('2026-10-14T00:05:00.000Z'),
      devCode: null,
    })),
    verifyOtp: jest.fn(),
    testCodeEnabled: () => false,
  };
  const nativeSessions = { issueSession: jest.fn(async () => TOKENS) };
  const requests = {
    submitPublic: jest.fn(async () => ({
      id: 'R1',
      status: 'pending_host_approval',
      authenticated: true,
      autoAccepted: false,
      bookingId: null,
    })),
    checkPublicAvailability: jest.fn(async () => ({ available: true })),
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
              phoneVerifiedAt: new Date(),
              status: USER_STATUS.ACTIVE,
            }
          : null;
      }),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        MobileAuthController,
        PhoneVerificationController,
        MobilePhoneAuthController,
        PublicBookingRequestsController,
      ],
      providers: [
        { provide: ConfigService, useValue: config },
        { provide: AuthService, useValue: auth },
        { provide: PhoneVerificationService, useValue: phoneVerification },
        { provide: NativeSessionService, useValue: nativeSessions },
        { provide: NativeAuthCodeService, useValue: { issue: jest.fn(), consume: jest.fn() } },
        { provide: AppleIdentityVerifier, useValue: { verify: jest.fn() } },
        { provide: BookingRequestsService, useValue: requests },
        { provide: PrismaService, useValue: prisma },
        SessionService,
        RequestRealmService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RealmGuard },
      ],
    }).compile();

    sessions = moduleRef.get(SessionService);
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

  const http = () => request(app.getHttpServer());
  const cookieOf = (userId: string, realm: AccountRealm) =>
    `${sessions.cookieName(realm)}=${sessions.issue(userId).token}`;

  describe('Đăng ký bắt mã OTP', () => {
    const BODY = { displayName: 'Khách A', phone: '0901234567', password: 'matkhau123' };

    it('web: thiếu `code` ⇒ 400, service không được gọi, không cookie', async () => {
      const res = await http().post('/auth/register').set(site(ACCOUNT_REALM.CUSTOMER)).send(BODY);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(API_ERROR_CODE.VALIDATION_FAILED);
      expect(auth.register).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('web: có mã ⇒ AuthService đối chiếu mã TRONG realm của site, cookie của site đó', async () => {
      const res = await http()
        .post('/auth/register')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ ...BODY, code: '123456' });
      expect(res.status).toBe(201);
      expect(auth.register).toHaveBeenCalledWith(
        expect.objectContaining({ ...BODY, code: '123456' }),
        ACCOUNT_REALM.CUSTOMER,
      );
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0];
      expect(cookie).toMatch(/^xp_session_customer=/);
    });

    it('mã không phải 6 chữ số ⇒ 400', async () => {
      const res = await http()
        .post('/auth/register')
        .set(site(ACCOUNT_REALM.PARTNER))
        .send({ ...BODY, code: '12ab' });
      expect(res.status).toBe(400);
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('app: thiếu `code` ⇒ 400 (bản app chưa cập nhật không tạo được tài khoản chưa xác minh)', async () => {
      const res = await http().post('/auth/mobile/register').send(BODY);
      expect(res.status).toBe(400);
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('app Partner: có mã ⇒ tài khoản ĐỐI TÁC, cặp token trong body, KHÔNG cookie', async () => {
      const res = await http()
        .post('/auth/mobile/register')
        .send({ ...BODY, code: '123456', clientApp: MOBILE_CLIENT_APP.PARTNER });
      expect(res.status).toBe(201);
      expect(auth.register).toHaveBeenCalledWith(expect.anything(), ACCOUNT_REALM.PARTNER);
      expect(res.body.tokens.accessToken).toBe('acc');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('Đăng nhập bằng OTP đã gỡ', () => {
    it('web: POST /auth/phone/login ⇒ 410 OTP_LOGIN_RETIRED, không cookie, không đối chiếu mã', async () => {
      const res = await http()
        .post('/auth/phone/login')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ phone: '0901234567', code: '123456' });
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe(API_ERROR_CODE.OTP_LOGIN_RETIRED);
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(phoneVerification.verifyOtp).not.toHaveBeenCalled();
    });

    it('app: POST /auth/mobile/phone/login ⇒ 410, không token', async () => {
      const res = await http()
        .post('/auth/mobile/phone/login')
        .send({ phone: '0901234567', code: '123456', clientApp: MOBILE_CLIENT_APP.CUSTOMER });
      expect(res.status).toBe(410);
      expect(res.body.error.code).toBe(API_ERROR_CODE.OTP_LOGIN_RETIRED);
      expect(res.body.tokens).toBeUndefined();
      expect(nativeSessions.issueSession).not.toHaveBeenCalled();
    });

    it('send-otp hỏi luật của AUTH trước, và chuyển `deliver` xuống service OTP', async () => {
      auth.otpDeliveryFor.mockResolvedValueOnce({ deliver: false });
      const res = await http()
        .post('/auth/phone/send-otp')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ phone: '0901234567', purpose: PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET });
      expect(res.status).toBe(200);
      expect(auth.otpDeliveryFor).toHaveBeenCalledWith(
        PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET,
        '0901234567',
        ACCOUNT_REALM.CUSTOMER,
      );
      expect(phoneVerification.sendOtp).toHaveBeenCalledWith(
        '0901234567',
        PHONE_VERIFICATION_PURPOSE.PASSWORD_RESET,
        ACCOUNT_REALM.CUSTOMER,
        { deliver: false },
      );
    });
  });

  describe('Quên mật khẩu bằng OTP', () => {
    const BODY = { phone: '0901234567', code: '123456', password: 'matkhaumoi1' };

    it('site partner: đổi mật khẩu trong realm partner, 204, KHÔNG phát phiên', async () => {
      const res = await http()
        .post('/auth/password/reset-otp')
        .set(site(ACCOUNT_REALM.PARTNER))
        .send(BODY);
      expect(res.status).toBe(204);
      expect(auth.resetPasswordWithOtp).toHaveBeenCalledWith(
        BODY.phone,
        BODY.code,
        BODY.password,
        ACCOUNT_REALM.PARTNER,
      );
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('site có realm thì `clientApp` trong body bị bỏ qua — realm do proxy quyết', async () => {
      await http()
        .post('/auth/password/reset-otp')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ ...BODY, clientApp: MOBILE_CLIENT_APP.PARTNER });
      expect(auth.resetPasswordWithOtp).toHaveBeenCalledWith(
        BODY.phone,
        BODY.code,
        BODY.password,
        ACCOUNT_REALM.CUSTOMER,
      );
    });

    it('app (không qua site): realm theo `clientApp`', async () => {
      const res = await http()
        .post('/auth/password/reset-otp')
        .send({ ...BODY, clientApp: MOBILE_CLIENT_APP.PARTNER });
      expect(res.status).toBe(204);
      expect(auth.resetPasswordWithOtp).toHaveBeenCalledWith(
        BODY.phone,
        BODY.code,
        BODY.password,
        ACCOUNT_REALM.PARTNER,
      );
    });

    it('site quản trị ⇒ 403 REALM_NOT_ALLOWED (tài khoản platform đặt lại qua email)', async () => {
      const res = await http()
        .post('/auth/password/reset-otp')
        .set(site(ACCOUNT_REALM.PLATFORM))
        .send(BODY);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.REALM_NOT_ALLOWED);
      expect(auth.resetPasswordWithOtp).not.toHaveBeenCalled();
    });

    it('mật khẩu yếu ⇒ 400 trước khi đụng mã', async () => {
      const res = await http()
        .post('/auth/password/reset-otp')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ ...BODY, password: 'khongcoso' });
      expect(res.status).toBe(400);
      expect(auth.resetPasswordWithOtp).not.toHaveBeenCalled();
    });
  });

  describe('Gửi yêu cầu thuê cần phiên KHÁCH', () => {
    const BODY = {
      vehicleId: 'V'.repeat(26),
      serviceType: 'self_drive',
      pickupAt: '2026-11-01T03:00:00.000Z',
      returnAt: '2026-11-03T03:00:00.000Z',
    };

    it('chưa đăng nhập ⇒ 401, không có yêu cầu nào, không phiên nào được cấp', async () => {
      const res = await http()
        .post('/public/booking-requests')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ ...BODY, customerName: 'Khách', customerPhone: '0901234567' });
      expect(res.status).toBe(401);
      expect(requests.submitPublic).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('phiên khách ⇒ 201, danh tính là người của PHIÊN', async () => {
      const res = await http()
        .post('/public/booking-requests')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .set('Cookie', cookieOf('U_CUSTOMER', ACCOUNT_REALM.CUSTOMER))
        .send(BODY);
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('R1');
      expect(res.body.session).toBeUndefined();
      expect(requests.submitPublic).toHaveBeenCalledWith(
        expect.objectContaining({ vehicleId: BODY.vehicleId }),
        'U_CUSTOMER',
      );
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('bản app cũ còn gửi liên hệ/`client`/`device` vẫn qua được (trường bị bỏ qua, không 400)', async () => {
      const res = await http()
        .post('/public/booking-requests')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .set('Cookie', cookieOf('U_CUSTOMER', ACCOUNT_REALM.CUSTOMER))
        .send({
          ...BODY,
          customerName: 'Tên tự khai',
          customerPhone: '0909999999',
          client: 'native',
          device: { deviceName: 'iPhone' },
        });
      expect(res.status).toBe(201);
      expect(nativeSessions.issueSession).not.toHaveBeenCalled();
    });

    it('phiên partner gọi qua site partner ⇒ 403 REALM_NOT_ALLOWED', async () => {
      const res = await http()
        .post('/public/booking-requests')
        .set(site(ACCOUNT_REALM.PARTNER))
        .set('Cookie', cookieOf('U_PARTNER', ACCOUNT_REALM.PARTNER))
        .send(BODY);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(API_ERROR_CODE.REALM_NOT_ALLOWED);
      expect(requests.submitPublic).not.toHaveBeenCalled();
    });

    it('kiểm khung giờ vẫn công khai — khách chưa đăng nhập kiểm được trước khi được mời đăng nhập', async () => {
      const res = await http()
        .post('/public/booking-requests/check-availability')
        .set(site(ACCOUNT_REALM.CUSTOMER))
        .send({ vehicleId: BODY.vehicleId, pickupAt: BODY.pickupAt, returnAt: BODY.returnAt });
      expect(res.status).toBe(200);
      expect(res.body.available).toBe(true);
    });
  });
});
