# Tạo key và cấu hình dịch vụ bên thứ ba

> Mọi endpoint, scope và đường dẫn trong tài liệu này lấy **từ code**, không phải từ tài liệu của
> nhà cung cấp. Khai sai một ký tự ở `redirect_uri` là lỗi tốn nhiều thời gian nhất trong cả danh
> sách này, nên hãy chép thẳng từ đây.
>
> Bản này viết cho **staging** (`stg.xeprime.vn` / `api-stg.xeprime.vn`). Production lặp lại đúng
> các bước với bộ key **riêng** — §9.
>
> **Cập nhật 06/10/2026:** tài liệu này chỉ ghi dịch vụ đã có biến/đường gọi trong code. SePay đã
> có cấu hình thật trong code — §8b. Đối tác thu hộ/chi hộ và bảo hiểm chuyến đi vẫn nằm trong
> roadmap, chưa có cấu hình; không tạo key hay viết tên biến đoán trước khi implementation và hợp
> đồng đối tác được chốt.
>
> **Cập nhật 15/10/2026:** §4 viết lại cho Vietmap (ADR 0061 — Geoapify đã gỡ khỏi API và web, web
> không còn vẽ bản đồ; Google Maps Platform không dùng được cho Việt Nam). Biến cũ
> `GEOAPIFY_API_KEY` / `NEXT_PUBLIC_GEOAPIFY_MAP_KEY` không còn được đọc.

## 0. Cần cái nào trước

Staging chạy được với **không có key nào cả**. Mỗi mục dưới đây mở thêm một mảng tính năng, và
thiếu thì phần đó suy giảm có kiểm soát chứ không làm sập app.

| # | Dịch vụ | Mở ra cái gì | Thiếu thì sao | Tốn tiền? |
| --- | --- | --- | --- | --- |
| 1 | **Cloudflare R2** | Tải ảnh xe, ảnh gian hàng, giấy tờ, đính kèm chat | Mọi endpoint upload trả **503 `UPLOADS_NOT_CONFIGURED`** | Gần như 0 ở mức staging |
| 2 | **Google OAuth** | Nút "Đăng nhập bằng Google" | Nút trả `SOCIAL_NOT_CONFIGURED`; mật khẩu + OTP vẫn chạy | Miễn phí |
| 3 | **Facebook Login** | Nút "Đăng nhập bằng Facebook" | như trên | Miễn phí |
| 4 | **Vietmap** (1 key server) | Gợi ý địa chỉ, ước lượng quãng đường + phí giao | Ô địa chỉ nhập tay, phí giao không hiện | Có — tính theo giao dịch, xem 4.6 |
| 5 | **Google Calendar** | Lớp ngày lễ trên lịch xe | `GET /holidays` trả rỗng | Miễn phí |
| 6 | **Firebase** | Chat **realtime** | Chat vẫn chạy trên PostgreSQL, chỉ không đẩy tức thì | Miễn phí ở mức này |
| 7 | **SMTP** | Thư mời thành viên + đặt lại mật khẩu gửi thật | Email **in ra log** container — chạy được nhưng KHÔNG đi qua nodemailer, nên lỗi SMTP/TLS/`From` chỉ lộ ở production. Staging nay gửi thật (§7.2); máy dev dùng Mailpit (§7.1) | Miễn phí ở mức pilot |
| 8 | **Telegram bot** | Cảnh báo sao lưu thất bại | Không ai biết khi backup hỏng | Miễn phí |
| 9 | **SePay** | Đối soát chuyển khoản tự động: kích hoạt gói, tạo đơn thuê khi tiền giữ chỗ về đủ, VietQR trên màn thanh toán | Webhook trả 503 `SEPAY_NOT_CONFIGURED`; màn thanh toán chỉ còn mã + số tiền, không tiền nào được ghi nhận tự động | Tuỳ gói dịch vụ SePay |
| 10 | **MoMo · VNPAY** (ADR 0058 — Proposed) | Nút "Thanh toán qua Ví MoMo / VNPAY" dưới khối chuyển khoản, cho hoá đơn gói và tiền giữ chỗ — **chỉ staging** cho tới khi ADR 0058 chuyển Accepted | Không nút nào hiện; checkout trả 503 `PAYMENT_GATEWAY_UNAVAILABLE`; chuyển khoản VietQR vẫn chạy | Sandbox miễn phí; production theo hợp đồng merchant (phí % mỗi giao dịch) |

**eSMS.vn ở staging là tuỳ chọn.** Staging gửi SMS thật (`OTP_MODE=esms` + ba `ESMS_*`) và nhận
thêm mã test `OTP_BYPASS_CODE` (vd `123456`) — gõ mã thật hay mã test đều qua, gửi mã hay không
cũng vậy. Không có eSMS thì `OTP_MODE=mock` in mã ra log và trả kèm `devCode`. Máy dev không khai
`OTP_BYPASS_CODE` thì mặc định `123456`. Production bắt buộc eSMS và CẤM `OTP_BYPASS_CODE` (workflow
dừng, API từ chối boot).

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
https://stg.xeprime.vn/api/auth/social/google/callback
https://partner-stg.xeprime.vn/api/auth/social/google/callback
https://api-stg.xeprime.vn/auth/social/google/callback
```

Ba dòng vì ba lối vào (ADR 0051 · 0053): site khách và site đối tác mỗi site một callback CÙNG ORIGIN
(cookie phiên là host-only của site đó), app native một callback trên host API. Site quản trị chỉ
đăng nhập bằng mật khẩu — không khai.

Không cần khai "Authorized JavaScript origins": vòng OAuth chạy **hoàn toàn ở server** (ADR
0019), trình duyệt không bao giờ cầm token của Google.

> URI web do URL gốc của site realm (`APP_WEB_URL` · `WEB_PARTNER_URL`) + `/api/auth/social/google/callback`
> ghép ra, URI native do `API_PUBLIC_URL` + `/auth/social/google/callback` — code **không bao giờ**
> suy chúng từ header của request, nên chúng ổn định từng ký tự. Lệch một dấu `/` là
> `redirect_uri_mismatch`.
>
> Đây là danh sách: khi dựng production, **thêm** `https://xeprime.vn/api/auth/social/google/callback`,
> `https://partner.xeprime.vn/api/auth/social/google/callback` và
> `https://api.xeprime.vn/auth/social/google/callback` vào cùng client, hoặc tạo client riêng.

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
https://stg.xeprime.vn/api/auth/social/facebook/callback
https://partner-stg.xeprime.vn/api/auth/social/facebook/callback
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

## 4. Vietmap — gợi ý địa chỉ, phí giao xe

Từ **ADR 0061** (15/10/2026) gợi ý địa chỉ và quãng đường giao xe chạy trên **Vietmap Maps API
v4**. Bản đồ trên web chỉ là **ẢNH TĨNH** (Static Map) do API vẽ hộ bằng chính services key và cache
theo chi nhánh — xem được, không tương tác; kèm liên kết "Mở bằng Google Maps" để dẫn đường (miễn
phí, không key). Geoapify/Leaflet đã gỡ. **Không dùng Google Maps Platform**: Việt Nam nằm trong danh
sách *Prohibited Territories* của Google.

Chỉ có **MỘT loại key: services key** ("Key API (search, route…)" trong console), và nó chỉ nằm ở
backend — kể cả ảnh bản đồ tĩnh. **Không dùng Key Tilemap**: nó dành cho bản đồ tương tác chạy
trong trình duyệt (lộ key, trả tiền theo tile cho mỗi lượt xem), thứ web không dùng.

Vietmap tính tiền theo **giao dịch**: gợi ý / place / search / reverse = 1 giao dịch mỗi lượt, route
2 điểm = 1 giao dịch. Gói trial: 60.000 giao dịch (Vietmap quy đổi ≈ 3.000.000đ, tức ~50đ/giao
dịch), giới hạn 500 lượt/ngày cho mỗi API. Code đã được thiết kế quanh chi phí đó — §4.6.

### 4.1 Tài khoản

1. Vào <https://maps.vietmap.vn/console-v2/> → đăng ký. Nên dùng tài khoản/email của CÔNG TY
   (không phải cá nhân một người); hai key được gửi qua email sau khi xác minh.
2. Trước khi mở cho khách thật: xem bảng giá gói Standard (menu **Thanh toán** / nút **Nâng
   cấp**), hỏi Vietmap về hoá đơn VAT + hợp đồng và điều khoản lưu cache (ADR 0061 "Còn mở"). Hỗ
   trợ: Zalo OA Vietmap (nút trong console), hotline 089.616.4567.

### 4.2 Lấy key

- **Tổng quan** → khung "Lấy API key" → **Key API (search, route…)**: đây là services key cần dùng.
- **Consumers** → mở project → **Detail**: thêm/xoá key, **whitelist IP**, giới hạn domain, đặt hạn
  mức theo key/IP và theo từng API. (Tài khoản Trial chưa được tự chỉnh hạn mức — cần nâng cấp.)

### 4.3 Dev + staging: HAI services key

| Key | Giới hạn | Dùng ở |
| --- | --- | --- |
| `xeprime-server-stg` | **Whitelist IP** = IP mà VPS staging gọi ra ngoài | Secret `VIETMAP_API_KEY` của staging |
| `xeprime-server-dev` | không giới hạn IP (IP nhà/văn phòng đổi liên tục) | `VIETMAP_API_KEY` trong `.env` máy dev |

Nếu tài khoản trial chỉ có MỘT services key và chưa tạo thêm được: tạm dùng một key cho cả hai,
KHÔNG đặt whitelist IP (đặt thì máy dev bị chặn), và tách thành hai key ngay khi nâng gói.

IP của VPS staging — lấy ngay trên VPS, đừng lấy bằng `nslookup` tên miền (bản ghi DNS đi qua proxy
Cloudflare trả IP của Cloudflare, không phải IP Vietmap nhìn thấy):

```bash
ssh xeprime@stg.xeprime.vn 'curl -s -4 ifconfig.me; echo; curl -s -6 ifconfig.me'
```

### 4.4 Khai biến

| Loại | Tên | Staging (GitHub Environment) | Máy dev (`.env`) |
| --- | --- | --- | --- |
| **Secret** | `VIETMAP_API_KEY` | `xeprime-server-stg` | `xeprime-server-dev` |
| Variable | `GEO_DAILY_CALL_BUDGET` | `3000` (cầu dao — §4.6), bỏ trống = 3000 | để mặc định |

Không có biến `NEXT_PUBLIC_*` nào cho bản đồ: đổi key không cần build lại web, chỉ cần khởi động lại
API (staging: deploy lại; máy dev: tắt rồi chạy lại `pnpm dev`).

**Xoá biến cũ** ở GitHub Environment — Secret `GEOAPIFY_API_KEY` và Variable
`NEXT_PUBLIC_GEOAPIFY_MAP_KEY` — **SAU KHI** code ADR 0061 đã deploy lên môi trường đó. Trước mốc
đó staging vẫn chạy code Geoapify và vẫn đọc hai biến này; khai biến Vietmap trước thì vô hại. Ở
`.env` máy dev thì xoá ngay khi đã kéo code mới.

Biến **tuỳ chọn**: thiếu key thì ô địa chỉ rơi về nhập tay, phí giao dự kiến không hiện — luồng
đặt xe chạy y như trước. Không biến nào chặn boot. Dòng khởi động của API ghi
`Bản đồ (Vietmap): đã cấu hình` khi đọc được key.

### 4.5 Kiểm key bằng vài lệnh (làm NGAY sau khi tạo — đóng ADR 0061 Q3)

Đã đối chiếu một lần trên key thật (15/10/2026 — ADR 0061 Q3). Chạy lại khi đổi key hoặc nghi Vietmap
đổi API. Chạy trong Git Bash (PowerShell thì gõ `curl.exe` thay cho `curl`):

```bash
K=<key xeprime-server-dev>
# 1. Gợi ý: phải ra MẢNG, mỗi dòng có ref_id / name / address (không có lat,lng).
curl -s "https://maps.vietmap.vn/api/autocomplete/v4?apikey=$K&text=197%20Tran%20Phu&focus=10.76,106.67&display_type=1"
# 2. Chi tiết: dán ref_id của dòng đầu ở lệnh 1 → phải có lat, lng, city, ward.
curl -s "https://maps.vietmap.vn/api/place/v4?apikey=$K&refid=<ref_id>"
# 3. Địa chỉ không có thật → KHÔNG rỗng: Search luôn khớp mờ ra một chỗ khác (code tự lọc — ADR 0061 điều 5).
curl -s "https://maps.vietmap.vn/api/search/v4?apikey=$K&text=dia%20chi%20khong%20co%20that%20xyz&display_type=1"
# 4. Quãng đường → "code":"OK" và paths[0].distance (mét).
curl -s "https://maps.vietmap.vn/api/route/v4?apikey=$K&point=10.7721,106.698&point=10.7743,106.7038&vehicle=car&points_encoded=true"
# 5. Key SAI → HTTP 401.
curl -s -w "\nHTTP %{http_code}\n" "https://maps.vietmap.vn/api/autocomplete/v4?apikey=sai-key&text=abc"
```

Mỗi lệnh đúng key là một giao dịch.

### 4.6 Chi phí — đã chặn sẵn trong code, và việc vận hành còn lại

Các lớp tiết kiệm có sẵn (ADR 0061 điều 3):

| Lớp | Tiết kiệm gì |
| --- | --- |
| **Bản đồ là ảnh tĩnh vẽ một lần mỗi chi nhánh** (API cache, trình duyệt giữ 1 ngày) thay vì bản đồ tương tác | chi phí tile (25 tile = 1 giao dịch) cho MỖI lượt xem trang xe |
| **Cầu dao** `GEO_DAILY_CALL_BUDGET` request/ngày (mặc định 3.000) — chạm trần thì bản đồ coi như "không hỏi được" tới hết ngày, log cảnh báo một lần | chặn một trận quét endpoint `/places/*` công khai biến thành hoá đơn |
| Debounce 400ms + tối thiểu 3 ký tự + chỉ hỏi khi đã biết tỉnh + `@Throttle` 30/phút/IP | lượt gõ thừa, lưu lượng không thật |
| Cache gợi ý trong bộ nhớ 10 phút | lượt gõ lặp lại, quay lại ô |
| Cache Place theo mã địa điểm | chọn lại cùng một chỗ (form sửa, hai khách một địa chỉ) = 0 giao dịch |
| Báo giá dùng toạ độ đã chọn, không tra lại | 2 giao dịch search + place cho mỗi báo giá |
| Cache DB **90 ngày** cho geocode/reverse/quãng đường (cả ca "không tìm thấy") | cùng địa chỉ / cùng cặp điểm không gọi lại |
| Lọc trước bằng đường chim bay | ngoài bán kính giao thì không gọi Route |

Ước tính ở mức pilot, mỗi tháng: 3.000 lượt nhập địa chỉ × ~4 gợi ý = 12.000 · 3.000 lượt chọn =
3.000 · 2.000 báo giá = 2.000 · ~500 địa chỉ gõ tay × 2 = 1.000 ⇒ **~18.000 giao dịch/tháng**,
chưa trừ phần trúng cache. Gói trial 60.000 giao dịch đủ ~3 tháng ở mức này; giá gói trả phí lấy
từ console (Q2).

Việc vận hành:
1. Cầu dao `GEO_DAILY_CALL_BUDGET` là trần của mình; khi đã nâng gói, đặt thêm hạn mức theo key/API
   trong **Consumers → Detail** làm lớp thứ hai. Log API có dòng `Vietmap chạm trần … lượt/ngày` là
   dấu hiệu nên xem lại. Xem **Thống kê** / **Lịch sử transactions** mỗi tuần.
2. Key lộ ⇒ **regenerate** key đó trong console rồi khai lại — key staging/dev tách riêng chính là để
   làm việc này mà không kéo theo môi trường kia.

### 4.7 Production

Một services key RIÊNG, whitelist IP = IP VPS production, hạn mức theo key đặt trong console.
**Không** dùng lại key staging/dev.

### 4.8 "Một key dùng cho cả dev và staging được không?"

| Trường hợp | Trả lời | Vì sao |
| --- | --- | --- |
| Dev + staging | **Nên hai key** | Key staging khoá theo IP VPS. Dùng chung với máy dev thì phải bỏ khoá IP, và một file `.env` lộ ra là một key không khoá gọi được dịch vụ tính tiền. Trial chỉ có một key thì tạm dùng chung (§4.3) |
| Bất kỳ key nào ↔ production | **Không bao giờ** | Hạn mức, hoá đơn và việc thu hồi key của production phải tách khỏi môi trường thử |

### 4.9 App native — CHƯA chuyển (ADR 0061 điều 9)

Hai app native vẫn VẼ bản đồ bằng Geoapify qua `EXPO_PUBLIC_GEOAPIFY_MAP_KEY` cho tới khi dev mobile
chuyển — giữ key Geoapify của app như cũ. Gợi ý địa chỉ, chọn địa điểm và quãng đường của app đi qua
API nên đã là Vietmap. App KHÔNG bao giờ cầm services key.

---

## 5. Google Calendar — ngày lễ

Key RIÊNG, tách khỏi key bản đồ ở §4 (khác nhà cung cấp, khác hạn mức, và nó chạy ở worker).

1. Cùng project với §2 (`XePrime`) → **Library** → bật **Google Calendar API**
2. **Credentials** → *Create credentials* → **API key**
   - Application restrictions: **IP addresses** → IP VPS staging (cách lấy IP ở §4.3)
   - API restrictions: chỉ **Google Calendar API**

| Loại | Tên | Giá trị |
| --- | --- | --- |
| **Secret** | `GOOGLE_HOLIDAY_API_KEY` | key vừa tạo |
| Hằng số (không phải env) | `GOOGLE_HOLIDAY_CALENDAR_ID_DEFAULT` ở `@xeprime/types` | `vi.vietnamese#holiday@group.v.calendar.google.com` |

Chỉ cần **API key**, không cần OAuth hay service account — lịch ngày lễ của Google là công khai.
Worker đồng bộ mỗi ngày một lần và tự che key khỏi log lỗi.

---

## 6. Firebase — chat realtime + thông báo đẩy

Đăng nhập đã tự làm hoàn toàn từ ADR 0019, nên Firebase còn đúng **hai vai**, bật/tắt độc lập
bằng hai biến riêng nhưng dùng CHUNG một project và một service account:

| Vai | Cờ | Ai đọc credential |
| --- | --- | --- |
| Đẩy tin nhắn realtime (Firestore projection) | `FIRESTORE_ENABLED` | API (mint custom token) + worker (đẩy projection) |
| Thông báo đẩy (FCM) | `PUSH_ENABLED` | worker (gửi). API chỉ xếp hàng, không gọi Firebase |

**PostgreSQL là nguồn sự thật** của mọi tin nhắn; Firestore chỉ giữ ~50 tin gần nhất mỗi hội
thoại để client nhận tức thì (ADR 0009).

Thông báo đẩy có tài liệu riêng cho toàn bộ luồng (bao gồm `google-services.json`,
`GoogleService-Info.plist` và khoá APNs): **`docs/push-notifications.md`**. Phần dưới đây chỉ nói
về bộ credential dùng chung.

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
- Đọc `/user_badges/{uid}` chỉ khi `uid` LÀ chính mình — bản chiếu huy hiệu, ADR 0034
- Bắt-tất-cả `/{document=**}` chặn cả đọc lẫn ghi

Firestore mặc định ở "Production mode" đã chặn hết, nhưng phải đẩy rules của repo lên để phần
đọc hợp lệ hoạt động:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules --project <project-id của môi trường đó>
```

> **Staging và production KHÔNG cần bước này nữa** (11/09/2026): `deploy.yml` tự đẩy rules trước
> khi rollout app, và release dừng nếu đẩy thất bại — xem `docs/deployment.md` §9.3. Phần dưới
> đây chỉ còn dành cho **máy dev** và cho tình huống chữa cháy bằng tay.

Hai ghi chú từ lần làm tay 11/09/2026:

- **Bản CLI trong repo đã được nâng lên `15.30.0`.** Bản cũ `13.29.1` crash ngay lúc khởi động
  trên Node 24 (`ENOENT … templates/hosting/init.js`) — không liên quan gì tới rules, nhưng nó
  làm mọi lệnh firebase chết trước khi kịp chạy. Dùng `pnpm exec firebase` để luôn chạy đúng bản
  đã ghim thay vì một bản global bất kỳ.
- **Máy dev thì `firebase login` (tương tác); CI thì service account.** CLI vẫn hỗ trợ đường
  không-tương-tác qua `GOOGLE_APPLICATION_CREDENTIALS` (Application Default Credentials) — chính
  nó in cảnh báo deprecated cho `--token`/`FIREBASE_TOKEN` và trỏ sang đây. Nhưng tài khoản
  `firebase-adminsdk-*` mà backend dùng lúc chạy **không** đẩy được rules: nó không có quyền quản
  trị rules, và cũng không nên được cấp. Vì vậy workflow dùng một service account RIÊNG
  (`FIREBASE_DEPLOY_CREDENTIALS_JSON`).

### 6.5 Bật

| Loại | Tên | Giá trị | Bật cái gì |
| --- | --- | --- | --- |
| Variable | `FIRESTORE_ENABLED` | `true` | chat realtime |
| Variable | `PUSH_ENABLED` | `true` | thông báo đẩy (FCM) |

Hai cờ ĐỘC LẬP — bật push mà tắt chat realtime là cấu hình hợp lệ. Đặt `false` bất cứ lúc nào để
tắt: chat quay về chạy trên PostgreSQL (không mất tin nào), còn thông báo quay về chỉ có hộp thư
in-app.

### 6.6 Thêm cho thông báo đẩy

Ba việc, chi tiết ở `docs/push-notifications.md` §2:

1. bật **Firebase Cloud Messaging API** trên Google Cloud Console;
2. cấp cho service account vai trò **Firebase Cloud Messaging API Admin**;
3. đăng ký **hai app Android + hai app iOS** trong mỗi Firebase project — một cặp cho mỗi app
   native — rồi tải `google-services.json` (Android) + `GoogleService-Info.plist` (iOS) vào
   `credentials/` của đúng app, và upload **khoá APNs `.p8`** vào Firebase Console. Package/bundle
   id phải trùng từng ký tự với `app.json` của app đó:

   | App | `app.json` | Package / Bundle ID |
   | --- | --- | --- |
   | XePrime (khách) | `apps/mobile/customer/app.json` | `vn.xeprime.mobile` |
   | XePrime Partner | `apps/mobile/manage/app.json` | `vn.xeprime.partner` |

> ⚠️ File credential của app native **không nằm trong repo** và không được commit
> (`/credentials/` nằm trong `.gitignore` của từng app). Private key
> của service account (`FIREBASE_PRIVATE_KEY`) chỉ ở backend/worker — không bao giờ vào app.

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

## 8b. SePay — đối soát chuyển khoản (tiền gói + tiền giữ chỗ)

SePay theo dõi tài khoản ngân hàng nhận tiền của nền tảng và bắn **webhook** cho mỗi giao dịch vào.
API ghi mọi khoản vào MỘT bảng `bank_transactions` và phân loại đích bằng tiền tố mã trong nội dung
chuyển khoản: `XPG…` = hoá đơn gói, `XPH…` = tiền giữ chỗ của khách (ADR 0022 · 0028 · 0044). Writer
duy nhất là `SepayService` (`apps/api/src/modules/sepay/`).

**Bốn biến là MỘT nhóm** — khai đủ cả bốn, hoặc để trống cả bốn. Khai lẻ thì API **từ chối boot**
(`superRefine` ở [env.schema.ts](../apps/api/src/config/env.schema.ts)):

| Loại | Tên | Giá trị | Ghi chú |
| --- | --- | --- | --- |
| **Secret** | `SEPAY_API_KEY` | khoá **webhook** đặt trong bảng điều khiển SePay | **≥ 16 ký tự** (`z.string().min(16)`). SePay gửi kèm `Authorization: Apikey <key>`, API so time-safe. KHÔNG phải khoá gọi API của SePay |
| Variable | `SEPAY_BANK_CODE` | mã ngân hàng chuẩn VietQR, vd `VCB`, `TCB` | dựng ảnh QR quicklink |
| Variable | `SEPAY_ACCOUNT_NUMBER` | số tài khoản nhận | in vào QR ⇒ công khai theo bản chất |
| Variable | `SEPAY_ACCOUNT_NAME` | tên chủ tài khoản | in trên QR để người chuyển đối chiếu |

Trống cả bốn (mặc định, kể cả staging): `POST /sepay/webhook` trả **503 `SEPAY_NOT_CONFIGURED`** —
fail closed, không bao giờ giả vờ đã nhận tiền — và màn thanh toán chỉ còn mã + số tiền, không có
VietQR. Nhóm này **chưa** nằm trong nhóm bắt buộc của `APP_ENV=production`; khi tài khoản thật đã
ký, chuyển nó xuống nhóm bắt buộc trong một PR riêng.

Cấu hình webhook trong bảng điều khiển SePay:

| Môi trường | URL webhook | Xác thực |
| --- | --- | --- |
| staging | `https://api-stg.xeprime.vn/sepay/webhook` | API Key = đúng giá trị `SEPAY_API_KEY` của staging |
| production | `https://api.xeprime.vn/sepay/webhook` | API Key = `SEPAY_API_KEY` của production (khoá KHÁC staging) |

Webhook gọi thẳng **host API** (`API_DOMAIN` trong `deploy/Caddyfile`), không qua `/api` của một site
web — route này `@Public()` và không cần realm. Nó trả đúng `{"success": true}` sau khi giao dịch đã
được xử lý, kể cả khi SePay gửi lại cùng giao dịch (idempotent bằng unique `provider_tx_id` ở DB).

Khai ở GitHub Environment như mọi biến khác (`.github/workflows/deploy.yml` đọc `vars.SEPAY_*` +
`secrets.SEPAY_API_KEY`); bảng tóm tắt ở `docs/deployment.md` §9.2.

---

## 8c. MoMo · VNPAY — cổng thanh toán bổ sung (ADR 0058 — Proposed)

Hai cổng là phương thức **bổ sung** cho chuyển khoản VietQR/SePay (§8b), không thay nó. Mã ở
`apps/api/src/modules/payment-gateway/`; writer duy nhất của sổ `payment_gateway_orders` là
`PaymentGatewayService`. Tiền qua cổng **không** đi vào `bank_transactions`.

Mọi thứ **mặc định tắt**. Có hai trục, cả hai phải bật thì nút mới hiện:

| Trục | Biến | Giá trị |
| --- | --- | --- |
| Luồng hoá đơn gói | `PAYMENT_GATEWAY_SUBSCRIPTION` | `off` (mặc định) · `on` — **production từ chối boot khi `on`** (phí cổng, đối soát, chứng từ chưa chốt — ADR 0058 Q2, Q5–Q7) |
| Luồng tiền giữ chỗ | `PAYMENT_GATEWAY_BOOKING_HOLD` | `off` (mặc định) · `on` — **production từ chối boot khi `on`** (thêm gate pháp lý L1/L5, ADR 0058 Q1–Q4) |
| Nhãn môi trường cổng | `PAYMENT_GATEWAY_MODE` | `sandbox` (mặc định — web gắn thẻ "Môi trường thử") · `live` (bắt buộc ở production khi được bật luồng, sau khi gỡ chặn) |
| Cổng MoMo | `MOMO_PARTNER_CODE` · `MOMO_ACCESS_KEY` · `MOMO_SECRET_KEY` · `MOMO_API_BASE_URL` | nhóm bốn-biến-hoặc-không |
| Cổng VNPAY | `VNPAY_TMN_CODE` · `VNPAY_HASH_SECRET` · `VNPAY_PAYMENT_URL` · `VNPAY_API_URL` | nhóm bốn-biến-hoặc-không |

Phân loại ở GitHub Environment: `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `VNPAY_HASH_SECRET` là **Secret**
(lộ là phải xoay lại); mã merchant, URL của cổng và ba công tắc là **Variable**. Khai lẻ một nhóm thì
API từ chối boot; bật một luồng mà không cổng nào đủ khoá cũng từ chối boot. Ở môi trường đã triển
khai, URL của cổng bắt buộc `https://`.

### 8c.1 MoMo sandbox

1. Đăng ký tài khoản doanh nghiệp/nhà phát triển ở cổng MoMo Business để nhận bộ khoá **môi trường
   thử** (`partnerCode`, `accessKey`, `secretKey`). Tài liệu: <https://developers.momo.vn/v3/docs/payment/onboarding/test-instructions/>.
2. Khai `MOMO_API_BASE_URL=https://test-payment.momo.vn` (production: `https://payment.momo.vn`).
3. **IPN URL không khai ở portal** — server gửi kèm từng request: `${API_PUBLIC_URL}/payment-gateway/momo/ipn`.
   MoMo POST JSON và chờ HTTP 204 trong 15 giây. URL phải ra được Internet bằng https (staging:
   `https://api-stg.xeprime.vn/payment-gateway/momo/ipn`).
4. Trang quay về dựng từ `APP_WEB_URL` (tiền giữ chỗ → `/trips/:id?paymentOrder=…`) và
   `WEB_PARTNER_URL` (hoá đơn gói → `/payment-return?order=…`).
5. Thử: tải **MoMo Test App** (trang download của developers.momo.vn), tạo ví bằng một SĐT 10 số;
   OTP và mật khẩu mặc định của môi trường thử là `000000`.
6. Hạn mức theo tài liệu `captureWallet`: 1.000đ – 50.000.000đ mỗi giao dịch (nút tự khoá ngoài
   khoảng này).

### 8c.2 VNPAY sandbox

1. Đăng ký merchant thử ở <https://sandbox.vnpayment.vn/devreg/> — VNPAY gửi `vnp_TmnCode` và
   `vnp_HashSecret` qua email, kèm tài khoản trang quản trị merchant thử và thông tin thẻ test.
2. Khai `VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html` và
   `VNPAY_API_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction`.
3. **IPN URL khai ở trang quản trị merchant của VNPAY** (không gửi theo request):
   `${API_PUBLIC_URL}/payment-gateway/vnpay/ipn`. VNPAY gọi GET và đọc `{ RspCode, Message }`; nếu
   không nhận `00`/`02` thì gọi lại tối đa 10 lần, cách 5 phút.
4. Đặc tả: <https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html> (thanh toán, IPN, bảng
   mã) · <https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr&refund.html> (`querydr`).

### 8c.3 Máy dev (IPN không tới được localhost)

Cổng không gọi được `http://localhost:4000`. Hai cách, chọn một:

- **Không cần IPN**: trang quay về hỏi trạng thái, và server tự truy vấn cổng (MoMo `query` /
  VNPAY `querydr`) khi lượt còn chờ quá 10 giây — đủ để thử trọn luồng trên máy dev. Đóng trình duyệt
  trước khi quay về cũng không sao: bộ quét trong API hỏi cổng các lượt còn chờ mỗi 5 phút.
- **Có IPN**: mở một tunnel https tới cổng 4000 và đặt `API_PUBLIC_URL` bằng URL tunnel (MoMo đọc IPN
  URL từ đó); với VNPAY khai URL tunnel ở trang quản trị merchant thử.

### 8c.4 Ca thử bắt buộc trên staging (bằng chứng UAT)

| Ca | Kỳ vọng |
| --- | --- |
| Trả thành công hoá đơn gói | Trang quay về: "đang chờ" → "đã nhận"; gói bật đúng MỘT lần; hoá đơn `paid` |
| Huỷ trên trang cổng | "Bạn đã huỷ thanh toán…"; hoá đơn vẫn chờ; mở phiên mới được |
| Bấm lại nút khi phiên cũ còn hạn | Dùng lại đúng phiên cũ (không mở phiên thứ hai) |
| IPN gửi lại (cổng retry) | Không cộng tiền lần hai |
| Hoá đơn bị void trước khi trả xong | Lượt vào hàng đợi "Cổng thanh toán cần xử lý" với lý do tiền về muộn; gói KHÔNG bật |
| IPN không tới | Trang quay về vẫn ra kết quả nhờ truy vấn phía server; người trực bấm "Hỏi lại cổng" được và màn hình nói đúng kết quả |
| IPN không tới VÀ không quay về trang | Trong ~5–10 phút bộ quét tự hỏi cổng và ghi nhận; gói bật / đơn thuê ra đời |
| Trả tiền giữ chỗ khi hold đã quá hạn | Không tạo đơn; lượt vào hàng đợi với lý do tiền về muộn |
| Vừa chuyển khoản đủ vừa trả qua cổng | Hoá đơn gói: lượt vào hàng đợi lý do "trả trùng". Tiền giữ chỗ: KHÔNG vào hàng đợi cổng — có yêu cầu hoàn phần thừa ở hàng đợi hoàn của khoản giữ chỗ; trang chuyến báo "khoản trùng đã được hoàn" |
| Trả trùng vào khoản giữ chỗ đã có một khoản hoàn từ trước | Lượt vào hàng đợi cổng lý do "trả trùng" — khoản hoàn cũ không bị cộng dồn |
| Đóng lượt ở hàng đợi | Có ghi chú + mã hoàn; nhật ký `payment_gateway_order.resolve` |
| Cổng báo thu SAU khi lượt đã đóng | Không tự áp; lượt mở lại, hiện ghi chú + mã hoàn lần trước; nút "Ghi nhận khoản này" chạy áp tiền kèm nhật ký `payment_gateway_order.apply` |

### 8c.5 Lên production — việc với nhà cung cấp

1. **Hợp đồng merchant** với từng cổng (hồ sơ pháp nhân, tài khoản ngân hàng nhận quyết toán, website có
   điều khoản, chính sách đổi trả/hoàn tiền và thông tin liên hệ công khai — Luật TMĐT, ADR 0028 điều 9).
2. **Nghiệm thu tích hợp** theo checklist của cổng (MoMo: mục "Launch And Reports" trên developers.momo.vn;
   VNPAY: nghiệm thu sandbox trước khi cấp bộ khoá production). Cổng cấp bộ khoá **production riêng** —
   không dùng chung với staging.
3. Khai bộ khoá production ở GitHub Environment `production`, `PAYMENT_GATEWAY_MODE=live`, URL production
   của cổng, và IPN URL production ở portal VNPAY.
4. Cả hai công tắc ở production bị MÃ chặn (env schema từ chối boot) cho tới khi ADR 0058 chuyển
   Accepted. Luồng gói gỡ được khi chủ sản phẩm chốt phí cổng, đối soát và chứng từ (Q2, Q5–Q7); luồng
   tiền giữ chỗ cần thêm ý kiến pháp lý L1/L5 và chính sách hoàn (Q1, Q3, Q4). Gỡ chặn là một PR sửa
   `apps/api/src/config/env.schema.ts` kèm ADR Accepted, không phải một lần đổi biến.
5. Muốn mở thẳng app MoMo (`deeplink`/`qrCodeUrl`) phải xin quyền riêng — hiện dùng `payUrl`.

---

## 9. Sang production thì khác gì

Lặp lại đúng các bước trên với bộ **riêng**. Bốn thứ **phải khác**, còn lại nên khác:

| Thứ | Vì sao bắt buộc khác |
| --- | --- |
| `R2_BUCKET` / `R2_PRIVATE_BUCKET` | Ảnh test và giấy tờ test lẫn vào kho khách hàng thật |
| `SEPAY_API_KEY` | Một khoá dùng chung thì ai cầm khoá staging cũng giả được webhook "tiền đã về" cho production (§8b) |
| `MOMO_SECRET_KEY` · `VNPAY_HASH_SECRET` | Khoá ký IPN — dùng chung là ai cầm khoá staging cũng ký được "đã thanh toán" cho production; cổng cấp bộ production riêng (§8c.5) |
| `SESSION_COOKIE_NAME` | Từ ADR 0053 cookie là **host-only** theo từng site (`<tên>_<realm>`, không có `Domain`) nên hai môi trường không còn ghi đè phiên nhau. Vẫn giữ khác tên (`xp_session` ↔ `xp_session_stg`) để nhìn devtools là biết đang ở môi trường nào, và để một file env chép nhầm không âm thầm trùng — `docs/deployment.md` §2.3 |
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
ssh xeprime@<ip-vps>
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
| Vietmap | Gõ địa chỉ ở ô giao xe phải ra gợi ý; chọn một dòng → báo giá giao xe hiện phí dự kiến. Log boot của API có dòng `Bản đồ (Vietmap): đã cấu hình` |
| Ngày lễ | `curl https://api-stg.xeprime.vn/holidays` — worker chạy mỗi ngày một lần, chờ tới hôm sau |
| Chat | Mở hội thoại ở hai trình duyệt, gửi tin. Không realtime ⇒ xem `docker compose logs worker` |

### Khi có gì đó không chạy

| Triệu chứng | Nguyên nhân gần như chắc chắn |
| --- | --- |
| `redirect_uri_mismatch` | Thiếu URI của ĐÚNG lối vào trong console, hoặc lệch từng ký tự: `https://<site>/api/auth/social/<provider>/callback` (web) · `https://api-stg.xeprime.vn/auth/social/<provider>/callback` (app native) |
| Upload im lặng hỏng, Console báo CORS | Chưa đặt CORS policy trên bucket, hoặc thiếu `content-type` trong `AllowedHeaders` |
| Ảnh tải lên xong nhưng không hiện | `R2_PUBLIC_BASE_URL` sai, hoặc bucket công khai chưa bật r2.dev |
| Ảnh chat bị từ chối `VALIDATION_FAILED` | `R2_PUBLIC_BASE_URL` có dấu `/` thừa ở cuối |
| API không boot sau khi bật Firebase | `FIRESTORE_ENABLED=true` bắt buộc đủ 6 biến R2 — làm §1 trước |
| Ô địa chỉ không ra gợi ý, log API có `Autocomplete trả HTTP …` | IP của VPS không nằm trong whitelist IP của key, dán nhầm Key Tilemap vào `VIETMAP_API_KEY` (Map API trả `423`), hoặc hết giao dịch/hạn mức ngày của gói |
| Phí giao dự kiến không bao giờ hiện, log có `Route trả …` | Như trên, hoặc API Route chưa bật cho gói (trial tắt sẵn một số API) |
| Log có `Vietmap chạm trần … lượt/ngày` | Cầu dao `GEO_DAILY_CALL_BUDGET` đã chặn — lưu lượng thật thì nâng biến này, bất thường thì xem log truy cập `/places/*` |
