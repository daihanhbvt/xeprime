<title>Staging CD + Backup Production</title>

# Staging lên VPS + CD chủ động + Kiến trúc sao lưu production

## Context

Bạn vừa mua VPS Vietnix **VPS SSD 3** (4 vCPU E5 v4 · 6 GB · 50 GB · Ubuntu 24.04) — đúng cấu
hình `docs/deployment.md` §1.2 đã chốt cho staging. Hạ tầng deploy đã hoàn chỉnh (`deploy/`,
`docker-compose.prod.yml`, `APP_ENV` gating, đã có trong cả `develop` lẫn `main` qua PR #26).

Ba việc còn thiếu:

1. **Nhánh `staging`** để tách ba môi trường dev → stg → prod.
2. **CD chủ động**: merge là deploy tự động, nhưng cũng bấm nút deploy/rollback bất kỳ môi
   trường nào từ tab Actions.
3. **Sao lưu đúng chuẩn production**: hiện tại `pg_dump` hằng đêm ghi ra chính đĩa VPS, không
   lock, không cảnh báo, và bản sao duy nhất nằm cùng ổ đĩa với bản gốc.

### Trạng thái git đã xác minh

`main` = `ea85c74` (Merge PR #28 from develop) · `develop` = `e4c2b4d`. `git diff --stat main
develop` **rỗng** — nội dung hai nhánh giống hệt nhau, `main` chỉ hơn 2 commit merge. Commit
`70ac9e5` (VPS deploy stack) nằm trong cả hai. `staging` tách được ngay từ `develop`.

---

# PHẦN A — Staging + CD

## A1. Thứ tự thực hiện

| # | Việc | Ai | Ở đâu |
| --- | --- | --- | --- |
| 1 | Nhánh `chore/repo-cd-pipeline`: sửa compose + `deploy.sh` + workflow | Claude | repo |
| 2 | Merge → `develop` → `main` | bạn | GitHub |
| 3 | Tạo `staging` từ `develop`, push | Claude (hỏi trước) | repo |
| 4 | DNS + dựng VPS lần đầu | bạn | Vietnix / Cloudflare |
| 5 | Khai Variables + Secrets ở Environment `staging` | bạn | GitHub |
| 6 | Seed `SEED_MODE=system` một lần | bạn | VPS |

Bước 4–5 **phải xong trước** khi push `staging`, nếu không job deploy đỏ ngay lần đầu.

## A2. Sửa code — 4 file

### `docker-compose.prod.yml` — lấy image từ registry

Bốn service đang hard-code `image: xeprime-app:latest`. Thêm một biến để cùng file phục vụ cả
hai lối — build tại chỗ và pull từ GHCR:

```yaml
x-app-image: &app_image ${XP_IMAGE:-xeprime-app:latest}
```

rồi `image: *app_image` cho `migrate`/`api`/`web`/`worker`. Giữ nguyên khối `build:` trên `api`
— không đặt `XP_IMAGE` thì mọi thứ chạy y như hôm nay, không hồi quy.

### `deploy/scripts/deploy.sh` — thêm `--image <ref>`

- Có `--image` → `export XP_IMAGE`, **bỏ bước build**, thay bằng `pull migrate api web worker`.
- Không có → giữ nguyên đường build tại chỗ.
- Thứ tự **không đổi**: sao lưu → pull → `up -d db` → `run --rm migrate` → `up -d api web worker
  caddy` → chờ health.

### `.github/workflows/ci.yml` — thêm gate `build`, biến thành reusable

Giữ nguyên job `api` (kể cả `REQUIRE_DB=1`) và `web` (kể cả `i18n:check`) — đó là phần giá trị
nhất của file. Ba thay đổi:

1. `on.push.branches: [main, develop, staging]` + thêm `on.workflow_call:`.
2. Job **`build`** mới: `docker/build-push-action` với `push: false`, `cache-to/from: type=gha`.
   Đây chính là thứ chạy `nest build` + `next build` + `tsc` worker — bắt lỗi build trên PR thay
   vì để nó nổ giữa lúc deploy.
3. Job `build` đọc `NEXT_PUBLIC_*` từ **repository Variables** để layer cache dùng lại được cho
   lần build đẩy lên GHCR.

> ⚠️ `NEXT_PUBLIC_API_URL` **nhúng cứng vào bundle lúc build** ⇒ image là *của một môi trường*.
> Không thể lấy image staging chạy production. Tag phải mang nhãn: `:staging-<sha>`.

### `.github/workflows/deploy.yml` — MỚI, một file cho mọi môi trường

```
on:
  push:               staging → deploy staging;  main → deploy production
  workflow_dispatch:  inputs:
      environment  (choice: staging | production)
      ref          (nhánh/tag/sha — mặc định nhánh hiện tại)
      image_tag    (bỏ trống = build mới; điền = ROLLBACK về image có sẵn, ~2 phút)

concurrency: deploy-${{ environment }}   cancel-in-progress: FALSE
             ← không huỷ giữa chừng: một deploy bị cắt ngang có thể dừng ở giữa migrate

job resolve  → xác định environment + ref + có build hay không
job verify   → uses: ./.github/workflows/ci.yml      (bỏ qua khi rollback bằng image_tag)
job image    → needs: verify — buildx build --push
               tags: ghcr.io/daihanhbvt/xeprime:<env>-${{ sha }} và :<env>
job deploy   → needs: image
               environment: ${{ inputs.environment }}   ← protection rules có hiệu lực ở đây
               1. render .env.<env> trên runner (heredoc, không echo)
               2. ssh: git fetch && git checkout --detach <sha>
               3. scp .env.<env> → /opt/xeprime/, chmod 600
               4. ssh: docker login ghcr.io bằng secrets.GITHUB_TOKEN
                  → ./deploy/scripts/deploy.sh --env <env> --no-pull --image <tag>
                  → docker logout
               5. curl -fsS https://<api-domain>/health   ← đỏ thì job đỏ
```

**Vì sao một file thay vì hai:** hai file chép nhau sẽ trôi lệch, và chỗ trôi lệch đầu tiên
luôn là chỗ nguy hiểm nhất — bước migrate. Production ở đây chỉ khác staging đúng ba thứ:
Environment name, secret set, và một cổng phê duyệt.

Ba chi tiết dễ sai:

- **`DATABASE_URL` không khai làm secret** — workflow tự ghép từ `POSTGRES_*`. `deployment.md`
  §3.3 cảnh báo đúng bẫy này: mật khẩu nằm hai chỗ sớm muộn lệch nhau, và triệu chứng (API báo
  lỗi xác thực trong khi container `db` khoẻ) không hề chỉ về nguyên nhân.
- **Đăng nhập GHCR bằng `secrets.GITHUB_TOKEN`** — hết hạn khi job kết thúc, không có PAT dài
  hạn nằm trên VPS.
- **`checkout --detach <sha>`** thay `git pull --ff-only` (vì vậy mới cần `--no-pull`): VPS
  không cần nằm trên nhánh nào, và compose/Caddyfile luôn khớp đúng commit đã sinh ra image.

## A3. GitHub Environments

**Settings → Environments.** Tạo `staging` và `production`.

| | `staging` | `production` |
| --- | --- | --- |
| Deployment branches | chỉ `staging` | chỉ `main` |
| Required reviewers | **tắt** — staging phải tự động | **bật** (bạn) |
| Wait timer | 0 | 0 |
| Admins bypass | tắt | tắt |

### Variables (35) — giá trị staging

| Biến | Giá trị |
| --- | --- |
| `WEB_DOMAIN` · `API_DOMAIN` | `stg.xeprime.vn` · `api-stg.xeprime.vn` |
| `ACME_EMAIL` | email nhận cảnh báo chứng chỉ |
| `POSTGRES_USER` · `POSTGRES_DB` | `xeprime` · `xeprime` |
| `NODE_ENV` | `production` ← **không phải** `staging`; nếu không Next trộn React dev vào bundle |
| `APP_ENV` | `staging` |
| `API_PORT` | `4000` |
| `CORS_ORIGINS` | `https://stg.xeprime.vn` |
| `TRUST_PROXY_HOPS` | `1` — đổi `2` nếu bật proxy Cloudflare (mây cam) |
| `API_PUBLIC_URL` · `APP_WEB_URL` | `https://api-stg.xeprime.vn` · `https://stg.xeprime.vn` |
| `SESSION_TTL_DAYS` | `7` |
| `SESSION_COOKIE_NAME` | **`xp_session_stg`** — bắt buộc khác production (A4) |
| `SESSION_COOKIE_SECURE` · `SESSION_COOKIE_DOMAIN` | `true` · `.xeprime.vn` (giữ dấu chấm đầu) |
| `MOBILE_ACCESS_TTL_MINUTES` · `MOBILE_REFRESH_TTL_DAYS` | `15` · `60` |
| `MOBILE_JWT_AUDIENCE` · `MOBILE_AUTH_REDIRECT_URIS` | `xeprime-mobile` · `xeprime://auth/callback` |
| `OTP_MODE` | `mock` — mã in ra log và trả trong response |
| `OTP_TTL_MINUTES` / `OTP_RESEND_COOLDOWN_SECONDS` / `OTP_MAX_SENDS_PER_HOUR` / `OTP_MAX_ATTEMPTS` | `5` / `60` / `5` / `5` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` | trống ở staging (email in ra log) |
| `SMTP_FROM` | `XePrime STG <no-reply@xeprime.vn>` |
| `FIRESTORE_ENABLED` | `false` |
| `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` | trống — là định danh, không phải bí mật |
| `GOOGLE_OAUTH_CLIENT_ID` · `FACEBOOK_APP_ID` | client id đi trong URL authorize ⇒ công khai theo thiết kế |
| `R2_ACCOUNT_ID` / `R2_ENDPOINT` / `R2_BUCKET` / `R2_PRIVATE_BUCKET` / `R2_PUBLIC_BASE_URL` | bucket **riêng** cho staging; URL `r2.dev` là đủ |
| `GOOGLE_HOLIDAY_CALENDAR_ID` | `vi.vietnamese#holiday@group.v.calendar.google.com` |
| `BACKUP_KEEP_DAYS` | `14` |
| `NEXT_PUBLIC_API_URL` | `https://api-stg.xeprime.vn` |
| `NEXT_PUBLIC_APP_NAME` | `XePrime STG` — nhãn khác giúp không nhầm tab |
| `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` · `NEXT_PUBLIC_FIREBASE_*` (4) | nằm lộ thiên trong bundle JS ⇒ **không bao giờ** là Secret |
| `VPS_USER` · `VPS_PATH` · `VPS_SSH_PORT` | `xeprime` · `/opt/xeprime` · `22` |

> Khai **thêm một bản `NEXT_PUBLIC_*` ở cấp repository** (Settings → Secrets and variables →
> Actions → Variables). Job `build` trên PR không có Environment nên nó đọc bản repo; nhờ vậy
> layer cache khớp với lần build đẩy GHCR. Variables của Environment đè lên Variables của repo.

### Secrets (14)

| Secret | Sinh bằng |
| --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `SESSION_JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` — schema từ chối giá trị mẫu `change-me` |
| `OTP_PEPPER` | `openssl rand -base64 32` |
| `GOOGLE_OAUTH_CLIENT_SECRET` · `FACEBOOK_APP_SECRET` | console provider — trống thì nút social trả `SOCIAL_NOT_CONFIGURED` |
| `ESMS_API_KEY` · `ESMS_SECRET_KEY` · `ESMS_BRANDNAME` | **trống ở staging** (`OTP_MODE=mock`) |
| `SMTP_PASS` | trống ở staging |
| `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` | trống ⇒ endpoint upload trả 503, phần còn lại vẫn chạy |
| `FIREBASE_PRIVATE_KEY` | dán một dòng, xuống dòng viết `\n` |
| `GOOGLE_MAPS_SERVER_KEY` · `GOOGLE_HOLIDAY_API_KEY` | key **server** ⇒ Secret, khác hẳn key embed ở trên |
| `VPS_HOST` | IP VPS — Secret cho đỡ bị quét, không phải vì nó bí mật thật |
| `VPS_SSH_KEY` | private key cặp khoá deploy (A5) |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -H <ip>` — thiếu thì phải `StrictHostKeyChecking=no`, tức chấp nhận MITM |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | cho cảnh báo backup (Phần B) |

**KHÔNG khai** `DATABASE_URL` (workflow tự ghép) và `BACKUP_RCLONE_REMOTE` (bỏ hẳn — Phần B).

## A4. Ba giá trị BẮT BUỘC khác production

| Biến | Hỏng thế nào nếu để giống |
| --- | --- |
| `SESSION_COOKIE_NAME` | `SESSION_COOKIE_DOMAIN=.xeprime.vn` gửi cookie tới MỌI subdomain ⇒ đăng nhập staging **ghi đè phiên production** của chính bạn |
| `R2_BUCKET` / `R2_PRIVATE_BUCKET` | Ảnh test và giấy tờ test nằm lẫn trong kho khách hàng thật |
| `APP_ENV` | `staging` trên máy production ⇒ mã OTP của khách trả thẳng trong response |

> ⚠️ `APP_ENV=staging` khiến endpoint gửi OTP trả kèm `devCode`. **Đừng đưa dữ liệu khách hàng
> thật lên staging.**

## A5. Dựng VPS lần đầu

**DNS:** `A stg.xeprime.vn` và `A api-stg.xeprime.vn` → IP VPS. Dùng Cloudflare thì để **mây
xám** cho tới khi Caddy lấy được chứng chỉ (mây cam chặn xác minh HTTP-01); bật lên rồi thì đổi
`TRUST_PROXY_HOPS=2`.

**Máy** — theo hướng dẫn SSH Vietnix, đăng nhập `root@<ip>`:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/daihanhbvt/xeprime.git /opt/xeprime
cd /opt/xeprime && git checkout staging
bash deploy/scripts/vps-bootstrap.sh      # swap 4GB · Docker · ufw 22/80/443 · user xeprime
chown -R xeprime:xeprime /opt/xeprime
```

**Khoá SSH riêng cho Actions** — tách khỏi khoá cá nhân để thu hồi độc lập:

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/xeprime_deploy -N ""
# public  → /home/xeprime/.ssh/authorized_keys trên VPS
# private → secret VPS_SSH_KEY (dán cả dòng BEGIN/END)
ssh-keyscan -H <ip-vps>          # → secret VPS_KNOWN_HOSTS
```

**Seed một lần** sau khi workflow xanh:

```bash
ssh xeprime@<ip> 'cd /opt/xeprime && XP_ENV_FILE=.env.staging \
  docker compose -p xeprime-staging -f docker-compose.prod.yml --env-file .env.staging \
  run --rm -e SEED_MODE=system -w /app/prisma migrate node_modules/.bin/tsx ./src/seed.ts'
```

## A6. Quy tắc nhánh

```
feature/*  →  develop  →  staging  →  main
   PR           PR/merge    merge      merge (có phê duyệt)
```

`staging` và `main` **không nhận commit trực tiếp**, chỉ merge. Mỗi lần merge là một lần deploy.
Cập nhật `docs/git-workflow.md` — file đó hiện chưa nhắc gì tới nhánh release.

---

# PHẦN B — Sao lưu PostgreSQL production

## B1. Database đang nằm ở đâu (trả lời câu hỏi 5)

| Môi trường | Nơi lưu |
| --- | --- |
| Dev (máy bạn) | `docker-compose.yml` service `db` → named volume `xeprime_pgdata`, publish `5432` ra host |
| VPS | `docker-compose.prod.yml` service `db` → named volume `pgdata`, compose thêm tiền tố project ⇒ **`/var/lib/docker/volumes/xeprime-<env>_pgdata/_data`**. **Không** publish cổng ra host, chỉ sống trong network `internal` |

Không có bind mount, không có block storage riêng — dữ liệu nằm trên chính đĩa 50 GB của VPS.

**Ngoài PostgreSQL còn hai kho dữ liệu khác:**

- **Cloudflare R2** — ảnh xe, giấy tờ (bucket public + private). **Không nằm trong phạm vi
  backup này.** Xoá nhầm bucket là mất ảnh; nên bật Object Versioning ở R2 — ghi ra đây để
  không ai tưởng `pg_dump` đã phủ.
- **Firestore** — projection chat ~30–50 tin gần nhất. PostgreSQL vẫn là source of truth
  (ADR 0009), nên dump Postgres đã phủ đủ; mất Firestore chỉ cần đẩy lại.

## B2. Review kiến trúc backup hiện tại

`deploy/scripts/backup-db.sh` đã làm đúng nhiều thứ. Đối chiếu với yêu cầu của bạn:

| Yêu cầu | Hiện trạng |
| --- | --- |
| pg_dump hằng ngày, giờ thấp điểm | ✅ cron 03:00 VN (mới ở tài liệu, chưa cài) |
| Nén | ✅ `-Fc` nén sẵn (zlib) |
| Thư mục riêng, giữ 14 ngày, tự xoá | ✅ `find -mtime +14 -delete` |
| Nhãn môi trường trong tên file | ✅ chặn khôi phục nhầm môi trường |
| Kiểm tra sau khi tạo | ⚠️ chỉ kiểm `> 1024 byte` — **không** kiểm dump đọc được không |
| Không làm đầy SSD | ❌ chỉ có retention, **không** kiểm dung lượng trước khi dump |
| Lock chống chạy trùng | ❌ `deploy.sh` cũng gọi script này — deploy lúc 03:00 = hai `pg_dump` cùng lúc trên máy 6 GB |
| Timeout / retry | ❌ |
| Cảnh báo khi thất bại / đĩa gần đầy | ❌ |
| Sao ra ngoài máy | ⚠️ có, nhưng qua **rclone → cloud object storage** — bạn đã loại |
| Máy công ty pull | ❌ chưa có gì |
| Checksum | ❌ |
| Test restore định kỳ | ⚠️ tài liệu nói "diễn tập một lần", không có quy trình lặp lại |

**Ba lỗi thứ tự đáng sửa** (rẻ, và mỗi cái bỏ hẳn một lớp rủi ro):

1. **Dọn retention TRƯỚC khi dump**, không phải sau. Hiện tại lúc ghi dump mới là lúc đĩa căng
   nhất. Đánh đổi: dump lỗi thì đã xoá mất bản thứ 14 — chấp nhận được khi còn 13 bản.
2. **`pg_restore --list` ngay sau khi dump.** Nó đọc TOC của file; file cụt hoặc hỏng sẽ lỗi ở
   đây. Rẻ (chỉ đọc header), và đúng là thứ bạn yêu cầu — "không chỉ kiểm tra file tồn tại".
3. **Gỡ hẳn khối rclone.** Giữ lại thì cảnh báo `⚠ BACKUP_RCLONE_REMOTE trống` kêu mỗi đêm mãi
   mãi, và đó là cách huấn luyện mọi người bỏ qua cảnh báo. Nó cũng mời người sau bật lại đúng
   con đường cloud đã bị loại.

## B3. Kiến trúc đề xuất

```
        VPS Vietnix (production)                    Máy công ty (Windows 11)
 ┌────────────────────────────────┐          ┌──────────────────────────────────┐
 │ systemd timer 03:00 VN hằng ngày│          │ Task Scheduler — CN 04:00 hằng tuần│
 │   flock (chống trùng deploy.sh) │          │   "chạy bù nếu lỡ giờ hẹn"        │
 │   kiểm df TRƯỚC                 │          │                                   │
 │   dọn retention TRƯỚC           │          │   sftp PULL ────────────────┐    │
 │   timeout 30m + nice            │  SSH     │   (chỉ-đọc, chroot)         │    │
 │   pg_dump -Fc  ─────────────────┼──────────┼───◄─────────────────────────┘    │
 │   sinh .sha256                  │  read    │   verify SHA-256                 │
 │   pg_restore --list  (xác minh) │  only    │   retention 12 tuần              │
 │   ghi backup-status.json        │          │   dead-man: bản mới nhất > 8 ngày │
 │   THẤT BẠI → Telegram           │          │   THẤT BẠI → Telegram            │
 └────────────────────────────────┘          └──────────────────────────────────┘
                                                    │ hằng tháng
                                                    ▼
                                       docker run postgres:16-alpine
                                       pg_restore thật + đếm bản ghi
```

### Bốn quyết định và lý do

**1. Máy công ty PULL, VPS không PUSH.** VPS là thứ dễ bị chiếm nhất trong hệ thống — nó nằm
trên Internet công khai. Nếu VPS giữ khoá ghi được vào mạng công ty thì kẻ chiếm VPS xoá luôn
bản sao lưu, đúng kịch bản ransomware. Chiều pull thì VPS **không cầm bí mật nào** của mạng
công ty, và công ty không phải mở cổng vào.

**2. Khoá pull bị giới hạn cứng ở phía VPS.** Không chỉ dựa vào "khoá này chỉ dùng để backup".
Tạo user riêng `xpbackup` và trong `/etc/ssh/sshd_config.d/xeprime-backup.conf`:

```
Match User xpbackup
    ChrootDirectory /var/backups
    ForceCommand internal-sftp -R -d /xeprime
    PermitTTY no
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    AllowAgentForwarding no
```

`internal-sftp -R` = **chỉ đọc ở cấp máy chủ**, không phải cấp thoả thuận. Khoá của máy công ty
rò rỉ thì kẻ cầm nó cũng chỉ tải được đúng thư mục dump, không mở được shell, không xoá được gì,
không dùng VPS làm bàn đạp vào mạng khác. `ChrootDirectory` yêu cầu `/var/backups` thuộc
`root:root` mode `0755`.

**3. VPS giữ 14 ngày độc lập, không chờ máy công ty xác nhận.** Bạn có hỏi về việc này. Nối
retention của VPS vào xác nhận của máy công ty đòi máy công ty phải **ghi ngược** vào VPS — và
đó chính là thứ quyết định 1 và 2 tồn tại để cấm. Con số đã đủ an toàn: NAS pull mỗi 7 ngày,
VPS giữ 14 ngày = **hai chu kỳ**. Lỡ một tuần vẫn còn nguyên bản để pull tuần sau; chỉ mất khi
máy công ty chết 14 ngày liên tiếp — mà lúc đó dead-man switch đã kêu hai lần.

**4. Cảnh báo phát từ HAI phía.** Cảnh báo phát từ VPS không bao giờ bắt được trường hợp VPS
chết hẳn. Nên máy công ty còn kiểm **tuổi của bản mới nhất**: quá 8 ngày là báo, bất kể VPS có
nói gì hay không. Đây là lớp duy nhất bắt được "cron chết lặng ba tuần rồi".

## B4. Cấu trúc thư mục

**Trên VPS** (`/var/backups` thay cho `$HOME/xeprime-backups`: đúng chuẩn FHS, gắn được đĩa
riêng sau này mà không đổi script, và chroot cần nó thuộc root):

```
/var/backups/                          root:root      0755   ← chroot cần đúng quyền này
└── xeprime/                           xeprime:xpbackup 0750
    └── production/
        ├── daily/
        │   ├── xeprime-production-20260901-030000.dump         0640
        │   └── xeprime-production-20260901-030000.dump.sha256
        ├── backup-status.json     ← lần chạy cuối: thời điểm, kích thước, kết quả
        └── backup.log
```

**Trên máy công ty** (ổ khác ổ hệ điều hành nếu có):

```
D:\XePrimeBackups\
├── production\
│   ├── 2026-W36\
│   │   ├── xeprime-production-20260901-030000.dump
│   │   ├── ...dump.sha256
│   │   └── .verified          ← ghi sau khi SHA-256 + pg_restore --list đều OK
│   └── ...                    ← giữ 12 tuần
├── pull.log
├── last-success.txt
└── config.json                ← host, khoá, token Telegram — KHÔNG nằm trong git
```

## B5. Script — 4 file mới, 2 file sửa

| File | Việc |
| --- | --- |
| `deploy/scripts/backup-db.sh` | **Sửa.** Thêm `flock`, kiểm `df`, dọn-trước-dump, `timeout`, `nice`, `.sha256`, `pg_restore --list`, ghi `backup-status.json`, gọi `notify.sh` khi đỏ. **Gỡ** khối rclone. |
| `deploy/scripts/notify.sh` | **Mới.** Gửi Telegram bằng `curl` (đã cài sẵn — không thêm service nào). Đọc `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` từ `.env.<env>`. Im lặng bỏ qua nếu chưa khai. |
| `deploy/systemd/xeprime-backup@.service` + `.timer` | **Mới.** Unit theo tham số môi trường (`xeprime-backup@production`). |
| `deploy/scripts/install-backup-timer.sh` | **Mới.** Cài unit, `daemon-reload`, `enable --now`. Idempotent. |
| `deploy/scripts/setup-backup-user.sh` | **Mới.** Tạo user `xpbackup`, dựng `/var/backups` đúng quyền, ghi khối `Match User` vào `sshd_config.d`, `sshd -t` rồi mới reload. |
| `deploy/scripts/restore-db.sh` | **Sửa.** Thêm xác minh SHA-256 trước khi restore. |
| `tools/backup-pull/Pull-XePrimeBackup.ps1` | **Mới.** Script pull chạy trên máy Windows. |
| `tools/backup-pull/Test-XePrimeRestore.ps1` | **Mới.** Test restore hằng tháng bằng Docker. |
| `tools/backup-pull/README.md` | **Mới.** Cách cài Task Scheduler + tạo khoá + config. |

### `backup-db.sh` — luồng sau khi sửa

```
flock -n /var/lock/xeprime-backup-<env>.lock   ← trùng thì THOÁT SẠCH (mã 0), không xếp hàng
  ↓                                              deploy.sh vừa dump rồi, cron không cần dump lại
kiểm df phân vùng đích
  < 2 GB trống          → DỪNG, báo đỏ (dump nửa vời tệ hơn không dump: chiếm chỗ mà trông như OK)
  < 5 GB hoặc < 2× dump gần nhất → cảnh báo, vẫn chạy
  ↓
dọn retention (14 ngày) TRƯỚC
  ↓
timeout 30m  docker compose exec -T db sh -c 'nice -n 10 pg_dump -U … -Fc -Z 6 …' > file.tmp
  ↓
kiểm kích thước > 1 KB
  ↓
pg_restore --list file.tmp > /dev/null     ← đọc TOC: file cụt/hỏng lộ ra ở ĐÂY, không phải lúc cần
  ↓
sha256sum → file.tmp.sha256
  ↓
mv file.tmp → file.dump   ← đổi tên là bước CUỐI: không bao giờ có file .dump nửa vời trong thư mục,
                             nên máy công ty pull lúc nào cũng an toàn, không cần khoá liên máy
  ↓
ghi backup-status.json
```

Bọc toàn bộ bằng `trap ... ERR` → `notify.sh` với dòng cuối của log.

**Vì sao `.tmp` rồi mới `mv`:** máy công ty có thể pull đúng lúc VPS đang dump. Đổi tên trong
cùng filesystem là thao tác nguyên tử, nên file mang đuôi `.dump` luôn là file đã hoàn chỉnh và
đã xác minh. Đây là thứ thay cho việc phải đồng bộ khoá giữa hai máy.

**Vì sao `nice` mà không `ionice`:** `nice` chạy được trong `postgres:16-alpine` (busybox có).
`ionice` cần `util-linux`, không có sẵn — cài thêm chỉ để giảm I/O của một job vài chục giây là
không đáng, và bạn đã yêu cầu không cài service thừa.

### `Pull-XePrimeBackup.ps1` — luồng

Viết cho **Windows PowerShell 5.1** (không `&&`, không toán tử ternary/`??`) dùng OpenSSH client
có sẵn trên Windows 11 — không cài thêm gì:

```
đọc config.json (host, port, user, đường dẫn khoá, thư mục đích, chat id)
  ↓
sftp -b <batch> : cd /xeprime/production/daily ; ls -1        ← liệt kê từ xa
  ↓
so với những gì đã có ở D:\XePrimeBackups\production\**
  → tải MỌI bản còn thiếu, không chỉ bản mới nhất
    (máy tắt hai tuần thì lần chạy sau tự bù — đúng yêu cầu retry của bạn)
  ↓
mỗi file: tải .dump + .dump.sha256
  Get-FileHash -Algorithm SHA256  → so khớp
  lệch  → xoá file vừa tải, ghi log, thử lại tối đa 3 lần
  ↓
đặt vào thư mục tuần ISO (2026-W36), ghi .verified
  ↓
dọn thư mục tuần cũ hơn 12 tuần
  ↓
kiểm dead-man: bản mới nhất > 8 ngày → Telegram
  ↓
ghi last-success.txt + pull.log; bất kỳ lỗi nào → Telegram
```

Task Scheduler: **Chủ Nhật 04:00**, bật **"Run task as soon as possible after a scheduled start
is missed"** — đây chính là cơ chế trả lời "máy công ty offline thì retry lần sau", và nó là
tính năng có sẵn chứ không phải thứ phải tự viết. Bật cả "Wake the computer to run this task"
nếu máy chỉ ngủ.

### `Test-XePrimeRestore.ps1` — test restore thật

Chạy **hằng tháng** trên máy công ty, không đụng VPS, không đụng staging. Nó xác minh đúng bản
mà công ty đang giữ — tức là bản sẽ dùng khi thảm hoạ:

```powershell
docker run -d --name xp-restore-test -e POSTGRES_PASSWORD=test postgres:16-alpine
Get-Content -Raw <dump> | docker exec -i xp-restore-test pg_restore -U postgres -d postgres --clean --if-exists --no-owner
docker exec xp-restore-test psql -U postgres -d postgres -c "select count(*) from bookings;"
docker rm -f xp-restore-test
```

Tiêu chí đạt: `pg_restore` không lỗi **và** số bản ghi ở vài bảng lõi (`bookings`, `vehicles`,
`payments`, `tenants`) khác 0 và hợp lý. Ghi kết quả vào `restore-test.log`. Đây mới là câu trả
lời cho "không chỉ kiểm tra file tồn tại" ở mức đầy đủ — `pg_restore --list` hằng ngày chỉ nói
file đọc được, còn cái này nói dữ liệu dựng lại được.

## B6. Cấu hình SSH an toàn cho máy công ty

```powershell
# Trên máy Windows — khoá RIÊNG, không dùng lại khoá deploy của Actions
ssh-keygen -t ed25519 -C "xeprime-backup-pull" -f $env:USERPROFILE\.ssh\xeprime_pull -N '""'
```

Trên VPS, thêm public key vào `/home/xpbackup/.ssh/authorized_keys` kèm giới hạn ở **cả cấp
khoá** (bổ sung cho `Match User` ở B3, hai lớp độc lập):

```
restrict ssh-ed25519 AAAA... xeprime-backup-pull
```

`restrict` (OpenSSH 7.4+) tắt sẵn port forwarding, agent forwarding, PTY, tunnel, `~/.ssh/rc`.
Trên Ubuntu 24.04 nó có sẵn.

Quyền file trên Windows — `ssh` từ chối khoá mà nhóm khác đọc được:

```powershell
icacls $env:USERPROFILE\.ssh\xeprime_pull /inheritance:r /grant:r "$env:USERNAME:(R)"
```

Đăng nhập bằng khoá này phải **không** mở được shell:

```powershell
ssh -i $env:USERPROFILE\.ssh\xeprime_pull xpbackup@<ip> "whoami"    # phải bị từ chối
sftp -i $env:USERPROFILE\.ssh\xeprime_pull xpbackup@<ip>            # phải vào được, chỉ đọc
```

Nếu lệnh đầu chạy được thì `ForceCommand` chưa có hiệu lực — dừng lại và sửa trước khi đi tiếp.

## B7. Ước tính tài nguyên

Ảnh và giấy tờ nằm ở R2, không trong database — nên DB của XePrime nhỏ hơn cảm giác nhiều.

| Thứ | Ước tính | Ghi chú |
| --- | --- | --- |
| DB thô sau năm đầu (~50 gian hàng, ~2.000 xe, ~50.000 đơn) | 1–3 GB | `audit_logs` và `notifications` là hai bảng lớn nhanh nhất |
| Dump `-Fc -Z6` | 150–400 MB | nén 5–10× vì phần lớn là text/số |
| 14 bản trên VPS | **~5,6 GB** | đĩa 50 GB trừ ~12 GB (OS + image Docker + volume DB) vẫn dư rộng |
| 12 tuần trên máy công ty | ~4,8 GB | |
| CPU lúc dump | 1 lõi, 30–90 giây | nén zlib là phần tốn nhất |
| RAM lúc dump | ~50 MB | `pg_dump` là streaming, không nạp cả DB vào bộ nhớ |
| I/O | đọc toàn bộ DB một lượt | trên SSD: vài chục giây |
| Băng thông pull tuần | ~400 MB | đường quốc tế VPS 30 Mbps ⇒ ~2 phút, chạy 04:00 |

**`pg_dump` KHÔNG khoá ghi** — nó chụp một snapshot nhất quán trong một transaction. Ảnh hưởng
thật là I/O, và ở kích thước này là vài chục giây. Điều đáng biết: transaction dài chặn `VACUUM`
dọn bản ghi mới hơn snapshot, nên dump chạy hàng giờ sẽ làm phình bảng — ở quy mô XePrime thì
không, nhưng đó là lý do đặt `timeout 30m` chứ không phải để vô hạn.

**Đo con số thật ngay sau lần backup đầu** rồi chỉnh `BACKUP_KEEP_DAYS` nếu cần:

```bash
docker compose -p xeprime-production -f docker-compose.prod.yml --env-file .env.production \
  exec -T db psql -U xeprime -d xeprime -c "select pg_size_pretty(pg_database_size('xeprime'));"
du -sh /var/backups/xeprime/production/daily
df -h /
```

## B8. Rủi ro và cách xử lý

| Rủi ro | Xử lý |
| --- | --- |
| **RPO 24 giờ** — sự cố 22h mất 19 giờ ghi: đơn thuê, phiếu thu chi, hợp đồng | **Đánh đổi đã chấp nhận** khi loại PITR. Ghi ra đây bằng con số để nó là quyết định chứ không phải bất ngờ. Khi lượng đơn/ngày đủ lớn để 19 giờ là không chấp nhận được thì mở lại: `pgBackRest` archive WAL vào chính `/var/backups`, máy công ty vẫn pull như cũ — kiến trúc này không cản đường nó |
| Dump "thành công" nhưng hỏng | `pg_restore --list` mỗi ngày + `.sha256` + test restore thật hằng tháng |
| Cron chết lặng, không ai biết | Dead-man switch ở máy công ty (tuổi bản mới nhất > 8 ngày) — cảnh báo từ VPS không bắt được VPS chết |
| VPS bị chiếm → xoá cả bản sao lưu | Máy công ty pull; VPS không cầm khoá ghi vào mạng công ty; khoá pull bị `ForceCommand internal-sftp -R` + `restrict` khoá cứng |
| Đĩa đầy → dump nửa vời | Kiểm `df` trước + dọn retention trước + từ chối khi < 2 GB |
| Deploy trùng cron → hai `pg_dump` | `flock -n`, gặp lock thì thoát sạch |
| Máy công ty pull đúng lúc đang dump | Ghi `.tmp` rồi `mv` nguyên tử — file `.dump` luôn hoàn chỉnh |
| Khôi phục nhầm môi trường | Nhãn env trong tên file + `restore-db.sh` cảnh báo (đã có) |
| **Máy nhận backup chính là máy dev** | Máy này hỏng hoặc bị mã hoá là mất bản sao công ty. Chấp nhận được lúc đầu, nhưng: để `D:\XePrimeBackups` ở **ổ khác ổ hệ điều hành**, và trong 1–2 tháng chuyển sang NAS hoặc thêm một ổ ngoài quay vòng. Ghi vào roadmap |
| Dump không mã hoá | Có chủ đích — nó nằm trong mạng công ty và mã hoá thêm một khoá nữa để mất. **Nhưng** nếu có ngày mang ổ ra khỏi văn phòng thì phải mã hoá (`age` hoặc 7-Zip AES-256) trước khi mang đi |
| R2 không được sao lưu | Bật Object Versioning ở R2. `pg_dump` không phủ ảnh xe (B1) |
| Bot Telegram lộ token | Token chỉ gửi được tin vào đúng chat id đã khai, không đọc được gì. Rủi ro thấp; vẫn để trong Secrets/config chứ không trong git |

## B9. Vì sao systemd timer chứ không cron

Bạn ưu tiên đơn giản, và cron là một dòng. Nhưng bốn thứ bạn *đã yêu cầu* thì systemd cho sẵn
còn cron phải tự viết:

| Yêu cầu | systemd | cron |
| --- | --- | --- |
| Chạy bù khi máy vừa khởi động lại và lỡ giờ hẹn | `Persistent=true` | im lặng bỏ qua |
| Cảnh báo khi thất bại | `OnFailure=xeprime-backup-alert@%i` | tự viết `trap` + tự chống trùng thông báo |
| Timeout cấp hệ thống | `RuntimeMaxSec=1800` | `timeout` chỉ phủ tiến trình con |
| Log có xoay vòng | `journalctl -u xeprime-backup@production` | tự quản một file log, tự logrotate |

Ubuntu 24.04 có sẵn systemd, không cài gì thêm. Đổi lại là 2 file unit thay vì 1 dòng crontab —
`install-backup-timer.sh` lo phần cài.

## B10. Tài liệu cần cập nhật

| File | Sửa gì |
| --- | --- |
| `docs/deployment.md` | §6 viết lại hoàn toàn (cron + rclone → systemd + pull). §8 gỡ "build chạy trên chính VPS" khỏi danh sách nợ. Thêm mục CD. |
| `docs/backup-and-restore.md` | **Mới** — quy trình khôi phục từng bước cho người trực, kể cả lúc hoảng: file ở đâu, lấy về thế nào, gõ lệnh gì, mất bao lâu |
| `docs/git-workflow.md` | Thêm `staging` + quy tắc chỉ-merge |
| `deploy/env.production.example` | Gỡ `BACKUP_RCLONE_REMOTE`, thêm `BACKUP_DIR`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `docs/completion-roadmap.md` · `CLAUDE.md` §3 | Ghi trạng thái staging + nợ có chủ đích (PITR, NAS riêng, R2 versioning) |

---

# Xác minh

## Phần A — CD

**Trước khi push `staging`** (skill `verify-changes` — chỉ phần vừa sửa):

```bash
XP_IMAGE=ghcr.io/daihanhbvt/xeprime:staging-test \
  docker compose -f docker-compose.prod.yml --env-file deploy/env.production.example config \
  | grep -E 'image:'          # 4 service phải hiện tag ghcr; bỏ XP_IMAGE → về xeprime-app:latest
bash -n deploy/scripts/deploy.sh
```

**Sau khi push:** Actions → `Deploy` xanh cả 3 job · Packages có `:staging-<sha>` ·

```bash
curl -fsS https://api-stg.xeprime.vn/health      # {"status":"ok","info":{"database":{"status":"up"}}}
curl -fsS -o /dev/null -w '%{http_code}\n' https://stg.xeprime.vn
```

Log API lúc boot **phải có** `⚠ APP_ENV=staging — KHÔNG phải production` — thiếu nghĩa là
`APP_ENV` chưa tới được container. Mở `https://stg.xeprime.vn`, đăng ký, đăng nhập, **console
trình duyệt không được có lỗi CORS**.

**Kiểm vòng lặp đầy đủ:** sửa một chữ ở `develop` → merge sang `staging` → thay đổi hiện trên
`stg.xeprime.vn` mà **không SSH lần nào**. Đó mới là thứ Phần A giao.

**Kiểm rollback:** Actions → Run workflow → `environment: staging`, `image_tag: staging-<sha cũ>`
→ site quay về bản cũ trong ~2 phút, không build lại.

## Phần B — Backup

```bash
# 1. Chạy tay một lần, xem từng bước
sudo -u xeprime /opt/xeprime/deploy/scripts/backup-db.sh --env production

# 2. Chống trùng: chạy hai lệnh cùng lúc, lệnh thứ hai phải thoát sạch vì gặp lock
./deploy/scripts/backup-db.sh --env production & ./deploy/scripts/backup-db.sh --env production

# 3. Cảnh báo: bịa một lỗi (đổi POSTGRES_USER sai) → Telegram phải có tin
# 4. Timer đã lên
systemctl list-timers xeprime-backup@production
journalctl -u xeprime-backup@production -n 50
```

```powershell
# 5. Khoá pull phải KHÔNG mở được shell
ssh -i $env:USERPROFILE\.ssh\xeprime_pull xpbackup@<ip> "whoami"     # phải bị từ chối
# 6. Pull lần đầu
.\tools\backup-pull\Pull-XePrimeBackup.ps1
# 7. Bỏ máy tắt qua một kỳ hẹn, bật lại → Task Scheduler phải tự chạy bù, và tải BÙ bản đã lỡ
# 8. Test restore thật — tiêu chí: pg_restore không lỗi VÀ bookings/vehicles/payments đếm ra số hợp lý
.\tools\backup-pull\Test-XePrimeRestore.ps1
```

**Diễn tập khôi phục đầy đủ trên staging một lần** — một bản sao lưu chưa từng khôi phục thử thì
chưa phải bản sao lưu:

```bash
./deploy/scripts/restore-db.sh --env staging ~/…/xeprime-staging-<stamp>.dump
```

Bấm giờ lần diễn tập đó và ghi con số vào `docs/backup-and-restore.md`. Khi sự cố thật xảy ra,
câu hỏi đầu tiên bạn phải trả lời được là "bao lâu thì xong" — và lúc đó không phải lúc đi đo.
