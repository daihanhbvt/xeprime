import { GOOGLE_HOLIDAY_CALENDAR_ID_DEFAULT, SESSION_COOKIE_NAME_DEFAULT } from '@xeprime/types';
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

    /*
     * MÔI TRƯỜNG ĐÃ TRIỂN KHAI — khác `NODE_ENV`, và sự khác nhau đó là cả điểm của biến này.
     *
     * `NODE_ENV` trả lời "build kiểu gì": staging PHẢI là `production`, nếu không Next trộn bản
     * React dev vào bundle server và app không giống thật nữa. Nhưng `NODE_ENV=production` cũng
     * đang kéo theo một nhóm luật thuộc loại khác hẳn — "tính năng phải chạy THẬT": bắt buộc
     * eSMS, bắt buộc SMTP, bắt buộc đủ bộ R2. Ở staging chúng chỉ có nghĩa là tốn tiền tin nhắn
     * để test một luồng đặt xe giả.
     *
     * Vì vậy `APP_ENV` trả lời "đây là môi trường nào", và cửa chặn tách làm hai nhóm ở
     * `superRefine` dưới:
     *   • BẢO MẬT (https, cookie Secure, secret không còn giá trị mẫu, CORS) — áp cho MỌI môi
     *     trường đã triển khai, staging KHÔNG được miễn. Staging có đăng nhập thật, cookie thật,
     *     và nằm trên Internet công khai như production.
     *   • NĂNG LỰC (eSMS · SMTP · R2) — chỉ production. Thiếu thì tính năng tương ứng suy giảm
     *     một cách có kiểm soát (mã OTP vào log, email vào log, upload trả 503), app vẫn chạy.
     *
     * Mặc định là `production` — giá trị NGHIÊM NGẶT nhất. Nới lỏng phải là một hành động tường
     * minh trong file env, không phải thứ rơi vào vì quên khai.
     */
    APP_ENV: z.enum(['production', 'staging']).default('production'),
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

    /*
     * Số lớp reverse proxy đứng TRƯỚC API — giá trị truyền thẳng cho `trust proxy` của Express.
     *
     * Mặc định 0 (dev chạy trần, không có proxy). Ở production sau Caddy/nginx thì đúng bằng 1.
     *
     * Nó không phải một tuỳ chọn cho vui: `X-Forwarded-For` là header do người GỌI gửi, nên khi
     * `trust proxy` = 0, Express bỏ qua nó và `req.ip` là IP của proxy — cùng MỘT giá trị cho
     * mọi người dùng. Hệ quả là @nestjs/throttler gộp cả thế giới vào chung hạn mức 120
     * request/phút, và giới hạn gửi OTP theo IP mất tác dụng. Chiều ngược lại cũng thật: bật
     * khi KHÔNG có proxy nghĩa là ai cũng tự khai được IP của mình và đi vòng qua chính các
     * giới hạn đó. Vì vậy con số này phải bằng đúng số proxy có thật, không phải một cờ bật/tắt.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

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

    /*
     * Deep link được phép nhận one-time code sau khi app native đăng nhập mạng xã hội (ADR 0019).
     *
     * Là ALLOWLIST, và app phải gửi lên một giá trị NẰM TRONG danh sách — không phải app muốn
     * gửi gì cũng được. Redirect tới một URI do client tự khai là cách one-time code được giao
     * thẳng cho kẻ tấn công.
     *
     * Nhiều giá trị vì môi trường dev khác production: Expo dev build trả `exp://192.168.x.x:8081/--/…`
     * chứ không phải scheme của app đã cài. Thêm URI dev vào đây, đừng nới lỏng luật.
     */
    MOBILE_AUTH_REDIRECT_URIS: z
      .string()
      .default('xeprime://auth/callback')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    /*
     * --- Đăng nhập mạng xã hội (ADR 0019) ---
     *
     * Vòng OAuth chạy hoàn toàn ở SERVER: client secret dưới đây không bao giờ rời tiến trình
     * này, và trình duyệt cũng không bao giờ cầm access token của provider.
     *
     * Không provider nào là bắt buộc, kể cả ở production — cùng logic với `GOOGLE_MAPS_SERVER_KEY`:
     * thiếu cấu hình thì nút Google/Facebook trả `SOCIAL_NOT_CONFIGURED`, còn ba đường đăng nhập
     * còn lại (mật khẩu, OTP, và đăng ký) không hề gãy. Nhưng có MỘT NỬA của một cặp thì fail
     * lúc boot: đó luôn là cấu hình gõ thiếu, không phải một lựa chọn.
     */
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),

    /*
     * URL công khai của chính API này — dùng dựng `redirect_uri` tuyệt đối cho OAuth.
     *
     * KHÔNG suy ra từ header của request: `Host`/`X-Forwarded-Host` do client gửi, và một
     * `redirect_uri` dựng từ dữ liệu client là cách `code` bị gửi tới máy của người khác. Provider
     * đối chiếu giá trị này với danh sách đã khai trong console, nên nó phải là hằng số.
     */
    API_PUBLIC_URL: z.string().default('http://localhost:4000'),

    /*
     * --- Firebase Admin: CHỈ còn phục vụ chat realtime (ADR 0009) ---
     *
     * Từ ADR 0019, Firebase KHÔNG còn nằm trên đường đăng nhập. Ba biến này chỉ được đọc bởi
     * `FirebaseAppService` (mint custom token cho Firestore) và bởi `apps/worker` (đẩy projection).
     * Chúng bắt buộc khi và chỉ khi `FIRESTORE_ENABLED=true`.
     */
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
    // Bật Firestore projection cho chat. Từ ADR 0019 đây là công dụng DUY NHẤT còn lại của
    // Firebase trong repo — đăng nhập không còn đi qua nó. Tắt (mặc định) thì chat chỉ chạy
    // trên Postgres, không đẩy realtime.
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

    /*
     * --- Bản đồ: geocode địa chỉ + khoảng cách giao xe (24/08/2026) ---
     *
     * Đây là **server key**, khoá theo IP trên Cloud Console và chỉ bật Geocoding API + Routes
     * API. Nó KHÔNG phải key nhúng bản đồ của web (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`, chỉ bật
     * Maps Embed API, khoá theo referrer): key nhúng nằm lộ thiên trong HTML, nên dùng chung
     * một key là mở hạn mức tính tiền cho bất kỳ ai xem trang.
     *
     * Optional có chủ đích, kể cả ở production: thiếu key thì phí giao dự kiến đơn giản không
     * hiện và hai bên tự thoả thuận như trước — không có gì gãy, nên không đáng chặn boot.
     */
    GOOGLE_MAPS_SERVER_KEY: z.string().optional(),

    /*
     * --- Ngày lễ Việt Nam: đồng bộ từ Google Calendar (26/08/2026) ---
     *
     * Hai biến này do **`apps/worker`** dùng, không phải API — API chỉ ĐỌC bảng
     * `public_holidays` và không biết Google tồn tại. Khai ở đây vì cả repo dùng chung một
     * `.env`: một biến không được khai báo là một biến không ai kiểm được chính tả, và người
     * gõ nhầm `GOOGLE_HOLIDAYS_API_KEY` sẽ không hiểu vì sao lịch mãi không có ngày lễ.
     *
     * Key RIÊNG, KHÔNG dùng lại `GOOGLE_MAPS_SERVER_KEY` ở trên: khác API được bật trên Cloud
     * Console (Calendar API vs Geocoding + Routes), khác hạn mức, và khác cả kiểu khoá — key
     * bản đồ khoá theo IP của API server, còn key này gọi từ máy chạy worker.
     *
     * Optional kể cả ở production, cùng logic với `GOOGLE_MAPS_SERVER_KEY` và bộ `R2_*` phía
     * hiển thị: thiếu key thì lịch xe đơn giản không có lớp ngày lễ. Không có gì gãy, nên không
     * đáng chặn boot — vì vậy KHÔNG có điều kiện nào cho chúng ở `superRefine` bên dưới.
     */
    GOOGLE_HOLIDAY_API_KEY: z.string().optional(),
    // Lịch nghỉ lễ VN công khai của Google. Mặc định lấy từ `@xeprime/types` để API và worker
    // không thể mô tả hai lịch khác nhau.
    GOOGLE_HOLIDAY_CALENDAR_ID: z.string().min(1).default(GOOGLE_HOLIDAY_CALENDAR_ID_DEFAULT),

    /*
     * Chế độ THI HÀNH của trục năng lực theo gói (ADR 0027) — `PlanFeatureGuard` đọc biến này.
     *
     *   off   — bỏ qua hoàn toàn (thoát hiểm khi sự cố, không cần revert code)
     *   warn  — MẶC ĐỊNH: ghi log ai SẼ bị chặn, nhưng cho qua
     *   on    — chặn thật
     *
     * Mặc định `warn`, không phải `on`, và đó là điều kiện an toàn của cả đợt: bật chặn trước
     * khi các bậc gói được seed cờ (hoặc trước khi log cảnh báo im) là khoá sổ thu chi của TOÀN
     * BỘ gian hàng đang dùng thật trong một lần deploy. Chuyển sang `on` phải là một lần deploy
     * riêng, không kèm thay đổi nào khác — nhờ vậy rollback là sửa một biến env.
     */
    PLAN_FEATURE_ENFORCEMENT: z.enum(['off', 'warn', 'on']).default('warn'),

    /*
     * --- SePay: đối soát tiền VÀO tài khoản nền tảng (ADR 0016/0022, R2) ---
     *
     * BỐN biến là MỘT nhóm bật/tắt: khai một nửa là cấu hình gõ thiếu và fail lúc boot
     * (kiểm ở superRefine dưới, cùng khuôn cặp OAuth). Chưa khai thì:
     *   • webhook `/sepay/webhook` trả 503 `SEPAY_NOT_CONFIGURED` — fail closed;
     *   • màn thanh toán hoá đơn gói không hiện VietQR, chỉ còn mã + số tiền (như trước R2).
     * Không nằm trong nhóm BẮT BUỘC ở production vì tài khoản SePay/ngân hàng thật là phụ
     * thuộc ngoài chưa ký — đưa vào nhóm bắt buộc trước khi có giá trị là chặn deploy của mọi
     * thứ khác. Khi tài khoản có thật: khai ở GitHub Environment rồi chuyển 4 biến này xuống
     * nhóm bắt buộc của `APP_ENV=production` trong một PR riêng.
     *
     * `SEPAY_API_KEY` là khoá WEBHOOK (SePay gửi `Authorization: Apikey …`), so sánh time-safe
     * ở `SepayService` — không phải khoá gọi API của SePay.
     */
    SEPAY_API_KEY: z.string().min(16).optional(),
    /** Mã ngân hàng theo chuẩn VietQR (vd `VCB`, `TCB`) — dùng dựng ảnh QR quicklink. */
    SEPAY_BANK_CODE: z.string().optional(),
    SEPAY_ACCOUNT_NUMBER: z.string().optional(),
    /** Tên chủ tài khoản in trên QR — người chuyển đối chiếu trước khi bấm gửi. */
    SEPAY_ACCOUNT_NAME: z.string().optional(),

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
    // Một cặp id/secret khai nửa vời là cấu hình gõ thiếu. Fail lúc boot chứ đừng để nó thành
    // "nút Google im lặng không hoạt động" mà không ai biết vì sao.
    const socialPairs = [
      ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
      ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
    ] as const;
    for (const [idKey, secretKey] of socialPairs) {
      if (Boolean(env[idKey]) !== Boolean(env[secretKey])) {
        ctx.addIssue({
          code: 'custom',
          path: [env[idKey] ? secretKey : idKey],
          message: `${idKey} và ${secretKey} phải khai cùng nhau (hoặc bỏ trống cả hai để tắt provider)`,
        });
      }
    }

    // SePay là nhóm bốn-biến-hoặc-không: một endpoint công khai có quyền ghi tiền mà thiếu
    // khoá, hoặc một QR thiếu số tài khoản, đều là cấu hình gõ thiếu — fail lúc boot.
    const sepayKeys = [
      'SEPAY_API_KEY',
      'SEPAY_BANK_CODE',
      'SEPAY_ACCOUNT_NUMBER',
      'SEPAY_ACCOUNT_NAME',
    ] as const;
    const sepaySet = sepayKeys.filter((key) => Boolean(env[key]));
    if (sepaySet.length > 0 && sepaySet.length < sepayKeys.length) {
      for (const key of sepayKeys) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} thiếu — bốn biến SEPAY_* phải khai cùng nhau (hoặc bỏ trống cả bốn để tắt)`,
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

    // ── Cửa chặn cho MỌI môi trường đã triển khai (kể cả staging) ─────────
    // Nhóm này là BẢO MẬT, và staging không được miễn: nó cũng nằm trên Internet công khai, cũng
    // phát cookie phiên thật. Chúng phải fail lúc BOOT — một API ghi link đặt lại mật khẩu ra
    // log, hay gửi `redirect_uri` OAuth trỏ localhost, là sự cố an ninh chứ không phải cấu hình
    // sai vặt.
    if (env.NODE_ENV !== 'production') return;

    // `redirect_uri` của OAuth dựng từ đây và phải trùng từng ký tự với giá trị đã khai trong
    // Google/Facebook console. Trỏ localhost ở production nghĩa là provider sẽ gửi `code` về máy
    // của chính người dùng — luồng đăng nhập hỏng 100%.
    if (
      !env.API_PUBLIC_URL.startsWith('https://') ||
      /localhost|127\.0\.0\.1/.test(env.API_PUBLIC_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message:
          'API_PUBLIC_URL phải là URL https của tên miền thật ở production (redirect_uri của OAuth dựng từ đây)',
      });
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
        message:
          'APP_WEB_URL phải là URL https của tên miền thật ở production (link đặt lại mật khẩu dựng từ đây)',
      });
    }

    // ── Từ đây trở xuống: CHỈ production ──────────────────────────────────
    // Nhóm NĂNG LỰC. Thiếu chúng, app vẫn boot và vẫn chạy, chỉ là ba tính năng suy giảm một
    // cách có kiểm soát: mã OTP vào log thay vì SMS, email đặt lại mật khẩu vào log thay vì hộp
    // thư, endpoint upload trả 503 `UPLOADS_NOT_CONFIGURED`. Ở production đó là ba sự cố; ở
    // staging đó là ba khoản chi phí không có lý do tồn tại.
    if (env.APP_ENV !== 'production') return;

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
