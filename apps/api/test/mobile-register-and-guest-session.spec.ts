import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { API_ERROR_CODE } from '@xeprime/types';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuthService } from '../src/modules/auth/auth.service';
import { NativeSessionService } from '../src/modules/auth/native-session.service';
import { SessionService } from '../src/modules/auth/session.service';
import { NativeAuthCodeService } from '../src/modules/auth/social/native-auth-code.service';
import { MobileAuthController } from '../src/modules/auth/mobile-auth.controller';
import { PublicBookingRequestsController } from '../src/modules/booking-requests/public-booking-requests.controller';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Hai đường CUỐI CÙNG của luồng auth còn chỉ trả cookie — nay có bản native (ADR 0017, ADR 0019 §8).
 *
 * Cả hai đều là "cấp phiên kèm theo một hành động khác", nên chúng dễ bị bỏ sót khi rà: một cái
 * nằm ở đăng ký, cái kia nằm trong receipt của `POST /public/booking-requests` (khách vãng lai
 * đặt xe). Bỏ sót nghĩa là app gọi thành công, nhận 201, mà người dùng vẫn chưa đăng nhập —
 * hỏng im lặng, không có lỗi nào để lần.
 *
 * Khẳng định QUAN TRỌNG NHẤT ở đây là `set-cookie` phải VẮNG MẶT: một cookie gửi cho app native
 * là một phiên rơi vào hư không.
 */
const TOKENS = {
  accessToken: 'acc',
  accessTokenExpiresIn: 900,
  refreshToken: 'ref',
  refreshTokenExpiresAt: new Date('2026-10-25T00:00:00.000Z'),
  sessionId: 'S1',
};

const USER = { id: 'U1', displayName: 'Khách A', phone: '84901234567' };

describe('Đăng ký + đặt xe cho app native — luôn trả token, không bao giờ trả cookie', () => {
  let app: INestApplication;

  const auth = { register: jest.fn(), me: jest.fn(), loginWithPassword: jest.fn() };
  const nativeSessions = { issueSession: jest.fn() };
  const sessions = { issue: jest.fn(), attach: jest.fn(), cookieName: 'xp_session' };
  const requests = { submitPublic: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MobileAuthController, PublicBookingRequestsController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: NativeSessionService, useValue: nativeSessions },
        { provide: SessionService, useValue: sessions },
        { provide: NativeAuthCodeService, useValue: { issue: jest.fn(), consume: jest.fn() } },
        { provide: BookingRequestsService, useValue: requests },
        { provide: PrismaService, useValue: { user: { findFirst: jest.fn() } } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter(false));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auth.register.mockResolvedValue({ userId: USER.id });
    auth.me.mockResolvedValue(USER);
    nativeSessions.issueSession.mockResolvedValue(TOKENS);
    sessions.issue.mockReturnValue({ token: 'jwt' });
  });

  describe('POST /auth/mobile/register', () => {
    const BODY = { displayName: 'Khách A', phone: '0901234567', password: 'matkhau123' };

    it('trả 201 kèm cặp token + user, KHÔNG đặt cookie', async () => {
      const res = await request(app.getHttpServer()).post('/auth/mobile/register').send(BODY);

      expect(res.status).toBe(201);
      expect(res.body.tokens.accessToken).toBe('acc');
      expect(res.body.tokens.refreshTokenExpiresAt).toBe('2026-10-25T00:00:00.000Z');
      expect(res.body.user.id).toBe(USER.id);

      expect(res.headers['set-cookie']).toBeUndefined();
      expect(sessions.attach).not.toHaveBeenCalled();
    });

    it('dùng CHUNG `AuthService.register` với web — luật mật khẩu chỉ có một bản', async () => {
      await request(app.getHttpServer()).post('/auth/mobile/register').send(BODY);
      expect(auth.register).toHaveBeenCalledWith(expect.objectContaining(BODY));
    });

    it('mật khẩu yếu bị từ chối y như web (kế thừa RegisterDto)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({ ...BODY, password: 'khongcoso' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(API_ERROR_CODE.VALIDATION_FAILED);
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('SĐT sai định dạng bị từ chối', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({ ...BODY, phone: '12345' });

      expect(res.status).toBe(400);
      expect(auth.register).not.toHaveBeenCalled();
    });

    it('gửi kèm `device` thì phiên nhớ tên máy', async () => {
      await request(app.getHttpServer())
        .post('/auth/mobile/register')
        .send({ ...BODY, device: { deviceName: 'Pixel 8', devicePlatform: 'android' } });

      expect(nativeSessions.issueSession).toHaveBeenCalledWith(USER.id, {
        deviceName: 'Pixel 8',
        devicePlatform: 'android',
      });
    });
  });

  describe('POST /public/booking-requests — khách vãng lai được tự đăng nhập', () => {
    const BODY = {
      vehicleId: 'V'.repeat(26),
      customerName: 'Khách A',
      customerPhone: '0901234567',
      serviceType: 'self_drive',
      pickupAt: '2026-09-01T03:00:00.000Z',
      returnAt: '2026-09-03T03:00:00.000Z',
      pickupPreference: 'at_branch',
    };

    beforeEach(() => {
      requests.submitPublic.mockResolvedValue({
        receipt: { id: 'R1', status: 'pending_host_approval', authenticated: true },
        loginUserId: USER.id,
      });
    });

    it('`client: native` thì token nằm trong receipt.session, KHÔNG cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/booking-requests')
        .send({ ...BODY, client: 'native', device: { deviceName: 'iPhone 15' } });

      expect(res.status).toBe(201);
      expect(res.body.session.tokens.accessToken).toBe('acc');
      expect(res.body.session.user.id).toBe(USER.id);

      // Hai khẳng định quan trọng nhất của cả file.
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(sessions.attach).not.toHaveBeenCalled();

      expect(nativeSessions.issueSession).toHaveBeenCalledWith(USER.id, {
        deviceName: 'iPhone 15',
      });
    });

    it('WEB không đổi một byte nào: vẫn cookie, và `session` vắng mặt', async () => {
      const res = await request(app.getHttpServer()).post('/public/booking-requests').send(BODY);

      expect(res.status).toBe(201);
      expect(res.body.session).toBeUndefined();
      expect(sessions.attach).toHaveBeenCalledTimes(1);
      expect(nativeSessions.issueSession).not.toHaveBeenCalled();
    });

    it('khách ĐÃ đăng nhập sẵn thì không cấp phiên mới ở cả hai nền tảng', async () => {
      requests.submitPublic.mockResolvedValue({
        receipt: { id: 'R1', status: 'pending_host_approval', authenticated: true },
        loginUserId: null,
      });

      const res = await request(app.getHttpServer())
        .post('/public/booking-requests')
        .send({ ...BODY, client: 'native' });

      expect(res.status).toBe(201);
      expect(res.body.session).toBeUndefined();
      expect(nativeSessions.issueSession).not.toHaveBeenCalled();
      expect(sessions.attach).not.toHaveBeenCalled();
    });

    it('`client` lạ bị từ chối thay vì âm thầm rơi về web', async () => {
      const res = await request(app.getHttpServer())
        .post('/public/booking-requests')
        .send({ ...BODY, client: 'desktop' });

      expect(res.status).toBe(400);
      expect(requests.submitPublic).not.toHaveBeenCalled();
    });
  });
});
