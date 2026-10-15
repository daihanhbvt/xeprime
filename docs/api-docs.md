# Tài liệu API (Swagger / OpenAPI)

Ngày viết: 21/08/2026 · Cập nhật: 06/10/2026

Dev mới vào dự án muốn biết API có gì, gọi thế nào, trả về gì → đọc file này trước.

## 1. Mở tài liệu

```bash
pnpm --filter @xeprime/api dev     # cần Postgres đang chạy (docker compose up -d db)
```

| Địa chỉ                         | Là gì                                                      |
| ------------------------------- | ---------------------------------------------------------- |
| http://localhost:4000/docs      | Swagger UI — đọc, thử gọi trực tiếp                        |
| http://localhost:4000/docs-json | Spec thô, import thẳng vào Postman / Insomnia / Scalar     |
| `packages/types/openapi.json`   | Bản spec đã commit — xem được mà **không cần chạy server** |

Swagger UI **tắt khi `NODE_ENV=production`** (nó phơi toàn bộ bề mặt API). Muốn đưa tài liệu cho
người ngoài mà không dựng server: gửi `packages/types/openapi.json`, mở bằng bất kỳ viewer nào.

### Cho máy khác cùng mạng LAN vào xem

API đã bind `0.0.0.0` sẵn, nên chỉ cần mở `http://<IP-máy-bạn>:4000/docs`. Hai thứ chặn đường:

1. **Windows Firewall.** Rule `Node.js JavaScript Runtime` cài sẵn thường chỉ áp cho profile
   _Public_, trong khi Wi-Fi ở nhà/văn phòng là _Private_ → inbound bị chặn. Mở theo CỔNG (hẹp hơn
   nới rule cho cả `node.exe`), chạy PowerShell **Administrator**:

   ```powershell
   New-NetFirewallRule -DisplayName "XePrime API (4000)" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "XePrime Web (3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```

2. **CSP `upgrade-insecure-requests`.** Đã xử lý ở [bootstrap.ts](../apps/api/src/bootstrap.ts):
   directive này bị bỏ khi `NODE_ENV` khác `production`. Nếu còn nó, trình duyệt nâng mọi asset
   Swagger lên `https://` và trang trắng kèm `ERR_SSL_PROTOCOL_ERROR` — **chỉ xảy ra khi vào bằng
   IP**, vì `localhost` được xếp vào "trustworthy origin" nên miễn nâng cấp. Đây là lý do lỗi này
   không bao giờ lộ ra trên máy dev.

Vẫn không vào được sau hai bước trên thì nghi router bật **AP/client isolation**. Kiểm từ máy kia:
`Test-NetConnection <IP> -Port 4000` — firewall đã mở mà vẫn `TcpTestSucceeded: False` thì là router.

## 2. Thử gọi API ngay trong Swagger UI

API có **hai đường xác thực**, và Swagger UI chỉ tiện cho đường thứ nhất.

### 2.1 Web — httpOnly session cookie (ADR 0002 · ADR 0053)

**Không có nút "Authorize" nào để dán token vào** — cookie không phải thứ dán tay được.

**Mọi request web phải mang REALM** (không gian tài khoản `customer` · `partner` · `platform` —
ADR 0053). Realm quyết ba thứ: đăng nhập/đăng ký tra và tạo tài khoản trong realm nào, cookie nào
được đọc, và route nào mở. Realm đi trong header `x-xp-realm` (`ACCOUNT_REALM_HEADER` ở
`@xeprime/types`) và API chỉ tin nó khi
[`RequestRealmService`](../apps/api/src/modules/auth/request-realm.service.ts) cho phép:

| Môi trường | Ai gắn `x-xp-realm` | API tin khi nào |
| --- | --- | --- |
| staging / production | Caddy, theo HOST của site (`xeprime.vn` · `partner.` · `admin.`) ở `/api` | kèm `x-xp-proxy-secret` khớp `REALM_PROXY_SECRET` (so thời gian hằng) |
| máy dev | proxy của web (`apps/web/src/proxy.ts`) theo khu của trang gọi (Referer), hoặc chính bạn khi gọi thẳng `:4000` | `REALM_HEADER_FROM_CLIENT=true` (đã bật trong `.env.example`; env schema CHẶN cờ này ở môi trường đã triển khai) |

Hệ quả khi gọi thẳng `http://localhost:4000`:

- **Không gửi `x-xp-realm`** ⇒ `POST /auth/login` (và `register`, `password/forgot`, `password/reset`)
  trả **400 `REALM_UNRESOLVED`** — server không đoán realm mặc định. Endpoint cần đăng nhập thì trả
  401 vì không biết đọc cookie nào.
- **Swagger UI không gửi được header này**, nên "Try it out" chỉ dùng được cho endpoint CÔNG KHAI
  không cần realm. Endpoint cần đăng nhập: dùng curl như dưới, hoặc đường Bearer ở §2.2.

Hai cách gọi ở máy dev:

```bash
# Cách 1 — thẳng API, tự khai realm (cần REALM_HEADER_FROM_CLIENT=true ở .env)
curl -c jar.txt -b jar.txt -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' -H 'x-xp-realm: partner' \
  -d "{\"identifier\":\"0902000001\",\"password\":\"$DEMO_PASSWORD\"}"
curl -b jar.txt -H 'x-xp-realm: partner' 'http://localhost:4000/bookings?page=1'

# Cách 2 — qua web dev (localhost:3000/api), y như trình duyệt: proxy gắn realm theo Referer
#   (không Referer ⇒ customer; trang dưới /manage ⇒ partner; dưới /admin ⇒ platform)
curl -c jar.txt -b jar.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -H 'Referer: http://localhost:3000/manage' \
  -d "{\"identifier\":\"0902000001\",\"password\":\"$DEMO_PASSWORD\"}"
```

Tài khoản demo do seed tạo (bảng tra đầy đủ ở [`qa-accounts.md`](qa-accounts.md)); mật khẩu là
biến env `DEMO_PASSWORD` (tài khoản nền tảng `admin@xeprime.vn` dùng `PLATFORM_ADMIN_PASSWORD`) —
**không ghi mật khẩu vào tài liệu, script hay log**. Site khách/partner đăng nhập bằng **SĐT**
(`0902000001` = `owner.saigon@…`; email ⇒ `PHONE_LOGIN_REQUIRED` — ADR 0060). Tài khoản thuộc ĐÚNG
MỘT realm: `owner.saigon@…` là `partner`, `khach.an@…` là `customer`; gửi sai realm thì đăng nhập báo sai thông tin như một
tài khoản không tồn tại.

Cookie phiên tên `<SESSION_COOKIE_NAME>_<realm>` (mặc định `xp_session_customer` ·
`xp_session_partner` · `xp_session_platform`), **host-only** — không có `Domain`, nên cookie của
site này không bao giờ đi sang site kia. Swagger vẫn hiện scheme `xp_session` (tên gốc) vì spec là
artifact tĩnh; tên thật luôn có hậu tố realm.

**Google/Facebook không thử được trong Swagger** — `GET /auth/social/{provider}` và
`/callback` là hai chặng của một lần ĐIỀU HƯỚNG TRÌNH DUYỆT và trả `302`, không trả JSON
(ADR 0019). Callback của WEB nằm dưới `/api` của CHÍNH site đó
(`<site>/api/auth/social/{provider}/callback`) để cookie host-only do đúng site phát. Thử ở máy dev
bằng cách mở `http://localhost:3000/api/auth/social/google?next=/` trên thanh địa chỉ (proxy dev
gắn realm). **Site quản trị (`platform`) không có đăng nhập mạng xã hội** — `begin` trả
`REALM_LOGIN_METHOD_NOT_ALLOWED`; realm đó cũng không tự đăng ký và không đăng nhập OTP.

### 2.2 App native — `Authorization: Bearer` (ADR 0017)

Sáu endpoint dưới nhóm `auth`, tiền tố `/auth/mobile`:

| Endpoint                            | Trả về                                | Ghi chú                                                                                       |
| ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST /auth/mobile/login`           | `MobileSessionDto` (tokens + `MeDto`) | **SĐT** + mật khẩu (email ⇒ `PHONE_LOGIN_REQUIRED` — ADR 0060). Throttle 5 req/phút           |
| `POST /auth/mobile/register`        | `MobileSessionDto`                    | SĐT + tên + mật khẩu + `code` OTP purpose `register` — SĐT đã xác thực khi tài khoản ra đời  |
| `POST /auth/mobile/phone/login`     | **410 `OTP_LOGIN_RETIRED`**           | Đã gỡ (ADR 0060). Không đối chiếu mã, không phát token                                        |
| `POST /auth/mobile/social/exchange` | `MobileSessionDto`                    | Đổi one-time code của Google/Facebook. Xem §2.3                                               |
| `POST /auth/mobile/refresh`         | `MobileTokenPairDto`                  | **Xoay**: trả cặp mới, token cũ chết ngay                                                     |
| `POST /auth/mobile/logout`          | 204                                   | Thu hồi phiên của thiết bị. Luôn 204, kể cả token lạ                                          |

**Ba cửa vào, một loại phiên.** `login`, `register` và `social/exchange` trả cùng
`MobileSessionDto` — app không cần biết người dùng đã vào bằng cách nào.

**`clientApp` quyết REALM của phiên native (ADR 0053).** Request native không đi qua header
`x-xp-realm`. Mọi endpoint PHÁT HÀNH phiên (`login`, `register`, `social/exchange`)
nhận trường tuỳ chọn `clientApp` = `customer` (app XePrime) | `partner` (app XePrime Partner) —
xem [mobile-auth.dto.ts](../apps/api/src/modules/auth/dto/mobile-auth.dto.ts). Thiếu ⇒ `customer`
(tương thích app hợp nhất cũ). Đăng nhập/đăng ký chỉ tra và tạo tài khoản TRONG realm đó, và giá
trị được ghi vào `native_auth_sessions.client_app` để refresh token không tái tạo được phiên cho app
kia. Với `social/exchange`, server đối chiếu `clientApp` với app suy từ scheme `redirect_uri` lúc
khởi tạo luồng (§2.3). Các bước OTP (`/auth/phone/send-otp` purpose `register` / `password_reset`,
`/auth/password/reset-otp`) dùng chung với web, cũng nhận `clientApp`.

`clientApp` **không có giá trị `platform`**: tài khoản quản trị nền tảng không có app mobile, và
controller `/auth/mobile/*` chỉ khai realm `customer` · `partner`. Ở web, realm `platform` bị chặn
tự đăng ký và đăng nhập mạng xã hội bằng `REALM_LOGIN_METHOD_NOT_ALLOWED` — nó chỉ đăng nhập bằng
mật khẩu (`assertSelfRegistration` / `assertSocialLogin` ở
[auth.service.ts](../apps/api/src/modules/auth/auth.service.ts)).

**Gửi yêu cầu thuê KHÔNG còn phát phiên (ADR 0060).** `POST /public/booking-requests` cần sẵn một
phiên khách (Bearer hoặc cookie) và trả 401 khi thiếu; `client`/`device` và các trường liên hệ người
thuê trong body bị bỏ qua, `receipt.session` luôn rỗng. App đăng nhập/đăng ký TRƯỚC rồi mới gửi.

> **Quên mật khẩu trên app.** `send-otp { purpose: "password_reset", clientApp }` rồi
> `POST /auth/password/reset-otp { phone, code, password, clientApp }` → 204, không phát token — app
> đưa người dùng về màn đăng nhập. Phản hồi `send-otp` giống hệt dù số có tài khoản hay không.

```bash
# Đăng nhập → lấy access token
ACCESS=$(curl -s -X POST http://localhost:4000/auth/mobile/login \
  -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"0902000001\",\"password\":\"$DEMO_PASSWORD\",\"clientApp\":\"partner\"}" \
  | jq -r .data.tokens.accessToken)

# Gọi endpoint cần đăng nhập bằng Bearer — KHÔNG cần cookie jar
curl -H "Authorization: Bearer $ACCESS" 'http://localhost:4000/bookings?page=1'
```

Ba điều dễ vấp:

- **Đừng gửi cả cookie lẫn Bearer.** Guard trả 401 thay vì đoán bên nào thắng — cố ý (ADR 0017 §5).
  Một request curl vừa mang cookie jar + `x-xp-realm` của §2.1 vừa mang header `Authorization` sẽ
  401; tách hai cách thử ra hai lệnh.
- **Access token sống 15 phút.** Hết hạn trả `SESSION_EXPIRED`; gọi `/auth/mobile/refresh`, đừng
  đăng nhập lại.
- **Refresh token dùng một lần.** Gửi lại token đã dùng ⇒ coi là bị đánh cắp ⇒ **thu hồi cả phiên**.
  Lưu token mới sau MỖI lần refresh.

Quyền và tenant scope **không** nằm trong token ở cả hai đường — `GET /auth/me` là chỗ duy nhất trả
chúng, và nó đọc DB mỗi lần gọi.

Cách app native cấu hình client: [`packages/api-client/README.md`](../packages/api-client/README.md).

### 2.3 App native — đăng nhập Google/Facebook (ADR 0019)

App **không** mở `/auth/social/:provider` như web: web kết thúc bằng `Set-Cookie`, còn app không
có chỗ chứa cookie. Thêm `client=native` thì callback phát một **one-time code** rồi trả về deep
link, và app đổi mã đó lấy cặp token.

```ts
// 1. PKCE — GIỮ verifier trong bộ nhớ, đừng ghi ra đĩa
const codeVerifier = base64UrlEncode(randomBytes(32));
const codeChallenge = base64UrlEncode(sha256(codeVerifier));

// 2. Mở trình duyệt hệ thống (ASWebAuthenticationSession / Custom Tabs)
const result = await WebBrowser.openAuthSessionAsync(
  `${API}/auth/social/google?client=native` +
    `&code_challenge=${codeChallenge}` +
    `&redirect_uri=${encodeURIComponent('xeprime://auth/callback')}`,
  'xeprime://auth/callback',
);

// 3. Đổi mã lấy phiên
const code = new URL(result.url).searchParams.get('code');
const session = await mobileAuthApi.exchangeSocialCode(authClient, {
  code,
  codeVerifier,
});
```

Bốn điều dễ vấp:

- **`redirect_uri` phải nằm trong `MOBILE_AUTH_REDIRECT_URIS`** (env của API — mặc định
  `xeprime://auth/callback,xeprimepartner://auth/callback`, hai scheme của hai app phát hành riêng,
  xem [env.schema.ts](../apps/api/src/config/env.schema.ts)). Scheme còn quyết app đích: luồng mở
  bằng `xeprimepartner://…` là luồng của app Partner (realm `partner`), và `social/exchange` phải
  gửi `clientApp: "partner"` khớp với nó. Không khớp allowlist ⇒ trình
  duyệt dừng ở trang web kèm `?authError=SOCIAL_STATE_INVALID`, không phải ở deep link — vì một
  `redirect_uri` chưa qua allowlist thì không đáng tin để redirect tới.
- **Expo dev build dùng scheme khác.** `exp://192.168.x.x:8081/--/auth/callback` phải được thêm
  vào allowlist của API dev; nó không tự động được chấp nhận. Mọi scheme khác `xeprimepartner`
  (gồm `exp://`) đều được suy là app khách (`clientAppForRedirectUri` ở `@xeprime/types`) — thử
  social của app Partner trên Expo Go sẽ không ra phiên partner.
- **Mã sống 60 giây, dùng một lần.** Hỏng thì làm lại từ bước 1 — đừng retry cùng một mã. Gửi sai
  `codeVerifier` cũng **đốt luôn mã**.
- **Lỗi cũng về deep link**: `xeprime://auth/callback?error=<mã>`. App phải đọc cả `code` lẫn
  `error`, nếu không nó sẽ đứng im khi người dùng bấm huỷ ở màn đồng ý.

## 3. Đọc gì trên mỗi endpoint

Ngoài `summary` và schema, mỗi endpoint có thêm phần sinh tự động:

- **Ổ khoá** trên đầu dòng: endpoint cần đăng nhập. Không ổ khoá = công khai.
- **Truy cập / Phạm vi / Quyền yêu cầu** trong mô tả: cần chính xác permission nào, có bị giới
  hạn theo gian hàng hay chỉ dành cho nền tảng.
- **Danh sách mã lỗi** ở từng response 4xx/5xx: nhánh code theo `error.code`, đừng nhánh theo
  `error.message`.

Trang chủ Swagger (phần mô tả đầu) nói các quy ước dùng chung: lớp bọc `{ data, meta }`, tiền là
string, thời gian ISO-8601 UTC, phân trang, và toàn bộ danh mục mã lỗi.

## 4. Sinh type cho client TypeScript

Không viết tay type API (ADR 0007):

```bash
pnpm contract
# = pnpm api:openapi  (apps/api → packages/types/openapi.json)
# + pnpm types:gen    (openapi.json → packages/types/src/api.generated.ts)
```

Dùng ở web:

```ts
import type { components } from '@xeprime/types';
type BookingDetail = components['schemas']['BookingDetailDto'];
```

**Chạy `pnpm contract` mỗi khi đổi controller/DTO** rồi commit cả `openapi.json` lẫn
`api.generated.ts` — hai file này là hợp đồng giữa BE và FE.

## 5. Tài liệu tự sinh từ đâu

Phần lớn tài liệu KHÔNG viết tay. `buildOpenApiDocument()` trong
[bootstrap.ts](../apps/api/src/bootstrap.ts) chạy hậu xử lý trên document mà Swagger quét được:

| Thứ được thêm                                             | Suy từ                                                                         | File                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Nhóm tag + mô tả + thứ tự                                 | danh mục khai báo tập trung                                                    | [api-tags.ts](../apps/api/src/openapi/api-tags.ts)                 |
| Trang mô tả đầu (quy ước, mã lỗi)                         | `API_ERROR_CODE` của `@xeprime/types`                                          | [api-description.ts](../apps/api/src/openapi/api-description.ts)   |
| Ổ khoá + quyền + phạm vi                                  | metadata `@Public` / `@RequirePermissions` / `@TenantScoped` / `@PlatformOnly` | [route-access.ts](../apps/api/src/openapi/route-access.ts)         |
| Lớp bọc `{ data }`, nhánh lỗi 400/401/403/404/409/429/500 | `ResponseInterceptor`, guard, `AllExceptionsFilter`                            | [enhance-document.ts](../apps/api/src/openapi/enhance-document.ts) |

Nghĩa là: **sửa quyền của endpoint thì tài liệu tự đổi theo** — không có bản viết tay nào để trôi
lệch khỏi hành vi thật.

## 6. Thêm endpoint mới thì phải làm gì

Chỉ 3 việc, phần còn lại tự có:

1. `@ApiTags('...')` trên controller — tag phải nằm trong `API_TAGS`, chưa có thì thêm vào
   [api-tags.ts](../apps/api/src/openapi/api-tags.ts) kèm mô tả.
2. `@ApiOperation({ summary: '...' })` trên mỗi route.
3. `@ApiOkResponse({ type: XxxDto })` (hoặc `@ApiCreatedResponse` / `@ApiNoContentResponse`) —
   **khai `type`, đừng khai `schema` inline**: schema inline sinh ra kiểu ẩn danh, FE generate ra
   một đống shape trùng nhau không tên.
   - Kết quả nhỏ dùng lại DTO chung ở [api-response.dto.ts](../apps/api/src/common/dto/api-response.dto.ts):
     `OkResultDto` (`{ ok: true }`), `IdResultDto` (`{ id }`), `DeletedCountDto` (`{ deleted }`).
   - DTO phải có `@ApiProperty` trên **mọi** field, nếu không field đó biến mất khỏi spec.

Bỏ sót thì `apps/api/test/openapi-contract.spec.ts` fail, kèm danh sách đúng route thiếu:

```bash
pnpm --filter @xeprime/api test -- openapi-contract
```

Spec đó khoá lại các khẳng định: mọi route có summary và tag đã khai báo, mọi route nói rõ cần
đăng nhập hay không và khớp `@Public` thật, mọi response 2xx mô tả đúng lớp bọc `{ data }` hoặc
được đánh dấu tường minh là raw response theo contract bên thứ ba, mọi
route có 429/500, route cần đăng nhập có 401, route công khai KHÔNG có 401, route đòi quyền có
403 và liệt kê đúng permission.

Khẳng định thứ 17 là quan trọng nhất với người sau: **`packages/types/openapi.json` đã commit phải
khớp source hiện tại**. Sửa DTO rồi quên `pnpm contract` là im lặng tuyệt đối nếu không có nó —
mọi test khác vẫn xanh vì chúng đọc document dựng tại chỗ, còn file đã commit thì đứng yên và web
tiếp tục compile theo type CŨ. Test fail sẽ chỉ đúng đường dẫn/schema nào đã lệch.

## 7. Ngoại lệ đã biết

Hai loại endpoint không có lớp bọc `{ data }`:

- `GET /health`: `ResponseInterceptor` bỏ qua payload đã có sẵn khoá `error`, mà kết quả
  `@nestjs/terminus` luôn có khoá đó. Giữ nguyên để uptime monitor đọc thẳng `status`. Xem
  [health.dto.ts](../apps/api/src/modules/health/dto/health.dto.ts).
- Endpoint tích hợp buộc phải theo response contract của bên thứ ba. Chúng phải gắn
  `x-xeprime-raw-response` trong OpenAPI và có HTTP test khoá raw body. Hiện tại chỉ có
  `POST /sepay/webhook`, trả đúng `{"success": true}` sau khi giao dịch đã được xử lý.
