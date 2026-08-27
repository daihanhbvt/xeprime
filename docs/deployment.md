# Triển khai XePrime lên VPS

> Ngày viết: 27/08/2026 · Kiến trúc: **một VPS duy nhất** (CLAUDE.md §3 — "Deploy MVP: 1 VPS").
> Mọi file nhắc tới ở đây nằm trong `deploy/` và `docker-compose.prod.yml`.

---

## 1. Cấu hình VPS — mua cái gì

### 1.1 Con số thật của XePrime

| Thành phần | RAM lúc chạy | Ghi chú |
| --- | --- | --- |
| PostgreSQL 16 | ~600 MB – 1.2 GB | `shared_buffers=512MB` + cache |
| API (NestJS) | ~350 – 700 MB | 33 module, Prisma pool 10 kết nối |
| Web (Next.js `next start`) | ~300 – 600 MB | 56 page, SSR vỏ + AntD |
| Worker | ~120 – 250 MB | vòng lặp theo đồng hồ |
| Caddy | ~30 MB | |
| **Tổng lúc chạy** | **~1.5 – 2.7 GB** | |
| **Đỉnh lúc `next build`** | **+2.5 – 3.5 GB** | đây mới là con số quyết định cấu hình |

⇒ **6 GB RAM là mức thấp nhất còn thoải mái** cho một môi trường. 4 GB vẫn chạy được nhưng
`next build` chạm trần và phụ thuộc hoàn toàn vào swap.

| Máy | Đề xuất | Vì sao |
| --- | --- | --- |
| **Staging** | 4 vCPU / **6 GB** / 50 GB | Dư cho một stack. Lưu lượng bằng không, database bé |
| **Production** | 4 vCPU đời mới + NVMe / **8 GB** / ≥ 80 GB | 8 GB cho runtime 2,7 GB + đỉnh build 3,5 GB + đệm cho lưu lượng thật. Đĩa lớn hơn vì ảnh, dump 14 ngày và các lớp image chồng lên nhau |

> Nếu sau này chuyển việc build sang GitHub Actions rồi VPS chỉ `docker compose pull` (§8), đỉnh
> 3,5 GB biến mất và production 4–6 GB là đủ. Chừng nào còn build tại chỗ thì đừng xuống dưới 8 GB.

**Mua staging trước, production sau là thứ tự đúng** — quy trình deploy được shake-out trên máy
rẻ, và khi dựng production bạn đã gõ đúng các bước này một lần rồi.

### 1.2 Chốt cho gói STAGING (VPS SSD 3 — 4 vCPU E5 v4 / 6 GB / 50 GB)

| Mục trên trang đặt hàng | Chọn | Vì sao |
| --- | --- | --- |
| **Cấu hình** | ✅ Hợp lý — mua được | Dư cho staging. Với production thì xem bảng §1.1 và cảnh báo CPU ở §1.3 |
| **Chu kỳ thanh toán** | **6 hoặc 12 tháng** | 12 tháng chỉ rẻ hơn 6 tháng ~6% (314k so với 333k/tháng). 24–36 tháng khoá 7–10 triệu vốn cho một MVP chưa có người dùng — không đáng |
| **VM Template** | **Ubuntu 24.04 LTS** | `deploy/scripts/vps-bootstrap.sh` viết cho bản này |
| **Dịch vụ Backup** | **None** — giữ nguyên | Gói đã kèm "tự động 1 lần/tuần". Mua thêm không giải quyết vấn đề thật — xem §1.4 |
| **Đặt tên máy chủ** | `xeprime-staging` | tuỳ ý, nhưng đặt đúng vai để sau này không SSH nhầm máy |
| **Số điện thoại liên hệ** | nên điền | để hỗ trợ gọi được khi máy có sự cố |

### 1.3 Hai điều cần biết trước khi bấm mua

**CPU E5 v4 là Broadwell đời 2016.** Nó chạy được, nhưng hiệu năng ĐƠN LUỒNG thấp — đúng thứ mà
cả `next build` (10–20 phút thay vì 5) lẫn SSR đều phụ thuộc. **Nếu Vietnix có dòng NVMe hoặc
CPU Gold/EPYC ở tầm giá tương đương thì chọn dòng đó**, kể cả khi RAM nhỉnh ít hơn: với workload
PostgreSQL + SSR, đổi "6 GB trên E5 v4 + SSD" lấy "4–8 GB trên CPU đời mới + NVMe" là đổi chác
có lợi. Đáng hỏi sale một câu trước khi thanh toán.

**Băng thông quốc tế 30 Mbps outbound.** Khách trong nước đi đường 200 Mbps nên không ảnh hưởng.
Nhưng ảnh xe phải phục vụ từ **Cloudflare R2** (`R2_PUBLIC_BASE_URL`) chứ không phải từ VPS —
kiến trúc hiện tại đã đúng như vậy, và đẩy ảnh qua VPS là cách làm nghẽn đúng 30 Mbps đó.

### 1.4 Backup: vì sao vẫn chọn None

Backup của nhà cung cấp là ảnh chụp **cả máy ảo, mỗi 7 ngày**. Với một sản phẩm đang ghi đơn
thuê, phiếu thu chi và hợp đồng thì trường hợp xấu nhất là **mất 7 ngày dữ liệu**.

`deploy/scripts/backup-db.sh` chạy `pg_dump` **hằng đêm** và đẩy ra Cloudflare R2 — hạ tầng dự
án đã có, R2 không tính phí egress, vài GB gần như miễn phí. Nhanh hơn, rẻ hơn, và khôi phục
được *một bảng* thay vì phải dựng lại cả máy ảo.

### 1.5 Cần chuẩn bị TRƯỚC ngày deploy

`apps/api/src/config/env.schema.ts` **từ chối boot** nếu thiếu — nhưng danh sách bắt buộc khác
nhau giữa hai môi trường, do biến `APP_ENV` (§2.3):

| Thứ | Staging | Production | Ghi chú |
| --- | --- | --- | --- |
| Tên miền + quyền sửa DNS | ✅ | ✅ | nhà đăng ký tên miền |
| Tài khoản **eSMS.vn** + brandname | ⬜ | ✅ | staging để `OTP_MODE=mock`: mã in ra log và trả trong response |
| **SMTP** (Zoho / Google Workspace / Amazon SES) | ⬜ | ✅ | staging bỏ trống: email in ra log |
| **Cloudflare R2**: 2 bucket (public + private) | ⬜ | ✅ | staging bỏ trống: endpoint upload trả 503 |
| Google/Facebook OAuth client | ⬜ | ⬜ | thiếu thì nút social trả `SOCIAL_NOT_CONFIGURED`; mật khẩu và OTP vẫn chạy |
| Google Maps: **2 key RIÊNG** (server + embed) | ⬜ | ⬜ | thiếu thì phí giao dự kiến không hiện (ADR 0018) |
| Google Calendar API key | ⬜ | ⬜ | thiếu thì lịch không có lớp ngày lễ |

---

## 2. Kiến trúc triển khai

```
                Internet
                    │  :443
              ┌─────▼─────┐
              │   Caddy   │   TLS tự động (Let's Encrypt)
              └──┬─────┬──┘
     xeprime.vn  │     │  api.xeprime.vn
              ┌──▼──┐ ┌▼────┐   ┌────────┐
              │ web │ │ api │   │ worker │
              └─────┘ └──┬──┘   └───┬────┘
                         └─────┬────┘
                          ┌────▼─────┐
                          │ Postgres │  không publish cổng ra host
                          └──────────┘
```

- **Một image** `xeprime-app:latest` chạy cả bốn tiến trình — lý do ghi ở đầu `deploy/Dockerfile`.
- **Hai tên miền** thay vì `/api` trên cùng host: `redirect_uri` của OAuth (ADR 0019) phải ổn
  định từng ký tự. Cookie phiên vẫn dùng chung nhờ `SESSION_COOKIE_DOMAIN=.xeprime.vn` và
  `sameSite: lax` coi hai subdomain là cùng site (ADR 0002).
- **Web không gọi API phía server.** Toàn bộ màn hình fetch ở client, nên `NEXT_PUBLIC_API_URL`
  là URL CÔNG KHAI — và tiến trình `web` không cần thấy `api` qua mạng nội bộ.

### 2.1 Bản đồ tên miền và URL

Nguyên tắc: **tách theo MÔI TRƯỜNG bằng tên miền con, tách theo VAI bằng đường dẫn.**

| Tên miền | Phục vụ |
| --- | --- |
| `xeprime.vn` | Cả ba giao diện: chợ xe `/` · cổng gian hàng `/manage` · quản trị nền tảng `/manage/admin` |
| `www.xeprime.vn` | 301 về `xeprime.vn` (khối đã có sẵn dạng comment trong `deploy/Caddyfile`) |
| `api.xeprime.vn` | NestJS — cũng là nơi app native gọi tới |
| `cdn.xeprime.vn` | Bucket R2 công khai (`R2_PUBLIC_BASE_URL`) — ảnh xe/gian hàng |
| `stg.xeprime.vn` + `api-stg.xeprime.vn` | Staging — máy riêng, xem §2.3 |

**Vì sao ba giao diện dùng CHUNG một tên miền, không phải `manage.` và `admin.`:**

1. Chúng là **một app Next duy nhất**, phân vai bằng route group `(public)` / `(manage)` và
   tiền tố đường dẫn. Tách tên miền nghĩa là hoặc build ba lần, hoặc thêm một tầng rewrite
   theo hostname trong `proxy.ts` — một tầng ánh xạ URL nữa để sai.
2. `apps/web/src/constants/routes.ts` giữ toàn bộ đường dẫn ở dạng **tương đối**. Đứng ở
   `manage.xeprime.vn` thì `ROUTES.HOME` (`/`) trỏ về `manage.xeprime.vn/` chứ không phải chợ
   xe. Phải đổi hàng loạt link sang URL tuyệt đối.
3. ADR 0014: chủ xe, chủ gian hàng và khách thuê là **một con người mang nhiều vai**, và họ đi
   qua lại giữa `/account` (khu công khai) và `/manage` liên tục. Đặt hai khu trên hai tên miền
   là tự tạo cảm giác "hai hệ thống" cho thứ cố ý là một tài khoản.
4. Mỗi tên miền thêm vào là một origin phải khai trong `CORS_ORIGINS`, một chứng chỉ phải gia
   hạn, và một chỗ nữa để cookie phiên đi lệch.

**Lý do chính đáng DUY NHẤT để tách `admin.`** là giới hạn truy cập theo IP cho khu quản trị.
Nhưng việc đó làm được theo đường dẫn, không cần tên miền — thêm vào khối `{$WEB_DOMAIN}` của
`deploy/Caddyfile`:

```caddyfile
# THAY dòng `reverse_proxy web:3000` hiện có bằng cả khối này. Thiếu `handle` thứ hai thì
# mọi đường dẫn ngoài /manage/admin không còn handler nào và cả site trả 404.
@admin path /manage/admin*
handle @admin {
	# Chỉ IP văn phòng vào được khu quản trị nền tảng.
	@blocked not client_ip 1.2.3.4 5.6.7.0/24
	respond @blocked 403
	reverse_proxy web:3000
}
handle {
	reverse_proxy web:3000
}
```

> `client_ip` chứ không phải `remote_ip`: sau proxy Cloudflare, `remote_ip` là IP biên của
> Cloudflare — nghĩa là danh sách chặn khớp với tất cả mọi người hoặc không khớp với ai. Dùng
> `client_ip` thì còn phải khai `trusted_proxies` cho Caddy (khối `servers` trong global
> options); không có proxy nào phía trước thì hai matcher này cho cùng kết quả.
>
> Và đây chỉ là lớp phụ. Chặn thật vẫn là `@PlatformOnly()` + `@RequirePermissions` ở backend
> (CLAUDE.md §6) — ẩn một đường dẫn không bảo vệ được gì.

### 2.2 DNS đặt ở đâu: Mắt Bão hay Cloudflare

Tên miền `.vn` đăng ký ở Mắt Bão, nhưng **nên trỏ nameserver về Cloudflare** (miễn phí, giữ
nguyên nhà đăng ký). Lý do cụ thể chứ không phải chuộng công cụ:

- **`R2_PUBLIC_BASE_URL` gần như bắt buộc phải là custom domain**, và R2 chỉ gắn được custom
  domain khi zone nằm trên Cloudflare. Đường lùi duy nhất là URL `r2.dev` — Cloudflare nói rõ
  nó bị giới hạn tốc độ và **không dành cho production**. Ảnh xe là thứ nặng nhất của chợ xe,
  nên đây không phải chi tiết nhỏ.
- Cache asset tĩnh ở biên, đỡ đúng chỗ băng thông quốc tế của VPS chỉ có 30 Mbps outbound.

⚠️ **Bật proxy Cloudflare (mây cam) thì `TRUST_PROXY_HOPS` phải là `2`, không phải `1`.**
Chuỗi lúc đó là khách → biên Cloudflare → Caddy → API, nên `X-Forwarded-For` tới API có hai
chặng. Để `1` thì `req.ip` thành IP biên Cloudflare và rate limit lại gộp cả hệ thống làm một —
đúng cái bug mà biến này sinh ra để chặn.

Và như §3.1: **tắt proxy (mây xám) cho tới khi Caddy lấy được chứng chỉ**, rồi mới bật.

---
---

### 2.3 Hai môi trường: staging và production

**Mỗi môi trường một VPS riêng.** Không phải để sang: chỉ MỘT container Caddy bind được cổng
80/443, nên hai stack độc lập trên cùng một máy thì stack thứ hai không lên nổi — muốn chung
máy phải dựng một Caddy duy nhất fronting cả hai qua network `external`. Hai máy rẻ hơn thời
gian bỏ ra cho việc đó, và staging sập cũng không kéo theo production.

| | Production | Staging |
| --- | --- | --- |
| Web | `xeprime.vn` | `stg.xeprime.vn` |
| API | `api.xeprime.vn` | `api-stg.xeprime.vn` |
| Ảnh (R2) | `cdn.xeprime.vn` | URL `r2.dev` của bucket staging là đủ |
| File cấu hình | `.env.production` | `.env.staging` |
| Project Docker | `xeprime-production` | `xeprime-staging` |
| `APP_ENV` | `production` | **`staging`** |
| Lệnh deploy | `./deploy/scripts/deploy.sh` | `./deploy/scripts/deploy.sh --env staging` |

`--env` chọn đồng thời **ba** thứ và chúng phải khớp nhau: file `.env.<tên>`, tên project (quyết
định tên volume), và biến `XP_ENV_FILE` mà `env_file:` trong compose đọc. Lệch một trong ba là
stack tách đôi trong im lặng — volume mới, database rỗng, không ai báo lỗi.

> `api-stg` chứ không phải `api.stg`: xem §2.2 — Universal SSL chỉ phủ một cấp subdomain.

#### `APP_ENV` — thứ tách "môi trường" khỏi "kiểu build"

`NODE_ENV=production` ở **cả hai** máy (nếu không Next trộn bản React dev vào bundle). `APP_ENV`
mới là thứ quyết định luật nào được áp:

| Nhóm luật | Production | Staging |
| --- | --- | --- |
| **Bảo mật** — https · cookie Secure · secret không còn giá trị mẫu · CORS toàn https | bắt buộc | **bắt buộc y hệt** |
| **Năng lực** — eSMS · SMTP · đủ bộ R2 | bắt buộc | được miễn |

Staging không được miễn bảo mật vì nó cũng nằm trên Internet công khai và cũng phát cookie phiên
thật. Được miễn năng lực vì thiếu chúng app chỉ suy giảm có kiểm soát: mã OTP vào log, email đặt
lại mật khẩu vào log, endpoint upload trả 503 — đủ để test toàn bộ luồng nghiệp vụ.

> ⚠️ **Đánh đổi đã biết của `APP_ENV=staging`:** response của endpoint gửi OTP kèm `devCode`, tức
> ai gọi được endpoint đó cũng lấy được mã của SĐT bất kỳ và xác thực được SĐT đó. Không có nó thì
> mỗi lần test một luồng đặt xe phải đi đọc `docker compose logs api`. Vì vậy: **đừng đưa dữ liệu
> khách hàng thật lên staging.** Mặc định của `APP_ENV` là `production` nên production không thể
> rơi vào trạng thái này do quên khai biến.

Máy nào không phải production sẽ **tự khai ra log lúc boot** những gì đang chạy suy giảm — dòng đó
là thứ phát hiện việc chép nhầm file env sang máy production ngay từ giây khởi động đầu tiên.

#### Ba giá trị BẮT BUỘC phải khác nhau

| Biến | Production | Staging | Hỏng thế nào nếu để giống |
| --- | --- | --- | --- |
| `SESSION_COOKIE_NAME` | `xp_session` | **`xp_session_stg`** | `SESSION_COOKIE_DOMAIN=.xeprime.vn` gửi cookie tới MỌI subdomain. Cùng tên ⇒ đăng nhập staging **ghi đè phiên production** của chính bạn, và token staging đi kèm mọi request tới production |
| `R2_BUCKET` / `R2_PRIVATE_BUCKET` | bucket thật | bucket riêng | Ảnh test và tài liệu test nằm lẫn trong kho của khách hàng thật |
| `APP_ENV` | `production` | **`staging`** | Để `production` trên máy staging ⇒ API từ chối boot vì thiếu eSMS/SMTP/R2. Để `staging` trên máy production ⇒ mã OTP của khách bị trả thẳng trong response |

`SESSION_COOKIE_NAME` được đọc lúc **chạy** ở cả hai phía (API phát cookie, `proxy.ts` chặn
`/manage/*`), nên đổi nó chỉ cần `deploy.sh` khởi động lại container — không phải build lại.
Compose truyền nó vào service `web` qua `environment:`; đó là biến runtime DUY NHẤT mà web nhận.

#### Dựng staging

Y hệt §3, chỉ khác ba chỗ:

```bash
cp deploy/env.production.example .env.staging   # tên file là .env.staging
nano .env.staging                               # sửa: APP_ENV, tên miền, cookie name
./deploy/scripts/deploy.sh --env staging
```

Trong `.env.staging`, các giá trị suy từ tên miền phải đổi theo — nếu không API từ chối boot vì
`redirect_uri` và `CORS_ORIGINS` không khớp origin thật:

```dotenv
APP_ENV=staging
WEB_DOMAIN=stg.xeprime.vn
API_DOMAIN=api-stg.xeprime.vn
CORS_ORIGINS="https://stg.xeprime.vn"
API_PUBLIC_URL="https://api-stg.xeprime.vn"
APP_WEB_URL="https://stg.xeprime.vn"
NEXT_PUBLIC_API_URL="https://api-stg.xeprime.vn"
SESSION_COOKIE_NAME=xp_session_stg
```

> Google/Facebook OAuth cần khai **thêm** redirect URI của staging trong console của provider
> (`https://api-stg.xeprime.vn/auth/social/google/callback`) — chúng là danh sách, không phải
> một giá trị.

---

## 3. Triển khai lần đầu

### 3.1 DNS — làm trước, chờ lan truyền

Bản đồ tên miền và lý do chọn nó ở §2.1; đây là phần bấm nút.

| Bản ghi | Trỏ về | Ghi chú |
| --- | --- | --- |
| `A  xeprime.vn` | IP VPS | chợ xe + `/manage` + `/manage/admin` |
| `A  api.xeprime.vn` | IP VPS | |
| `A  www.xeprime.vn` | IP VPS | tuỳ chọn — nhớ bỏ comment khối `www` trong `deploy/Caddyfile` |
| `CNAME  cdn.xeprime.vn` | bucket R2 công khai | tạo từ giao diện R2, không tự gõ tay (§2.2) |
| `A  stg.xeprime.vn` | IP VPS **staging** | máy khác, IP khác |
| `A  api-stg.xeprime.vn` | IP VPS **staging** | |

> Dùng Cloudflare thì **tắt proxy (mây xám)** cho tới khi Caddy lấy được chứng chỉ — mây cam
> chặn xác minh HTTP-01 và Caddy sẽ thử lại vô ích.

### 3.2 Chuẩn bị máy

```bash
ssh root@<ip-vps>
apt-get update && apt-get install -y git
git clone https://github.com/daihanhbvt/xeprime.git /opt/xeprime
cd /opt/xeprime
bash deploy/scripts/vps-bootstrap.sh      # swap 4GB · Docker · ufw · user xeprime
chown -R xeprime:xeprime /opt/xeprime
```

Rồi đăng nhập lại bằng user thường: `ssh xeprime@<ip-vps>`.

### 3.3 Cấu hình

```bash
cd /opt/xeprime
cp deploy/env.production.example .env.production
chmod 600 .env.production
nano .env.production          # điền hết; chú thích trong file nói rõ cái nào bắt buộc
```

Sinh ba bí mật:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_JWT_SECRET
openssl rand -base64 32                                                          # OTP_PEPPER
openssl rand -base64 32                                                          # POSTGRES_PASSWORD
```

> `POSTGRES_PASSWORD` xuất hiện **hai lần** và phải khớp: ở chính nó và bên trong `DATABASE_URL`.
> Lệch nhau thì container `db` lên bình thường còn API báo lỗi xác thực — triệu chứng không hề
> chỉ về nguyên nhân.

### 3.4 Deploy

```bash
./deploy/scripts/deploy.sh
```

Lần đầu mất **10–25 phút** (cài dependency + `next build` trên CPU E5 v4). Các lần sau nhanh
hơn nhiều nhờ cache layer.

### 3.5 Seed dữ liệu nền — chạy đúng MỘT lần

`SEED_MODE=system` nạp quyền, role hệ thống, danh mục thu/chi, gói dịch vụ, banner. Không dựng
gian hàng demo.

```bash
# Đổi `production` thành `staging` ở CẢ HAI chỗ khi chạy trên máy staging.
XP_ENV_FILE=.env.production docker compose -p xeprime-production \
  -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e SEED_MODE=system -w /app/prisma migrate \
  node_modules/.bin/tsx ./src/seed.ts
```

> ❌ **Không bao giờ chạy `SEED_MODE=demo` trên production** — nó tạo 19 tài khoản và 5 gian hàng
> giả ngay trong database thật. `prisma/src/seed/context.ts` đã chặn sẵn (`NODE_ENV=production`
> + `SEED_MODE=demo` ⇒ từ chối chạy), nhưng đừng đi tìm cách vòng qua nó.

Tài khoản quản trị đầu tiên: đăng ký qua giao diện rồi gán `platform_admin` bằng SQL
(`docker compose ... exec db psql -U xeprime -d xeprime`).

### 3.6 Kiểm tra

```bash
curl -fsS https://api.xeprime.vn/health        # {"status":"ok","info":{"database":{"status":"up"}}}
curl -fsS -o /dev/null -w '%{http_code}\n' https://xeprime.vn
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

Kiểm bằng mắt: mở `https://xeprime.vn`, đăng nhập, và xác nhận **console trình duyệt không có
lỗi CORS** (có lỗi ⇒ `CORS_ORIGINS` chưa khớp origin thật).

---

## 4. Deploy các lần sau

```bash
cd /opt/xeprime && ./deploy/scripts/deploy.sh                  # máy production
cd /opt/xeprime && ./deploy/scripts/deploy.sh --env staging    # máy staging
```

Thứ tự trong script là cố định và **không được đổi**:

```
sao lưu → build → migrate → khởi động lại app
```

Migrate chạy **trước** khi container app mới lên: migration thêm cột mà code cũ chưa biết thì vô
hại; code mới đọc một cột chưa tồn tại thì gãy ngay từ request đầu tiên.

**Đổi bất kỳ biến `NEXT_PUBLIC_*` nào thì PHẢI build lại** — Next nhúng cứng chúng vào bundle
lúc build, `restart` không thay đổi gì trên trình duyệt. `SESSION_COOKIE_NAME` thì ngược lại:
nó là biến runtime, `deploy.sh` khởi động lại container là đủ.

---

## 5. Vận hành hằng ngày

`-p` không phải trang trí: thiếu nó, compose rơi về `name:` trong file (`xeprime-production`)
— nên trên máy staging mọi lệnh dưới đây sẽ trỏ vào một project KHÔNG tồn tại và trả về rỗng
thay vì báo lỗi.

```bash
# Máy staging: đổi cả `production` lẫn `.env.production` thành `staging` / `.env.staging`.
C='docker compose -p xeprime-production -f docker-compose.prod.yml --env-file .env.production'

$C ps                        # trạng thái + health
$C logs -f --tail 100 api
$C logs -f --tail 100 web
$C restart api
$C exec db psql -U xeprime -d xeprime
docker stats --no-stream     # RAM/CPU thật của từng container
```

---

## 6. Sao lưu tự động

Cron 03:00 giờ VN hằng ngày, đặt bằng user `xeprime` (không phải root):

```bash
crontab -e
```

```cron
# Máy production:
0 3 * * * cd /opt/xeprime && ./deploy/scripts/backup-db.sh >> /home/xeprime/xeprime-backup.log 2>&1
# Máy staging (nếu muốn giữ dữ liệu test):
# 0 3 * * * cd /opt/xeprime && ./deploy/scripts/backup-db.sh --env staging >> /home/xeprime/xeprime-backup.log 2>&1
```

Đẩy bản sao ra R2 — bản sao nằm cùng ổ đĩa với dữ liệu gốc thì không phải bản sao lưu:

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config     # loại "s3" → provider Cloudflare → endpoint R2 → đặt tên remote là `r2`
# rồi trong .env.production:  BACKUP_RCLONE_REMOTE=r2:xeprime-backup
```

**Diễn tập khôi phục một lần ngay sau khi dựng xong.** Một bản sao lưu chưa từng được khôi phục
thử thì chưa phải bản sao lưu:

```bash
# Tên file mang nhãn môi trường; script cảnh báo nếu nhãn không khớp `--env`.
./deploy/scripts/restore-db.sh ~/xeprime-backups/xeprime-production-<stamp>.dump
```

---

## 7. Sự cố thường gặp

| Triệu chứng | Nguyên nhân gần như chắc chắn |
| --- | --- |
| API không boot, log liệt kê tên biến env | `env.schema.ts` chặn ở production — mỗi dòng nó in ra là một biến thiếu hoặc sai |
| `next build` bị giết giữa chừng (exit 137) | Hết RAM. Kiểm `swapon --show`; chạy lại `vps-bootstrap.sh` nếu chưa có swap |
| Caddy không lấy được chứng chỉ | DNS chưa trỏ đúng, Cloudflare còn bật proxy (mây cam), hoặc cổng 80 bị chặn |
| Trình duyệt báo lỗi CORS | `CORS_ORIGINS` thiếu đúng origin đang mở — kể cả `https://www.` |
| Đăng nhập xong vẫn bị đá về trang login (vòng lặp) | `SESSION_COOKIE_DOMAIN` thiếu dấu chấm đầu, hoặc container `web` không nhận được `SESSION_COOKIE_NAME` nên `proxy.ts` tìm tên mặc định trong khi API phát tên khác |
| Rate limit chặn nhầm cả hệ thống | `TRUST_PROXY_HOPS` chưa đặt = 1 ⇒ mọi request mang cùng một IP |
| Google/Facebook trả `redirect_uri_mismatch` | `API_PUBLIC_URL` không trùng TỪNG KÝ TỰ với giá trị khai trong console provider |
| Đĩa đầy dần | Log container (đã giới hạn ở `vps-bootstrap.sh`) hoặc image cũ — `docker image prune -a` |
| `docker compose ps` trả về rỗng dù stack đang chạy | Thiếu `-p xeprime-<môi trường>` — compose đang nhìn vào một project khác (§5) |
| Đăng nhập staging xong thì production đăng xuất | `SESSION_COOKIE_NAME` giống nhau giữa hai môi trường (§2.3) |
| Deploy xong nhưng database trống trơn | `--env` lệch với `.env.<tên>` ⇒ project khác ⇒ volume khác. Kiểm `docker volume ls` |

---

## 8. Chưa làm — nợ có chủ đích

Ghi ra để không ai tưởng là đã có:

- **Không có CDN trước Caddy.** Asset `_next/static` phục vụ thẳng từ VPS. Khi lưu lượng lớn,
  đặt Cloudflare phía trước (bật proxy SAU khi đã có chứng chỉ).
- **Không có zero-downtime deploy.** `deploy.sh` gián đoạn ~10–30 giây lúc đổi container. Chấp
  nhận được ở MVP; muốn bỏ thì cần hai bản api chạy song song + Caddy load balance.
- **Không có giám sát ngoài `/health`.** Nên cắm uptime monitor miễn phí (UptimeRobot, Better
  Stack) vào `https://api.xeprime.vn/health` và `https://xeprime.vn`.
- **Build chạy trên chính VPS.** Đơn giản, không cần registry; đổi lại là ~15 phút CPU cao mỗi
  lần deploy. Khi thấy phiền: build ở GitHub Actions → đẩy image lên GHCR → VPS chỉ
  `docker compose pull && up -d`.
- **Redis chưa dùng** — giữ sau profile `worker-queue` trong `docker-compose.prod.yml`.
