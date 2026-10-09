import { validateEnv } from '../../src/config/env.schema';

/**
 * Bộ env cho các spec kiểm `validateEnv` — unit thuần, không đụng DB. Một nguồn cho mọi spec env: chép
 * lại bộ production đầy đủ ở từng file là để một biến bắt buộc mới chỉ được thêm ở một nửa số chỗ.
 */

/** Bộ env tối thiểu hợp lệ; từng test chỉ ghi đè đúng thứ nó nói về. */
export function baseEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/xeprime?schema=public',
    SESSION_JWT_SECRET: 'x'.repeat(48),
    ...overrides,
  };
}

/** Bộ env production đầy đủ — dùng làm mốc "hợp lệ" để mỗi test bẻ đúng một biến. */
export function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return baseEnv({
    NODE_ENV: 'production',
    SESSION_COOKIE_SECURE: 'true',
    SESSION_JWT_SECRET: 'p'.repeat(48),
    OTP_PEPPER: 'production-pepper-value-0001',
    CORS_ORIGINS: 'https://xeprime.vn,https://www.xeprime.vn',
    APP_WEB_URL: 'https://xeprime.vn',
    WEB_PARTNER_URL: 'https://partner.xeprime.vn',
    WEB_ADMIN_URL: 'https://admin.xeprime.vn',
    REALM_PROXY_SECRET: 'r'.repeat(40),
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
export function validationError(env: Record<string, string>): string {
  try {
    validateEnv(env);
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
