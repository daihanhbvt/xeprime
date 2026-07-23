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
