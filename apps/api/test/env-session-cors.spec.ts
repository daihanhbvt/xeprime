import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import {
  ACCOUNT_REALM,
  ACCOUNT_REALM_VALUES,
  SESSION_COOKIE_NAME_DEFAULT,
  resolveSessionCookieName,
} from '@xeprime/types';
import type { CookieOptions, Response } from 'express';
import { validateEnv } from '../src/config/env.schema';
import { baseEnv, productionEnv, validationError } from './helpers/env-fixture';
import { SessionService } from '../src/modules/auth/session.service';

/**
 * Ma trận cookie / CORS / môi trường — unit thuần, không đụng DB.
 *
 * Vì sao các test này tồn tại: mọi mục ở đây từng là (hoặc vẫn là) một cấu hình "chạy tốt ở
 * localhost, hỏng hoặc mất an toàn ở production". Chúng không tự lộ ra lúc dev, nên phải có
 * test khoá lại.
 */

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

describe('env: APP_ENV — staging được miễn NĂNG LỰC, KHÔNG được miễn BẢO MẬT', () => {
  /**
   * Bộ env của một máy staging thật: `NODE_ENV=production` (bắt buộc — bundle phải giống thật)
   * nhưng chưa có eSMS, chưa có SMTP, chưa có R2.
   */
  function stagingEnv(overrides: Record<string, string> = {}): Record<string, string> {
    return baseEnv({
      NODE_ENV: 'production',
      APP_ENV: 'staging',
      SESSION_COOKIE_SECURE: 'true',
      SESSION_JWT_SECRET: 's'.repeat(48),
      OTP_PEPPER: 'staging-pepper-value-0001',
      CORS_ORIGINS: 'https://stg.xeprime.vn',
      APP_WEB_URL: 'https://stg.xeprime.vn',
      WEB_PARTNER_URL: 'https://partner-stg.xeprime.vn',
      WEB_ADMIN_URL: 'https://admin-stg.xeprime.vn',
      REALM_PROXY_SECRET: 's'.repeat(40),
      API_PUBLIC_URL: 'https://api-stg.xeprime.vn',
      ...overrides,
    });
  }

  it('staging boot được KHÔNG cần eSMS / SMTP / R2 — đó là cả lý do biến này tồn tại', () => {
    const env = validateEnv(stagingEnv());
    expect(env.APP_ENV).toBe('staging');
    expect(env.OTP_MODE).toBe('mock');
    expect(env.SMTP_HOST).toBeUndefined();
    expect(env.R2_BUCKET).toBeUndefined();
  });

  /*
   * Bốn test dưới là phần QUAN TRỌNG của describe này. Cái bẫy hiển nhiên khi thêm một môi
   * trường "dễ tính hơn" là nới luôn cả nhóm bảo mật — và staging thì cũng nằm trên Internet
   * công khai, cũng phát cookie phiên thật, cũng nhận đăng nhập thật.
   */
  it('staging VẪN bị chặn khi cookie phiên không Secure', () => {
    expect(validationError(stagingEnv({ SESSION_COOKIE_SECURE: 'false' }))).toContain(
      'SESSION_COOKIE_SECURE',
    );
  });

  it('staging VẪN bị chặn khi CORS có origin http hoặc "*"', () => {
    expect(validationError(stagingEnv({ CORS_ORIGINS: 'http://stg.xeprime.vn' }))).toContain(
      'CORS_ORIGINS',
    );
    expect(validationError(stagingEnv({ CORS_ORIGINS: '*' }))).toContain('CORS_ORIGINS');
  });

  it('staging VẪN bị chặn khi URL công khai trỏ localhost', () => {
    expect(validationError(stagingEnv({ API_PUBLIC_URL: 'http://localhost:4000' }))).toContain(
      'API_PUBLIC_URL',
    );
    expect(validationError(stagingEnv({ APP_WEB_URL: 'http://localhost:3000' }))).toContain(
      'APP_WEB_URL',
    );
  });

  it('staging VẪN bị chặn khi realm có thể do client tự khai (ADR 0053)', () => {
    expect(validationError(stagingEnv({ REALM_HEADER_FROM_CLIENT: 'true' }))).toContain(
      'REALM_HEADER_FROM_CLIENT',
    );
    expect(validationError(stagingEnv({ REALM_PROXY_SECRET: '' }))).toContain('REALM_PROXY_SECRET');
  });

  it('staging VẪN bị chặn khi secret còn là giá trị mẫu', () => {
    const err = validationError(
      stagingEnv({ SESSION_JWT_SECRET: 'change-me-dev-only-do-not-use-in-production-00' }),
    );
    expect(err).toContain('SESSION_JWT_SECRET');
  });

  /*
   * Mặc định phải là giá trị NGHIÊM NGẶT nhất. Nếu một ngày ai đó đổi default thành `staging`
   * "cho tiện", mọi máy production quên khai biến này sẽ âm thầm chạy mock OTP và trả mã 6 số
   * thẳng trong response.
   */
  it('bỏ trống APP_ENV = production: vẫn đòi đủ eSMS / SMTP / R2', () => {
    const err = validationError(stagingEnv({ APP_ENV: '' }));
    expect(err).toContain('APP_ENV');

    const { APP_ENV: _omitted, ...withoutAppEnv } = stagingEnv();
    const strict = validationError(withoutAppEnv);
    expect(strict).toContain('OTP_MODE');
    expect(strict).toContain('SMTP_HOST');
    expect(strict).toContain('R2_BUCKET');
  });

  it('production đầy đủ vẫn hợp lệ và APP_ENV mặc định là production', () => {
    const env = validateEnv(productionEnv());
    expect(env.APP_ENV).toBe('production');
  });

  it('giá trị lạ bị từ chối — không có môi trường thứ ba nào được suy diễn ra', () => {
    expect(validationError(stagingEnv({ APP_ENV: 'dev' }))).toContain('APP_ENV');
  });
});

describe('env: TRUST_PROXY_HOPS — số lớp proxy, không phải cờ bật/tắt', () => {
  /*
   * Mặc định 0 phải giữ nguyên cho dev chạy trần. Nếu một ngày ai đó đổi default thành 1 "cho
   * tiện production" thì mọi môi trường không có proxy sẽ tin `X-Forwarded-For` do client tự
   * gửi — tức là ai cũng khai được IP của mình và đi vòng qua rate limit theo IP.
   */
  it('mặc định là 0 — dev không có proxy thì không được tin X-Forwarded-For', () => {
    expect(validateEnv(baseEnv()).TRUST_PROXY_HOPS).toBe(0);
  });

  it('nhận số lớp proxy dạng chuỗi (env luôn là chuỗi)', () => {
    expect(validateEnv(baseEnv({ TRUST_PROXY_HOPS: '1' })).TRUST_PROXY_HOPS).toBe(1);
  });

  it('chặn giá trị âm và giá trị không phải số — cả hai đều là cấu hình gõ sai', () => {
    expect(validationError(baseEnv({ TRUST_PROXY_HOPS: '-1' }))).toContain('TRUST_PROXY_HOPS');
    expect(validationError(baseEnv({ TRUST_PROXY_HOPS: 'true' }))).toContain('TRUST_PROXY_HOPS');
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
    expect(
      validationError(productionEnv({ OTP_PEPPER: 'xeprime-dev-otp-pepper-change-me' })),
    ).toContain('OTP_PEPPER');
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
    expect(validationError(productionEnv({ CORS_ORIGINS: 'http://xeprime.vn' }))).toContain(
      'CORS_ORIGINS',
    );
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
    expect(validationError(productionEnv({ R2_PRIVATE_BUCKET: 'xeprime-public' }))).toContain(
      'R2_PRIVATE_BUCKET',
    );
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
        baseEnv({
          GOOGLE_OAUTH_CLIENT_ID: 'id.apps.googleusercontent.com',
          GOOGLE_OAUTH_CLIENT_SECRET: 's',
        }),
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

describe('env: ba không gian tài khoản (ADR 0053)', () => {
  it('SESSION_COOKIE_DOMAIN bị từ chối ở MỌI môi trường — cookie phiên host-only theo site', () => {
    expect(validationError(baseEnv({ SESSION_COOKIE_DOMAIN: '.xeprime.vn' }))).toContain(
      'SESSION_COOKIE_DOMAIN',
    );
    expect(validationError(productionEnv({ SESSION_COOKIE_DOMAIN: '.xeprime.vn' }))).toContain(
      'SESSION_COOKIE_DOMAIN',
    );
    // Bỏ trống thì vẫn chạy: file env cũ để `SESSION_COOKIE_DOMAIN=` không làm gãy boot.
    expect(() => validateEnv(baseEnv({ SESSION_COOKIE_DOMAIN: '' }))).not.toThrow();
  });

  it('cờ dev REALM_HEADER_FROM_CLIENT: dev được bật, production bị chặn', () => {
    expect(
      validateEnv(baseEnv({ REALM_HEADER_FROM_CLIENT: 'true' })).REALM_HEADER_FROM_CLIENT,
    ).toBe(true);
    expect(validationError(productionEnv({ REALM_HEADER_FROM_CLIENT: 'true' }))).toContain(
      'REALM_HEADER_FROM_CLIENT',
    );
  });

  it('production bắt buộc REALM_PROXY_SECRET đủ dài', () => {
    expect(validationError(productionEnv({ REALM_PROXY_SECRET: '' }))).toContain(
      'REALM_PROXY_SECRET',
    );
    expect(validationError(productionEnv({ REALM_PROXY_SECRET: 'short' }))).toContain(
      'REALM_PROXY_SECRET',
    );
  });

  it('production chặn URL site partner/admin không https hoặc trỏ localhost', () => {
    expect(
      validationError(productionEnv({ WEB_PARTNER_URL: 'http://localhost:3000/manage' })),
    ).toContain('WEB_PARTNER_URL');
    expect(validationError(productionEnv({ WEB_ADMIN_URL: 'http://admin.xeprime.vn' }))).toContain(
      'WEB_ADMIN_URL',
    );
  });

  it('dev mặc định chế độ PATH: site partner/admin là tiền tố trên localhost:3000', () => {
    const env = validateEnv(baseEnv());
    expect(env.WEB_PARTNER_URL).toBe('http://localhost:3000/manage');
    expect(env.WEB_ADMIN_URL).toBe('http://localhost:3000/admin');
  });
});

describe('tên cookie phiên: một nguồn duy nhất', () => {
  it('default của env schema đúng bằng hằng số dùng chung', () => {
    expect(validateEnv(baseEnv()).SESSION_COOKIE_NAME).toBe(SESSION_COOKIE_NAME_DEFAULT);
  });

  it('web proxy và API cùng một công thức: env đè lên default, hậu tố là realm', () => {
    const P = ACCOUNT_REALM.PARTNER;
    expect(resolveSessionCookieName({}, P)).toBe(`${SESSION_COOKIE_NAME_DEFAULT}_partner`);
    expect(resolveSessionCookieName({ SESSION_COOKIE_NAME: '  ' }, P)).toBe(
      `${SESSION_COOKIE_NAME_DEFAULT}_partner`,
    );
    expect(resolveSessionCookieName({ SESSION_COOKIE_NAME: 'xp_session_stg' }, P)).toBe(
      'xp_session_stg_partner',
    );
    expect(
      validateEnv(baseEnv({ SESSION_COOKIE_NAME: 'xp_session_stg' })).SESSION_COOKIE_NAME,
    ).toBe('xp_session_stg');
  });

  it('ba realm là ba tên cookie khác nhau — phiên không bao giờ đọc chéo (ADR 0053)', () => {
    const names = ACCOUNT_REALM_VALUES.map((realm) => resolveSessionCookieName({}, realm));
    expect(new Set(names).size).toBe(ACCOUNT_REALM_VALUES.length);
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
    SESSION_COOKIE_NAME: SESSION_COOKIE_NAME_DEFAULT,
    SESSION_COOKIE_SECURE: true,
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

  it('production: httpOnly + secure + sameSite lax + HOST-ONLY, tên cookie mang realm', () => {
    const { res, set } = fakeResponse();
    serviceWith(PROD_VALUES).attach(res, 'token', ACCOUNT_REALM.PARTNER);

    expect(set.name).toBe(`${SESSION_COOKIE_NAME_DEFAULT}_partner`);
    expect(set.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    // ADR 0053 điều 4: không `domain` = host-only. Cookie của partner.xeprime.vn không bao giờ
    // được trình duyệt gửi sang xeprime.vn hay admin.xeprime.vn.
    expect(set.options).not.toHaveProperty('domain');
  });

  it('localhost/LAN: secure=false, vẫn host-only', () => {
    const { res, set } = fakeResponse();
    serviceWith({ ...PROD_VALUES, SESSION_COOKIE_SECURE: false }).attach(
      res,
      'token',
      ACCOUNT_REALM.CUSTOMER,
    );

    expect(set.options?.secure).toBe(false);
    expect(set.options).not.toHaveProperty('domain');
  });

  it('clear dùng ĐÚNG bộ thuộc tính của attach (trừ maxAge) — khác một thuộc tính là cookie không bị xoá', () => {
    const { res, set, cleared } = fakeResponse();
    const service = serviceWith(PROD_VALUES);
    service.attach(res, 'token', ACCOUNT_REALM.PLATFORM);
    service.clear(res, ACCOUNT_REALM.PLATFORM);

    expect(cleared.name).toBe(set.name);
    const { maxAge, ...attachedWithoutMaxAge } = set.options as CookieOptions;
    expect(maxAge).toBeGreaterThan(0);
    expect(cleared.options).toEqual(attachedWithoutMaxAge);
    expect(cleared.options).not.toHaveProperty('maxAge');
  });
});

describe('env: APP_ENV=development — nhãn của máy dev (seed demo đòi giá trị này)', () => {
  it('máy dev (NODE_ENV khác production) boot được với APP_ENV=development', () => {
    const env = validateEnv(baseEnv({ APP_ENV: 'development' }));
    expect(env.APP_ENV).toBe('development');
  });

  it('môi trường đã triển khai (NODE_ENV=production) khai development bị chặn', () => {
    expect(validationError(productionEnv({ APP_ENV: 'development' }))).toContain('APP_ENV');
  });
});
