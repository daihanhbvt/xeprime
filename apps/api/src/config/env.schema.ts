import { z } from 'zod';

/**
 * Validate env lúc khởi động, fail-fast.
 *
 * CLAUDE.md mục 4: env dùng zod (type inference tốt), DTO dùng class-validator.
 * Đây là chỗ duy nhất đọc `process.env` — phần còn lại của app inject `AppConfig`.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL là bắt buộc'),

    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    // --- Session (ADR 0002) ---
    SESSION_JWT_SECRET: z.string().min(32, 'SESSION_JWT_SECRET phải ít nhất 32 ký tự'),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
    SESSION_COOKIE_NAME: z.string().default('xp_session'),
    SESSION_COOKIE_SECURE: booleanish.default(false),
    SESSION_COOKIE_DOMAIN: z.string().optional(),

    // --- Auth provider ---
    AUTH_MODE: z.enum(['mock', 'firebase']).default('mock'),
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),

    // --- Xác thực SĐT / OTP (Phase 4) ---
    // mock -> sinh mã 6 số, KHÔNG gửi SMS: in ra log + trả `devCode` ở dev (tự động điền/test).
    // esms -> gửi thật qua eSMS.vn, cần 3 ESMS_* dưới. Firebase-code cũ dùng eSMS (không phải
    // Firebase Phone Auth); key prod nằm trong Secret Manager, không tái dùng local được.
    OTP_MODE: z.enum(['mock', 'esms']).default('mock'),
    ESMS_API_KEY: z.string().optional(),
    ESMS_SECRET_KEY: z.string().optional(),
    ESMS_BRANDNAME: z.string().optional(),
    OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().positive().default(5),
    // Pepper để hash mã OTP (schema phone_verifications không có cột salt). Có default dev để
    // không phá `.env` sẵn có; production bắt buộc đổi (kiểm ở superRefine dưới).
    OTP_PEPPER: z.string().min(16).default('xeprime-dev-otp-pepper-change-me'),

    // --- Chat realtime (ADR 0009) ---
    // Bật Firestore projection cho chat. Độc lập với AUTH_MODE: có thể AUTH_MODE=mock mà vẫn
    // dùng Firestore cho chat (dùng chung 3 FIREBASE_* ở trên). Tắt (mặc định) thì chat chỉ
    // chạy trên Postgres, không đẩy realtime.
    FIRESTORE_ENABLED: booleanish.default(false),

    // --- Chat attachments: Cloudflare R2 (S3-compatible) ---
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET: z.string().optional(),
    R2_ENDPOINT: z.string().optional(),
    R2_PUBLIC_BASE_URL: z.string().optional(),

    // --- Web + Email (cho link đặt lại mật khẩu) ---
    APP_WEB_URL: z.string().default('http://localhost:3000'),
    // SMTP tuỳ chọn: chưa cấu hình thì EmailService in link ra log (dev), không gửi thật.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('XePrime <no-reply@xeprime.local>'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'firebase') {
      for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} là bắt buộc khi AUTH_MODE=firebase`,
          });
        }
      }
    }

    // Bật chat realtime → cần credential Firebase Admin (đẩy Firestore) + R2 (đính kèm).
    if (env.FIRESTORE_ENABLED) {
      const required = [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET',
        'R2_ENDPOINT',
        'R2_PUBLIC_BASE_URL',
      ] as const;
      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} là bắt buộc khi FIRESTORE_ENABLED=true`,
          });
        }
      }
    }

    // Cookie không có Secure trên production nghĩa là session đi qua HTTP trần.
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'SESSION_COOKIE_SECURE phải = true ở production',
      });
    }

    if (env.NODE_ENV === 'production' && env.SESSION_JWT_SECRET.includes('change-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_JWT_SECRET'],
        message: 'SESSION_JWT_SECRET vẫn là giá trị mẫu — phải đổi trước khi lên production',
      });
    }

    // Gửi SMS thật → cần credential eSMS.vn (API key + secret + brandname đã duyệt).
    if (env.OTP_MODE === 'esms') {
      for (const key of ['ESMS_API_KEY', 'ESMS_SECRET_KEY', 'ESMS_BRANDNAME'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} là bắt buộc khi OTP_MODE=esms`,
          });
        }
      }
    }

    if (env.NODE_ENV === 'production' && env.OTP_PEPPER.includes('change-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_PEPPER'],
        message: 'OTP_PEPPER vẫn là giá trị mẫu — phải đổi trước khi lên production',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Cấu hình env không hợp lệ:\n${lines.join('\n')}`);
  }

  return parsed.data;
}
