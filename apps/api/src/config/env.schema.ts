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

/**
 * Chuỗi RỖNG = chưa khai — cùng luật với `SEPAY_API_KEY` bên dưới: `.env.example` để trống các biến
 * này, CI chạy `cp .env.example .env`, và `kv()` của deploy bỏ qua giá trị rỗng. Không `preprocess`
 * thì một ràng buộc định dạng chạy TRƯỚC `superRefine` và đánh trượt cả bộ env vì một ô trống.
 */
const emptyAsUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

function optionalSecret() {
  return z.preprocess(emptyAsUndefined, z.string().trim().min(1).optional());
}

function optionalUrl() {
  return z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .trim()
      .url()
      .transform((url) => url.replace(/\/+$/, ''))
      .optional(),
  );
}

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
    /*
     * `development` = máy dev: CÙNG giá trị mà seed đòi để đổ dữ liệu demo (`prisma/src/seed/context.ts`,
     * `.env.example` hướng dẫn đặt nó vào `.env`). Trước đây schema chỉ nhận production|staging nên
     * làm theo hướng dẫn của seed là API không boot. Chỉ hợp lệ khi `NODE_ENV` KHÁC production —
     * môi trường đã triển khai khai `development` bị chặn ở `superRefine`.
     */
    APP_ENV: z.enum(['production', 'staging', 'development']).default('production'),
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
    // Default lấy từ `@xeprime/types` — web proxy đọc cùng hằng số này (ADR 0002).
    SESSION_COOKIE_NAME: z.string().min(1).default(SESSION_COOKIE_NAME_DEFAULT),
    SESSION_COOKIE_SECURE: booleanish.default(false),
    /*
     * BỎ từ ADR 0053 — cookie phiên nay HOST-ONLY, mỗi realm một tên, API cùng origin dưới `/api`
     * của từng site. Vẫn khai ở đây chỉ để `superRefine` dưới THẤY và từ chối một file env cũ còn
     * `.xeprime.vn`: im lặng bỏ qua thì người đọc env tưởng cookie đang đi chung ba site.
     */
    SESSION_COOKIE_DOMAIN: z.string().optional(),

    // --- Không gian tài khoản (ADR 0053) ---
    /*
     * Khoá dùng chung giữa Caddy và API. Caddy gắn nó cùng header realm (`x-xp-realm`) ở `/api`
     * của từng site; API chỉ tin header realm khi khoá khớp. Không có khoá thì một client gọi thẳng
     * `api.xeprime.vn` (site của app mobile) tự khai được `x-xp-realm: platform`.
     * Bắt buộc ở mọi môi trường đã triển khai (kiểm ở superRefine).
     */
    REALM_PROXY_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(32, 'REALM_PROXY_SECRET phải ít nhất 32 ký tự').optional(),
    ),
    /*
     * CHỈ máy dev: tin header realm do web app gắn, không cần khoá proxy. Ở chế độ `path` của ADR
     * 0051 cả ba khu chung `localhost:3000`, nên host không cho biết realm — web app tự gắn theo
     * khu của trang. Bật ở môi trường đã triển khai là API TỪ CHỐI khởi động.
     */
    REALM_HEADER_FROM_CLIENT: booleanish.default(false),

    // Thời hạn phiên web và chính sách OTP là HẰNG SỐ ở `@xeprime/types` (`SESSION_TTL_DAYS`,
    // `OTP_POLICY`) — giống nhau ở mọi môi trường nên không phải biến env.

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
    // Hai URI mặc định = hai app phát hành riêng (25/09/2026): scheme `xeprime` (XePrime —
    // customer) và `xeprimepartner` (XePrime Partner). Scheme là hợp đồng với
    // `MOBILE_APP_SCHEME` ở @xeprime/types — luồng social suy app đích từ chính scheme này.
    MOBILE_AUTH_REDIRECT_URIS: z
      .string()
      .default('xeprime://auth/callback,xeprimepartner://auth/callback')
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
     * Không provider nào là bắt buộc, kể cả ở production — cùng logic với `VIETMAP_API_KEY`:
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
     * --- Firebase Admin: chat realtime (ADR 0009) + thông báo đẩy (FCM) ---
     *
     * Từ ADR 0019, Firebase KHÔNG còn nằm trên đường đăng nhập. Nó phục vụ HAI tính năng, và
     * chúng bật/tắt độc lập:
     *   • `FIRESTORE_ENABLED` — projection chat realtime (`FirebaseAppService.createCustomToken`
     *     ở API, outbox pump ở worker);
     *   • `PUSH_ENABLED`      — thông báo đẩy qua FCM (API xếp hàng, worker gửi).
     *
     * MỘT bộ credential cho cả hai: cùng một Firebase project, cùng service account. Cấp thêm
     * một service account chỉ để gửi FCM là thêm một bí mật phải xoay mà không mua lại được gì.
     * Ba biến dưới bắt buộc khi BẤT KỲ cái nào trong hai cờ đó bật.
     */
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),

    /*
     * Thông báo đẩy (FCM). Tắt (mặc định) thì:
     *   • `POST /notifications/device-token` VẪN nhận đăng ký — thiết bị đăng ký trước, bật sau,
     *     không phải đợi người dùng mở lại app;
     *   • KHÔNG có `push_deliveries` nào được tạo, nên bật lên không làm nổ ra một trận thông báo
     *     tồn đọng của mấy tuần trước;
     *   • hộp thư in-app hoạt động y như cũ — push là một LỚP GIAO VẬN, không phải nguồn tin.
     */
    PUSH_ENABLED: booleanish.default(false),

    // --- Xác thực SĐT / OTP (Phase 4) ---
    // mock -> sinh mã 6 số, KHÔNG gửi SMS: in ra log + trả `devCode` ở dev (tự động điền/test).
    // esms -> gửi thật qua eSMS.vn, cần 3 ESMS_* dưới. Firebase-code cũ dùng eSMS (không phải
    // Firebase Phone Auth); key prod nằm trong Secret Manager, không tái dùng local được.
    OTP_MODE: z.enum(['mock', 'esms']).default('mock'),
    ESMS_API_KEY: z.string().optional(),
    ESMS_SECRET_KEY: z.string().optional(),
    ESMS_BRANDNAME: z.string().optional(),
    // Nội dung tin OTP, `{code}` là chỗ điền mã. Nhà mạng chỉ giao tin KHỚP mẫu đã duyệt cho
    // brandname (lệch một ký tự là lỗi 146), nên câu này đi theo brandname của từng môi trường:
    // staging dùng brandname dùng chung `Baotrixemay` của eSMS ⇒ khai đúng câu mẫu của nó.
    ESMS_OTP_TEMPLATE: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .trim()
        .refine((v) => v.includes('{code}'), 'ESMS_OTP_TEMPLATE phải chứa {code}')
        .default('{code} la ma xac thuc XePrime cua ban. Ma het han sau 5 phut.'),
    ),
    // Mã OTP TEST (6 số) — gõ nó là xác thực xong, có gửi mã hay không, chạy SONG SONG với mã
    // thật. Staging khai ở GitHub Environment; máy dev không khai thì mặc định `123456`
    // (`resolveOtpBypassCode`). Production có giá trị là từ chối boot (superRefine dưới).
    OTP_BYPASS_CODE: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .trim()
        .regex(/^\d{6}$/, 'OTP_BYPASS_CODE phải là đúng 6 chữ số')
        .optional(),
    ),
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
     * --- Bản đồ: gợi ý địa chỉ + khoảng cách giao xe (24/08/2026 · Vietmap — ADR 0061) ---
     *
     * **Services key** của Vietmap (autocomplete · search · place · reverse · route · static map),
     * giới hạn theo IP của máy chạy API trên Vietmap console. Chỉ backend cầm nó: bản đồ trên web là
     * ảnh tĩnh API vẽ hộ, nên KHÔNG có key bản đồ nào trong bundle (ADR 0061 điều 1). Tilemap key
     * của Vietmap không dùng.
     *
     * Optional có chủ đích, kể cả ở production: thiếu key thì phí giao dự kiến đơn giản không
     * hiện và hai bên tự thoả thuận như trước — không có gì gãy, nên không đáng chặn boot.
     */
    VIETMAP_API_KEY: z.string().optional(),
    /*
     * Trần SỐ LƯỢT gọi nhà cung cấp bản đồ mỗi ngày (giờ Việt Nam) của một tiến trình API — cầu dao
     * chi phí (ADR 0061 điều 3). `/places/*` là endpoint công khai: không có trần này thì một kẻ
     * quét endpoint biến thành hoá đơn. Chạm trần ⇒ bản đồ coi như "không hỏi được" tới hết ngày —
     * ô địa chỉ cho dùng địa chỉ đã gõ, phí giao rơi về tự thoả thuận. 3.000 lượt ≈ 3.000 giao dịch
     * Vietmap (≈150.000đ/ngày ở mức ~50đ/giao dịch); nâng khi lưu lượng thật cần.
     */
    GEO_DAILY_CALL_BUDGET: z.coerce.number().int().positive().default(3000),

    /*
     * --- Ngày lễ Việt Nam: đồng bộ từ Google Calendar (26/08/2026) ---
     *
     * Hai biến này do **`apps/worker`** dùng, không phải API — API chỉ ĐỌC bảng
     * `public_holidays` và không biết Google tồn tại. Khai ở đây vì cả repo dùng chung một
     * `.env`: một biến không được khai báo là một biến không ai kiểm được chính tả, và người
     * gõ nhầm `GOOGLE_HOLIDAYS_API_KEY` sẽ không hiểu vì sao lịch mãi không có ngày lễ.
     *
     * Key của Google Cloud, không liên quan gì tới bản đồ (bản đồ là Vietmap — ADR 0061): Google
     * Maps Platform không dùng được cho tài khoản Việt Nam, nhưng Calendar API thì được.
     *
     * Optional kể cả ở production, cùng logic với `VIETMAP_API_KEY` và bộ `R2_*` phía
     * hiển thị: thiếu key thì lịch xe đơn giản không có lớp ngày lễ. Không có gì gãy, nên không
     * đáng chặn boot — vì vậy KHÔNG có điều kiện nào cho chúng ở `superRefine` bên dưới.
     */
    GOOGLE_HOLIDAY_API_KEY: z.string().optional(),

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
     * --- Bằng lái của khách: đọc ảnh tự động (ADR 0057) ---
     *
     *   tesseract — MẶC ĐỊNH: đọc bằng Tesseract chạy NGAY TRONG tiến trình API (WASM + dữ liệu
     *               tiếng Việt đóng gói trong node_modules). Không khoá, không gọi ra ngoài, không
     *               tốn phí theo lượt.
     *   off       — thoát hiểm: không đọc tự động, mọi lượt nộp vào hàng đợi duyệt tay (vd máy chủ
     *               quá tải CPU, hay bộ đọc đang tự quyết sai). Không cần revert.
     *
     * Ở cả hai chế độ, máy KHÔNG BAO GIỜ tự đánh dấu "đã xác thực" khi chưa đọc được ảnh.
     */
    DRIVER_LICENCE_OCR: z.enum(['tesseract', 'off']).default('tesseract'),

    /*
     * Cổng "phải có bằng lái đã xác thực mới gửi được yêu cầu thuê xe tự lái" (ADR 0057).
     *
     *   on   — MẶC ĐỊNH: chặn thật ở `POST /public/booking-requests`.
     *   off  — thoát hiểm: bỏ qua cổng (vd app native chưa có bước nộp bằng). Không cần revert.
     *
     * Chỉ là công tắc ROLLOUT — luồng nộp/duyệt bằng lái chạy bình thường ở cả hai chế độ.
     */
    DRIVER_LICENCE_ENFORCEMENT: z.enum(['off', 'on']).default('on'),

    /*
     * Đối tác phát hành bảo hiểm chuyến `IV`/`IP` (ADR 0032 điều 4 · luồng tiền v2).
     *
     *   none     — MẶC ĐỊNH: chưa có đối tác — hợp đồng dừng ở `failed/partner_not_configured`, phí
     *              đã thu nằm ở vế GIỮ HỘ. Không bao giờ có số chứng nhận bịa.
     *   mic_mock — GIẢ LẬP MIC cho dev/staging: phát GCN `MIC-VCX-…`/`MIC-NNTX-…` kèm link tra cứu
     *              để chạy trọn luồng bàn giao → phát hành. **Production từ chối boot** — GCN giả là
     *              khẳng định với khách rằng họ có bảo hiểm thật (ADR 0028 điều 5).
     */
    INSURANCE_PARTNER: z.enum(['none', 'mic_mock']).default('none'),

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
     *
     * ⚠️ `preprocess` biến chuỗi RỖNG thành `undefined` trước khi kiểm độ dài. Toàn bộ file này
     * coi "rỗng = chưa khai" (`superRefine` dưới dùng `Boolean(env[key])`, `kv()` của deploy bỏ
     * qua giá trị rỗng), nhưng `.min(16)` chạy TRƯỚC superRefine nên một dòng `SEPAY_API_KEY=`
     * bỏ trống trong `.env.example` làm API từ chối boot — và CI thì `cp .env.example .env`.
     * Sàn 16 ký tự vẫn áp nguyên cho khoá THẬT.
     */
    SEPAY_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(16).optional(),
    ),
    /** Mã ngân hàng theo chuẩn VietQR (vd `VCB`, `TCB`) — dùng dựng ảnh VietQR của SePay (`qr.sepay.vn`). */
    SEPAY_BANK_CODE: z.string().optional(),
    SEPAY_ACCOUNT_NUMBER: z.string().optional(),
    /** Tên chủ tài khoản in trên QR — người chuyển đối chiếu trước khi bấm gửi. */
    SEPAY_ACCOUNT_NAME: z.string().optional(),
    /**
     * Từ khoá ghép TRƯỚC mã đối soát trong nội dung chuyển khoản (QR + dòng "Nội dung chuyển
     * khoản"), cách một dấu cách. Một số ngân hàng nối SePay bằng API Banking (VietinBank…) CHỈ
     * đẩy sang SePay giao dịch có nội dung BẮT ĐẦU bằng `SEVQR` — kèm `TKP<VA>` khi dùng tài khoản
     * ảo tự tạo (vd `SEVQR TKPXEP`). Thiếu nó, tiền vẫn vào tài khoản nhưng webhook không bao giờ
     * tới. Trống = nội dung chỉ là mã.
     *
     * Không thuộc nhóm bốn biến: là đặc thù của ngân hàng nhận, không phải của SePay. Cấm chứa
     * `XP` — `extractReferenceCode` tìm mã `XPG…`/`XPH…` ở BẤT KỲ đâu trong nội dung, một tiền tố
     * mang chữ đó có thể bị đọc nhầm thành mã khi ngân hàng viết liền.
     */
    SEPAY_TRANSFER_PREFIX: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .string()
        .regex(
          /^[A-Z0-9]{2,16}( [A-Z0-9]{2,16}){0,2}$/,
          'Một đến ba cụm chữ in hoa không dấu / chữ số, cách nhau một dấu cách (vd SEVQR, SEVQR TKPABC)',
        )
        .refine(
          (value) => !value.includes('XP'),
          'Không được chứa "XP" — trùng tiền tố mã đối soát',
        )
        .optional(),
    ),

    /*
     * --- Cổng thanh toán MoMo · VNPAY (ADR 0058 — Proposed) ---
     *
     * Phương thức BỔ SUNG bên cạnh chuyển khoản VietQR/SePay, không thay nó. Mọi thứ mặc định TẮT
     * và fail closed: thiếu cấu hình thì endpoint checkout trả 503 `PAYMENT_GATEWAY_UNAVAILABLE`,
     * IPN trả lời "không nhận", và giao diện không hiện nút nào — không bao giờ dựng một liên kết
     * thanh toán giả.
     *
     * HAI TRỤC độc lập:
     *   • CỔNG có cấu hình chưa — mỗi cổng là một nhóm bốn-biến-hoặc-không (khai nửa nhóm fail lúc
     *     boot, cùng khuôn SePay/OAuth);
     *   • LUỒNG nào được dùng cổng — `PAYMENT_GATEWAY_SUBSCRIPTION` (hoá đơn gói) và
     *     `PAYMENT_GATEWAY_BOOKING_HOLD` (tiền giữ chỗ). Phương thức hiện cho một luồng = luồng bật
     *     VÀ cổng có cấu hình.
     *
     * Release gate nằm ở `superRefine`: production từ chối boot nếu bật cổng cho BẤT KỲ luồng nào
     * khi ADR 0058 còn Proposed (tiền giữ chỗ: gate L1/L5; cả hai luồng: phí cổng, đối soát, hợp
     * đồng merchant). Gỡ chặn đó là một PR có ADR Accepted đi kèm, không phải một lần đổi biến.
     *
     * Bí mật (`MOMO_SECRET_KEY`, `MOMO_ACCESS_KEY`, `VNPAY_HASH_SECRET`) chỉ đọc ở backend, không
     * bao giờ ra frontend, bundle app, log hay OpenAPI. URL của cổng là cấu hình — không gõ cứng
     * miền sandbox hay production trong mã.
     */
    /**
     * `sandbox` | `live` — nhãn môi trường của cổng. Web hiện thẻ "Môi trường thử" khi `sandbox` để
     * người thử không tưởng mình trả tiền thật; production bắt buộc `live` khi có luồng nào bật.
     */
    PAYMENT_GATEWAY_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
    PAYMENT_GATEWAY_SUBSCRIPTION: z.enum(['off', 'on']).default('off'),
    PAYMENT_GATEWAY_BOOKING_HOLD: z.enum(['off', 'on']).default('off'),
    MOMO_PARTNER_CODE: optionalSecret(),
    MOMO_ACCESS_KEY: optionalSecret(),
    MOMO_SECRET_KEY: optionalSecret(),
    /** Gốc API của MoMo, không có `/` cuối (vd sandbox `https://test-payment.momo.vn`). */
    MOMO_API_BASE_URL: optionalUrl(),
    /** `vnp_TmnCode` — mã website/terminal VNPAY cấp. */
    VNPAY_TMN_CODE: optionalSecret(),
    VNPAY_HASH_SECRET: optionalSecret(),
    /** URL trang thanh toán (vd sandbox `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`). */
    VNPAY_PAYMENT_URL: optionalUrl(),
    /** URL API truy vấn giao dịch `querydr` (vd sandbox `…/merchant_webapi/api/transaction`). */
    VNPAY_API_URL: optionalUrl(),

    // --- Web + Email (cho link đặt lại mật khẩu) ---
    APP_WEB_URL: z.string().default('http://localhost:3000'),
    /*
     * URL gốc của site partner và site admin — ADR 0051/0053. `APP_WEB_URL` là site KHÁCH.
     * Link trong email (đặt lại mật khẩu, lời mời thành viên) và chỗ quay về sau OAuth dựng từ URL
     * của ĐÚNG realm người nhận, qua `webUrlFor(realm)`. Ở chế độ `path` (máy dev) URL mang luôn
     * tiền tố khu: `http://localhost:3000/manage`, `http://localhost:3000/admin`.
     */
    WEB_PARTNER_URL: z.string().default('http://localhost:3000/manage'),
    WEB_ADMIN_URL: z.string().default('http://localhost:3000/admin'),
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

    // Cổng thanh toán (ADR 0058): mỗi cổng là nhóm bốn-biến-hoặc-không — một IPN công khai có
    // quyền ghi tiền mà thiếu khoá để kiểm chữ ký là cấu hình gõ thiếu, fail lúc boot.
    const gatewayGroups = {
      MOMO: ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY', 'MOMO_API_BASE_URL'],
      VNPAY: ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET', 'VNPAY_PAYMENT_URL', 'VNPAY_API_URL'],
    } as const;
    let gatewaysConfigured = 0;
    for (const [name, keys] of Object.entries(gatewayGroups)) {
      const set = keys.filter((key) => Boolean(env[key]));
      if (set.length === keys.length) gatewaysConfigured += 1;
      if (set.length > 0 && set.length < keys.length) {
        for (const key of keys) {
          if (!env[key]) {
            ctx.addIssue({
              code: 'custom',
              path: [key],
              message: `${key} thiếu — bốn biến ${name}_* phải khai cùng nhau (hoặc bỏ trống cả bốn để tắt cổng)`,
            });
          }
        }
      }
    }
    // Bật một luồng mà không có cổng nào là cấu hình vô nghĩa — nói ra lúc boot thay vì để màn
    // thanh toán im lặng không có nút nào mà không ai biết vì sao.
    for (const flag of ['PAYMENT_GATEWAY_SUBSCRIPTION', 'PAYMENT_GATEWAY_BOOKING_HOLD'] as const) {
      if (env[flag] === 'on' && gatewaysConfigured === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [flag],
          message: `${flag}=on nhưng chưa cổng nào được cấu hình đủ (MOMO_* hoặc VNPAY_*)`,
        });
      }
    }

    /*
     * Credential Firebase Admin: bắt buộc khi BẤT KỲ tính năng nào dùng nó được bật.
     *
     * Tách khỏi khối `FIRESTORE_ENABLED` bên dưới vì hai cờ độc lập: một triển khai có thể bật
     * push mà tắt chat realtime (đúng cấu hình của giai đoạn này), và khi đó nhóm `R2_*` của
     * đính kèm chat không liên quan gì.
     */
    if (env.FIRESTORE_ENABLED || env.PUSH_ENABLED) {
      for (const key of [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_PRIVATE_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} là bắt buộc khi FIRESTORE_ENABLED=true hoặc PUSH_ENABLED=true`,
          });
        }
      }
    }

    // Bật chat realtime → thêm R2 (đính kèm) ngoài credential Firebase ở trên.
    if (env.FIRESTORE_ENABLED) {
      const required = [
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

    // ADR 0053: cookie phiên host-only. Một `SESSION_COOKIE_DOMAIN` còn sót từ file env cũ không
    // còn tác dụng gì — nhưng người đọc env sẽ tưởng cookie đang đi chung ba site. Từ chối ở MỌI
    // môi trường để không ai phải đoán.
    if (env.SESSION_COOKIE_DOMAIN?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_DOMAIN'],
        message:
          'SESSION_COOKIE_DOMAIN không còn dùng (ADR 0053 — cookie phiên host-only theo từng site). Xoá dòng này khỏi env',
      });
    }

    // ── Cửa chặn cho MỌI môi trường đã triển khai (kể cả staging) ─────────
    // Nhóm này là BẢO MẬT, và staging không được miễn: nó cũng nằm trên Internet công khai, cũng
    // phát cookie phiên thật. Chúng phải fail lúc BOOT — một API ghi link đặt lại mật khẩu ra
    // log, hay gửi `redirect_uri` OAuth trỏ localhost, là sự cố an ninh chứ không phải cấu hình
    // sai vặt.
    if (env.NODE_ENV !== 'production') return;

    // `APP_ENV=development` là nhãn của MÁY DEV (seed demo được phép). Môi trường đã triển khai khai
    // nó là nhầm file env — và nó còn mở devCode OTP như staging.
    if (env.APP_ENV === 'development') {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message:
          'APP_ENV=development chỉ dành cho máy dev (NODE_ENV khác production) — môi trường đã triển khai dùng staging hoặc production',
      });
    }

    // ADR 0053 điều 4: realm của request web do PROXY quyết. Cờ dev mà lọt lên môi trường thật là
    // để bất kỳ ai tự khai `x-xp-realm: platform`.
    if (env.REALM_HEADER_FROM_CLIENT) {
      ctx.addIssue({
        code: 'custom',
        path: ['REALM_HEADER_FROM_CLIENT'],
        message:
          'REALM_HEADER_FROM_CLIENT chỉ dành cho máy dev — môi trường đã triển khai phải để realm do Caddy gắn (ADR 0053)',
      });
    }
    if (!env.REALM_PROXY_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['REALM_PROXY_SECRET'],
        message:
          'REALM_PROXY_SECRET là bắt buộc ở môi trường đã triển khai — thiếu nó API không tin được header realm của Caddy (ADR 0053)',
      });
    }
    for (const key of ['WEB_PARTNER_URL', 'WEB_ADMIN_URL'] as const) {
      if (!env[key].startsWith('https://') || /localhost|127\.0\.0\.1/.test(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} phải là URL https của tên miền thật (link email và chỗ quay về sau đăng nhập dựng từ đây)`,
        });
      }
    }

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

    // Cổng thanh toán: khoá ký đi kèm mọi request — một URL http là gửi chữ ký và dữ liệu thanh toán
    // qua đường truyền không mã hoá. Áp cho cả staging (cũng nằm trên Internet công khai).
    for (const key of ['MOMO_API_BASE_URL', 'VNPAY_PAYMENT_URL', 'VNPAY_API_URL'] as const) {
      const url = env[key];
      if (url && !url.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} phải là URL https ở môi trường đã triển khai`,
        });
      }
    }

    // ── Từ đây trở xuống: CHỈ production ──────────────────────────────────
    // Nhóm NĂNG LỰC. Thiếu chúng, app vẫn boot và vẫn chạy, chỉ là ba tính năng suy giảm một
    // cách có kiểm soát: mã OTP vào log thay vì SMS, email đặt lại mật khẩu vào log thay vì hộp
    // thư, endpoint upload trả 503 `UPLOADS_NOT_CONFIGURED`. Ở production đó là ba sự cố; ở
    // staging đó là ba khoản chi phí không có lý do tồn tại.
    if (env.APP_ENV !== 'production') return;

    // Adapter bảo hiểm GIẢ LẬP ở production = phát GCN không tồn tại cho khách thật đã trả phí.
    if (env.INSURANCE_PARTNER === 'mic_mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['INSURANCE_PARTNER'],
        message:
          'INSURANCE_PARTNER=mic_mock chỉ dành cho dev/staging — production phải dùng none cho tới khi có adapter đối tác thật',
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

    // Mã test ở production = ai cũng đăng nhập/xác thực được SĐT của người khác. Đây là cửa BẢO
    // MẬT, nhưng nằm trong nhóm production vì staging CỐ Ý được dùng nó.
    if (env.OTP_BYPASS_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_BYPASS_CODE'],
        message:
          'OTP_BYPASS_CODE chỉ dành cho dev/staging — production phải để trống (xoá Variable ở GitHub Environment production)',
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

    /*
     * RELEASE GATE của cổng thanh toán (ADR 0058 — Proposed · ADR 0028 release gate · roadmap §8.2).
     *
     *  - Tiền giữ chỗ chứa tiền của NHIỀU bên (`D` của chủ xe, `IV`/`IP` giữ hộ hãng bảo hiểm) — nhận
     *    nó qua một cổng là thu hộ qua một trung gian thanh toán, đúng thứ gate L1 (ý kiến pháp lý thu
     *    hộ/chi hộ) và L5 (điều khoản) đang chặn, cộng ADR 0058 Q1–Q4.
     *  - Hoá đơn gói: ADR 0058 Q2 (ai chịu phí cổng), Q5 (đối soát ngày chưa có vế tiền đang nằm ở
     *    cổng — gate R2 "khớp sổ mà admin không sửa database"), Q8 (hợp đồng merchant).
     *
     * Chặn CẢ HAI ở đây chứ không chỉ để mặc định `off`: gỡ chặn phải là một PR kèm ADR 0058 Accepted,
     * không phải một lần sửa biến môi trường. Staging (sandbox) không bị chặn — đó là chỗ để UAT.
     */
    for (const flag of ['PAYMENT_GATEWAY_SUBSCRIPTION', 'PAYMENT_GATEWAY_BOOKING_HOLD'] as const) {
      if (env[flag] === 'on') {
        ctx.addIssue({
          code: 'custom',
          path: [flag],
          message: `${flag}=on chưa được phép ở production — cổng thanh toán chưa vượt release gate (ADR 0058 còn Proposed)`,
        });
      }
    }
    // Khi đã gỡ chặn: production thu tiền THẬT, một nhãn `sandbox` là dấu hiệu khoá thử đang dùng thật.
    if (
      (env.PAYMENT_GATEWAY_SUBSCRIPTION === 'on' || env.PAYMENT_GATEWAY_BOOKING_HOLD === 'on') &&
      env.PAYMENT_GATEWAY_MODE !== 'live'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_GATEWAY_MODE'],
        message:
          'PAYMENT_GATEWAY_MODE phải là live khi bật cổng thanh toán ở production (khoá và URL của môi trường thật)',
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
