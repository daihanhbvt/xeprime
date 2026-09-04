# Tạo key và cấu hình dịch vụ bên thứ ba

> Mọi endpoint, scope và đường dẫn trong tài liệu này lấy **từ code**, không phải từ tài liệu của
> nhà cung cấp. Khai sai một ký tự ở `redirect_uri` là lỗi tốn nhiều thời gian nhất trong cả danh
> sách này, nên hãy chép thẳng từ đây.
>
> Bản này viết cho **staging** (`stg.xeprime.vn` / `api-stg.xeprime.vn`). Production lặp lại đúng
> các bước với bộ key **riêng** — §9.
>
> **Cập nhật 03/09/2026:** tài liệu này chỉ ghi dịch vụ đã có biến/đường gọi trong code. SePay,
> đối tác thu hộ/chi hộ và bảo hiểm chuyến đi nằm trong roadmap nhưng chưa có cấu hình thật;
> không tạo key hay viết tên biến đoán trước khi implementation và hợp đồng đối tác được chốt.

## 0. Cần cái nào trước

Staging chạy được với **không có key nào cả**. Mỗi mục dưới đây mở thêm một mảng tính năng, và
thiếu thì phần đó suy giảm có kiểm soát chứ không làm sập app.

| # | Dịch vụ | Mở ra cái gì | Thiếu thì sao | Tốn tiền? |
| --- | --- | --- | --- | --- |
| 1 | **Cloudflare R2** | Tải ảnh xe, ảnh gian hàng, giấy tờ, đính kèm chat | Mọi endpoint upload trả **503 `UPLOADS_NOT_CONFIGURED`** | Gần như 0 ở mức staging |
| 2 | **Google OAuth** | Nút "Đăng nhập bằng Google" | Nút trả `SOCIAL_NOT_CONFIGURED`; mật khẩu + OTP vẫn chạy | Miễn phí |
| 3 | **Facebook Login** | Nút "Đăng nhập bằng Facebook" | như trên | Miễn phí |
| 4 | **Google Maps** (2 key) | Ước lượng quãng đường + phí giao, bản đồ nhúng | Khối bản đồ **ẩn hẳn**, phí giao không hiện | Có, xem 4.3 |
| 5 | **Google Calendar** | Lớp ngày lễ trên lịch xe | `GET /holidays` trả rỗng | Miễn phí |
| 6 | **Firebase** | Chat **realtime** | Chat vẫn chạy trên PostgreSQL, chỉ không đẩy tức thì | Miễn phí ở mức này |
| 7 | **SMTP** | Thư mời thành viên + đặt lại mật khẩu gửi thật | Email **in ra log** container — chạy được nhưng KHÔNG đi qua nodemailer, nên lỗi SMTP/TLS/`From` chỉ lộ ở production. Staging nay gửi thật (§7.2); máy dev dùng Mailpit (§7.1) | Miễn phí ở mức pilot |
| 8 | **Telegram bot** | Cảnh báo sao lưu thất bại | Không ai biết khi backup hỏng | Miễn phí |

**eSMS.vn KHÔNG cần cho staging.** `OTP_MODE=mock` in mã ra log và trả kèm `devCode` trong
response — đủ để test mọi luồng OTP. Chỉ production mới bắt buộc eSMS.

**Thứ tự đề nghị:** 1 → 2 → 4 → 6. Làm R2 trước vì bật Firebase (`FIRESTORE_ENABLED=true`) sẽ
khiến **toàn bộ biến R2 thành bắt buộc lúc boot** — thiếu là API không lên.

### Khai giá trị ở đâu

Tất cả vào **GitHub → Settings → Environments → `staging`**, không sửa tay trên VPS (file
`.env.staging` bị workflow ghi đè mỗi lần deploy — `docs/deployment.md` §9.4).

> ⚠️ Biến `NEXT_PUBLIC_*` bị Next **nhúng cứng vào bundle lúc build**. Đổi chúng thì phải
> **deploy lại**, khởi động lại container không có tác dụng gì. Các biến còn lại chỉ cần deploy
> lại để file env được sinh mới.

---

## 1. Cloudflare R2

Bạn đã có tài khoản Cloudflare (zone `xeprime.vn` đang ở đó). R2 cần bật riêng và **yêu cầu thẻ
thanh toán**, nhưng có hạn mức miễn phí 10 GB lưu trữ + 1 triệu thao tác ghi/tháng — staging
không chạm tới.

### 1.1 Tạo hai bucket

Cloudflare Dashboard → **R2** → *Create bucket*. Tạo **hai** cái:

| Bucket | Tên đề nghị | Vai trò |
| --- | --- | --- |
| Công khai | `xeprime-stg-public` | Ảnh xe, ảnh gian hàng, đính kèm chat, chứng từ thu chi |
| Riêng tư | `xeprime-stg-private` | Giấy tờ khách (CCCD, GPLX), giấy tờ xe |

Location: **Asia-Pacific (APAC)** nếu có chọn.

> `R2_PRIVATE_BUCKET` **phải khác** `R2_BUCKET` ở mọi môi trường — API từ chối boot nếu trùng.
> Đây là chốt chặn việc giấy tờ CCCD lọt vào bucket có URL công khai.
>
> Và bucket staging phải **khác** bucket production. Ảnh test lẫn vào kho khách hàng thật là thứ
> không gỡ ra được.

### 1.2 Bucket công khai — mở đường đọc

Vào `xeprime-stg-public` → **Settings** → *Public access*:

- **Cách nhanh (đủ cho staging):** bật **R2.dev subdomain**. Cloudflare cho một URL dạng
  `https://pub-xxxxxxxx.r2.dev`. Đó là `R2_PUBLIC_BASE_URL`.
- **Cách cho production:** *Connect Domain* → `cdn.xeprime.vn`. Cloudflare tự tạo bản ghi CNAME
  trong zone. Bắt buộc ở production vì URL `r2.dev` bị giới hạn tốc độ và Cloudflare nói rõ nó
  **không dành cho production**.

### 1.3 Bucket riêng tư — KHÔNG mở gì cả

`xeprime-stg-private`: **không** bật r2.dev, **không** gắn domain. File chỉ ra ngoài qua signed
URL sống 120 giây, sau khi backend đã kiểm quyền. Bật public ở đây là làm hỏng đúng thứ nó tồn
tại để bảo vệ.

### 1.4 CORS — bắt buộc cho CẢ HAI bucket

Trình duyệt `PUT` **thẳng lên R2** bằng presigned URL (`apps/web/src/services/upload.ts`), không
đi qua API. Thiếu CORS thì mọi lần tải ảnh im lặng thất bại ở trình duyệt.

Mỗi bucket → **Settings** → *CORS Policy* → dán:

```json
[
  {
    "AllowedOrigins": ["https://stg.xeprime.vn"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

Thêm `"http://localhost:3000"` vào `AllowedOrigins` nếu muốn test upload từ máy dev.

### 1.5 API token

R2 → **Manage R2 API Tokens** → *Create API token*:

- Permissions: **Object Read & Write**
- Specify buckets: chọn **cả hai** bucket vừa tạo (đừng để "Apply to all buckets")
- TTL: không hết hạn

Bấm tạo, màn hình hiện **Access Key ID** và **Secret Access Key** — **chỉ hiện một lần**.

### 1.6 Khai vào GitHub

`Account ID` lấy ở góc phải trang R2 (chuỗi hex 32 ký tự).

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Variable | `R2_ACCOUNT_ID` | Account ID |
| Variable | `R2_ENDPOINT` | `https://<account_id>.r2.cloudflarestorage.com` |
| Variable | `R2_BUCKET` | `xeprime-stg-public` |
| Variable | `R2_PRIVATE_BUCKET` | `xeprime-stg-private` |
| Variable | `R2_PUBLIC_BASE_URL` | URL r2.dev, **không** có dấu `/` cuối |
| **Secret** | `R2_ACCESS_KEY_ID` | Access Key ID |
| **Secret** | `R2_SECRET_ACCESS_KEY` | Secret Access Key |

> `R2_PUBLIC_BASE_URL` còn là **bộ lọc bảo mật của chat**: `chat.service.ts` từ chối mọi URL
> đính kèm không bắt đầu bằng giá trị này. Sai một dấu `/` cuối là mọi ảnh chat bị coi là không
> hợp lệ.

---

## 2. Google OAuth

Không dùng lại project cũ — tạo mới theo yêu cầu của bạn.

### 2.1 Tạo project + màn hình đồng ý

1. [console.cloud.google.com](https://console.cloud.google.com) → *Select a project* → **New
   Project** → tên `XePrime` → Create.
2. **APIs & Services** → **OAuth consent screen**:
   - User type: **External** → Create
   - App name `XePrime`, User support email, Developer contact
   - **Scopes: KHÔNG thêm gì cả.** Code chỉ xin `openid email profile` — ba scope này Google xếp
     loại không nhạy cảm, nên **không phải qua vòng thẩm định** nào. Thêm scope khác là tự chuốc
     lấy review.
   - Test users: thêm email của bạn (app ở chế độ Testing chỉ cho các email này đăng nhập)

### 2.2 Tạo OAuth client

**Credentials** → *Create Credentials* → **OAuth client ID**:

- Application type: **Web application**
- Name: `XePrime staging`
- **Authorized redirect URIs** — chép chính xác:

```
https://api-stg.xeprime.vn/auth/social/google/callback
```

Không cần khai "Authorized JavaScript origins": vòng OAuth chạy **hoàn toàn ở server** (ADR
0019), trình duyệt không bao giờ cầm token của Google.

> URI này do `API_PUBLIC_URL` + `/auth/social/google/callback` ghép ra, và code **không bao giờ**
> suy nó từ header của request — nên nó ổn định từng ký tự. Lệch một dấu `/` là
> `redirect_uri_mismatch`.
>
> Đây là danh sách: khi dựng production, **thêm** `https://api.xeprime.vn/auth/social/google/callback`
> vào cùng client, hoặc tạo client riêng.

### 2.3 Khai vào GitHub

| Loại | Tên | Ghi chú |
| --- | --- | --- |
| Variable | `GOOGLE_OAUTH_CLIENT_ID` | Client ID đi trong URL authorize ⇒ công khai theo thiết kế |
| **Secret** | `GOOGLE_OAUTH_CLIENT_SECRET` | |

> Khai **nửa cặp** thì API **từ chối boot** — đó luôn là gõ thiếu, không phải ý đồ.

---

## 3. Facebook Login

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**
2. Use case: **Authenticate and request data from users with Facebook Login** → App type
   **Consumer** (hoặc Business) → tên `XePrime staging`
3. Thêm sản phẩm **Facebook Login** → **Settings**:
   - **Valid OAuth Redirect URIs**:

```
https://api-stg.xeprime.vn/auth/social/facebook/callback
```

   - *Client OAuth login*: Bật · *Web OAuth login*: Bật
   - *Use Strict Mode for redirect URIs*: **Bật** (nên bật — code khai URI tuyệt đối nên không vướng)
4. **App Settings → Basic**: lấy **App ID** và **App Secret**
5. Muốn người ngoài đăng nhập được thì phải chuyển app sang **Live** và xin duyệt scope `email`.
   Ở chế độ Development, chỉ tài khoản có vai trò trong app (Admin/Developer/Tester) đăng nhập
   được — **đủ cho staging**.

| Loại | Tên |
| --- | --- |
| Variable | `FACEBOOK_APP_ID` |
| **Secret** | `FACEBOOK_APP_SECRET` |

> Code dùng Graph **v21.0** và gọi `debug_token` để xác minh access token đúng là của app này
> (Facebook không phải OIDC nên không có `id_token` để kiểm tại chỗ).
>
> ⚠️ **ID người dùng Facebook bị giới hạn theo từng app.** Đổi sang app Facebook khác là mọi tài
> khoản đã liên kết trở thành người lạ. Chọn xong thì đừng đổi.

---

## 4. Google Maps — **hai key riêng biệt**

Dùng lại project `XePrime` ở §2.1.

**Không được** dùng chung một key cho cả hai. Key nhúng nằm lộ thiên trong HTML mà ai cũng xem
được; nếu nó cũng mở được Routes API thì bất kỳ ai cũng tiêu tiền của bạn.

### 4.1 Bật đúng ba API

**APIs & Services → Library**, bật:

| API | Cho key nào | Code gọi gì |
| --- | --- | --- |
| **Geocoding API** | server | `maps.googleapis.com/maps/api/geocode/json` — đổi địa chỉ thành toạ độ |
| **Routes API** | server | `routes.googleapis.com/directions/v2:computeRoutes` — quãng đường đường bộ |
| **Maps Embed API** | nhúng | `google.com/maps/embed/v1/place` và `/directions` |

Không cần Places API, không cần Distance Matrix — code không gọi.

### 4.2 Tạo key và **khoá chúng lại**

**Credentials** → *Create credentials* → **API key**, làm **hai lần**:

**Key A — server** (`GOOGLE_MAPS_SERVER_KEY`)
- Application restrictions: **IP addresses** → thêm `222.255.215.242` (IP VPS staging)
- API restrictions: **Restrict key** → chỉ chọn *Geocoding API* + *Routes API*

**Key B — nhúng** (`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY`)
- Application restrictions: **HTTP referrers** → `https://stg.xeprime.vn/*`
- API restrictions: **Restrict key** → chỉ chọn *Maps Embed API*

| Loại | Tên |
| --- | --- |
| **Secret** | `GOOGLE_MAPS_SERVER_KEY` |
| Variable | `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` — nằm trong bundle JS ⇒ **không bao giờ** là Secret |

### 4.3 Tiền

Routes API tính phí theo lượt gọi. Hai thứ giữ hoá đơn ở mức thấp:

- Code khai `X-Goog-FieldMask: routes.distanceMeters` — **cố ý** chỉ xin đúng một trường, để nằm
  trong bậc rẻ nhất (Essentials). Đừng "cải tiến" nó thành xin thêm trường.
- Kết quả được **cache trong database** (`geo_route_cache`), nên cùng một cặp điểm không gọi lại.

Vẫn nên đặt **Budget alert** trong Billing.

---

## 5. Google Calendar — ngày lễ

Key **thứ ba**, tách khỏi hai key trên (khác API, khác hạn mức, và nó chạy ở worker).

1. Cùng project → **Library** → bật **Google Calendar API**
2. **Credentials** → *Create credentials* → **API key**
   - Application restrictions: **IP addresses** → `222.255.215.242`
   - API restrictions: chỉ **Google Calendar API**

| Loại | Tên | Giá trị |
| --- | --- | --- |
| **Secret** | `GOOGLE_HOLIDAY_API_KEY` | key vừa tạo |
| Variable | `GOOGLE_HOLIDAY_CALENDAR_ID` | `vi.vietnamese#holiday@group.v.calendar.google.com` |

Chỉ cần **API key**, không cần OAuth hay service account — lịch ngày lễ của Google là công khai.
Worker đồng bộ mỗi ngày một lần và tự che key khỏi log lỗi.

---

## 6. Firebase — chat realtime

Firebase ở XePrime **chỉ còn đúng một vai**: đẩy tin nhắn realtime. Đăng nhập đã tự làm hoàn toàn
từ ADR 0019. **PostgreSQL là nguồn sự thật** của mọi tin nhắn; Firestore chỉ giữ ~50 tin gần nhất
mỗi hội thoại để client nhận tức thì (ADR 0009).

> ⚠️ Bật `FIRESTORE_ENABLED=true` khiến **toàn bộ biến R2 thành bắt buộc lúc boot** (chat có đính
> kèm). Làm §1 trước.

### 6.1 Tạo project và Firestore

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** →
   `xeprime-staging`. Tắt Google Analytics.
2. **Build → Firestore Database** → *Create database* → **Production mode** → location
   `asia-southeast1`.

### 6.2 Service account (phía server)

**Project settings** (bánh răng) → **Service accounts** → *Generate new private key* → tải file
JSON. Trong đó:

| Trường trong JSON | Khai thành | Loại |
| --- | --- | --- |
| `project_id` | `FIREBASE_PROJECT_ID` | Variable |
| `client_email` | `FIREBASE_CLIENT_EMAIL` | Variable (chỉ là định danh) |
| `private_key` | `FIREBASE_PRIVATE_KEY` | **Secret** |

`private_key` trong JSON là **một dòng** có sẵn `\n` — chép **nguyên văn** như vậy, kể cả
`-----BEGIN PRIVATE KEY-----`. Code tự đổi `\n` thành xuống dòng thật.

### 6.3 Web app (phía trình duyệt)

**Project settings → General** → *Your apps* → **Web** (`</>`) → đăng ký `XePrime Web`. Firebase
hiện một khối `firebaseConfig`. Lấy đúng **bốn** giá trị:

| Trong `firebaseConfig` | Khai thành |
| --- | --- |
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |

Tất cả là **Variable**, không phải Secret — chúng nằm trong file JS mà trình duyệt tải về.
`storageBucket` và `messagingSenderId` **không dùng**, bỏ qua.

### 6.4 Đẩy Firestore rules — đừng bỏ bước này

Repo đã có `firestore.rules`, và nó là thứ duy nhất chặn người dùng đọc hội thoại của người khác:

- `allow write: if false` ở mọi nơi — chỉ Admin SDK ghi được (Admin SDK bỏ qua rules)
- Đọc `/conversations/{id}` chỉ khi `request.auth.uid` nằm trong `memberUids` của tài liệu đó
- Bắt-tất-cả `/{document=**}` chặn cả đọc lẫn ghi

Firestore mặc định ở "Production mode" đã chặn hết, nhưng phải đẩy rules của repo lên để phần
đọc hợp lệ hoạt động:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project xeprime-staging
```

### 6.5 Bật

| Loại | Tên | Giá trị |
| --- | --- | --- |
| Variable | `FIRESTORE_ENABLED` | `true` |

Đặt `false` bất cứ lúc nào để tắt — chat lập tức quay về chạy trên PostgreSQL, không mất tin nào.

---

## 7. SMTP — dùng thật ở CẢ staging và production

Hai luồng phụ thuộc vào email, và cả hai đều gửi đi một **token nằm trên URL**:

| Luồng | Link |
| --- | --- |
| Thư mời tham gia gian hàng | `APP_WEB_URL/invites/<token>` — token 32 byte, DB chỉ giữ SHA-256 |
| Đặt lại mật khẩu | `APP_WEB_URL/reset-password?token=<token>` — dùng một lần, hạn 1 giờ |

Vì vậy `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` là **bắt buộc ở production**: thiếu thì
`EmailService` rơi về chế độ in nội dung ra log, tức token đi thẳng vào log — API từ chối boot
thay vì để chuyện đó xảy ra (`apps/api/src/config/env.schema.ts`).

### 7.1 Máy dev — Mailpit, không cần tài khoản nào

`docker-compose.yml` có sẵn service `mailpit`: một SMTP server chạy local bắt mọi thư thay vì
chuyển tiếp đi đâu cả.

```bash
docker compose up -d mailpit     # đã nằm trong `docker compose up` mặc định
```

Hộp thư ở **<http://localhost:8025>** — HTML render đúng như người nhận thấy, nút bấm được, nên
test được cả phần "người được mời bấm vào link" chứ không chỉ phần gửi. `.env` mặc định đã trỏ
sẵn:

```
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=            # Mailpit không đòi đăng nhập — để trống là ĐÚNG
SMTP_PASS=
```

Không có relay nào được cấu hình, và Mailpit không tự chuyển tiếp: lỡ để một địa chỉ thật trong
`To:` lúc test thì thư vẫn nằm trong hộp này, không tới ai. Thư không được lưu qua lần khởi động
lại — một hộp thư sống dai là nơi token cũ tích lại.

Muốn quay về kiểu cũ (in ra log, không cần Docker) thì để trống `SMTP_HOST`.

### 7.2 Staging — gửi THẬT, nhưng từ một tên miền con

Quyết định 04/09/2026: staging gửi thư thật như production. Lý do không phải "cho giống" mà là
**đường mã**: khi `SMTP_HOST` trống, `EmailService` không hề chạm tới nodemailer, nên cả một lớp
lỗi (xác thực SMTP, TLS, định dạng `From`, thư bị chặn) không thể lộ ra ở staging — nó đợi tới
production, nơi người dùng thật đang chờ một lời mời.

Đổi lại, staging phải chịu đúng các ràng buộc của thư thật. Ba điều dưới đây là bắt buộc.

**1. Gửi từ `stg.xeprime.vn`, KHÔNG phải `xeprime.vn`.**

Xác minh `stg.xeprime.vn` như một sending domain riêng ở nhà cung cấp (bộ DKIM riêng), rồi đặt:

```
SMTP_FROM="XePrime STG <no-reply@stg.xeprime.vn>"
```

Uy tín gửi thư tính theo tên miền. Thư test bị đánh spam, bị bounce, bị người ta bấm "báo cáo"
— tất cả đổ vào tên miền đứng tên. Dùng chung `xeprime.vn` cho staging là để một lần test hỏng
kéo theo thư thật của khách vào Junk, và đó là loại hỏng không nhìn thấy ngay.

**2. Đừng để staging gửi tới địa chỉ không tồn tại.**

Seed demo dùng `@xeprime.test` — `.test` là TLD dành riêng, **không bao giờ phân giải**. Mỗi thư
gửi tới đó là một **hard bounce**. Vài chục cái là nhà cung cấp hạ hạn mức hoặc khoá tài khoản,
và nó khoá cả đường thư của production nếu dùng chung tài khoản.

Nên trên staging chỉ kích hoạt luồng thư (mời thành viên, quên mật khẩu) với **địa chỉ bạn thật
sự sở hữu**. Muốn chắc chắn hơn thì tách hẳn tài khoản/API key riêng cho staging, để một sự cố
danh tiếng không lan sang production.

**3. Vẫn xem được thư khi cần bới.** Nhà cung cấp nào cũng có nhật ký gửi (Resend: *Emails*;
SES: CloudWatch). Đó là chỗ tra "thư đã đi chưa", thay cho log container trước đây.

### 7.3 Chọn nhà cung cấp (dùng chung cho staging và production)

| Nhà cung cấp | Hợp khi | Lưu ý |
| --- | --- | --- |
| **Resend** | Bắt đầu nhanh, giao diện gọn | 3.000 thư/tháng miễn phí; cấu hình DNS có hướng dẫn từng bước |
| **Amazon SES** | Rẻ nhất khi lượng lớn | Mặc định nằm trong *sandbox* — chỉ gửi được tới địa chỉ đã xác minh cho tới khi mở hạn mức, **xin trước vài ngày** |
| **Zoho Mail** / **Google Workspace** | Đã có hộp thư cho tên miền | Hạn mức thấp (~500/ngày), hợp giai đoạn pilot |

Dù chọn ai, **ba bản ghi DNS dưới đây là bắt buộc** — thiếu chúng thì thư mời rơi vào spam và cả
tính năng coi như không tồn tại, dù code chạy đúng:

Bộ ba này khai **cho từng tên miền gửi**, tức làm HAI lần: `stg.xeprime.vn` (staging) và
`xeprime.vn` (production). Chúng độc lập — DKIM của tên miền này không ký được thư của tên
miền kia.

| Bản ghi | Đặt ở | Vì sao |
| --- | --- | --- |
| **SPF** (`TXT`) | gốc của tên miền gửi (`xeprime.vn`, và `stg.xeprime.vn`) | Khai máy chủ nào được phép gửi thay tên miền. **Mỗi tên miền chỉ được có MỘT** bản ghi SPF — đã có sẵn thì *gộp* `include:` vào bản ghi cũ, thêm bản ghi thứ hai là hỏng cả hai |
| **DKIM** (`CNAME`/`TXT` theo hướng dẫn nhà cung cấp) | tên miền gửi | Ký số từng thư; Gmail bỏ qua thư không ký từ tên miền lạ |
| **DMARC** (`TXT`) | `_dmarc.xeprime.vn` · `_dmarc.stg.xeprime.vn` | Bắt đầu bằng `v=DMARC1; p=none; rua=mailto:...` để nhận báo cáo, siết lên `p=quarantine` sau vài tuần khi đã sạch |

Kiểm chứng trước khi tin: gửi một thư tới [mail-tester.com](https://www.mail-tester.com) và soi
điểm, hoặc mở một thư ở Gmail → *Show original* → cả ba dòng `SPF` `DKIM` `DMARC` phải là **PASS**.

### 7.4 Khai vào GitHub Environment

Hai Environment khai **cùng bộ tên biến, khác giá trị** — khác nhau ở đúng tên miền gửi:

| Loại | Tên | `staging` | `production` |
| --- | --- | --- | --- |
| Variable | `SMTP_HOST` | `smtp.resend.com` | `smtp.resend.com` |
| Variable | `SMTP_PORT` | `587` | `587` |
| Variable | `SMTP_USER` | `resend` (SES/Zoho thì là chuỗi riêng) | như staging |
| **Secret** | `SMTP_PASS` | API key **riêng của staging** | API key của production |
| Variable | `SMTP_FROM` | `XePrime STG <no-reply@stg.xeprime.vn>` | `XePrime <no-reply@xeprime.vn>` |
| Variable | `APP_WEB_URL` | `https://stg.xeprime.vn` | `https://xeprime.vn` — link trong thư dựng từ đây |

Hai API key riêng, không dùng chung một cái: khi cần thu hồi khoá của staging (lộ, hoặc bị hạ
hạn mức vì bounce) thì production không bị kéo theo.

Cổng 587 dùng STARTTLS — đúng mặc định của nodemailer, không cần khai thêm.

> ⚠️ `SMTP_FROM` chứa dấu cách và dấu `<>`. File env trên VPS được `source` bằng bash, nên giá
> trị **phải nằm trong nháy kép** — workflow deploy đã tự bọc, nhưng đừng sửa tay trên VPS
> (`docs/deployment.md` §9.2).
>
> ⚠️ Địa chỉ ở `SMTP_FROM` phải thuộc **đúng tên miền đã ký DKIM**. Gửi `@gmail.com` qua SES là
> cách chắc chắn nhất để vào spam.

---

## 8. Telegram — cảnh báo sao lưu

1. Nhắn [@BotFather](https://t.me/BotFather) → `/newbot` → đặt tên → nhận **token**
2. **Nhắn cho bot của bạn một câu bất kỳ** (bot không nhắn trước được cho người chưa từng nhắn nó)
3. Mở `https://api.telegram.org/bot<TOKEN>/getUpdates` → lấy `message.chat.id`

| Loại | Tên |
| --- | --- |
| **Secret** | `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` |

---

## 9. Sang production thì khác gì

Lặp lại đúng các bước trên với bộ **riêng**. Ba thứ **bắt buộc phải khác**, còn lại nên khác:

| Thứ | Vì sao bắt buộc khác |
| --- | --- |
| `R2_BUCKET` / `R2_PRIVATE_BUCKET` | Ảnh test và giấy tờ test lẫn vào kho khách hàng thật |
| `SESSION_COOKIE_NAME` | Cookie gửi tới mọi subdomain — trùng tên là đăng nhập staging ghi đè phiên production |
| `APP_ENV` | `staging` trên máy production ⇒ mã OTP của khách bị trả thẳng trong response |

Và production **bắt buộc** ba thứ mà staging được miễn: **eSMS** (`OTP_MODE=esms`), **SMTP**, và
**đủ bộ R2**. Thiếu bất kỳ cái nào là API từ chối boot — đó là chủ đích, xem `docs/deployment.md` §2.3.

OAuth: `redirect_uri` là **danh sách**, nên thêm URI production vào cùng client cũng được. Nhưng
tách hẳn hai client thì thu hồi được độc lập.

---

## 10. Sau khi khai xong

Biến chỉ vào máy khi deploy lại — file `.env.staging` được sinh mới mỗi lần:

**Actions → Deploy → Run workflow** → `environment: staging` → Run.

Rồi kiểm bằng **log boot của API**, nơi nó tự khai đang chạy suy giảm những gì:

```bash
ssh xeprime@222.255.215.242
cd /opt/xeprime
docker compose -p xeprime-staging -f docker-compose.prod.yml --env-file .env.staging \
  logs api | grep -A5 'APP_ENV=staging'
```

Khai R2 đúng thì dòng `• R2: TRỐNG (upload trả 503)` **biến mất**. Đó là cách kiểm nhanh nhất —
nhanh hơn đi bấm thử trên giao diện.

| Kiểm bằng mắt | Cách |
| --- | --- |
| R2 | Vào một xe → thêm ảnh. Lỗi CORS hiện ở Console trình duyệt, không phải ở log server |
| Google/Facebook | Bấm nút đăng nhập tương ứng. `?authError=SOCIAL_NOT_CONFIGURED` trên URL = chưa nhận biến |
| Maps | Mở chi tiết một xe có địa chỉ — khối bản đồ chỉ hiện khi key nhúng hợp lệ |
| Ngày lễ | `curl https://api-stg.xeprime.vn/holidays` — worker chạy mỗi ngày một lần, chờ tới hôm sau |
| Chat | Mở hội thoại ở hai trình duyệt, gửi tin. Không realtime ⇒ xem `docker compose logs worker` |

### Khi có gì đó không chạy

| Triệu chứng | Nguyên nhân gần như chắc chắn |
| --- | --- |
| `redirect_uri_mismatch` | URI trong console lệch từng ký tự với `https://api-stg.xeprime.vn/auth/social/<provider>/callback` |
| Upload im lặng hỏng, Console báo CORS | Chưa đặt CORS policy trên bucket, hoặc thiếu `content-type` trong `AllowedHeaders` |
| Ảnh tải lên xong nhưng không hiện | `R2_PUBLIC_BASE_URL` sai, hoặc bucket công khai chưa bật r2.dev |
| Ảnh chat bị từ chối `VALIDATION_FAILED` | `R2_PUBLIC_BASE_URL` có dấu `/` thừa ở cuối |
| API không boot sau khi bật Firebase | `FIRESTORE_ENABLED=true` bắt buộc đủ 6 biến R2 — làm §1 trước |
| Bản đồ không hiện dù đã khai key | `NEXT_PUBLIC_*` nhúng lúc build — phải **deploy lại**, restart không đủ |
| Maps trả `REQUEST_DENIED` | Key bị khoá theo IP mà IP VPS không nằm trong danh sách, hoặc chưa bật đúng API |
