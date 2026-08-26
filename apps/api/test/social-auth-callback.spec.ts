import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { API_ERROR_CODE } from '@xeprime/types';
import request from 'supertest';
import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { SocialAuthController } from '../src/modules/auth/social/social-auth.controller';
import { SocialAuthService } from '../src/modules/auth/social/social-auth.service';
import { SessionService } from '../src/modules/auth/session.service';
import { NativeAuthCodeService } from '../src/modules/auth/social/native-auth-code.service';

/**
 * Hai route `/auth/social/*` phải SỐNG SÓT qua `ValidationPipe` toàn cục — ADR 0019.
 *
 * Đây là một lỗi ĐÃ XẢY RA THẬT, và nó không lộ ra ở bất kỳ unit test nào: `bootstrap.ts` cài
 * `ValidationPipe({ forbidNonWhitelisted: true })` ở phạm vi toàn cục, mà pipe toàn cục của
 * NestJS LUÔN chạy — `@UsePipes` ở method chỉ THÊM pipe chứ không thay thế. Bản đầu gắn một DTO
 * vào `@Query()` của chặng callback, nên đúng lúc Google gọi về kèm `iss`, `scope`, `authuser`,
 * `prompt`, người dùng nhận:
 *
 *   {"error":{"code":"VALIDATION_FAILED", … "property iss should not exist" …}}
 *
 * Một trang JSON trắng, ngay giữa luồng đăng nhập.
 *
 * Bộ test này dựng app bằng CHÍNH `createValidationPipe()` của production (không chép cấu hình)
 * và bắn đúng bộ tham số mà Google/Facebook thật sự gửi.
 */
describe('GET /auth/social/:provider/callback — sống sót qua ValidationPipe toàn cục', () => {
  let app: INestApplication;

  const social = {
    begin: jest.fn(),
    complete: jest.fn(),
    resolveNativeContext: jest.fn(),
    nativeRedirect: jest.fn(),
    webRedirect: jest.fn(),
    logFailure: jest.fn(),
  };
  const sessions = { issue: jest.fn(), attach: jest.fn() };
  const nativeCodes = { issue: jest.fn(), consume: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SocialAuthController],
      providers: [
        { provide: SocialAuthService, useValue: social },
        { provide: SessionService, useValue: sessions },
        { provide: NativeAuthCodeService, useValue: nativeCodes },
      ],
    })
      // Guard toàn cục không có ở đây; hai route đều `@Public()` nên không ảnh hưởng kết quả.
      .compile();

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
    social.webRedirect.mockReturnValue('https://xeprime.vn/');
    social.resolveNativeContext.mockReturnValue(null);
    sessions.issue.mockReturnValue({ token: 'jwt' });
  });

  it('KHÔNG 400 khi Google gắn thêm iss/scope/authuser/prompt', async () => {
    social.complete.mockResolvedValue({
      ok: true,
      userId: 'U1',
      redirectNext: '/xe/01H',
      native: null,
    });

    const res = await request(app.getHttpServer())
      .get('/auth/social/google/callback')
      .query({
        state: 'st',
        code: 'c',
        // Bốn tham số dưới đây do GOOGLE tự gắn, không phải XePrime.
        iss: 'https://accounts.google.com',
        scope: 'email profile openid',
        authuser: '0',
        prompt: 'consent',
      });

    expect(res.status).toBe(302);
    expect(social.complete).toHaveBeenCalledWith({
      provider: 'google',
      code: 'c',
      state: 'st',
    });
  });

  it('KHÔNG 400 khi Facebook gắn thêm error_reason/error_description lúc người dùng huỷ', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/social/facebook/callback')
      .query({
        error: 'access_denied',
        error_code: '200',
        error_reason: 'user_denied',
        error_description: 'Permissions error.',
      });

    expect(res.status).toBe(302);
    expect(social.webRedirect).toHaveBeenCalledWith(null, API_ERROR_CODE.SOCIAL_CANCELLED);
    expect(social.complete).not.toHaveBeenCalled();
  });

  it('bước BẮT ĐẦU cũng không 400 vì tham số lạ — nó là một lần điều hướng, không phải XHR', async () => {
    social.begin.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');

    const res = await request(app.getHttpServer())
      .get('/auth/social/google')
      .query({ next: '/trips', locale: 'en', utm_source: 'zalo' });

    expect(res.status).toBe(302);
    expect(social.begin).toHaveBeenCalledWith({
      provider: 'google',
      next: '/trips',
      locale: 'en',
    });
  });

  it('thiếu code/state thì redirect kèm SOCIAL_STATE_INVALID, không phải JSON lỗi', async () => {
    const res = await request(app.getHttpServer()).get('/auth/social/google/callback');

    expect(res.status).toBe(302);
    expect(res.headers['content-type']).not.toMatch(/json/);
    expect(social.webRedirect).toHaveBeenCalledWith(null, API_ERROR_CODE.SOCIAL_STATE_INVALID);
  });

  it('provider lạ trong đường dẫn cũng ra 302, không phải 404/500', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/social/tiktok/callback')
      .query({ code: 'c', state: 'st' });

    expect(res.status).toBe(302);
    expect(social.webRedirect).toHaveBeenCalledWith(null, API_ERROR_CODE.SOCIAL_STATE_INVALID);
  });
});

/**
 * Nhánh APP NATIVE — ADR 0019 + 0017.
 *
 * Đây là chỗ hai nền tảng rẽ đôi, và khoá lại vì một lý do rất cụ thể: nếu callback lỡ đặt cookie
 * cho app native thì app **không nhận được gì** (nó không có cookie jar), và luồng đăng nhập hỏng
 * im lặng — trình duyệt hệ thống đóng lại, app đứng yên, không có lỗi nào để đọc.
 */
describe('GET /auth/social/:provider/callback — nhánh app native', () => {
  let app: INestApplication;

  const social = {
    begin: jest.fn(),
    complete: jest.fn(),
    resolveNativeContext: jest.fn(),
    nativeRedirect: jest.fn(),
    webRedirect: jest.fn(),
    logFailure: jest.fn(),
  };
  const sessions = { issue: jest.fn(), attach: jest.fn() };
  const nativeCodes = { issue: jest.fn(), consume: jest.fn() };

  const NATIVE = { redirectUri: 'xeprime://auth/callback', codeChallenge: 'x'.repeat(43) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SocialAuthController],
      providers: [
        { provide: SocialAuthService, useValue: social },
        { provide: SessionService, useValue: sessions },
        { provide: NativeAuthCodeService, useValue: nativeCodes },
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
    social.webRedirect.mockReturnValue('https://xeprime.vn/');
    social.nativeRedirect.mockImplementation(
      (_target: unknown, params: { code?: string; error?: string }) =>
        `xeprime://auth/callback?${params.code ? `code=${params.code}` : `error=${params.error}`}`,
    );
    nativeCodes.issue.mockResolvedValue('one-time-code');
    sessions.issue.mockReturnValue({ token: 'jwt' });
  });

  it('phát one-time code về deep link và KHÔNG đặt cookie', async () => {
    social.complete.mockResolvedValue({
      ok: true,
      userId: 'U1',
      redirectNext: null,
      native: NATIVE,
    });

    const res = await request(app.getHttpServer())
      .get('/auth/social/google/callback')
      .query({ code: 'c', state: 'st' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('xeprime://auth/callback?code=one-time-code');
    expect(nativeCodes.issue).toHaveBeenCalledWith({
      userId: 'U1',
      codeChallenge: NATIVE.codeChallenge,
    });

    // Hai khẳng định QUAN TRỌNG NHẤT của cả bộ test này.
    expect(sessions.attach).not.toHaveBeenCalled();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('hỏng thì lỗi cũng về deep link — app không bị treo ở trình duyệt', async () => {
    social.complete.mockResolvedValue({
      ok: false,
      errorCode: API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      redirectNext: null,
      native: NATIVE,
    });

    const res = await request(app.getHttpServer())
      .get('/auth/social/google/callback')
      .query({ code: 'c', state: 'st' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain(`error=${API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED}`);
    expect(social.webRedirect).not.toHaveBeenCalled();
    expect(nativeCodes.issue).not.toHaveBeenCalled();
  });

  it('truyền client/code_challenge/redirect_uri xuống service ở bước bắt đầu', async () => {
    social.resolveNativeContext.mockReturnValue(NATIVE);
    social.begin.mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');

    const res = await request(app.getHttpServer()).get('/auth/social/google').query({
      client: 'native',
      code_challenge: NATIVE.codeChallenge,
      redirect_uri: NATIVE.redirectUri,
    });

    expect(res.status).toBe(302);
    expect(social.resolveNativeContext).toHaveBeenCalledWith({
      client: 'native',
      codeChallenge: NATIVE.codeChallenge,
      redirectUri: NATIVE.redirectUri,
    });
    expect(social.begin).toHaveBeenCalledWith({
      provider: 'google',
      next: null,
      locale: null,
      native: NATIVE,
    });
  });
});
