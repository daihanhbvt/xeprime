# ADR 0051 — Bề mặt sản phẩm: ba site web trong một Next app (URL sạch theo host), hai app mobile, một API

Ngày: 30/09/2026 · **Viết lại toàn bộ 02/10/2026** (bản 30/09 giữ `/manage` trong URL, dùng chung
session ba host và đặt Owner Lite ở `xeprime.vn` — cả ba điều đã bỏ; bản cũ còn trong lịch sử git) ·
Trạng thái: Accepted · Đi cùng: [ADR 0053](0053-separate-account-realms.md) (ba không gian tài khoản,
session tách biệt) · Mở rộng: 0002, 0017, 0031, 0040, 0050 · Ghi đè: 0032 điều 6 và 0040 (vị trí
Owner Lite — chi tiết ở 0053) · Thay lập luận "một tên miền" của `docs/deployment.md` §2.1

## Bối cảnh

Sản phẩm tách theo KHÁN GIẢ, và mỗi khán giả có TÀI KHOẢN riêng (ADR 0053):

| Bề mặt | Ai dùng |
| --- | --- |
| `xeprime.vn` · app **XePrime** | Chỉ khách thuê |
| `partner.xeprime.vn` · app **XePrime Partner** | Gian hàng tuyến gói (Full Manage) **và** chủ xe cá nhân tuyến hoa hồng (Owner Lite) |
| `admin.xeprime.vn` | Nhân sự nền tảng |

Hiện trạng trước ADR này: một Next app phục vụ mọi khu bằng đường dẫn (`/`, `/account`, `/manage`,
`/manage/admin`); mọi quyết định "vào khu nào" nằm ở client; admin dùng chung `AppShell` và
`constants/nav.ts` với Manage; Owner Lite nằm trong `/account` của khu khách.

Ranh giới TUYẾN (hoa hồng ↔ gói) đã được server thi hành (`resolveEffectiveBilling`,
`@SubscriptionTrackOnly` — ADR 0038). Việc tách bề mặt là việc của trình bày, định tuyến và phiên —
không phải của domain.

## Quyết định

### 1. Giữ chung mọi thứ dưới bề mặt

Một monorepo, một NestJS modular monolith, một PostgreSQL, một worker. **Không BFF theo site/app.**
Mọi bề mặt dùng chung booking, lịch và tiền; dòng tiền băng qua khách ↔ chủ xe trong MỘT transaction
(ADR 0053 điều 8), nên không tách DB.

### 2. Web: MỘT Next app, BA site theo host, URL sạch

| Người dùng thấy | Thư mục nội bộ |
| --- | --- |
| `xeprime.vn/…` (`/`, `/search`, `/listings/*`, `/trips/*`, `/chat`, `/account/**`…) | `app/(public)/…` |
| `partner.xeprime.vn/vehicles`, `/login`, `/onboarding`… | `app/(manage)/manage/…` |
| `admin.xeprime.vn/tenants`, `/tenant-support/[ctx]/vehicles`… | `app/(admin)/admin/…` |

- Tiền tố `/manage` và `/admin` **chỉ còn là tên thư mục**. Chỉ `proxy.ts` và `zoneBase()` biết tới
  chúng; mọi code khác (link, so sánh path, `usePathname`) làm việc trên URL HIỂN THỊ. Đã kiểm trên
  Next 16.2: rewrite trong `proxy.ts` giữ `req.url` gốc, nên `usePathname` trả path hiển thị ở cả
  server lẫn client.
- `proxy.ts` ở chế độ `host`: rewrite theo host; URL cũ `xeprime.vn/manage/*` và
  `/manage/admin/*` chuyển sang đúng host + path sạch (307 cho tới khi staging ổn, rồi 308); gõ thẳng
  tiền tố nội bộ trên host khác ⇒ 404; host partner/admin gắn `X-Robots-Tag: noindex`.
- Route dùng chung mọi host đi thẳng không rewrite: `/_next`, asset tĩnh, `/.well-known`, `/api`
  (điều 4), và các trang công khai mà cả ba site cần (văn bản pháp lý…). Đặt lại mật khẩu và lời mời
  là trang CỦA TỪNG SITE (mỗi site một không gian tài khoản), không dùng chung.
- Khu được xác định bằng `<ZoneProvider>` ở layout gốc của từng route group, **không** bằng tiền tố
  path (sau khi bỏ tiền tố, `/chat` hay `/support` tồn tại ở nhiều site).
- Điều hướng khác site đi qua `zoneHref()` (URL tuyệt đối) + `location.assign`.
- Máy dev: chế độ `path` (mặc định) — `localhost:3000` chứa cả ba khu dưới tiền tố nội bộ, không
  rewrite. `zoneBase()` trả tiền tố ở chế độ này nên code giống hệt nhau ở hai chế độ. Chế độ `host`
  ở local dùng file hosts `*.xeprime.test`.

### 3. Site partner phục vụ HAI tuyến trên MỘT cây URL

Owner Lite rời `/account` của `xeprime.vn` sang `partner.xeprime.vn`. Trang có cùng ý nghĩa ở hai
tuyến (xe, lịch, chuyến/đơn, số dư, thuế, chứng từ, gói, tài khoản) dùng MỘT URL; nội dung chọn theo
tuyến hiệu lực do server trả. Trang chỉ của tuyến gói bị chặn ở server (`@SubscriptionTrackOnly`) và
ẩn khỏi menu tuyến hoa hồng. Đây là đúng nguyên tắc Product Vision §2.2: *cùng module, API và dữ liệu;
UI chỉ hiện năng lực của gói*. Đăng ký cả hai tuyến (ADR 0040) diễn ra ở site partner; `xeprime.vn`
chỉ còn lối dẫn sang.

Admin có khung giao diện riêng (`AdminShell`), dùng lại Sidebar/Topbar. Menu chọn theo site, không
theo `navForScope(isPlatform)`.

### 4. API cùng origin dưới `/api` của từng site

Caddy chuyển `xeprime.vn/api/*`, `partner.xeprime.vn/api/*`, `admin.xeprime.vn/api/*` về cùng một
NestJS và gắn header realm theo host (ADR 0053 điều 4). `NEXT_PUBLIC_API_URL=/api` — một image chạy
được trên mọi host, mọi request cùng origin, không còn CORS cho web. `api.xeprime.vn` giữ lại cho app
mobile (Bearer). Cơ chế session/cookie: ADR 0053.

### 5. Mobile: hai Expo project mỏng + một package dùng chung (ghi nhận hiện trạng)

Đội mobile đã tách `apps/mobile` thành `customer/` (`@xeprime/mobile-customer`, `vn.xeprime.mobile`,
scheme `xeprime`), `manage/` (`@xeprime/mobile-manage`, `vn.xeprime.partner`, scheme
`xeprimepartner`) và `shared/` (`@xeprime/mobile-shared`) — thiết kế ở `docs/mobile-split-impact.md`.
Mỗi app chỉ ghi đè `src/app-profile.ts` và `src/navigation/routes.ts` qua alias `@/*`; phiên bản thư
viện chung qua pnpm `catalog:`. Cách này thay cho "một Expo project, hai variant" của bản 30/09.

**Lệch đã biết, chưa xử lý theo chỉ đạo 02/10/2026 (không đụng mobile đợt này):** app Partner hiện chỉ
nhận tuyến gói, còn app XePrime vẫn chứa Owner Lite. Theo ADR 0053, chủ xe tuyến hoa hồng thuộc không
gian `partner` — đội mobile phải căn lại khi mở việc mobile.

### 6. Bảo vệ nằm ở API, không ở host

Host chỉ là trình bày và điều hướng. Quyền và tuyến do guard backend quyết. Bổ sung: chặn CSRF theo
`Origin` cho request đổi trạng thái đi bằng cookie; endpoint `platform/*` chỉ nhận realm `platform`
(ADR 0053 điều 5).

### 7. Triển khai

Một image cho mọi host. Caddy thêm site `partner.` và `admin.` (staging: `partner-stg.`, `admin-stg.`
— Universal SSL chỉ phủ một cấp), mỗi site có `handle /api/*`. Web không giữ trạng thái riêng, nên
sau này đặt mỗi site trên một VPS chỉ cần đổi deploy (mỗi node web chỉ nhận biến của web; node core
chạy api/worker/db và migration trước).

## Ràng buộc bắt buộc

1. Không quyết định quyền hay tuyến nào dựa trên host, site hay app — server là nguồn duy nhất.
2. Không chuỗi `'/manage'`/`'/admin'` gõ cứng ngoài `zones/`, `proxy.ts` và thư mục `app/`.
3. Không đoán khu từ tiền tố path; dùng `useZone()`.
4. Lint ranh giới: khu `public` và `manage` không import feature `admin-*`; khu admin ĐƯỢC import
   view của partner (tenant-support, ADR 0050) — chiều cho phép duy nhất.
5. **Web không có trạng thái riêng:** không ghi file ra ổ của web, không giữ phiên trong RAM, không
   gọi DB hay API nội bộ từ phía server Next. Đây là điều kiện để chia site ra nhiều máy.
6. Không đổi đường dẫn endpoint API vì bề mặt; nhóm theo realm bằng decorator.
7. Không thêm Next app, Expo project hay BFF khi chưa chạm điều kiện dưới.

## Cần xem lại khi nào

- **Tách một site thành Next app riêng** khi: có đội riêng sở hữu nó; nhịp release xung đột thật;
  build hoặc bộ nhớ vượt ngưỡng VPS; hoặc có yêu cầu "server công khai không được chứa code admin".
  Nhờ ràng buộc 4, tách là chuyển thư mục.
- **Căn lại mobile** theo ADR 0053 khi mở lại việc mobile.
