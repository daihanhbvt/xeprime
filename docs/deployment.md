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

> **Việc build ĐÃ chuyển sang GitHub Actions** (§9): VPS chỉ `docker compose pull`, nên đỉnh
> 3,5 GB không còn xuất hiện trong vận hành thường ngày và production 4–6 GB là đủ. Con số 8 GB
> ở trên chỉ còn cần cho đường build TẠI CHỖ — thứ vẫn phải dùng được khi GitHub không truy cập
> được. Mua dư 8 GB là mua lại đúng khả năng đó.

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

`deploy/scripts/backup-db.sh` chạy `pg_dump` **hằng đêm**, và máy tại công ty kéo bản sao về
**hằng tuần** qua SFTP chỉ-đọc (§6). Nhanh hơn, và khôi phục được *một bảng* thay vì phải dựng
lại cả máy ảo.

⚠️ Nhưng nhớ con số: `pg_dump` hằng đêm nghĩa là **RPO 24 giờ** — sự cố lúc 22h làm mất 19 giờ
đơn thuê, phiếu thu chi và hợp đồng. Đó là đánh đổi đã chấp nhận khi chưa làm PITR (§8), không
phải chuyện bị bỏ sót.

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
git checkout staging                      # `main` trên máy production
bash deploy/scripts/vps-bootstrap.sh      # swap 4GB · Docker · ufw · user xeprime
chown -R xeprime:xeprime /opt/xeprime
```

Rồi đăng nhập lại bằng user thường: `ssh xeprime@<ip-vps>`.

**Khoá SSH riêng cho GitHub Actions** — tách khỏi khoá cá nhân để thu hồi được độc lập:

```bash
# TRÊN MÁY BẠN, không phải trên VPS:
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/xeprime_deploy -N ""
ssh-keyscan -H <ip-vps>                   # → Secret VPS_KNOWN_HOSTS
cat ~/.ssh/xeprime_deploy                 # → Secret VPS_SSH_KEY (cả dòng BEGIN/END)
cat ~/.ssh/xeprime_deploy.pub             # → thêm vào /home/xeprime/.ssh/authorized_keys
```

> `vps-bootstrap.sh` chép `authorized_keys` của root sang user `xeprime`, nên khoá bạn dùng để
> đăng nhập root đã dùng được luôn cho `xeprime`. Khoá deploy ở trên là khoá **thứ hai**, riêng
> cho máy móc — mất nó thì thu hồi một dòng, không phải đổi cả khoá cá nhân.

Swap 4GB vẫn cần dù build đã chuyển sang Actions: Postgres + ba tiến trình Node trên máy 6GB mà
không có swap là một lần OOM killer bắn nhầm.

### 3.3 Cấu hình

**Đường chính: khai ở GitHub, không nano trên VPS.** Workflow sinh `.env.<môi trường>` mỗi lần
deploy và `scp` lên máy — danh sách Variables/Secrets đầy đủ ở §9.2. Sinh ba bí mật:

```bash
openssl rand -hex 32                                                             # POSTGRES_PASSWORD
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_JWT_SECRET
openssl rand -base64 32                                                          # OTP_PEPPER
```

> `-hex` chứ không `-base64` cho `POSTGRES_PASSWORD`: mật khẩu này đi vào phần userinfo của
> `DATABASE_URL`, mà `base64` sinh ra `/` và `+` — những ký tự phải URL-encode. Workflow có
> encode, nhưng một mật khẩu không cần encode thì không có gì để encode sai.
>
> `DATABASE_URL` **không khai** — workflow tự ghép từ `POSTGRES_*`. Khai riêng nghĩa là mật khẩu
> nằm hai chỗ, và khi chúng lệch nhau thì container `db` lên bình thường còn API báo lỗi xác
> thực — triệu chứng không hề chỉ về nguyên nhân.

<details>
<summary>Đường dựng TAY (khi chưa có CI, hoặc GitHub không truy cập được)</summary>

```bash
cd /opt/xeprime
cp deploy/env.production.example .env.production
chmod 600 .env.production
nano .env.production          # điền hết; chú thích trong file nói rõ cái nào bắt buộc
```

Ở đường này `POSTGRES_PASSWORD` xuất hiện **hai lần** và phải khớp: ở chính nó và bên trong
`DATABASE_URL`.

</details>

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
# Đổi `production` → `staging` ở MỌI chỗ khi chạy trên máy staging.
cd /opt/xeprime
export XP_ENV_FILE=.env.production

# BẮT BUỘC khi image đến từ GHCR (đường CD, §9). Thiếu nó thì compose rơi về
# `xeprime-app:latest` — cái tag chỉ tồn tại khi build TẠI CHỖ — và báo
# "pull access denied for xeprime-app". Lấy thẳng tag đang chạy để không gõ sai sha:
export XP_IMAGE="$(docker compose -p xeprime-production -f docker-compose.prod.yml \
  --env-file .env.production ps --format '{{.Image}}' api | head -1)"

# `read -rs` không hiện mật khẩu ra màn hình và không để nó lại trong lịch sử shell.
read -rsp 'Mật khẩu platform admin: ' PLATFORM_ADMIN_PASSWORD; echo

docker compose -p xeprime-production -f docker-compose.prod.yml --profile tools \
  --env-file .env.production run --rm \
  -e SEED_MODE=system -e PLATFORM_ADMIN_PASSWORD="$PLATFORM_ADMIN_PASSWORD" \
  -w /app/prisma migrate node_modules/.bin/tsx ./src/seed.ts

unset PLATFORM_ADMIN_PASSWORD
```

> `PLATFORM_ADMIN_PASSWORD` là **bắt buộc** khi `NODE_ENV=production` (tức là ở cả hai môi
> trường): `prisma/src/seed/context.ts` từ chối tạo tài khoản quản trị bằng mật khẩu mẫu. Seed
> dựng `admin@xeprime.vn` với mật khẩu bạn nhập — đổi email bằng `PLATFORM_ADMIN_EMAIL`.
>
> `--profile tools` cũng bắt buộc: `migrate` nằm sau profile đó trong compose.

#### Dữ liệu DEMO — chỉ trên staging

`SEED_MODE=demo` dựng 5 gian hàng khác quy mô, 19 tài khoản, 54 xe, 107 đơn và 273 phiếu thu chi
— đủ để test toàn bộ luồng nghiệp vụ mà không phải bấm tay.

Chốt an toàn chia làm HAI tầng, và biết ranh giới đó là biết vì sao lệnh dưới đây chạy được ở
staging mà không chạy được ở production:

| Tầng | Đọc biến | Áp cho | Chặn gì |
| --- | --- | --- | --- |
| **Dữ liệu** | `APP_ENV` | chỉ production | `SEED_MODE=demo` — nơi duy nhất có dữ liệu khách hàng thật để làm hỏng |
| **Bảo mật** | `NODE_ENV` | staging **và** production | mật khẩu mẫu: `PLATFORM_ADMIN_PASSWORD` và `DEMO_PASSWORD` phải khai thật |

`APP_ENV` mặc định là `production`, nên **quên khai biến vẫn an toàn** — chốt chặt lại chứ không
lỏng ra. Cùng cách chia mà `apps/api/src/config/env.schema.ts` đã dùng.

```bash
# CHỈ chạy trên máy STAGING. Trên production lệnh này bị từ chối, và đó là chủ đích.
cd /opt/xeprime
export XP_ENV_FILE=.env.staging
export XP_IMAGE="$(docker compose -p xeprime-staging -f docker-compose.prod.yml \
  --env-file .env.staging ps --format '{{.Image}}' api | head -1)"

read -rsp 'Mật khẩu platform admin: ' PW_ADMIN; echo
read -rsp 'Mật khẩu chung cho tài khoản demo: ' PW_DEMO; echo

docker compose -p xeprime-staging -f docker-compose.prod.yml --profile tools \
  --env-file .env.staging run --rm \
  -e SEED_MODE=demo -e PLATFORM_ADMIN_PASSWORD="$PW_ADMIN" -e DEMO_PASSWORD="$PW_DEMO" \
  -w /app/prisma migrate node_modules/.bin/tsx ./src/seed.ts

unset PW_ADMIN PW_DEMO
```

> `DEMO_PASSWORD` bắt buộc vì mật khẩu mẫu nằm **công khai trong repo**: 19 tài khoản demo dùng
> nó trên một máy có mặt trên Internet là 19 lối vào. Seed idempotent trên toàn bộ 63 bảng nên
> chạy lại nhiều lần không nhân đôi dữ liệu.
>
> ⚠️ **Đừng đưa dữ liệu khách hàng thật lên staging** — `APP_ENV=staging` khiến endpoint gửi OTP
> trả kèm `devCode` (§2.3).

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

**Đường chính là GitHub Actions — không SSH.** Merge vào `staging` hoặc `main` là deploy tự
động; xem §9. Hai lệnh dưới đây là đường THỦ CÔNG, dùng khi CI không dùng được (mất mạng
GitHub, hoặc đang gỡ lỗi ngay trên máy):

```bash
cd /opt/xeprime && ./deploy/scripts/deploy.sh                  # máy production — BUILD tại chỗ
cd /opt/xeprime && ./deploy/scripts/deploy.sh --env staging    # máy staging  — BUILD tại chỗ
```

> Build tại chỗ ngốn ~3,5GB RAM và 10–20 phút trên E5 v4. Đường CI (§9) truyền thêm
> `--image <ref>` và VPS chỉ `docker compose pull` — khoảng 1–2 phút.

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

Kiến trúc đầy đủ, quy trình khôi phục và cách xử lý sự cố: **`docs/backup-and-restore.md`**.
Đây chỉ là phần cài đặt.

```
   VPS                                       Máy tại công ty (Windows)
   systemd timer, 03:00 VN hằng ngày         Task Scheduler, CN 04:00 hằng tuần
   pg_dump → xác minh → .sha256              sftp PULL (chỉ đọc) → so SHA-256
   giữ 14 ngày                               giữ 12 tuần
   thất bại → Telegram                       bản mới nhất > 8 ngày → Telegram
```

**Máy công ty PULL, VPS không PUSH.** VPS là thứ dễ bị chiếm nhất trong hệ thống. Nếu nó cầm
khoá ghi được vào mạng công ty thì kẻ chiếm nó xoá luôn bản sao lưu — đúng kịch bản ransomware.
Chiều pull thì VPS không cầm bí mật nào của phía bên kia.

### 6.1 Trên VPS

```bash
cd /opt/xeprime
sudo ./deploy/scripts/install-backup-timer.sh                 # production
sudo ./deploy/scripts/install-backup-timer.sh --env staging   # nếu muốn giữ dữ liệu test

# Chạy thử ngay một lượt, đừng chờ tới 03:00
sudo systemctl start xeprime-backup@production
journalctl -u xeprime-backup@production -n 50 --no-pager
```

systemd timer chứ không phải một dòng crontab, vì bốn thứ cron không cho sẵn: `Persistent=true`
(chạy bù khi máy tắt qua giờ hẹn — cron im lặng bỏ qua), `OnFailure=` (gọi thẳng unit cảnh báo),
`RuntimeMaxSec=` (trần thời gian ở cấp hệ thống), và `journalctl` (log có sẵn, có xoay vòng).

Cảnh báo qua Telegram: khai `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (Secrets của Environment,
§9). Bỏ trống thì `notify.sh` im lặng bỏ qua.

### 6.2 Lối kéo về cho máy tại công ty

```bash
sudo ./deploy/scripts/setup-backup-user.sh --pubkey "ssh-ed25519 AAAA... xeprime-backup-pull"
```

Tạo user `xpbackup`, dựng `/var/backups` đúng quyền, và khoá phiên SSH của user đó lại thành
**SFTP chỉ đọc ở cấp máy chủ** (`ForceCommand internal-sftp -R` + `ChrootDirectory`). Khoá của
máy công ty rò rỉ thì kẻ cầm nó cũng chỉ tải được đúng thư mục dump — không mở được shell,
không xoá được gì, không dùng VPS làm bàn đạp.

Phía Windows: **`tools/backup-pull/README.md`**.

### 6.3 Hai thứ phải làm ngay, không để sau

1. **Kiểm khoá pull KHÔNG mở được shell.** Nếu `ssh -i <khoá> xpbackup@<ip> "whoami"` chạy
   được thì cả mô hình chống ransomware ở trên vô nghĩa. Cách kiểm: `tools/backup-pull/README.md` §3.
2. **Diễn tập khôi phục.** Một bản sao lưu chưa từng được khôi phục thử thì chưa phải bản sao lưu:

   ```bash
   # Tên file mang nhãn môi trường; script cảnh báo nếu nhãn không khớp `--env`.
   ./deploy/scripts/restore-db.sh --env staging \
     /var/backups/xeprime/staging/daily/xeprime-staging-<stamp>.dump
   ```

   **Bấm giờ lần đó** và ghi con số vào `docs/backup-and-restore.md`. Khi sự cố thật xảy ra,
   câu hỏi đầu tiên phải trả lời được là "bao lâu thì xong" — và lúc đó không phải lúc đi đo.

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
| Job deploy đỏ ở bước "Thiếu giá trị bắt buộc" | Chưa khai Variable/Secret đó ở Environment tương ứng (§9.2) |
| Deploy xanh nhưng web hiện dữ liệu của môi trường kia | Image bị dùng chéo. `NEXT_PUBLIC_API_URL` nhúng cứng lúc build, nên tag `staging-*` **không** chạy được ở production (§9.3) |
| `./deploy/scripts/deploy.sh: Permission denied` | Bit thực thi chưa có trong index git. `git update-index --chmod=+x deploy/scripts/*.sh` rồi commit |

---

## 8. Chưa làm — nợ có chủ đích

Ghi ra để không ai tưởng là đã có:

- **RPO 24 giờ.** `pg_dump` hằng đêm nghĩa là sự cố lúc 22h làm mất 19 giờ ghi. Chưa làm PITR
  (WAL archiving) vì nó thêm một thành phần phải vận hành cho một sản phẩm chưa có lượng đơn
  đủ lớn. Khi 19 giờ trở thành không chấp nhận được: `pgBackRest` archive WAL vào chính
  `/var/backups`, máy công ty vẫn pull như cũ — kiến trúc hiện tại không cản đường nó.
- **Bản sao ngoài VPS nằm trên một máy trạm.** Máy đó vừa dùng hằng ngày vừa giữ bản sao. Nên
  chuyển sang NAS, hoặc thêm một ổ ngoài quay vòng cất ngoài phòng máy.
- **R2 không được sao lưu.** `pg_dump` chỉ phủ PostgreSQL; ảnh xe và giấy tờ nằm ở R2. Bật
  Object Versioning cho hai bucket đó.
- **Không có CDN trước Caddy.** Asset `_next/static` phục vụ thẳng từ VPS. Khi lưu lượng lớn,
  đặt Cloudflare phía trước (bật proxy SAU khi đã có chứng chỉ).
- **Không có zero-downtime deploy.** `deploy.sh` gián đoạn ~10–30 giây lúc đổi container. Chấp
  nhận được ở MVP; muốn bỏ thì cần hai bản api chạy song song + Caddy load balance.
- **Không có giám sát ngoài `/health`.** Nên cắm uptime monitor miễn phí (UptimeRobot, Better
  Stack) vào `https://api.xeprime.vn/health` và `https://xeprime.vn`.
- **Redis chưa dùng** — giữ sau profile `worker-queue` trong `docker-compose.prod.yml`.
- **`apps/mobile` chưa có trong CI.** Đã có code nhưng chưa có job lint/typecheck/test, và chưa
  có `eas.json`. App native **không** deploy lên VPS (§9.5) — đây là việc riêng.

---

## 9. CD — deploy bằng GitHub Actions

`.github/workflows/deploy.yml`. **Một file cho cả hai môi trường**, không phải hai file chép
nhau: hai bản chép nhau sẽ trôi lệch, và chỗ trôi lệch đầu tiên luôn là bước nguy hiểm nhất —
migrate.

### 9.1 Ba đường vào

| Cách | Xảy ra gì |
| --- | --- |
| Merge `develop` → **`staging`** | verify → build → push GHCR → deploy staging. Tự động, không phê duyệt |
| Merge `staging` → **`main`** | y hệt, nhưng dừng ở cổng **Required reviewers** trước khi chạm production |
| **Run workflow** (thủ công) | Chọn `environment` + `ref` bất kỳ. Deploy một nhánh/tag/SHA cụ thể |
| **Run workflow** + `image_tag` | **ROLLBACK.** Bỏ qua verify + build, chỉ bảo VPS pull tag đó — ~2 phút |

Luồng: `resolve` → `verify` (dùng lại `ci.yml` nguyên vẹn) → `deploy` (build + push + ssh).

`verify` cố ý **nằm ngoài** Environment để test chạy xong rồi mới tới lượt người duyệt nhìn.
Build và deploy nằm **chung một job** vì cả hai đều cần Environment, mà GitHub hỏi phê duyệt
một lần cho mỗi job — tách đôi là bắt người duyệt bấm hai lần cho một lần deploy.

`concurrency.cancel-in-progress: false` — ngược với `ci.yml`, và cố ý: một deploy bị cắt ngang
có thể dừng đúng giữa `prisma migrate deploy`.

### 9.2 Environments — Variables vs Secrets

**Settings → Environments** → tạo `staging` và `production`.

| | `staging` | `production` |
| --- | --- | --- |
| Deployment branches | chỉ `staging` | chỉ `main` |
| Required reviewers | **tắt** — staging phải tự động | **bật** |

Nguyên tắc phân loại: **Secret** = giá trị mà lộ ra là phải đi xoay lại. **Variable** = giá trị
công khai theo bản chất, hoặc suy được từ tên miền. Variable đọc được trong log và trong
Settings; Secret bị che và không đọc lại được sau khi lưu.

**Variables** (giá trị cột giữa là của staging):

| Biến | staging | Ghi chú |
| --- | --- | --- |
| `WEB_DOMAIN` · `API_DOMAIN` | `stg.xeprime.vn` · `api-stg.xeprime.vn` | |
| `ACME_EMAIL` | email của bạn | nhận cảnh báo chứng chỉ |
| `POSTGRES_USER` · `POSTGRES_DB` | `xeprime` · `xeprime` | |
| `APP_ENV` | **`staging`** | §2.3 — `NODE_ENV` KHÔNG khai, workflow luôn ghi `production` |
| `API_PORT` | `4000` | |
| `CORS_ORIGINS` | `https://stg.xeprime.vn` | |
| `TRUST_PROXY_HOPS` | `1` | `2` nếu bật proxy Cloudflare (§2.2) |
| `API_PUBLIC_URL` · `APP_WEB_URL` | `https://api-stg.xeprime.vn` · `https://stg.xeprime.vn` | |
| `SESSION_TTL_DAYS` | `7` | |
| `SESSION_COOKIE_NAME` | **`xp_session_stg`** | BẮT BUỘC khác production — §2.3 |
| `SESSION_COOKIE_SECURE` · `SESSION_COOKIE_DOMAIN` | `true` · `.xeprime.vn` | giữ dấu chấm đầu |
| `MOBILE_ACCESS_TTL_MINUTES` · `MOBILE_REFRESH_TTL_DAYS` | `15` · `60` | |
| `MOBILE_JWT_AUDIENCE` · `MOBILE_AUTH_REDIRECT_URIS` | `xeprime-mobile` · `xeprime://auth/callback` | |
| `OTP_MODE` | `mock` | mã in ra log và trả trong response |
| `PLAN_FEATURE_ENFORCEMENT` | `warn` | trục năng lực theo gói (ADR 0027). Xem §9.4 trước khi đổi sang `on` |
| `OTP_TTL_MINUTES` · `OTP_RESEND_COOLDOWN_SECONDS` · `OTP_MAX_SENDS_PER_HOUR` · `OTP_MAX_ATTEMPTS` | `5` · `60` · `5` · `5` | |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` | `smtp.resend.com` · `587` · `resend` | staging gửi thư THẬT (quyết định 04/09/2026) — `third-party-keys.md` §7.2. Để trống thì email rơi về in ra log |
| `SMTP_FROM` | `XePrime STG <no-reply@stg.xeprime.vn>` | tên miền **con**, không phải `xeprime.vn` — uy tín gửi thư tính theo tên miền, test hỏng không được kéo thư của khách vào Junk |
| `SEPAY_BANK_CODE` · `SEPAY_ACCOUNT_NUMBER` · `SEPAY_ACCOUNT_NAME` | trống | in vào mã VietQR ⇒ công khai theo bản chất. Đi cùng `SEPAY_API_KEY` (Secret) — bốn cái khai cùng nhau hoặc cùng để trống, khai lẻ thì API từ chối boot |
| `FIRESTORE_ENABLED` | `false` | |
| `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` | trống | là ĐỊNH DANH, không phải bí mật |
| `GOOGLE_OAUTH_CLIENT_ID` · `FACEBOOK_APP_ID` | trống hoặc thật | client id đi trong URL authorize ⇒ công khai theo thiết kế |
| `R2_ACCOUNT_ID` · `R2_ENDPOINT` · `R2_BUCKET` · `R2_PRIVATE_BUCKET` · `R2_PUBLIC_BASE_URL` | bucket RIÊNG cho staging | URL `r2.dev` là đủ |
| `GOOGLE_HOLIDAY_CALENDAR_ID` | `vi.vietnamese#holiday@group.v.calendar.google.com` | |
| `BACKUP_KEEP_DAYS` | `14` | |
| `NEXT_PUBLIC_API_URL` | `https://api-stg.xeprime.vn` | |
| `NEXT_PUBLIC_APP_NAME` | `XePrime STG` | nhãn khác giúp không nhầm tab |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` · `NEXT_PUBLIC_FIREBASE_*` (4) | | nằm lộ thiên trong bundle JS ⇒ **không bao giờ** là Secret |
| `VPS_USER` · `VPS_PATH` · `VPS_SSH_PORT` | `xeprime` · `/opt/xeprime` · `22` | |

**Secrets:**

| Secret | Sinh bằng |
| --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` |
| `SESSION_JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — schema từ chối giá trị mẫu |
| `OTP_PEPPER` | `openssl rand -base64 32` |
| `GOOGLE_OAUTH_CLIENT_SECRET` · `FACEBOOK_APP_SECRET` | console provider; trống ⇒ nút social trả `SOCIAL_NOT_CONFIGURED` |
| `ESMS_API_KEY` · `ESMS_SECRET_KEY` · `ESMS_BRANDNAME` | trống ở staging |
| `SMTP_PASS` | API key SMTP — **key riêng cho staging**, không dùng chung với production (thu hồi một bên không kéo bên kia) |
| `SEPAY_API_KEY` | khoá **webhook** trong bảng điều khiển SePay (≥16 ký tự). Trống ⇒ `/sepay/webhook` trả 503 `SEPAY_NOT_CONFIGURED` — fail closed, không giả vờ đã nhận tiền |
| `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` | trống ⇒ endpoint upload trả 503, phần còn lại vẫn chạy |
| `FIREBASE_PRIVATE_KEY` | một dòng, xuống dòng viết `\n` |
| `GOOGLE_MAPS_SERVER_KEY` · `GOOGLE_HOLIDAY_API_KEY` | key **server** ⇒ Secret, khác hẳn key embed ở bảng trên |
| `VPS_HOST` | IP VPS — Secret cho đỡ bị quét, không phải vì nó bí mật thật |
| `VPS_SSH_KEY` | private key cặp khoá deploy (§3.2) |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -H <ip>` |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | cảnh báo backup (§6) |

**KHÔNG khai `DATABASE_URL`.** Workflow tự ghép từ `POSTGRES_*` và URL-encode mật khẩu. §3.3 nói
rõ vì sao: mật khẩu nằm hai chỗ thì sớm muộn lệch nhau, và triệu chứng không hề chỉ về nguyên
nhân. `openssl rand -hex` ở bảng trên (thay cho `-base64`) cũng vì lý do đó — `base64` sinh ra
`/` và `+`, những ký tự phải encode trong phần userinfo của URL.

Ngoài ra khai **thêm một bản `NEXT_PUBLIC_*` ở cấp repository** (Settings → Secrets and
variables → Actions → Variables). Job `build` của `ci.yml` chạy trên PR, nơi không có
Environment nào — cùng giá trị thì layer cache khớp với lần build thật và tiết kiệm gần trọn
thời gian build web. Variables của Environment đè lên Variables của repository.

### 9.3 Image mang nhãn môi trường — không dùng chéo

`ghcr.io/daihanhbvt/xeprime:staging-<sha>` và `:production-<sha>`.

**Không phải để cho gọn.** Next **nhúng cứng `NEXT_PUBLIC_API_URL` vào bundle lúc build**, nên
image build cho staging trỏ vĩnh viễn vào `api-stg`. Đem nó chạy production là cả site gọi sang
staging — mà nhìn bên ngoài thì mọi thứ vẫn "chạy".

Hệ quả khi rollback: chỉ chọn tag mang đúng tiền tố môi trường đang deploy.

### 9.4 File env trên VPS được SINH TỰ ĐỘNG

Mỗi lần deploy, workflow dựng `.env.<môi trường>` từ Variables + Secrets rồi `scp` lên, `chmod
600`. **Sửa tay trên VPS sẽ bị ghi đè ở lần deploy kế tiếp** — đổi giá trị thì đổi ở GitHub.

`deploy/env.production.example` vẫn là tài liệu tham chiếu cho từng biến, và là đường dựng tay
khi cần chạy stack ngay trên máy.

Workflow cũng `git checkout --detach <sha>` trên VPS thay vì `git pull`: compose và Caddyfile
trên máy khớp **chính xác** commit đã sinh ra image.

### 9.4b Bật cổng chặn năng lực theo gói (`PLAN_FEATURE_ENFORCEMENT`)

Biến này quyết định `PlanFeatureGuard` (ADR 0027) chặn thật hay chỉ ghi log. Ba giá trị:

| Giá trị | Hành vi |
| --- | --- |
| `off` | bỏ qua hoàn toàn — lối thoát hiểm, không cần revert code |
| `warn` | **mặc định**: ghi log `plan-feature: sẽ bị chặn khi …` kèm `{tenantId, feature, state, method, path}`, nhưng **cho qua** |
| `on` | chặn thật: `hidden` → 403 `FEATURE_NOT_IN_PLAN`, `read_only` + ghi → 403 `FEATURE_READ_ONLY` |

**Bật `on` là một lần deploy RIÊNG, không kèm bất kỳ thay đổi nào khác.** Lý do rất cụ thể: nếu
nó đi chung với một đợt sửa dữ liệu (seed cờ, backfill gói) thì khi sổ sách của gian hàng thật bị
khoá, không ai biết nên revert cái gì — còn tách riêng thì rollback là đổi lại một biến.

Điều kiện tiên quyết, **cả hai** phải đạt:

1. **Log cảnh báo đã im** qua ít nhất một chu kỳ kinh doanh. Còn hit nghĩa là hoặc gói thiếu cờ,
   hoặc vị từ backfill `used_features` siết quá tay — sửa dữ liệu, deploy lại, ngâm lại.
2. **Truy vấn kiểm chứng trả về 0** (chạy trên chính database của môi trường đó):

   ```sql
   WITH cur AS (
     SELECT t.id, t.used_features,
            COALESCE(p.limits_json->'features', '[]'::jsonb) AS pf, p.code
     FROM tenants t
     LEFT JOIN LATERAL (
       SELECT pl.* FROM tenant_subscriptions ts JOIN plans pl ON pl.id = ts.plan_id
       WHERE ts.tenant_id = t.id AND ts.status = 'active'
         AND ts.starts_at <= now() AND ts.ends_at > now()
       ORDER BY ts.ends_at DESC LIMIT 1) p ON true
     WHERE t.deleted_at IS NULL)
   SELECT count(*) FROM cur
   WHERE code IS NULL
      OR EXISTS (SELECT 1 FROM unnest(used_features) f WHERE NOT (pf ? f));
   ```

   Khác 0 nghĩa là có gian hàng **không có gói hiện hành** (mất sạch tính năng nâng cao, kể cả
   quyền đọc) hoặc **đang dùng một cờ mà gói của họ không có**. Hai nguồn kiểm chứng này bổ sung
   nhau: truy vấn thấy trạng thái đã ghi, log thấy cả những đường dùng mà backfill đoán sai.

Rollback: đổi `PLAN_FEATURE_ENFORCEMENT` về `warn` ở GitHub Environment rồi chạy lại workflow —
không revert commit nào.

### 9.5 App native KHÔNG deploy lên VPS

`apps/mobile` là Expo / React Native, và nó **cố ý bị loại khỏi image Docker**: `deploy/Dockerfile`
lọc `--filter @xeprime/{api,web,worker,prisma}...` rồi `rm -rf apps/mobile` (~1 GB Expo/RN),
`.dockerignore` cũng gạt `apps/mobile/{android,ios,.expo}`.

App không phải thứ "deploy" — nó là file `.apk`/`.ipa` build qua **EAS Build** rồi phát hành qua
TestFlight / Google Play. Nó chỉ *gọi* tới VPS. Để app dùng được staging cần đúng ba việc, và cả
ba nằm ngoài phạm vi tài liệu này:

1. `EXPO_PUBLIC_API_URL=https://api-stg.xeprime.vn` — biến duy nhất app cần.
2. Thêm `https://api-stg.xeprime.vn/auth/social/google/callback` vào danh sách redirect URI
   trong console Google/Facebook — chúng là *danh sách*, không phải một giá trị.
3. Muốn build tự động thì tạo `eas.json` (hiện chưa có) + một workflow riêng.
