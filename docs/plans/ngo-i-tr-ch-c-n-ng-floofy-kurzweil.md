# Kế hoạch — Giai đoạn tiếp theo (rà soát BA, 25/08/2026)

> **Phạm vi loại trừ:** epic doanh thu `/manage/finance` đang làm dở (57 file chưa commit) —
> không nằm trong kế hoạch này, nhưng **phải commit trước khi đợt 1 chạm vào contract** (lý do ở §6).

---

## 1. Context — vì sao có tài liệu này

Dự án đã **vượt milestone "vận hành đủ tiền"** (hết Phase 6) và đi khá xa vào Phase 7. Backend
hoàn chỉnh ở mức bất thường cho một MVP: 32 module, 250 route, 68 model Prisma, 58 spec e2e chạy
trên PostgreSQL thật, **0 `TODO`/`FIXME` trong `apps/api/src`**. Web có 46 page, 37 đầy đủ.

Nhưng khi soi theo **giá trị kinh doanh** thay vì theo module, lộ ra ba lỗ hổng mà lịch 9 phase
không bắt được — và cả ba đều không phải "thiếu tính năng":

1. **Sản phẩm chưa tồn tại ngoài máy dev.** Không có Dockerfile nào trong repo, không có
   `.github/`, `docker-compose.yml` chỉ có `db` + `redis`. Không có artifact nào để đem lên VPS.
   Hàng rào `apps/api/src/config/env.schema.ts:203-283` (fail-at-boot khi `AUTH_MODE=mock`,
   `OTP_MODE≠esms`, thiếu SMTP) chỉ là **rào chắn cuối của một con đường chưa xây**.
2. **Nền tảng chưa thu được tiền.** ADR 0015 (cước theo chỗ xe) và ADR 0016 (SePay) Accepted từ
   21/08 nhưng **0 dòng code**: `modules/billing/billing.service.ts:260` vẫn tính
   `plan.durationDays × 86400000` — đúng mô hình phẳng ADR 0010 mà ADR 0015 đã bãi bỏ.
3. **Nợ chữ nghĩa đang sinh lãi kép.** 2330 chuỗi i18n thô, 168 `label:` tiếng Việt trong
   `packages/types`, thông báo là văn xuôi tiếng Việt ghi thẳng DB. Có **RN dev sắp tham gia** ⇒
   mỗi món này sắp bị nhân đôi.

**Mục tiêu người dùng chốt:** ra mắt thật với shop thật · nền tảng thu được tiền · hoàn thiện
chiều sâu web. **Ràng buộc:** chưa có eSMS, SMTP, SePay, Firebase service account.
**Phase 8:** chỉ migrate danh mục nền.

---

## 2. Hiện trạng đã xác minh bằng code (không lấy từ tài liệu)

| Phase | Trạng thái thực tế |
| --- | --- |
| 0–4 | ✅ Xong |
| 5 | ✅ Notification + Review · Chat **dựng xong nhưng TẮT** (`env.schema.ts:78`), worker `apps/worker/src/jobs/outbox-pump.ts` đã có |
| 6 | ✅ Xong — milestone "vận hành đủ tiền" đạt |
| 7 | 🚧 Lõi + 3 màn giám sát xong · thiếu **support ticket** + **invoice cho gói** |
| 8 | ✅ **Đã xong dưới phạm vi đã chốt** — xem dưới |
| 9 | ❌ Chưa bắt đầu, và lớn hơn tưởng |

**Phase 8 gần như không còn việc.** Danh mục nền đã nằm sẵn trong baseline:
`prisma/migrations/20260821000000_init/migration.sql:2142` (provinces) và `:2256` (catalog_items);
banner ở `prisma/src/seed/system.ts:274`, chạy được với `SEED_MODE=system` ở production.
⇒ Còn đúng **một việc xác minh**, không phải một khối công việc.
Lưu ý kèm: `../Firebase-code` mà `CLAUDE.md` §1 và `CODEMAP.md` trỏ tới **không tồn tại trên máy
này** — nếu sau này cần dữ liệu vận hành cũ thì phải lấy từ Firestore export.

### Nhóm 1 — Chặn "có mặt trên đời"

| Việc | Bằng chứng |
| --- | --- |
| Không có artifact build / reverse proxy / TLS / runbook | 0 Dockerfile · không có `.github/` · compose chỉ `db`+`redis` |
| eSMS chưa ký | `.env` không có `OTP_MODE`/`ESMS_*`; code `EsmsOtpProvider` **đã xong** |
| SMTP chưa có | `.env` không có `SMTP_*`; thiếu thì in **nguyên link reset kèm token** ra log |
| Firebase prod chưa xác nhận | `AUTH_MODE` default `mock` (`env.schema.ts:51`) — `MockTokenVerifier` nhận token giả |
| CSRF chưa triển khai | chỉ comment ở `modules/auth/session.service.ts:81-82` — **nợ ADR 0002 ràng buộc 3** |
| Web session không revoke được | chỉ `model NativeAuthSession` (`schema.prisma:339`) — **nợ ADR 0002 ràng buộc 5** |
| CI xanh giả | **51/58 spec** có guard `dbAvailable` tự bỏ qua im lặng; `jest.config.js` không có `globalSetup` |
| 1 test đỏ thường trực | `apps/api/test/vehicle-documents.spec.ts` hardcode `expiresAt: '2026-08-20'` |
| 1 test flaky | `features/marketplace/search/search-experience.test.tsx` |

### Nhóm 2 — Chặn "thu được tiền"

| Việc | Bằng chứng |
| --- | --- |
| ADR 0015 chưa code | `billing.service.ts:260` dùng `durationDays`; seed `prisma/src/seed/system.ts:187-232` cũng model cũ; `model Plan` (`schema.prisma:2421`) còn `duration_days`/`max_vehicles` |
| Hạn mức chưa có "răng" | `assertVehicleQuota` (`billing.service.ts:368`) chỉ được gọi ở `vehicles.service.ts:393` (lúc TẠO xe), **không** ở `submit-public` |
| Không có `subscription_invoices` | không có model trong `schema.prisma` |
| ADR 0016 SePay chưa code | `grep -i sepay apps/api` = 0 |
| Notification chỉ 1 kênh | `notification.service.ts` `buildData()` khoá cứng `NOTIFICATION_CHANNEL.IN_APP` và nhận `title`/`body` **văn xuôi** |
| 7 màn `/account/*` placeholder | `constants/account-nav.ts:80,87,94,101,108,115,122` |
| Plan 21/08 mới chạy 1/10 wave | chỉ A1 xong |

### Nhóm 3 — Nợ sinh lãi kép (làm sau = đập đi)

| Việc | Số đo hôm nay |
| --- | --- |
| Thông báo là văn xuôi VN trong DB | `bookings.service.ts:357,358,772` · `settlement.service.ts:313` |
| Nhãn nghiệp vụ hai nguồn | **168 `label:`** trong `packages/types/src/status/*.ts` · **70 file web** đọc `*_META` · 2 chỗ backend |
| Nợ i18n | **2330 chuỗi / 33 khu** (đo hôm nay) |
| `i18n:audit` mù `packages/` | `apps/web/scripts/i18n-audit.mjs:33` chỉ lấy `<web>/src` ⇒ **186 dòng** tiếng Việt ở `packages/validators/src/` vô hình |

### Nhóm 4 — Nợ tuyến tính (không nhân lên)

G-03 lý do ẩn xe (chỉ nằm trong `audit_logs.after`, `platform-vehicles.service.ts:216` — **không
có cột nào lưu**) · G-04 gate chất lượng listing · phụ phí vượt cọc chưa thu · `vehicle-obligations`
· nút "Sửa chi phí" (API xong, UI chưa) · support ticket (`/manage/support` chỉ là FAQ tĩnh) ·
rác R2 · OCR (503, khung xong) · 4 bảng mồ côi (`ChatAttachment`, `TenantDocument`, `TenantInvite`,
`AdminNote`) · mời thành viên qua email (`members.service.ts:77`) · 2 page stub · vùng trắng test
(API: `members`/`notification`/`rbac`/`users`; web: `features/bookings` 17 file 0 test, `chat` 13
file 0 test, `contracts`, `drivers`, `approvals`, `banners`, `catalog`, `platform-dashboard`).

### Đính chính tài liệu (roadmap đang nói sai)

- `completion-roadmap.md:533` liệt "**chưa có writer cho `blocked_range`**" — **SAI**. Đã có
  `modules/calendar/vehicle-blocks.controller.ts` + `.service.ts` (ghi occupancy ở `:95,165,212`),
  UI `features/calendar/components/VehicleBlockDetailDialog.tsx`, test `test/vehicle-blocks.spec.ts`.
- `CODEMAP.md:175` + `docs/README.md`: "13 ADR" → thực tế **18**. `CODEMAP.md:146`: "63 model" → **68**.

---

## 3. Nguyên tắc xếp thứ tự

Tiêu chí duy nhất: **nợ sinh lãi kép trả trước, nợ tuyến tính trả sau.** Một chuỗi tiếng Việt
cứng hôm nay tốn 1 đơn vị; sau khi RN dev clone màn đó, nó tốn 2. Một thông báo văn xuôi ghi vào
DB hôm nay tốn 1; sau khi có push và có dữ liệu lịch sử, nó tốn 1 + migration.

**Hệ quả về lịch:** credential (eSMS lead time tính bằng **tuần**) chặn phần *xác minh* của Đợt 1
chứ không chặn phần *code*. Vì vậy Đợt 2 khởi động ngay khi code Đợt 1 xong, **không đợi SMS về**.

---

## 4. Ba đợt

### Đợt 1 — "Từ máy dev lên một máy thật" · **M**

**Mục tiêu:** một người lạ gõ tên miền thật, đăng ký bằng SĐT thật, nhận SMS thật — và một lần
test xanh có nghĩa là xanh.

**Phạm vi:** Dockerfile cho `apps/{api,web,worker}` · `docker-compose.prod.yml` + nginx + TLS ·
`docs/runbooks/` · `.env.example` + `config/env.schema.ts` · `modules/auth/token-verifier.ts` ·
`modules/phone-verification/otp-provider.ts` · CSRF (`common/guards/` + `session.service.ts` +
`packages/api-client`) · bảng phiên web (`schema.prisma` + `session.service.ts` + `auth.controller.ts`)
· `jest.config.js` + `.github/workflows/ci.yml`.

**Done khi:** `NODE_ENV=production` boot sạch trên VPS staging · đăng nhập Firebase thật + OTP
eSMS thật + email reset thật đi tới hộp thư · request ghi thiếu CSRF token → 403 · revoke một
phiên web làm phiên đó chết ở request kế · CI **đỏ** khi thiếu PostgreSQL · api test 0 đỏ · đã
diễn tập khôi phục `pg_dump`.

**Chặn bởi bên ngoài — đặt hàng NGAY ngày T0:** eSMS.vn + duyệt brandname (chậm nhất) · Firebase
service account · SMTP + SPF/DKIM · VPS + tên miền + TLS · R2 production.

Kế hoạch thực thi chi tiết ở §5.

### Đợt 2 — "Bán được gói" (ADR 0015 + 0016) · **L**

**Mục tiêu:** một gian hàng mua N chỗ ô tô + M chỗ xe máy, chuyển khoản, hệ thống tự kích hoạt —
hết hạn thì xe rời chợ mà không ai phải nhớ.

| Wave | Nội dung | Chặn ngoài |
| --- | --- | --- |
| **B0** | **Key-hoá thông báo** — `notification.service.ts` nhận `type` + `dataJson` thay `title`/`body`; sửa 4 chỗ ghi văn xuôi; FE `features/notifications` + `packages/domain/messages/` dịch từ khoá | — |
| **B1** | Migration `duration_days → duration_months` + `base_price_monthly` + reshape `limits_json` + backfill; `billing.service.ts` dùng `addCalendarMonthsVn`; sửa seed `system.ts:187`; `features/admin-plans` | — |
| **B2** | `assertVehicleQuota` tách theo `vehicle_type` + **gọi thêm ở `submit-public`** (răng thật) | — |
| **B3** | Bảng `subscription_invoices` + FK `payments.subscription_id` + màn "Gói của tôi" | — |
| **B4** | `modules/billing/sepay.controller.ts` — endpoint công khai đầu tiên **có quyền ghi tiền** | **SePay + tài khoản ngân hàng** |
| **B5** | Job hết hạn (gỡ xe khỏi chợ) + nhắc hạn 3 mốc | — |

**Done khi:** mua/gia hạn/mua thêm chỗ giữa kỳ sinh đúng hoá đơn, prorate **tròn tháng** · webhook
gửi lại 2 lần không cộng tiền 2 lần — **chứng minh bằng constraint DB, không bằng check tầng app**
(ADR 0006) · chuyển thiếu → `partially_paid` và **không** kích hoạt · qua `graceDays` xe về
`hidden` **qua `ListingsService.syncFromVehicle`** (ADR 0008 — billing không tự ghi
`public_listings`), chạy job lần hai ra 0 dòng · **không khoá tenant** (ADR 0015 điều 6).

> **Quyết định phải chốt đầu đợt — job hết hạn chạy ở đâu.** `apps/worker/src/main.ts:54-59`
> **thoát ngay** khi `FIRESTORE_ENABLED=false`, và worker không có Nest DI nên không gọi được
> `ListingsService`. Đề xuất: **`@nestjs/schedule` trong tiến trình API + `pg_try_advisory_lock`**
> (mượn `apps/worker/src/lib/advisory-lock.ts`) — giữ luật một-writer, đúng với 1 VPS, và vẫn đúng
> nếu sau này chạy 2 instance. Chốt **trước** khi viết job, không phải sau.

### Đợt 3 — "Một nguồn chữ, một nguồn nhãn" · **L**

**Mục tiêu:** mỗi chuỗi hiện cho người dùng chỉ có đúng một chỗ để sửa — **trước khi RN dev clone
màn thứ hai**.

**Phạm vi:** gỡ `label` khỏi `packages/types/src/status/*.ts` → `domain.json` là nguồn duy nhất
(70 file web + 2 chỗ backend) · `packages/validators` chuyển sang khoá message + mở rộng
`i18n:audit` quét `packages/` · i18n hoá theo cụm giá trị giảm dần:

1. `(manage)` 293 + `bookings` 170 + `customers` 176 + `booking-requests` 137 = **776** (đã có
   namespace dở dang — rẻ nhất)
2. `rental-policies` 285 + `calendar` 173 + `vehicle-maintenance` 138 + `handovers` 106 +
   `vehicle-documents` 82 + `settlement` 68 + `contracts` 48 = **900** (chưa có namespace)
3. `admin-*` ~310 — **để cuối**: admin ngồi máy tính và đọc được tiếng Việt

Kèm: `/account` A2–A5 · G-03 · phụ phí vượt cọc nối Finance · bịt vùng trắng test.

**Done khi:** `i18n:audit` (đã gồm `packages/`) về 0 ở khu đã tuyên bố · `i18n:check` parity ·
`grep "label:" packages/types/src/status` = 0.

**Nút cổ chai thật của đợt này là người dịch `en` cho ~2300 chuỗi, không phải code.**

### Song song — việc chỉ Leader làm được (bắt đầu ngày T0)

Ký eSMS.vn + brandname · Firebase service account · SMTP + SPF/DKIM · VPS + tên miền · R2 prod ·
mở đàm phán SePay + tài khoản ngân hàng (chặn B4) · chốt bảng giá gói cho B1 (giá đặt trong DB,
**không hard-code**) · chốt ngưỡng cảnh báo giấy tờ hết hạn.

---

## 5. Đợt 1 — kế hoạch thực thi

> Điều kiện tiên quyết: epic `/manage/finance` đã commit, cây làm việc sạch.

### T1 · Dựng baseline test trung thực (làm đầu tiên) — S

`apps/api/test/vehicle-documents.spec.ts`: bỏ ngày tuyệt đối (`'2026-08-20'`, comment *"còn 8
ngày"*), tính tương đối từ `new Date()` — ngưỡng hết hạn là nghiệp vụ theo *quãng*, test phải nói
cùng ngôn ngữ. `search-experience.test.tsx`: cô lập nguồn flaky (mock `IntersectionObserver` dùng
mảng cấp module), **không** `retry`.

**Verify:** `pnpm db:up` · `pnpm --filter @xeprime/api test -- vehicle-documents` ·
`pnpm --filter @xeprime/web test -- search-experience` (chạy 3 lần liên tiếp).

### T2 · Cổng CI không nói dối — S/M

- `apps/api/jest.config.js`: thêm `globalSetup` trỏ `apps/api/test/global-setup.ts` (mới) — kết
  nối PostgreSQL một lần; `REQUIRE_DB=1` mà hỏng thì **throw**. **Không đụng 51 spec**: guard
  `dbAvailable` sẵn có thành nhánh chết trong CI.
- `test/setup-test-db.ts`: thêm khẳng định "CI phải có `TEST_DATABASE_URL`" để test không ghi vào
  DB dev trên runner.
- `.github/workflows/ci.yml` (mới): service `postgres:16` → install → `db:deploy` → `db:seed`
  (`SEED_MODE=system`) → `REQUIRE_DB=1` api test · web test · typecheck · lint · `i18n:check` ·
  `openapi-contract`.

**Verify:** `docker compose stop db` rồi `REQUIRE_DB=1 pnpm --filter @xeprime/api test -- banners`
→ phải **ĐỎ**; `db:up` lại → phải **XANH**. Đó là toàn bộ nội dung task này.

### T3 · Chốt hình dạng triển khai — ADR 0019 — S, chặn T4 + T6

`docs/decisions/0019-deployment-topology.md`: một VPS · web+api **cùng origin** qua nginx (`/` →
Next, `/api` → Nest) hay hai tên miền · vị trí `apps/worker` · nơi cắm cron của Đợt 2 ·
`SESSION_COOKIE_DOMAIN` · nguồn TLS · chiến lược backup.

Đây là quyết định kiến trúc, không phải file cấu hình — **ADR 0002 ràng buộc 3 tham chiếu trực
tiếp tới nó** ("cần CSRF token khi web và API khác origin"). Làm CSRF trước rồi đổi topology sau
là làm hai lần.

**Verify:** không có lệnh. Done = T4 và T6 đọc ADR này mà không phải hỏi lại.

### T4 · Artifact triển khai + runbook — M

Dockerfile `apps/api` — nhớ 3 bẫy đã ghi ở `CLAUDE.md` §8: `@prisma/client-runtime-utils` phải
khai báo tường minh trong `prisma/package.json` · tắt `incremental` trong `nest.json` · `rootDir`
ở `tsconfig.build.json`. Dockerfile `apps/web` — bẫy `NODE_ENV` khi `next build` (script đã ghi đè
bằng `dotenv -v NODE_ENV=production`). Dockerfile `apps/worker`.
`docker-compose.prod.yml` + `nginx.conf` + TLS.
`docs/runbooks/deploy.md` + `backup-restore.md`: `migrate deploy` → `SEED_MODE=system` → health
(`@nestjs/terminus` đã có) → rollback.

> Runbook **phải nhắc lại** cảnh báo ở header `prisma/migrations/20260821000000_init/migration.sql`
> về các FK tổ hợp `(id, tenant_id)` mà Prisma muốn DROP — đừng để người trực tự đọc ra.

**Verify:** dựng đủ stack lên VPS staging, `curl https://<domain>/api/health` → 200 · `pg_dump` →
restore sang DB rỗng → API boot trên bản restore (**diễn tập thật**, không phải đọc tài liệu).

### T5 · Bật ba nhà cung cấp thật — S code, chặn bởi bên ngoài

- Nạp credential vào `.env` production; `.env.example` bổ sung `OTP_MODE`/`ESMS_*`/`SMTP_*` **kèm
  chú thích production bắt buộc** — `env.schema.ts:203-283` đã cưỡng chế, nhưng `.env.example` mới
  là chỗ người ta đọc.
- `AUTH_MODE=firebase` → `modules/auth/token-verifier.ts` đi đường Firebase Admin thật (adapter
  dựng sẵn từ Phase 0, **không sửa guard**).
- Thêm spec cho `EsmsOtpProvider` (mock `fetch`: `CodeResult ≠ '100'` phải ném lỗi) — hiện chưa có
  test nào.

**Verify:** `pnpm --filter @xeprime/api test -- phone-verification` · smoke thật trên staging (một
SĐT thật nhận SMS, một hộp thư thật nhận link reset) · thử boot với `.env` staging **thiếu**
`SMTP_HOST` → phải fail lúc boot (chứng minh hàng rào còn sống).

### T6 · CSRF — trả ADR 0002 ràng buộc 3 — S

- `session.service.ts`: phát thêm cookie `XP_CSRF` **không httpOnly** cùng lúc session cookie
  (double-submit); `cookieOptions()` đã tập trung một chỗ nên chỉ thêm hàm anh em.
- `common/guards/csrf.guard.ts` (mới), đăng ký ở `app.module.ts` **sau `ThrottlerGuard`, trước
  `AuthGuard`**. Miễn trừ **tường minh bằng decorator**, không phải bằng cách quên: `POST
  /auth/session` (chưa có cookie) · `/health` · **mọi request mang `Authorization: Bearer`**
  (native không có cookie ⇒ không có bề mặt CSRF — ADR 0017) · ghi sẵn lối miễn trừ cho webhook
  SePay của Đợt 2.
- `packages/api-client` `webAuthTransport()`: đọc cookie `XP_CSRF` → gắn header `X-XP-CSRF` cho
  `POST/PATCH/PUT/DELETE`. **Không** đụng native transport.

**Verify:** spec mới `apps/api/test/csrf.spec.ts` (thiếu header → 403 · header ≠ cookie → 403 ·
khớp → 200 · Bearer không cần → 200) · `pnpm --filter @xeprime/api test -- csrf` ·
`pnpm --filter @xeprime/web typecheck` · một luồng ghi thật trên web (tạo đơn) còn chạy.

### T7 · Phiên web: bảng + sliding renewal + revoke — M *(đường cắt của đợt)*

- `prisma/schema.prisma`: bảng phiên web soi gương `native_auth_sessions` (`user_id · sid ·
  user_agent · ip · last_used_at · revoked_at · expires_at`). Skill `database-change` trước khi chạm.
- `session.service.ts`: verify thêm bước tra `sid` (**ADR 0002 ràng buộc 1 vẫn giữ** — token không
  mang quyền/tenant) · gia hạn trượt khi còn < 1 ngày · `clear()` đánh dấu revoke.
- `auth.controller.ts`: `GET /auth/sessions`, `DELETE /auth/sessions/:id` — chính là dữ liệu mà
  `/account` A5 (Đợt 3) sẽ hiển thị.

**Verify:** `pnpm db:migrate` + `pnpm db:seed` (idempotent, chạy lại ra 0 thay đổi) · spec mới
`test/web-session.spec.ts` (revoke → request kế 401 · sliding gia hạn đúng ngưỡng · session cũ
trước migration không bị đá ra) · `pnpm contract` rồi `test -- openapi-contract`.

> Nếu đợt bị siết thời gian, **cắt T7 xuống Đợt 2** — nó là nợ ADR chứ không chặn go-live.
> Tuyệt đối **không** cắt T2 hay T6.

### Riders rẻ, gắn cuối đợt (không phụ thuộc gì)

- **G-03** — hiện lý do ẩn xe trên phiếu duyệt lại. Hôm nay lý do chỉ nằm trong `audit_logs.after`
  (`platform-vehicles.service.ts:216`) nên reviewer **duyệt mù**. `ApprovalTask.snapshot`
  (`schema.prisma:612`) đã sẵn chỗ chứa. Chuỗi mới ⇒ skill `i18n` bắt buộc vi+en.
- **Nút "Sửa chi phí"** phiếu bảo dưỡng — API xong, UI chưa gọi (`features/vehicle-maintenance`).
- **Xác minh Phase 8** — chạy `SEED_MODE=system` trên staging, đối chiếu 34 tỉnh + catalog + banner.
- **Doc drift** — `CODEMAP.md:175` + `docs/README.md` (13 → 18 ADR) · `CODEMAP.md:146` (63 → 68
  model) · `completion-roadmap.md` §5 bỏ dòng sai về `blocked_range`.

---

## 6. Thứ tự bắt buộc — làm sai là phải đập đi

1. **Commit epic `/manage/finance` TRƯỚC mọi task đụng contract.** `packages/types/openapi.json` +
   `api.generated.ts` là file **sinh tự động** đang dirty; xung đột ở đó là loại tệ nhất để gỡ tay.
2. **T1 (sửa test đỏ/flaky) TRƯỚC T2 (cổng CI).** Bật cổng khi còn màu đỏ = cả đội học cách phớt lờ nó.
3. **T3 (ADR topology) TRƯỚC T6 (CSRF).** Topology quyết định cấu hình cookie + CORS.
4. **B0 (key-hoá thông báo) TRƯỚC mọi thông báo mới và TRƯỚC push.** ADR 0016 §3 bắt buộc 3 thông
   báo nhắc hạn — viết chúng thành văn xuôi là thêm 3 dòng nợ vào đúng bảng đang muốn dọn, và sửa
   sau nghĩa là migration dữ liệu thông báo lịch sử.
5. **B1 (mô hình gói) TRƯỚC B3/B4.** `subscription_invoices.lines_json` snapshot
   `{vehicleType, slots, unitPrice}` — hình dạng đó **không tồn tại** trong mô hình phẳng. SePay
   đối soát *vào hoá đơn*; không có hoá đơn thì `bank_ref UNIQUE` (chốt chặn idempotent) không có
   chỗ đứng.
6. **B1 TRƯỚC khi bán gói cho tenant thật.** Mỗi ngày bán dưới `duration_days` là thêm một dòng
   phải backfill, và `endsAt` lệch ~5 ngày/năm so với tháng lịch — đúng lý do ADR 0015 §2 tồn tại.
7. **Chốt nơi chạy cron TRƯỚC khi viết job B5.** `apps/worker/src/main.ts:54-59` thoát sớm khi
   `FIRESTORE_ENABLED=false` — job cắm vào đó hôm nay sẽ **không bao giờ chạy, và im lặng**.
8. **T7 (bảng phiên) TRƯỚC `/account` A5.** Màn "thiết bị đang đăng nhập" render chính bảng đó.
9. **Gỡ `label` khỏi `packages/types` TRƯỚC khi RN dev clone màn.** Hôm nay 70 file trong một app.
10. **`i18n:audit` quét `packages/` TRƯỚC khi dịch `validators`.** Không thước đo thì không biết khi nào xong.

---

## 7. Cái KHÔNG nên làm ở giai đoạn này

| Không làm | Vì sao |
| --- | --- |
| **Viết script migration Firestore** | Script một-lần chỉ đúng vào ngày cutover. Viết bây giờ = nuôi nó chống lại một schema còn đang đổi (Đợt 2 đổi `plans`, thêm bảng) suốt nhiều tháng. Danh mục nền đã có sẵn trong baseline. |
| **Bật `FIRESTORE_ENABLED=true`** | Chat không chặn bán cũng không chặn thu. Bật lên = thêm nguồn sự thật thứ hai, thêm chi phí, thêm hạ tầng phải trực. Giữ Postgres-only. |
| **Màn nghiệp vụ mobile trước Đợt 3** | Clone tiếng Việt cứng + `label` hai nguồn vào app thứ hai — đúng thứ `@xeprime/domain` sinh ra để chặn. |
| **OCR provider** | 503 `OCR_NOT_CONFIGURED` là trạng thái cuối chấp nhận được. 0 tác động doanh thu. |
| **Wave 10 "bàn giao rút gọn"** | Thiết kế lại một luồng ĐANG CHẠY, và động lực thật của nó (camera native) chưa tồn tại. Làm cùng mobile, không tách. |
| **4 bảng mồ côi** | Đừng dựng tính năng để biện minh cho schema. |
| **`vehicle-obligations`, xuất CSV, bảng số liệu cho biểu đồ** | Thuộc epic finance đang dở — đã loại khỏi phạm vi. |
| **Dark theme · ⌘K · PWA · điểm tích luỹ** | Không món nào chặn bán hay thu. |
| **Sửa hàng loạt 10 hook + 19 service sang `use-url-filters`** | Roadmap §5 đã chốt: dời dần khi chạm tới. Diff lớn không liên quan là rủi ro thuần. |
| **Tự khoá tenant khi hết hạn** | ADR 0015 điều 6 cố ý không làm — đơn đang chạy có khách thật cầm xe. |

---

## 8. Verify tổng thể khi đóng Đợt 1

```bash
pnpm db:up
pnpm --filter @xeprime/api test          # 0 đỏ, và ĐỎ thật khi tắt db
pnpm --filter @xeprime/web test
pnpm --filter @xeprime/api  typecheck && pnpm --filter @xeprime/web typecheck
pnpm --filter @xeprime/api  lint        && pnpm --filter @xeprime/web lint
pnpm --filter @xeprime/web  i18n:check
pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract
```

Cộng thêm ba việc **không có lệnh nào thay thế được**:
`curl https://<staging>/api/health` → 200 · một SĐT thật nhận SMS · `pg_dump` → restore → API boot
trên bản restore.

Đóng đợt thì cập nhật `docs/completion-roadmap.md` §0 (số đo mới) + §2 (bảng phase) + §5 (gỡ dòng
sai về `blocked_range`).
