import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE_NAME_DEFAULT, resolveSessionCookieName } from '@xeprime/types';
import type { CookieOptions, Response } from 'express';
import { validateEnv } from '../src/config/env.schema';
import { SessionService } from '../src/modules/auth/session.service';

/**
 * Ma trận cookie / CORS / môi trường — unit thuần, không đụng DB.
 *
 * Vì sao các test này tồn tại: mọi mục ở đây từng là (hoặc vẫn là) một cấu hình "chạy tốt ở
 * localhost, hỏng hoặc mất an toàn ở production". Chúng không tự lộ ra lúc dev, nên phải có
 * test khoá lại.
 */

/** Bộ env tối thiểu hợp lệ; từng test chỉ ghi đè đúng thứ nó nói về. */
function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/xeprime?schema=public',
    SESSION_JWT_SECRET: 'x'.repeat(48),
    ...overrides,
  };
}

/** Bộ env production đầy đủ — dùng làm mốc "hợp lệ" để mỗi test bẻ đúng một biến. */
function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return baseEnv({
    NODE_ENV: 'production',
    SESSION_COOKIE_SECURE: 'true',
    SESSION_JWT_SECRET: 'p'.repeat(48),
    OTP_PEPPER: 'production-pepper-value-0001',
    CORS_ORIGINS: 'https://xeprime.vn,https://www.xeprime.vn',
    APP_WEB_URL: 'https://xeprime.vn',
    API_PUBLIC_URL: 'https://api.xeprime.vn',
    FIREBASE_PROJECT_ID: 'p',
    FIREBASE_CLIENT_EMAIL: 'p@p.iam.gserviceaccount.com',
    FIREBASE_PRIVATE_KEY: 'k',
    OTP_MODE: 'esms',
    ESMS_API_KEY: 'k',
    ESMS_SECRET_KEY: 's',
    ESMS_BRANDNAME: 'XePrime',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'u',
    SMTP_PASS: 'p',
    R2_ACCOUNT_ID: 'a',
    R2_ACCESS_KEY_ID: 'a',
    R2_SECRET_ACCESS_KEY: 's',
    R2_BUCKET: 'xeprime-public',
    R2_ENDPOINT: 'https://a.r2.cloudflarestorage.com',
    R2_PUBLIC_BASE_URL: 'https://cdn.xeprime.vn',
    R2_PRIVATE_BUCKET: 'xeprime-private',
    ...overrides,
  });
}

/** Thông điệp lỗi gộp của mọi issue — đủ để khẳng định "biến X bị chặn". */
function validationError(env: Record<string, string>): string {
  try {
    validateEnv(env);
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe('env: mặc định dev vẫn chạy được', () => {
  it('bộ env tối thiểu là hợp lệ và CORS mặc định là localhost', () => {
    const env = validateEnv(baseEnv());
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.SESSION_COOKIE_SECURE).toBe(false);
    // Không provider mạng xã hội nào bắt buộc — nút Google/Facebook trả SOCIAL_NOT_CONFIGURED,
    // ba đường đăng nhập còn lại vẫn chạy (ADR 0019).
    expect(env.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
  });

  it('CORS_ORIGINS tách theo dấu phẩy và bỏ khoảng trắng — origin LAN dùng được', () => {
    const env = validateEnv(
      baseEnv({ CORS_ORIGINS: 'http://localhost:3000, http://192.168.1.210:3000 ' }),
    );
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://192.168.1.210:3000']);
  });

  it('production hợp lệ đầy đủ thì KHÔNG lỗi (mốc so sánh của các test dưới)', () => {
    expect(() => validateEnv(productionEnv())).not.toThrow();
  });
});

describe('env: cửa chặn production', () => {
  it('chặn cookie phiên không Secure', () => {
    expect(validationError(productionEnv({ SESSION_COOKIE_SECURE: 'false' }))).toContain(
      'SESSION_COOKIE_SECURE',
    );
  });

  it('chặn secret/pepper còn giá trị mẫu', () => {
    expect(
      validationError(productionEnv({ SESSION_JWT_SECRET: `change-me-${'0'.repeat(40)}` })),
    ).toContain('SESSION_JWT_SECRET');
    expect(validationError(productionEnv({ OTP_PEPPER: 'xeprime-dev-otp-pepper-change-me' })))
      .toContain('OTP_PEPPER');
  });

  it('chặn API_PUBLIC_URL trỏ localhost — redirect_uri của OAuth dựng từ đây', () => {
    expect(validationError(productionEnv({ API_PUBLIC_URL: 'http://localhost:4000' }))).toContain(
      'API_PUBLIC_URL',
    );
  });

  it('chặn OTP_MODE=mock — mã OTP chỉ nằm trong log, không có SMS nào được gửi', () => {
    expect(validationError(productionEnv({ OTP_MODE: 'mock' }))).toContain('OTP_MODE');
  });

  it('chặn thiếu SMTP — link đặt lại mật khẩu (kèm token) sẽ bị ghi ra log', () => {
    const message = validationError(productionEnv({ SMTP_HOST: '' }));
    expect(message).toContain('SMTP_HOST');
    expect(message).toContain('token');
  });

  it('chặn CORS "*" và origin không phải https', () => {
    expect(validationError(productionEnv({ CORS_ORIGINS: '*' }))).toContain('CORS_ORIGINS');
    expect(
      validationError(productionEnv({ CORS_ORIGINS: 'http://xeprime.vn' })),
    ).toContain('CORS_ORIGINS');
  });

  it('chặn APP_WEB_URL trỏ localhost (email đặt lại mật khẩu sẽ vô dụng)', () => {
    expect(validationError(productionEnv({ APP_WEB_URL: 'http://localhost:3000' }))).toContain(
      'APP_WEB_URL',
    );
  });

  it('chặn thiếu cấu hình R2 công khai lẫn bucket riêng tư', () => {
    expect(validationError(productionEnv({ R2_PRIVATE_BUCKET: '' }))).toContain(
      'R2_PRIVATE_BUCKET',
    );
    expect(validationError(productionEnv({ R2_PUBLIC_BASE_URL: '' }))).toContain(
      'R2_PUBLIC_BASE_URL',
    );
  });

  it('chặn bucket riêng tư TRÙNG bucket công khai — ở mọi môi trường', () => {
    expect(
      validationError(productionEnv({ R2_PRIVATE_BUCKET: 'xeprime-public' })),
    ).toContain('R2_PRIVATE_BUCKET');
    // Dev cũng chặn: trùng bucket là tài liệu riêng tư nằm sau URL công khai, không phụ thuộc môi trường.
    expect(
      validationError(baseEnv({ R2_BUCKET: 'same-bucket', R2_PRIVATE_BUCKET: 'same-bucket' })),
    ).toContain('R2_PRIVATE_BUCKET');
  });

  it('thông báo lỗi nêu TÊN biến mà không in giá trị', () => {
    const secret = `change-me-${'9'.repeat(40)}`;
    const message = validationError(productionEnv({ SESSION_JWT_SECRET: secret }));
    expect(message).toContain('SESSION_JWT_SECRET');
    expect(message).not.toContain(secret);
  });
});

/**
 * ADR 0019. Không provider nào bắt buộc — nhưng khai NỬA cặp thì luôn là gõ thiếu, và nó phải
 * gãy lúc boot chứ không thành "nút Google im lặng không hoạt động".
 */
describe('env: cặp client id/secret của đăng nhập mạng xã hội', () => {
  it('bỏ trống cả hai là hợp lệ ở mọi môi trường — provider chỉ đơn giản là tắt', () => {
    expect(() => validateEnv(baseEnv())).not.toThrow();
    expect(() => validateEnv(productionEnv())).not.toThrow();
  });

  it('khai đủ cặp là hợp lệ', () => {
    expect(() =>
      validateEnv(
        baseEnv({ GOOGLE_OAUTH_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_OAUTH_CLIENT_SECRET: 's' }),
      ),
    ).not.toThrow();
  });

  it('chặn khai nửa cặp — cả hai chiều, cả hai provider', () => {
    expect(validationError(baseEnv({ GOOGLE_OAUTH_CLIENT_ID: 'id' }))).toContain(
      'GOOGLE_OAUTH_CLIENT_SECRET',
    );
    expect(validationError(baseEnv({ GOOGLE_OAUTH_CLIENT_SECRET: 's' }))).toContain(
      'GOOGLE_OAUTH_CLIENT_ID',
    );
    expect(validationError(baseEnv({ FACEBOOK_APP_ID: 'id' }))).toContain('FACEBOOK_APP_SECRET');
    expect(validationError(baseEnv({ FACEBOOK_APP_SECRET: 's' }))).toContain('FACEBOOK_APP_ID');
  });
});

describe('tên cookie phiên: một nguồn duy nhất', () => {
  it('default của env schema đúng bằng hằng số dùng chung', () => {
    expect(validateEnv(baseEnv()).SESSION_COOKIE_NAME).toBe(SESSION_COOKIE_NAME_DEFAULT);
  });

  it('web proxy và API cùng một công thức: env đè lên default', () => {
    expect(resolveSessionCookieName({})).toBe(SESSION_COOKIE_NAME_DEFAULT);
    expect(resolveSessionCookieName({ SESSION_COOKIE_NAME: '  ' })).toBe(
      SESSION_COOKIE_NAME_DEFAULT,
    );
    expect(resolveSessionCookieName({ SESSION_COOKIE_NAME: 'xp_session_stg' })).toBe(
      'xp_session_stg',
    );
    expect(validateEnv(baseEnv({ SESSION_COOKIE_NAME: 'xp_session_stg' })).SESSION_COOKIE_NAME).toBe(
      resolveSessionCookieName({ SESSION_COOKIE_NAME: 'xp_session_stg' }),
    );
  });

  it('proxy.ts KHÔNG gõ thẳng tên cookie', () => {
    // Đọc source thay vì import: proxy chạy ở Edge runtime, không nạp được trong jest node.
    const source = readFileSync(resolve(__dirname, '../../web/src/proxy.ts'), 'utf8');
    expect(source).toContain('resolveSessionCookieName');
    expect(source).not.toMatch(/['"`]xp_session['"`]/);
  });
});

describe('SessionService: cookie gắn và xoá phải cùng thuộc tính', () => {
  /** ConfigService giả — chỉ trả những khoá SessionService thực sự đọc. */
  function serviceWith(values: Record<string, unknown>): SessionService {
    const config = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => {
        if (!(key in values)) throw new Error(`thiếu ${key}`);
        return values[key];
      },
    } as unknown as ConfigService;
    return new SessionService(config);
  }

  const PROD_VALUES = {
    SESSION_JWT_SECRET: 'p'.repeat(48),
    SESSION_TTL_DAYS: 7,
    SESSION_COOKIE_NAME: SESSION_COOKIE_NAME_DEFAULT,
    SESSION_COOKIE_SECURE: true,
    SESSION_COOKIE_DOMAIN: '.xeprime.vn',
  };

  /** Bắt lại đối số của res.cookie / res.clearCookie. */
  function fakeResponse(): {
    res: Response;
    set: { name?: string; options?: CookieOptions };
    cleared: { name?: string; options?: CookieOptions };
  } {
    const set: { name?: string; options?: CookieOptions } = {};
    const cleared: { name?: string; options?: CookieOptions } = {};
    const res = {
      cookie: (name: string, _value: string, options: CookieOptions) => {
        set.name = name;
        set.options = options;
      },
      clearCookie: (name: string, options: CookieOptions) => {
        cleared.name = name;
        cleared.options = options;
      },
    } as unknown as Response;
    return { res, set, cleared };
  }

  it('production: httpOnly + secure + sameSite lax + domain cấu hình', () => {
    const { res, set } = fakeResponse();
    serviceWith(PROD_VALUES).attach(res, 'token');

    expect(set.name).toBe(SESSION_COOKIE_NAME_DEFAULT);
    expect(set.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      domain: '.xeprime.vn',
    });
  });

  it('localhost/LAN: cookie host-only (không domain) và secure=false', () => {
    const { res, set } = fakeResponse();
    serviceWith({ ...PROD_VALUES, SESSION_COOKIE_SECURE: false, SESSION_COOKIE_DOMAIN: '' }).attach(
      res,
      'token',
    );

    expect(set.options?.secure).toBe(false);
    // Không có `domain` nghĩa là host-only: mở web bằng localhost và bằng 192.168.x.x là HAI
    // cookie khác nhau — đúng như tài liệu, và là lý do không được trộn hai host.
    expect(set.options).not.toHaveProperty('domain');
  });

  it('clear dùng ĐÚNG bộ thuộc tính của attach (trừ maxAge) — khác một thuộc tính là cookie không bị xoá', () => {
    const { res, set, cleared } = fakeResponse();
    const service = serviceWith(PROD_VALUES);
    service.attach(res, 'token');
    service.clear(res);

    expect(cleared.name).toBe(set.name);
    const { maxAge, ...attachedWithoutMaxAge } = set.options as CookieOptions;
    expect(maxAge).toBeGreaterThan(0);
    expect(cleared.options).toEqual(attachedWithoutMaxAge);
    expect(cleared.options).not.toHaveProperty('maxAge');
  });
});
