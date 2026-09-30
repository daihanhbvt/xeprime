# ADR 0051 — Bề mặt sản phẩm: ba zone web trong một Next app, hai variant mobile trong một Expo project, một API

Ngày: 30/09/2026 · Trạng thái: Accepted · Mở rộng: 0002 (cookie dùng chung ba host + chặn CSRF bằng
`Origin`), 0017 (`client_type` theo app, scheme thứ hai), 0031 (vẫn mỗi PLATFORM một bản), 0038 (ranh
giới tuyến giữ nguyên, bộ đổi khu thay bằng hai app), 0040, 0050 (tenant-support ở zone admin) ·
Liên quan: 0012, 0014, 0027 · Không ghi đè ADR nào — thay lập luận "một tên miền" của
`docs/deployment.md` §2.1

## Bối cảnh

Sản phẩm tách theo KHÁN GIẢ:

| Bề mặt | Khán giả |
| --- | --- |
| `xeprime.vn` · app **XePrime** | Khách thuê + chủ xe cá nhân tuyến hoa hồng (Owner Lite) |
| `partner.xeprime.vn` · app **XePrime Partner** | Gian hàng tuyến gói (Full Manage). **Không** có tuyến hoa hồng |
| `admin.xeprime.vn` | Nhân sự nền tảng |

Hiện trạng (rà 30/09/2026): một Next app phục vụ cả bốn khu (`/`, `/account`, `/manage`,
`/manage/admin`), mọi quyết định "vào khu nào" nằm ở client, admin dùng chung `AppShell` và
`constants/nav.ts` với Manage; một app Expo (`vn.xeprime.mobile`) với Navigator kép khách ↔ quản lý
và `ScopeSwitcher`, không có `eas.json` hay variant.

Điều quyết định hình dạng lời giải: **ranh giới giữa hai app mobile và giữa `xeprime.vn` với
`partner.xeprime.vn` TRÙNG KHÍT ranh giới TUYẾN mà server đã thi hành** (`resolveEffectiveBilling`,
`tenants.onboarding_state`, `@SubscriptionTrackOnly`, `@PlatformOnly`, `@TenantScoped` — ADR
0038/0040). Việc tách là việc của BỀ MẶT, không phải của domain. Tách backend, DB hay repo không trả
lời câu hỏi nào mà sản phẩm đang hỏi.

## Quyết định

### 1. Giữ chung mọi thứ dưới bề mặt

Một monorepo, một NestJS modular monolith, một PostgreSQL, một worker. **Không BFF theo app**: mọi
bề mặt dùng cùng booking/lịch/tiền và khác nhau ở QUYỀN và TUYẾN — thứ guard đã xử lý. BFF theo app
là nhân đôi logic phân quyền. Multirepo là publish/version package cho bốn app cùng tiêu thụ
`@xeprime/types`, `@xeprime/domain` và contract sinh — đổi API và client không còn atomic.

### 2. Web: MỘT Next app, BA zone theo host

| Host | Đường dẫn | Ai |
| --- | --- | --- |
| `xeprime.vn` | `/`, `/search`, `/listings/*`, `/shops/*`, `/trips/*`, `/chat`, `/account/**`, `/list-your-vehicle*`, `/legal/*`, `/support` | Khách, chủ xe hoa hồng |
| `partner.xeprime.vn` | `/manage/**` trừ admin, `/manage/login`, `/manage/onboarding`, `/invites/[token]`; `/` ⇒ `/manage` | Gian hàng tuyến gói, `package_pending` |
| `admin.xeprime.vn` | `/manage/admin/**` (gồm tenant-support); `/` ⇒ `/manage/admin` | Nhân sự nền tảng |

Vì sao không ba Next app:

- Tenant-support (ADR 0050) mount 27 view Manage bên trong admin; Owner Lite dùng chung vehicle
  editor, lịch, ví, thuế với Manage. Ba app buộc bóc ~60k LOC feature ra package và nhân đôi shell,
  auth, i18n, `ROUTES`.
- Web **không gọi API phía server** (`docs/deployment.md` §2). Tiến trình Next không giữ secret nào,
  nên tách app không thêm một lớp bảo mật nào. Bảo mật nằm ở API (điều 5).

**Giữ tiền tố `/manage` trong URL** của host partner/admin. Bỏ nó bằng rewrite làm `usePathname`
trả đường dẫn HIỂN THỊ trong khi `isManageRoute`, `isPlatformRoute`,
`tenantSupportContextIdFromPath`, `toTenantSupportRoute` và `post-auth-destination` so với đường dẫn
NỘI BỘ. Làm đẹp URL là việc tuỳ chọn, chỉ sau khi mọi phép đọc path đi qua một hàm duy nhất.

Host là **cổng điều hướng**, không phải kiểm soát quyền: `proxy.ts` 308 đường sai host về đúng host
(kể cả URL cũ `xeprime.vn/manage/*`), vẫn chỉ đọc cookie. Máy dev chạy `XP_ZONE_MODE=path` (localhost
không chia sẻ cookie qua subdomain) — khi đó không gác host. Admin có shell riêng; menu chọn theo
ZONE, không theo `navForScope(isPlatform)`.

### 3. Mobile: MỘT Expo project, HAI variant

`APP_VARIANT=customer|partner` chọn tên, bundle id, scheme, icon, `google-services`, EAS project và
**thư mục route** (option `root` của plugin `expo-router` — có trong `expo-router@6.0.24`). Mỗi binary
chỉ bundle route của nó; `src/features/**` dùng chung trực tiếp.

| Variant | Bundle id / scheme | Có | Không có |
| --- | --- | --- | --- |
| XePrime | `vn.xeprime.mobile` / `xeprime://` | khu khách, Owner Lite, đăng ký tuyến hoa hồng | `manage/**` |
| XePrime Partner | `vn.xeprime.partner` / `xeprimepartner://` | toàn bộ `manage/**`, onboarding gói, lời mời, chat gian hàng | chợ xe, đặt xe |

Vì sao không hai Expo project: hai lần nâng Expo/native deps, và phải bóc ~118k LOC feature ra package.

`ScopeSwitcher`/Navigator kép bị thay bằng **cổng variant**:

- App XePrime + tenant tuyến gói hoặc `package_pending` ⇒ màn chuyển sang XePrime Partner (ADR 0038
  điều 6: tài khoản gian hàng không đặt xe — app khách không có gì cho họ).
- App Partner + chưa có tenant ⇒ đăng ký gian hàng gói (ADR 0040) trong app.
- App Partner + tenant tuyến hoa hồng ⇒ nâng cấp trên TENANT HIỆN CÓ (ADR 0038 điều 9) trong app;
  app XePrime chỉ dẫn sang.
- Nhân sự nền tảng không có app nào.

### 4. Tầng gọi API: vẫn mỗi PLATFORM một bản

ADR 0031 giữ nguyên. Năm bề mặt nhưng vẫn đúng **hai bản** (web, mobile): zone và variant nằm cùng
app nên dùng chung trực tiếp. Để giảm phần chép tay, `@xeprime/api-client` được phép có một client
có kiểu sinh từ `paths` của `api.generated.ts` (hạ tầng thuần, không đường dẫn nghiệp vụ viết tay);
feature chuyển dần khi được đụng tới.

### 5. API là nơi thi hành, không phải host

- **Một cookie phiên cho ba host** (`SESSION_COOKIE_DOMAIN=.xeprime.vn`, như hiện tại).
- **CSRF bằng `Origin`**: request đổi trạng thái đi bằng cookie mà `Origin` không thuộc
  `CORS_ORIGINS` ⇒ 403. Bearer không áp. Ba host `sameSite: lax` coi nhau là cùng site, nên cookie
  một mình không còn là bằng chứng request đến từ đúng giao diện.
- **Endpoint nền tảng** (`platform/*`) với phiên cookie đòi `Origin` = origin admin. Allowlist IP (nếu
  bật) đặt ở site API của Caddy theo đường `platform/*` — chặn ở site web không bảo vệ gì vì trang
  admin gọi thẳng `api.xeprime.vn`.
- **URL web theo zone**: `APP_WEB_URL` tách thành URL market/partner/admin (`APP_WEB_URL` là alias
  market trong giai đoạn chuyển). OAuth ghi ZONE (enum, không phải URL tự do) vào `oauth_states` lúc
  bắt đầu; reset mật khẩu nhận zone; lời mời thành viên về host partner. Đích `next=` khác zone chỉ
  chấp nhận origin trong allowlist ba host.
- **App đích của thông báo đẩy do TUYẾN quyết định, không do audience**: `push_devices` biết app của
  nó; audience `customer` ⇒ XePrime; audience `manage` ⇒ Partner nếu tenant đang ở tuyến gói
  (`resolveEffectiveBilling`), ngược lại ⇒ XePrime (Owner Lite nhận thông báo quản lý ở app khách).
  `native_auth_sessions.client_type` phân biệt hai app.
- **Tenant đang làm việc** chọn được, lưu phía server (cookie httpOnly riêng cho web, cột trên
  `native_auth_sessions` cho native), kiểm lại membership MỖI request, fallback về membership cũ
  nhất. Không vào JWT (ADR 0002/0017). Chi tiết ở ADR riêng — đây là điều kiện để Partner phục vụ
  nhân sự thuộc nhiều gian hàng.

## Ràng buộc bắt buộc

1. Host, variant, menu là TRÌNH BÀY. Không một quyết định quyền hay tuyến nào được dựa trên host hay
   variant — server vẫn là nguồn duy nhất.
2. Zone/variant mỏng: route, layout, nav, cổng. Logic ở `features/`, luật ở `packages/`.
3. Không tạo package mới cho zone hay variant; package chỉ sinh khi có consumer thứ hai thật.
4. Ranh giới import thi hành bằng ESLint: market và partner không import view admin; admin **được**
   import view partner (tenant-support) — chiều cho phép duy nhất. Route của variant này không import
   route của variant kia; feature dùng chung không gõ cứng route mà đi qua bảng route của variant.
5. Không đổi đường dẫn endpoint API vì bề mặt. Nhóm theo bề mặt bằng decorator/OpenAPI tag.
6. Staging dùng `partner-stg.` / `admin-stg.` (Universal SSL chỉ phủ một cấp subdomain).

## Thứ tự triển khai

| Pha | Việc | Chặn bởi |
| --- | --- | --- |
| 1 | Rào chắn không đổi hành vi: pre-commit thật, `next build` + kiểm contract trong CI, ESLint ranh giới | — |
| 2 | Web ba zone + phần API của điều 5 (trừ tenant đang làm việc) + DNS/Caddy/biến môi trường | Deploy: gate H1 (staging). Code làm được trên máy dev |
| 3 | Mobile hai variant, `eas.json`, định tuyến push, universal link theo host — dev mobile | `client_type` + `push_devices` của pha 2 |
| 4 | Tenant đang làm việc (ADR riêng) + bộ chọn gian hàng ở Partner | Trước khi Partner có nhân sự nhiều gian hàng |

Pha 2 nên xong **trước người dùng thật**: đổi URL lúc này không phải di trú bookmark, email hay
thông báo của ai.

## Cần xem lại khi nào

- **Tách một zone thành Next app riêng** khi: có đội riêng sở hữu nó; nhịp release xung đột thật;
  build/bộ nhớ vượt ngưỡng VPS; hoặc admin cần chính sách phiên riêng MÀ không làm được ở API. Nhờ
  ràng buộc 4, tách là chuyển thư mục.
- **Tách Expo project** khi hai app cần phiên bản Expo/native deps khác nhau, hoặc hai đội.
- **Hợp nhất tầng gọi API web ↔ mobile** theo điều kiện của ADR 0031 (≥ 3 lỗi production do lệch).
