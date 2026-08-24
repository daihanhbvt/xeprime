import { SESSION_COOKIE_NAME_DEFAULT } from '@xeprime/types';
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
    // Default lấy từ `@xeprime/types` — web proxy đọc cùng hằng số này (ADR 0002).
    SESSION_COOKIE_NAME: z.string().min(1).default(SESSION_COOKIE_NAME_DEFAULT),
    SESSION_COOKIE_SECURE: booleanish.default(false),
    SESSION_COOKIE_DOMAIN: z.string().optional(),

    // --- Phiên app native (ADR 0017) ---
    // Access token JWT ngắn hạn. Khoảng 10–15 phút là RÀNG BUỘC của ADR, không phải gợi ý: nó là
    // cửa sổ mà một access token bị lộ còn dùng được sau khi phiên đã bị thu hồi. Chặn ở đây để
    // một biến env đặt sai không âm thầm biến 15 phút thành 15 ngày.
    MOBILE_ACCESS_TTL_MINUTES: z.coerce.number().int().min(10).max(15).default(15),
    // Refresh token opaque, xoay mỗi lần dùng. Dài hơn nhiều vì nó thu hồi được tức thì.
    MOBILE_REFRESH_TTL_DAYS: z.coerce.number().int().positive().max(180).default(60),
    // Claim `aud` của access token — cùng với `typ=access` là thứ chặn session JWT của web đi
    // lẫn sang đường Bearer.
    MOBILE_JWT_AUDIENCE: z.string().min(1).default('xeprime-mobile'),

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
    // Số lần nhập SAI mã tối đa cho một OTP trước khi khoá mã (phải gửi lại). Chống brute-force
    // ngoài @Throttle controller + TTL ngắn.
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
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
    /**
     * Bucket RIÊNG TƯ cho tài liệu nhạy cảm (hợp đồng nguồn xe — Wave 4.1; giấy tờ xe — Wave 5).
     * Bucket này KHÔNG được bật r2.dev URL hay custom domain public — file chỉ ra ngoài qua
     * signed GET URL ngắn hạn do backend phát sau khi kiểm quyền. Không cấu hình → endpoint
     * hợp đồng trả 503 (fail closed), KHÔNG rơi về bucket public.
     */
    R2_PRIVATE_BUCKET: z.string().optional(),

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

    // Bucket riêng tư PHẢI khác bucket public — đúng ở MỌI môi trường: trùng tên nghĩa là hợp
    // đồng/giấy tờ xe nằm trong bucket có URL công khai.
    if (env.R2_PRIVATE_BUCKET && env.R2_PRIVATE_BUCKET === env.R2_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['R2_PRIVATE_BUCKET'],
        message:
          'R2_PRIVATE_BUCKET không được trùng R2_BUCKET — tài liệu riêng tư sẽ nằm trong bucket công khai',
      });
    }

    // ── Cửa chặn production ────────────────────────────────────────────────
    // Mọi luật dưới đây đều là "mặc định tiện cho dev nhưng NGUY HIỂM ở production".
    // Chúng phải fail lúc BOOT: một API production chạy với `AUTH_MODE=mock` hay ghi link đặt
    // lại mật khẩu ra log là sự cố an ninh, không phải cấu hình sai vặt.
    if (env.NODE_ENV !== 'production') return;

    // Guard `mock` nhận token giả — bất kỳ ai cũng đăng nhập được thành bất kỳ ai.
    if (env.AUTH_MODE === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'AUTH_MODE=mock chấp nhận token giả — production phải dùng firebase',
      });
    }

    // OTP_MODE=mock ở production nghĩa là KHÔNG có SMS nào được gửi và mã 6 số chỉ nằm trong
    // log server — vừa hỏng luồng đăng nhập vừa là rò rỉ mã.
    if (env.OTP_MODE !== 'esms') {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_MODE'],
        message: 'OTP_MODE=mock không gửi SMS và chỉ in mã ra log — production phải dùng esms',
      });
    }

    // Thiếu SMTP thì EmailService in NGUYÊN link đặt lại mật khẩu (kèm token) ra log.
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} là bắt buộc ở production — thiếu SMTP thì link đặt lại mật khẩu (kèm token) bị ghi ra log`,
        });
      }
    }

    // CORS: '*' không đi được với credentials, và origin http để lộ cookie phiên trên đường truyền.
    for (const origin of env.CORS_ORIGINS) {
      if (origin === '*') {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'CORS_ORIGINS không được chứa "*" ở production (cookie đi kèm credentials)',
        });
      } else if (!origin.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `CORS_ORIGINS chứa origin không phải https ở production: ${origin}`,
        });
      }
    }

    // Link trong email đặt lại mật khẩu dựng từ APP_WEB_URL — trỏ localhost là email vô dụng.
    if (!env.APP_WEB_URL.startsWith('https://') || /localhost|127\.0\.0\.1/.test(env.APP_WEB_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_WEB_URL'],
        message: 'APP_WEB_URL phải là URL https của tên miền thật ở production (link đặt lại mật khẩu dựng từ đây)',
      });
    }

    // Ảnh xe/gian hàng (bucket public) và tài liệu xe (bucket riêng tư) đều là chức năng đã phát
    // hành. Thiếu env, chúng trả 503 lúc chạy — biết ở lần đầu người dùng bấm upload là quá muộn.
    for (const key of [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
      'R2_ENDPOINT',
      'R2_PUBLIC_BASE_URL',
      'R2_PRIVATE_BUCKET',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} là bắt buộc ở production (upload ảnh + tài liệu riêng tư của xe)`,
        });
      }
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
