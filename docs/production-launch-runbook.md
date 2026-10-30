# Runbook lên production — từ con số 0 tới app trên Google Play

> Ngày viết: 29/10/2026 · Trạng thái: **sống** — làm theo đúng thứ tự cho lần dựng production thật.
> Phạm vi: TRÌNH TỰ và CHECKLIST. Chi tiết kỹ thuật từng bước đã có ở hai tài liệu chuyên đề, file
> này trỏ sang đúng mục thay vì chép lại:
>
> - [`deployment.md`](deployment.md): VPS, DNS, Caddy, CD (GitHub Actions), sao lưu, sự cố.
> - [`third-party-keys.md`](third-party-keys.md): cách tạo từng key. Tài liệu đó viết cho staging;
>   bảng ở §3 dưới đây ghi **giá trị production** tương ứng.
> - [`push-notifications.md`](push-notifications.md): Firebase cho thông báo đẩy của hai app.
>
> Production tạm (giai đoạn nội bộ, chạy chung VPS staging) là một biến thể riêng, ghi ở
> [Phụ lục A](#phụ-lục-a--production-tạm-trên-vps-staging). Runbook chính KHÔNG phụ thuộc phụ lục đó.

---

## 0. Bức tranh tổng thể

```
A. Pháp lý + tài khoản chờ duyệt lâu   ── bắt đầu NGAY, chạy song song mọi thứ bên dưới
B. Hạ tầng: VPS · DNS · GitHub
C. Dịch vụ ngoài bản production         ── R2 · Firebase · OAuth · SMTP · eSMS · SePay · Vietmap…
D. Khai GitHub Environment `production`
E. Deploy lần đầu + seed + kiểm tra + sao lưu
F. App mobile → Google Play (và App Store)
G. Bật MoMo / VNPAY (khi đã có hợp đồng + ADR 0058 Accepted)
```

### Việc chờ lâu — khởi động trước tiên

Thời gian dưới đây chỉ là ước lượng thường gặp; hỏi lại nhà cung cấp lúc nộp.

| Việc | Ai cấp | Thường mất | Chặn bước nào |
| --- | --- | --- | --- |
| Brandname SMS `XePrime` + mẫu tin OTP | eSMS.vn (đăng ký với từng nhà mạng) | vài ngày – vài tuần | E (API production không boot nếu không gửi được OTP thật) |
| Đăng ký website TMĐT (sàn giao dịch) | Bộ Công Thương — `online.gov.vn` | vài tuần | G (cổng thanh toán thường đòi), uy tín site |
| Tài khoản tổ chức Google Play + số D-U-N-S | Dun & Bradstreet → Google | vài ngày – vài tuần | F |
| Hợp đồng merchant MoMo / VNPAY | MoMo, VNPAY | vài tuần | G |
| Tài khoản ngân hàng công ty + SePay | Ngân hàng, SePay | vài ngày | E (thu tiền giữ chỗ, tiền gói) |
| Facebook app chế độ **Live** | Meta | vài ngày | Đăng nhập Facebook cho người ngoài |
| (iOS) Apple Developer Program tổ chức | Apple (cần D-U-N-S) | vài ngày – vài tuần | F (iOS) |

---

## A. Pháp lý và tài khoản — bắt đầu sớm

### A1. Hồ sơ dùng chung

Chuẩn bị một bộ, dùng cho mọi nơi bên dưới: giấy chứng nhận đăng ký doanh nghiệp, CCCD người đại
diện, tài khoản ngân hàng đứng tên công ty, email công ty (không dùng email cá nhân — khi người đó
nghỉ việc, tài khoản đi theo), một SĐT công ty nhận được OTP.

Tạo một **kho bí mật** (trình quản lý mật khẩu của công ty) ngay từ đầu. Mọi khoá ở runbook này đi
vào đó trước, rồi mới vào GitHub. Nhiều khoá chỉ hiện **một lần** lúc tạo.

### A2. Website TMĐT — Bộ Công Thương

XePrime là nơi bên thứ ba (chủ xe, gian hàng) bán dịch vụ cho khách ⇒ thuộc diện **sàn giao dịch
TMĐT**, phải **đăng ký** (không chỉ thông báo) tại `online.gov.vn`. Hồ sơ cần đề án cung cấp dịch
vụ, quy chế hoạt động sàn, điều khoản sử dụng, chính sách bảo vệ thông tin. Bốn văn bản pháp lý đã
có trên web ở `/legal/terms`, `/legal/privacy`, `/legal/marketplace-rules`, `/legal/cancellation`
(nguồn: `packages/domain/src/legal.ts`). **Nhờ tư vấn pháp lý xác nhận diện và hồ sơ** — đây là
ghi chú vận hành, không phải ý kiến pháp lý.

Được duyệt thì gắn logo "Đã đăng ký Bộ Công Thương" lên chân trang site khách.

### A3. eSMS.vn — brandname OTP

Code gửi qua eSMS REST (`apps/api/src/modules/phone-verification/otp-provider.ts`), kiểu tin
`SmsType=2` (brandname CSKH). Production **bắt buộc** gửi SMS thật: `OTP_MODE=esms`, cấm mã test,
và công tắc "tắt gửi SMS" ở màn quản trị không có tác dụng ở production.

1. Đăng nhập tài khoản eSMS hiện có (staging đang dùng) → mục **Brandname** → đăng ký brandname
   `XePrime` cho các nhà mạng (Viettel, Mobifone, Vinaphone, Vietnamobile…). Nộp giấy phép kinh
   doanh + giấy tờ chứng minh quyền dùng tên thương hiệu nếu được hỏi.
2. Đăng ký **mẫu tin OTP**. Mẫu mặc định trong code (dùng khi `ESMS_OTP_TEMPLATE` để trống):

   ```
   {code} la ma xac thuc XePrime cua ban. Ma het han sau 5 phut.
   ```

   Nhà mạng chỉ giao tin **khớp từng ký tự** mẫu đã duyệt (lệch ⇒ eSMS trả lỗi `146`). Nếu mẫu
   được duyệt khác câu trên, khai đúng câu được duyệt vào `ESMS_OTP_TEMPLATE` (giữ `{code}`).
3. Lấy **API Key** và **Secret Key** ở trang quản lý tài khoản eSMS. Nạp tiền trước — hết số dư là
   không ai đăng ký được.

> ⚠️ Hiện trạng 29/10/2026: staging gửi OTP bằng brandname **dùng chung `Baotrixemay`** của eSMS
> (cùng câu mẫu của brandname đó), vì brandname `XePrime` chưa được duyệt. Người nhận thấy tên gửi
> "Baotrixemay". Đủ cho thử nội bộ, KHÔNG đủ cho production thật.

### A4. Google Play Console — tài khoản tổ chức

1. Lấy số **D-U-N-S** của công ty (tra miễn phí trên trang Dun & Bradstreet; chưa có thì đăng ký,
   mất vài ngày đến vài tuần).
2. `play.google.com/console` → tạo tài khoản nhà phát triển loại **Organization**, phí một lần
   25 USD, xác minh danh tính tổ chức bằng D-U-N-S + giấy tờ.
3. Tài khoản tổ chức **không** bị luật "12 người thử × 14 ngày" của tài khoản cá nhân — được đưa
   thẳng lên kênh Production sau khi qua review.
4. Mời thêm thành viên (Users and permissions) bằng email công ty, phân quyền theo vai.

### A5. MoMo · VNPAY — chỉ cần nộp hồ sơ, bật ở giai đoạn G

Nộp hồ sơ merchant song song từ bây giờ (pháp nhân, tài khoản ngân hàng nhận quyết toán, website có
điều khoản + chính sách hoàn tiền + liên hệ công khai). Trong lúc chờ, làm nghiệm thu bằng bộ khoá
**sandbox** trên staging: [`third-party-keys.md` §8c.1–8c.4](third-party-keys.md#8c-momo--vnpay--cổng-thanh-toán-bổ-sung-adr-0058--proposed).

### A6. Tài khoản ngân hàng nhận tiền + SePay

Tài khoản ngân hàng **đứng tên công ty**, RIÊNG cho production (không dùng chung tài khoản đang gắn
với staging — giao dịch hai môi trường sẽ lẫn vào nhau). Đăng ký SePay, liên kết tài khoản đó. Cấu
hình webhook ở bước C.

---

## B. Hạ tầng

### B1. VPS

Cấu hình đề xuất và lý do: [`deployment.md` §1](deployment.md#1-cấu-hình-vps--mua-cái-gì).
Production: 4 vCPU đời mới + NVMe · **8 GB** · ≥ 80 GB · Ubuntu 24.04 LTS · đặt tên `xeprime-production`.

Chuẩn bị máy (clone repo, `vps-bootstrap.sh`, user `xeprime`, khoá SSH riêng cho GitHub Actions):
[`deployment.md` §3.2](deployment.md#32-chuẩn-bị-máy). Trên máy production checkout `main`.

Ghi lại ba giá trị, dùng ở bước D: IP máy (`VPS_HOST`), private key deploy (`VPS_SSH_KEY`), kết quả
`ssh-keyscan -H <ip>` (`VPS_KNOWN_HOSTS`).

### B2. DNS — Cloudflare

Tên miền đăng ký ở Mắt Bão, nameserver trỏ về Cloudflare (lý do: [`deployment.md` §2.2](deployment.md#22-dns-đặt-ở-đâu-mắt-bão-hay-cloudflare)).

| Bản ghi | Trỏ về | Ghi chú |
| --- | --- | --- |
| `A xeprime.vn` | IP VPS production | site khách |
| `A partner.xeprime.vn` | IP VPS production | site đối tác |
| `A admin.xeprime.vn` | IP VPS production | site quản trị |
| `A api.xeprime.vn` | IP VPS production | app native + webhook SePay + IPN cổng |
| `A www.xeprime.vn` | IP VPS production | tuỳ chọn — nhớ bỏ comment khối `www` trong `deploy/Caddyfile` |
| `CNAME cdn.xeprime.vn` | bucket R2 công khai | tạo từ giao diện R2 (bước C1), không gõ tay |
| SPF / DKIM / DMARC | theo nhà cung cấp SMTP | bước C5 |

**Mây xám (tắt proxy)** cho tới khi Caddy lấy xong chứng chỉ. Bật mây cam sau đó thì đổi
`TRUST_PROXY_HOPS` thành `2`.

### B3. GitHub

1. **Settings → Environments → New environment** `production`:
   - Deployment branches: chỉ `main`.
   - **Required reviewers: bật**, thêm người duyệt.
2. Danh sách biến điền ở bước D.

---

## C. Dịch vụ ngoài — bộ production

Nguyên tắc: **mọi khoá production là khoá RIÊNG**, không dùng lại của staging (thu hồi một bên không
kéo bên kia; ai cầm khoá staging không giả được webhook "đã trả tiền" cho production).

### C1. Cloudflare R2 — ảnh và giấy tờ

Làm theo [`third-party-keys.md` §1](third-party-keys.md#1-cloudflare-r2), thay giá trị:

| Mục | Production |
| --- | --- |
| Bucket công khai | `xeprime-prod-public` → *Connect Domain* `cdn.xeprime.vn` (**không** dùng r2.dev) |
| Bucket riêng tư | `xeprime-prod-private` → không bật gì |
| CORS `AllowedOrigins` (cả hai bucket) | `["https://xeprime.vn", "https://partner.xeprime.vn", "https://admin.xeprime.vn"]` |
| API token | Object Read & Write, chỉ HAI bucket production |
| `R2_PUBLIC_BASE_URL` | `https://cdn.xeprime.vn` (không có `/` cuối) |

Nên bật **Object Versioning** cho cả hai bucket (R2 không nằm trong `pg_dump`).

### C2. Firebase — chat realtime + thông báo đẩy

Một project **riêng** cho production.

1. `console.firebase.google.com` → **Add project** `xeprime-production`, tắt Analytics.
2. **Firestore Database** → Production mode → `asia-southeast1`.
3. **Service account runtime**: Project settings → Service accounts → *Generate new private key* →
   lấy `project_id`, `client_email`, `private_key` ([`third-party-keys.md` §6.2](third-party-keys.md#62-service-account-phía-server)).
4. **Web app**: Your apps → Web → `XePrime Web` → lấy `apiKey`, `projectId`, `authDomain`, `appId`
   ([§6.3](third-party-keys.md#63-web-app-phía-trình-duyệt)).
5. **Service account đẩy rules** (bắt buộc khi `FIRESTORE_ENABLED=true`): Google Cloud Console (cùng
   project) → IAM & Admin → **Service Accounts** → *Create* `firestore-rules-deployer` → vai trò
   **Firebase Rules Admin** (`roles/firebaserules.admin`) → tab *Keys* → *Add key* → JSON. Nguyên
   file JSON là Secret `FIREBASE_DEPLOY_CREDENTIALS_JSON`. Workflow tự đẩy `firestore.rules` mỗi lần
   deploy.
6. **Thông báo đẩy**: bật *Firebase Cloud Messaging API*, cấp vai trò *Firebase Cloud Messaging API
   Admin* cho service account runtime, đăng ký **2 app Android** (`vn.xeprime.mobile`,
   `vn.xeprime.partner`) và **2 app iOS** cùng bundle id, tải `google-services.json` /
   `GoogleService-Info.plist` cho bước F, upload khoá APNs `.p8`
   ([`push-notifications.md` §2](push-notifications.md#2-việc-người-vận-hành-phải-làm-trong-firebase-console)).
   Bốn giá trị `EXPO_PUBLIC_FIREBASE_*` của app lấy từ cùng project (Your apps → SDK setup).

### C3. Google OAuth

[`third-party-keys.md` §2](third-party-keys.md#2-google-oauth). Nên tạo **client riêng**
`XePrime production` (thu hồi độc lập). Consent screen phải **Publish** (chế độ Testing chỉ cho
email được thêm tay đăng nhập).

Authorized redirect URIs — chép chính xác:

```
https://xeprime.vn/api/auth/social/google/callback
https://partner.xeprime.vn/api/auth/social/google/callback
https://api.xeprime.vn/auth/social/google/callback
```

### C4. Facebook Login

[`third-party-keys.md` §3](third-party-keys.md#3-facebook-login). App riêng `XePrime`, Valid OAuth
Redirect URIs:

```
https://xeprime.vn/api/auth/social/facebook/callback
https://partner.xeprime.vn/api/auth/social/facebook/callback
https://api.xeprime.vn/auth/social/facebook/callback
```

Chuyển app sang **Live** (cần URL chính sách quyền riêng tư `https://xeprime.vn/legal/privacy` và URL
xoá dữ liệu `https://xeprime.vn/delete-account`). ⚠️ ID người dùng Facebook gắn theo app: chọn app
production xong thì không đổi nữa.

### C5. SMTP

[`third-party-keys.md` §7](third-party-keys.md#7-smtp--dùng-thật-ở-cả-staging-và-production). Xác minh
tên miền gửi **`xeprime.vn`** (SPF, DKIM, DMARC ở gốc tên miền), API key **riêng** của production,
`SMTP_FROM="XePrime <no-reply@xeprime.vn>"`. Kiểm bằng mail-tester.com trước khi mở cho khách.

### C6. eSMS

Dùng tài khoản ở A3: `ESMS_API_KEY`, `ESMS_SECRET_KEY`, `ESMS_BRANDNAME=XePrime`, và
`ESMS_OTP_TEMPLATE` chỉ khi mẫu được duyệt khác câu mặc định.

### C7. SePay

[`third-party-keys.md` §8b](third-party-keys.md#8b-sepay--đối-soát-chuyển-khoản-tiền-gói--tiền-giữ-chỗ).

| Mục | Production |
| --- | --- |
| URL webhook (bảng điều khiển SePay) | `https://api.xeprime.vn/sepay/webhook` |
| Kiểu xác thực | API Key = giá trị tự sinh, ≥ 16 ký tự (`openssl rand -hex 24`) → Secret `SEPAY_API_KEY` |
| `SEPAY_BANK_CODE` | mã VietQR của ngân hàng, vd `VCB`, `TCB` |
| `SEPAY_ACCOUNT_NUMBER` · `SEPAY_ACCOUNT_NAME` | tài khoản công ty ở A6 |

Bốn giá trị khai đủ hoặc để trống cả bốn.

### C8. Vietmap

[`third-party-keys.md` §4](third-party-keys.md#4-vietmap--gợi-ý-địa-chỉ-phí-giao-xe). Services key
**riêng** `xeprime-server-prod`, **whitelist IP** = IP VPS production (lấy bằng
`curl -s -4 ifconfig.me` chạy TRÊN VPS). Nâng gói trả phí trước khi mở cho khách thật (trial giới hạn
500 lượt/ngày mỗi API).

### C9. Google Calendar (ngày lễ)

[`third-party-keys.md` §5](third-party-keys.md#5-google-calendar--ngày-lễ). API key riêng, giới hạn IP
VPS production, chỉ Google Calendar API.

### C10. Telegram — cảnh báo sao lưu

[`third-party-keys.md` §8](third-party-keys.md#8-telegram--cảnh-báo-sao-lưu). Nên dùng một nhóm chat
riêng cho production.

### C11. Không bật ở lần lên đầu

| Dịch vụ | Giữ ở | Lý do |
| --- | --- | --- |
| MoMo / VNPAY | để trống mọi biến `MOMO_*`, `VNPAY_*`, `PAYMENT_GATEWAY_*` | ADR 0058 còn Proposed — production từ chối boot nếu bật. Giai đoạn G |
| Bảo hiểm chuyến | `INSURANCE_PARTNER=none` | Chưa có hợp đồng + adapter thật. `mic_mock` bị cấm ở production |

---

## D. Khai GitHub Environment `production`

Tất cả vào **Settings → Environments → `production`**. Không sửa tay `.env.production` trên VPS — file
đó bị workflow sinh lại và ghi đè mỗi lần deploy ([`deployment.md` §9.4](deployment.md#94-file-env-trên-vps-được-sinh-tự-động)).
Ý nghĩa từng biến: [`deployment.md` §9.2](deployment.md#92-environments--variables-vs-secrets).

### D1. Sinh bí mật nội bộ

```bash
openssl rand -hex 32                                                             # POSTGRES_PASSWORD
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # REALM_PROXY_SECRET (giá trị KHÁC)
openssl rand -base64 32                                                          # OTP_PEPPER
```

Mỗi giá trị **khác staging**. Lưu vào kho bí mật trước khi dán lên GitHub.

### D2. Variables

| Biến | Giá trị production | Lấy từ |
| --- | --- | --- |
| `WEB_DOMAIN` · `PARTNER_DOMAIN` · `ADMIN_DOMAIN` · `API_DOMAIN` | `xeprime.vn` · `partner.xeprime.vn` · `admin.xeprime.vn` · `api.xeprime.vn` | B2 |
| `ACME_EMAIL` | email công ty | nhận cảnh báo chứng chỉ |
| `ADMIN_ALLOWED_IPS` | IP/CIDR văn phòng, cách nhau bằng dấu cách (vd `1.2.3.4 5.6.7.0/24`) — **nên khai**; không khai = mọi IP vào được site quản trị. Bật proxy Cloudflare thì phải khai `trusted_proxies` cho Caddy trước, nếu không danh sách so với IP của Cloudflare | [`deployment.md` §2.1](deployment.md) · ADR 0076 |
| `POSTGRES_USER` · `POSTGRES_DB` | `xeprime` · `xeprime` | |
| `APP_ENV` | `production` | |
| `API_PORT` | `4000` | |
| `CORS_ORIGINS` | `https://xeprime.vn,https://partner.xeprime.vn,https://admin.xeprime.vn` | |
| `TRUST_PROXY_HOPS` | `1` (`2` khi bật proxy Cloudflare) | B2 |
| `API_PUBLIC_URL` · `APP_WEB_URL` | `https://api.xeprime.vn` · `https://xeprime.vn` | |
| `WEB_PARTNER_URL` · `WEB_ADMIN_URL` | `https://partner.xeprime.vn` · `https://admin.xeprime.vn` | |
| `SESSION_COOKIE_NAME` · `SESSION_COOKIE_SECURE` | `xp_session` · `true` | |
| `MOBILE_ACCESS_TTL_MINUTES` · `MOBILE_REFRESH_TTL_DAYS` | `15` · `60` | |
| `MOBILE_JWT_AUDIENCE` · `MOBILE_AUTH_REDIRECT_URIS` | `xeprime-mobile` · `xeprime://auth/callback,xeprimepartner://auth/callback` | |
| `OTP_MODE` | `esms` | |
| `ESMS_OTP_TEMPLATE` | để trống, hoặc câu mẫu đã duyệt | A3 |
| `OTP_BYPASS_CODE` | **KHÔNG khai** — khai là workflow dừng | |
| `PLAN_FEATURE_ENFORCEMENT` | `warn` (khai tường minh) | [`deployment.md` §9.4b](deployment.md#94b-bật-cổng-chặn-năng-lực-theo-gói-plan_feature_enforcement) |
| `DRIVER_LICENCE_ENFORCEMENT` · `DRIVER_LICENCE_OCR` | `on` · `tesseract` | |
| `INSURANCE_PARTNER` | `none` | C11 |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_FROM` | theo nhà cung cấp · `587` · … · `XePrime <no-reply@xeprime.vn>` | C5 |
| `SEPAY_BANK_CODE` · `SEPAY_ACCOUNT_NUMBER` · `SEPAY_ACCOUNT_NAME` | tài khoản công ty | C7 |
| `FIRESTORE_ENABLED` · `PUSH_ENABLED` | `true` · `true` (sau khi xong C2) | |
| `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` | từ JSON service account runtime | C2.3 |
| `NEXT_PUBLIC_FIREBASE_API_KEY` · `_PROJECT_ID` · `_AUTH_DOMAIN` · `_APP_ID` | từ `firebaseConfig` của web app | C2.4 |
| `GOOGLE_OAUTH_CLIENT_ID` · `FACEBOOK_APP_ID` | console provider | C3, C4 |
| `R2_ACCOUNT_ID` · `R2_ENDPOINT` | Account ID · `https://<account_id>.r2.cloudflarestorage.com` | C1 |
| `R2_BUCKET` · `R2_PRIVATE_BUCKET` · `R2_PUBLIC_BASE_URL` | `xeprime-prod-public` · `xeprime-prod-private` · `https://cdn.xeprime.vn` | C1 |
| `GEO_DAILY_CALL_BUDGET` | `3000` (nâng khi lưu lượng thật cần) | |
| `BACKUP_KEEP_DAYS` | `14` | |
| `NEXT_PUBLIC_APP_NAME` | `XePrime` | |
| `VPS_USER` · `VPS_PATH` · `VPS_SSH_PORT` | `xeprime` · `/opt/xeprime` · `22` | B1 |

**Không khai**: `DATABASE_URL` (workflow tự ghép), `NEXT_PUBLIC_API_URL`, `SESSION_COOKIE_DOMAIN`,
ba URL `NEXT_PUBLIC_WEB_*_URL` (workflow tự dựng từ biến site).

### D3. Secrets

| Secret | Lấy từ |
| --- | --- |
| `POSTGRES_PASSWORD` · `SESSION_JWT_SECRET` · `REALM_PROXY_SECRET` · `OTP_PEPPER` | D1 |
| `ESMS_API_KEY` · `ESMS_SECRET_KEY` · `ESMS_BRANDNAME` | A3 (`ESMS_BRANDNAME` để ở Secret cho chắc — bước kiểm thiếu của workflow đọc Secret) |
| `SMTP_PASS` | C5 |
| `SEPAY_API_KEY` | C7 |
| `FIREBASE_PRIVATE_KEY` | C2.3 — một dòng, giữ nguyên `\n` |
| `FIREBASE_DEPLOY_CREDENTIALS_JSON` | C2.5 — nguyên file JSON |
| `GOOGLE_OAUTH_CLIENT_SECRET` · `FACEBOOK_APP_SECRET` | C3, C4 |
| `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` | C1 |
| `VIETMAP_API_KEY` · `GOOGLE_HOLIDAY_API_KEY` | C8, C9 |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | C10 |
| `VPS_HOST` · `VPS_SSH_KEY` · `VPS_KNOWN_HOSTS` | B1 |

Thiếu một giá trị bắt buộc thì job deploy dừng ở bước "Thiếu giá trị bắt buộc" — **trước** khi
migrate chạm vào database. Đọc dòng `::error::` là biết thiếu gì.

---

## E. Deploy lần đầu

### E1. Chạy workflow

- Đường chuẩn: merge `staging` → `main`, duyệt ở cổng Required reviewers.
- Hoặc: **Actions → Deploy → Run workflow** → `environment: production`.

Theo dõi tới khi job xanh. Lỗi thường gặp: [`deployment.md` §7](deployment.md#7-sự-cố-thường-gặp).

### E2. Seed dữ liệu nền — đúng MỘT lần

Lệnh đầy đủ: [`deployment.md` §3.5](deployment.md#35-seed-dữ-liệu-nền--chạy-đúng-một-lần) với
`SEED_MODE=system`. Kết quả:

| Có sẵn | Nguồn |
| --- | --- |
| Tỉnh / xã | migration |
| Hãng xe, mẫu xe, tiện nghi, kiểu dáng; logo hãng (`/brands/*.webp` đi theo image) | `seedVehicleCatalog` |
| Quyền, role hệ thống, danh mục thu/chi, gói dịch vụ, banner, chính sách phí | `seedSystemData` |
| Tài khoản `admin@xeprime.vn` với mật khẩu nhập lúc chạy | `seedPlatformAdmin` |

❌ Không bao giờ chạy `SEED_MODE=demo` ở production (seed tự chặn).

### E3. Việc tay của admin ngay sau seed

1. Đăng nhập `https://admin.xeprime.vn` → đổi mật khẩu nếu cần, bật thêm tài khoản nhân sự nền tảng.
2. **Gói dịch vụ**: sáu bậc tự mua được tạo ở trạng thái `draft` với giá giữ chỗ. Chốt giá thật
   (giá tuyệt đối từng kỳ hạn — ADR 0041) rồi bấm **Mở bán**. Chưa mở bán thì partner không mua được
   gói nào.
3. Soát **chính sách phí** (`fee_policies`): phí sàn, nấc hoa hồng, thuế, mức giữ chỗ khớp quyết định
   kinh doanh hiện hành.
4. Banner, danh mục: chỉnh nội dung hiển thị nếu cần.

### E4. Kiểm tra

```bash
curl -fsS https://api.xeprime.vn/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://xeprime.vn
curl -fsS -o /dev/null -w '%{http_code}\n' https://partner.xeprime.vn
curl -fsS -o /dev/null -w '%{http_code}\n' https://admin.xeprime.vn
```

Môi trường đã có người dùng web (staging, hay production khi nâng cấp): lần deploy đầu tiên mang
migration `20261029120000_web_sessions_login_throttles` đăng xuất MỌI phiên web một lần — cookie cũ
không có hàng `web_sessions` (ADR 0076). App mobile không bị ảnh hưởng.

Log boot của API ở production không được có dòng "chạy suy giảm" nào. Rồi kiểm bằng tay, mỗi dòng
một tài khoản thật (SIM công ty):

| Kiểm | Đạt khi |
| --- | --- |
| Đăng ký khách ở `xeprime.vn` | SMS OTP tới máy, tên người gửi là `XePrime` |
| Quên mật khẩu | Thư tới hộp thư, link mở được, không vào Spam |
| Đăng nhập Google / Facebook | Quay về đúng site, không `redirect_uri_mismatch` |
| Đăng nhập ở hai trình duyệt → đổi mật khẩu ở trình duyệt 1 | Trình duyệt 2 bị đăng xuất ở thao tác kế tiếp; trình duyệt 1 vẫn ở trong (ADR 0076) |
| Gõ sai mật khẩu 5 lần ở `admin.xeprime.vn` | Lần thứ 5 báo tạm khoá; đúng mật khẩu cũng chưa vào được trong 15 phút |
| Mở `admin.xeprime.vn` từ mạng 4G (ngoài `ADMIN_ALLOWED_IPS`) | 403 |
| `curl -sI https://xeprime.vn` | Có `Content-Security-Policy: frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`, không có `X-Powered-By` |
| Đăng ký đối tác ở `partner.xeprime.vn`, đăng xe kèm ảnh | Ảnh hiện với URL `cdn.xeprime.vn` |
| Admin duyệt xe | Xe lên chợ |
| Đặt xe → chủ xe duyệt → chuyển khoản QR số tiền nhỏ | Webhook SePay về, đơn thuê ra đời, màn thanh toán tự lật |
| Huỷ trong cửa sổ miễn phí | Tiền hoàn vào ví điểm của tài khoản khách |
| Chat hai phía | Tin tới ngay (realtime) |
| Ô địa chỉ giao xe | Có gợi ý Vietmap |

### E5. Sao lưu và giám sát — làm ngay, không để sau

1. Cài timer sao lưu, chạy thử một lượt: [`deployment.md` §6.1](deployment.md#61-trên-vps).
2. Tạo user SFTP chỉ-đọc cho máy công ty kéo bản sao: [§6.2](deployment.md#62-lối-kéo-về-cho-máy-tại-công-ty),
   kiểm khoá đó **không** mở được shell ([§6.3](deployment.md#63-hai-thứ-phải-làm-ngay-không-để-sau)).
3. Diễn tập khôi phục một lần, bấm giờ, ghi vào [`backup-and-restore.md`](backup-and-restore.md).
4. Cắm uptime monitor miễn phí (UptimeRobot / Better Stack) vào `https://api.xeprime.vn/health` và
   `https://xeprime.vn`.

---

## F. App mobile lên Google Play

Hai app, mỗi app một listing riêng, review riêng:

| App | Thư mục | Package | Lệnh build |
| --- | --- | --- | --- |
| XePrime (khách) | `apps/mobile/customer` | `vn.xeprime.mobile` | `pnpm --filter @xeprime/mobile-customer release:android` |
| XePrime Partner | `apps/mobile/manage` | `vn.xeprime.partner` | `pnpm --filter @xeprime/mobile-manage release:android` |

⚠️ Package name **không đổi được** sau lần upload đầu tiên.

### F1. Upload key — tạo MỘT lần, giữ vĩnh viễn

App mới trên Play dùng **Play App Signing**: Google giữ khoá ký app, mình giữ **upload key** để ký
file nộp lên. Hai app dùng chung một upload key (cùng bộ Gradle property).

```bash
keytool -genkeypair -v -storetype PKCS12 \
  -keystore C:/Users/<ten>/keystores/xeprime-upload.jks \
  -alias xeprime-upload -keyalg RSA -keysize 2048 -validity 10000
```

Khai vào `C:/Users/<ten>/.gradle/gradle.properties` (ngoài repo):

```properties
XEPRIME_UPLOAD_STORE_FILE=C:/Users/<ten>/keystores/xeprime-upload.jks
XEPRIME_UPLOAD_STORE_PASSWORD=...
XEPRIME_UPLOAD_KEY_ALIAS=xeprime-upload
XEPRIME_UPLOAD_KEY_PASSWORD=...
```

Cất file `.jks` + hai mật khẩu vào kho bí mật. Mất upload key thì phải xin Google đặt lại — mất
nhiều ngày. Chi tiết cơ chế ký: docblock `apps/mobile/shared/plugins/with-android-release-signing.js`.

### F2. Cấu hình app trỏ vào production

Mỗi app một file `.env` (mẫu ở `.env.example` cùng thư mục) — các biến `EXPO_PUBLIC_*` bị **nhúng
cứng lúc build**, đổi là phải build lại:

| Biến | Giá trị |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | `https://api.xeprime.vn` |
| `EXPO_PUBLIC_WEB_URL` | `https://xeprime.vn` (màn văn bản pháp lý mở trang web) |
| `EXPO_PUBLIC_APP_NAME` | `XePrime` |
| `EXPO_PUBLIC_FIREBASE_*` (4) | project `xeprime-production` (C2.6) |
| `EXPO_PUBLIC_CHAT_DEBUG` · `EXPO_PUBLIC_PUSH_DEBUG_RAW` | `false` |
| `EXPO_PUBLIC_PARTNER_ANDROID_STORE_URL` (chỉ app khách) | link Play của app Partner, sau khi Partner có listing |

Đặt `google-services.json` của project production vào `credentials/` của **từng** app (không commit).

### F3. Build

Chạy lệnh build ở bảng đầu mục F (hoặc lệnh `/customer-build-android`, `/partner-build-android`).
Script tự tăng `versionCode`, kiểm upload key, ra file `dist/<slug>-<version>-<versionCode>.aab`.
Commit phần tăng `versionCode` sau mỗi lần build nộp store.

### F4. Tạo app trên Play Console

Với mỗi app: **Create app** → tên, ngôn ngữ mặc định Tiếng Việt, loại *App*, *Free*.

**Store listing**: tên, mô tả ngắn (≤ 80 ký tự), mô tả đầy đủ, icon 512×512, feature graphic
1024×500, tối thiểu 2 ảnh chụp điện thoại.

**App content** — điền hết, thiếu mục nào là không gửi review được:

| Mục | Điền |
| --- | --- |
| Privacy policy | `https://xeprime.vn/legal/privacy` |
| App access | "Một số chức năng bị giới hạn" → khai tài khoản cho người duyệt: SĐT + mật khẩu. Reviewer **không nhận được OTP**, nên tài khoản phải tạo sẵn và đã xác minh SĐT bằng SIM công ty. App khách: một tài khoản khách. App Partner: một tài khoản đối tác tuyến hoa hồng đã có gian hàng + một xe |
| Ads | Không có quảng cáo |
| Content rating | Làm bảng hỏi IARC |
| Target audience | 18+ |
| Data safety | Thu: SĐT, tên, email, vị trí (ô địa chỉ), ảnh (xe, bằng lái — dữ liệu nhạy cảm), thông tin thanh toán (chuyển khoản, không lưu thẻ), mã thiết bị cho thông báo đẩy. Mã hoá khi truyền: có. Cho xoá dữ liệu: có |
| Account deletion | Trong app: màn Xoá tài khoản. URL web: `https://xeprime.vn/delete-account` (mở được không cần đăng nhập) |
| Financial features | Khai đúng: thanh toán cho dịch vụ thuê xe qua chuyển khoản; không cho vay, không ví điện tử |
| Government apps · Health | Không |

**Countries/regions**: Việt Nam.

> ⚠️ **Rủi ro chính sách thanh toán của app Partner.** Đặt xe là dịch vụ ngoài đời thật nên thu ngoài
> Google Play Billing được. Nhưng **mua gói để mở tính năng quản lý trong app** có thể bị Google xếp
> vào "tính năng số" — loại bắt buộc Play Billing. Hướng an toàn: trong app Partner không có luồng
> mua gói, việc mua làm trên web `partner.xeprime.vn`. Chốt với chủ sản phẩm trước khi nộp.

### F5. Phát hành

1. **Internal testing** trước: upload `.aab`, mời nhóm nội bộ, cài thử và chạy lại các ca ở E4 trên
   điện thoại thật (đăng nhập, đặt xe, thanh toán, nhận thông báo đẩy).
2. **Publishing overview → Managed publishing: bật.** Google duyệt xong thì app CHƯA lên ngay; mình
   tự bấm phát hành khi đội vận hành sẵn sàng.
3. **Production → Create release** (hoặc Promote bản Internal đã thử) → **staged rollout** 10% →
   50% → 100%. Theo dõi Android vitals / crash giữa các nấc.
4. Lần đầu lên Production thường duyệt lâu hơn các lần sau — nộp sớm.

### F6. iOS (App Store)

Cần Apple Developer Program tổ chức (D-U-N-S), khoá APNs `.p8` đã upload ở C2.6,
`GoogleService-Info.plist` production, `APS_ENVIRONMENT=production`. Build qua EAS: lệnh
`/customer-build-ios`, `/partner-build-ios`. Hồ sơ App Store Connect tương tự F4 (privacy policy, URL
xoá tài khoản, tài khoản cho reviewer, App Privacy).

---

## G. Bật MoMo / VNPAY

Code đã sẵn ở API, web và app khách (màn thanh toán chuyến có nút cổng); nút tự hiện khi server bật,
**không cần build lại app**. Điều kiện và trình tự:

1. Có bộ khoá **production** của cổng (A5) và đã qua nghiệm thu sandbox
   ([`third-party-keys.md` §8c.4](third-party-keys.md#8c4-ca-thử-bắt-buộc-trên-staging-bằng-chứng-uat)).
2. Chủ sản phẩm / tài chính / pháp lý trả lời các câu mở của ADR 0058 cho luồng định bật:
   - Luồng **hoá đơn gói**: Q2 (ai chịu phí cổng), Q5 (đối soát tiền còn ở merchant), Q6 (chứng
     từ), Q7.
   - Luồng **tiền giữ chỗ**: thêm Q1 (ý kiến pháp lý thu hộ), Q3, Q4 (chính sách hoàn).
3. Một PR: ADR 0058 → Accepted + gỡ chặn đúng luồng đó ở `apps/api/src/config/env.schema.ts`.
4. Khai ở Environment `production`:

   | Loại | Biến | Giá trị |
   | --- | --- | --- |
   | Variable | `PAYMENT_GATEWAY_MODE` | `live` |
   | Variable | `PAYMENT_GATEWAY_SUBSCRIPTION` / `PAYMENT_GATEWAY_BOOKING_HOLD` | `on` cho luồng đã gỡ chặn |
   | Variable | `MOMO_PARTNER_CODE` · `MOMO_API_BASE_URL` | mã merchant · `https://payment.momo.vn` |
   | Secret | `MOMO_ACCESS_KEY` · `MOMO_SECRET_KEY` | MoMo cấp |
   | Variable | `VNPAY_TMN_CODE` · `VNPAY_PAYMENT_URL` · `VNPAY_API_URL` | VNPAY cấp (URL production) |
   | Secret | `VNPAY_HASH_SECRET` | VNPAY cấp |

5. Portal VNPAY → khai IPN URL `https://api.xeprime.vn/payment-gateway/vnpay/ipn`. MoMo không khai —
   server gửi IPN URL theo từng request.
6. Deploy lại, thử một giao dịch số tiền nhỏ mỗi cổng, rồi xử lý nó qua hàng đợi "Cổng thanh toán cần
   xử lý" của admin nếu cần hoàn.

---

## Checklist một trang

- [ ] A1 Hồ sơ công ty + kho bí mật
- [ ] A2 Nộp đăng ký sàn TMĐT (Bộ Công Thương)
- [ ] A3 Brandname `XePrime` + mẫu OTP được duyệt, đã nạp tiền eSMS
- [ ] A4 Play Console tổ chức (D-U-N-S)
- [ ] A5 Nộp hồ sơ MoMo, VNPAY · nghiệm thu sandbox trên staging
- [ ] A6 Tài khoản ngân hàng production + SePay
- [ ] B1 VPS production, bootstrap, khoá deploy
- [ ] B2 DNS sáu bản ghi (mây xám)
- [ ] B3 Environment `production` + Required reviewers
- [ ] C1 R2 hai bucket + `cdn.xeprime.vn` + CORS + token
- [ ] C2 Firebase production: Firestore, SA runtime, web app, SA đẩy rules, FCM, 2 Android + 2 iOS, APNs
- [ ] C3 Google OAuth client production, consent Published
- [ ] C4 Facebook app Live
- [ ] C5 SMTP `xeprime.vn` + SPF/DKIM/DMARC
- [ ] C7 SePay webhook production
- [ ] C8 Vietmap key production (whitelist IP) · C9 Calendar key · C10 Telegram
- [ ] D Variables + Secrets đủ
- [ ] E1 Deploy xanh · E2 seed `system` · E3 mở bán gói, soát chính sách phí
- [ ] E4 Mọi ca kiểm đạt · E5 sao lưu + diễn tập khôi phục + uptime monitor
- [ ] F1 Upload key cất kho bí mật · F2 `.env` app trỏ production · F3 build hai `.aab`
- [ ] F4 Hai listing đủ App content · F5 Internal → Production (managed publishing, staged rollout)
- [ ] G (sau) MoMo/VNPAY

---

## Phụ lục A — Production tạm trên VPS staging

Giai đoạn đầu dùng **nội bộ** để đưa app lên store trước (quyết định 29/10/2026). Khi lên production
thật thì dựng lại TỪ ĐẦU theo runbook trên, trên VPS mới, và bỏ bản tạm.

### A.1 Khác runbook chính ở đâu

| Hạng mục | Production tạm | Production thật |
| --- | --- | --- |
| Máy | VPS staging, chạy như **site ngoài** qua cơ chế [`deployment.md` §10](deployment.md#10-site-của-dự-án-khác-trên-cùng-vps) — Caddy của staging xin chứng chỉ, stack tạm không có Caddy riêng, tên service khác `web`/`api`/`db`…, `mem_limit` thấp | VPS riêng (B1) |
| Domain | `xeprime.vn` · `partner.` · `admin.` · `api.xeprime.vn` (giữ nguyên khi chuyển) | như nhau |
| Deploy | Bằng tay, file env đặt trên máy — **không** qua GitHub Environment/CD | CD (D, E1) |
| Image | Build riêng với URL site production (`NEXT_PUBLIC_*` nhúng lúc build — không dùng image `staging-*`) | CD build |
| `APP_ENV` | API `production` (bắt buộc: chặn mã OTP test, bắt buộc SMS thật). Riêng container web có thể đặt `staging` để mọi trang `noindex` — Google không index dữ liệu tạm | `production` |
| Dữ liệu | Migrate + seed `system`, phần còn lại tạo tay | như nhau |
| eSMS | Dùng chung tài khoản; brandname `Baotrixemay` + câu mẫu của nó cho tới khi `XePrime` được duyệt | brandname `XePrime` |
| SePay | **Tạo mới**, webhook `https://api.xeprime.vn/sepay/webhook`, tài khoản ngân hàng khác staging | dùng tiếp — webhook theo domain |
| R2 · Firebase · SMTP · Vietmap · Calendar | Dùng lại của staging (Vietmap whitelist IP staging sẵn có) | tạo bộ production (C1–C9) |
| Google / Facebook OAuth | Thêm redirect URI production vào client/app của staging | client/app production |
| MoMo / VNPAY | Tắt; bật theo G khi có hợp đồng — bộ khoá production **dùng tiếp** cho production thật | như nhau |
| Bảo hiểm | `INSURANCE_PARTNER=none` | như nhau |
| App mobile | Build trỏ `https://api.xeprime.vn`, Firebase của staging | build lại với Firebase production; bắt người dùng cập nhật |

### A.2 Kiểm trước khi dựng

- RAM thật của VPS staging (`docker stats --no-stream`, `free -m`): stack staging + `softrent.vn` +
  stack tạm phải vừa 6 GB, không thì hạ `mem_limit` hoặc nâng RAM.
- Đĩa còn đủ cho thêm một database + bản sao lưu của nó.

File cụ thể (compose, khối Caddy, mẫu env, script deploy) sẽ ghi vào đây khi dựng.

### A.3 Bỏ bản tạm khi lên production thật

1. Ngừng nhận tiền mới: tắt webhook SePay (và cổng nếu đã bật) trỏ vào bản tạm.
2. Tất toán mọi khoản đang mở: giữ chỗ dở dang, yêu cầu hoàn, hàng đợi cổng, yêu cầu rút ví — hoàn
   tay cho người đã chuyển.
3. `pg_dump` bản cuối, cất ở máy công ty (đối chiếu sao kê / báo cáo quyết toán cổng nếu cần).
4. Gỡ khối Caddy của bản tạm (`caddy validate` → `caddy reload`), `docker compose down -v` đúng project
   của bản tạm — **kiểm tên project hai lần**, nhầm là xoá database staging.
5. Trỏ DNS sáu bản ghi sang VPS production thật, deploy theo E, phát hành bản app mới theo F và yêu
   cầu mọi máy cập nhật.
