# XePrime — Repo dự án

Ngày tạo: 22/07/2026

## 0. Đọc file này trước khi làm bất cứ việc gì

Đây là **repo dự án XePrime** (workspace = thư mục này). Agent không có lịch sử chat trước đó — toàn bộ context nằm ở `docs/` và file này. Source cũ để tham chiếu nghiệp vụ nằm **ngoài** workspace tại `../Firebase-code` (chỉ đọc, không sửa).

## 1. Bản đồ thư mục

| Thư mục | Vai trò | Được sửa? |
| --- | --- | --- |
| `.` (repo này) | Source mới Next.js + NestJS + PostgreSQL + Prisma. Toàn bộ code mới viết ở đây. | ✅ Có |
| `docs/` | Toàn bộ tài liệu phân tích/thiết kế. Đã chuyển từ Firebase-code sang. | ✅ Có |
| `../Firebase-code/` | Source đang chạy production (Vietrent HTML/JS thuần + xeprime-functions Cloud Functions). **Chỉ dùng làm tham chiếu nghiệp vụ**, nằm ngoài workspace. | ❌ KHÔNG sửa |

Git: **thư mục này là repo** (remote `https://github.com/daihanhbvt/xeprime.git`, nhánh `main`) — mở thẳng nó làm workspace. `../Firebase-code` (gồm `Vietrent/` + `xeprime-functions/`) là các repo riêng khác để tham chiếu.

## 2. Tài liệu — đọc theo thứ tự

Nguồn sống (đọc trước, luôn đúng hiện tại):
1. `docs/decisions/` — **9 ADR (0001–0009), thắng mọi tài liệu khác khi mâu thuẫn**
2. `docs/CODEMAP.md` — chỉ mục "cái gì nằm ở đâu"
3. `docs/completion-roadmap.md` — **"đang ở đâu / làm gì tiếp"** (tiến độ thực tế + milestone). Đóng xong phase thì cập nhật file này.
4. File này (CLAUDE.md)

Tham chiếu nghiệp vụ (viết 22/07/2026, **không sửa lại**, phần công nghệ đã bị ADR ghi đè — giá trị ở phần domain):
5. `docs/xeprime_screen_spec_by_role_before_db.md` — màn hình/chức năng theo role
6. `docs/xeprime_overall_user_flow_next_node.md` — user flow
7. `docs/xeprime_database_design.md` — thiết kế đầy đủ các bảng (nhiều bảng làm phase sau)
8. `docs/xeprime_build_plan_nextjs_nestjs_prod.md` — lộ trình 9 phase
9. `docs/xeprime_fe_base_stack_calendar.md` — màn lịch (phase 4)

> Plan mode ghi vào `docs/plans/` (cấu hình ở `.claude/settings.json`) — plan đi theo repo, không rơi ra ngoài.
> Dọn docs 23/07/2026: đã xóa `_archive_`, mọi `.docx`, và 3 doc "prompt để build base" (base đã xong). Chi tiết ở `docs/README.md`.

### ⚠️ ADR thắng tài liệu cũ

Tài liệu tham chiếu (5–9) có vài quyết định kỹ thuật đã bị ghi đè, và 3 chỗ tự mâu thuẫn nhau.

`docs/decisions/` là các ADR ghi quyết định kèm lý do. **Khi ADR mâu thuẫn với tài liệu cũ, ADR thắng.**

| ADR | Ghi đè gì |
| --- | --- |
| [0001](docs/decisions/0001-database-postgresql.md) | PostgreSQL 16, không phải MySQL 8 |
| [0002](docs/decisions/0002-auth-session-cookie.md) | httpOnly session cookie (docs không nói gì về session) |
| [0003](docs/decisions/0003-styling-css-modules.md) | CSS Modules, bỏ styled-components |
| [0004](docs/decisions/0004-client-state.md) | Giữ Redux; filter lịch/marketplace đẩy ra URL searchParams |
| [0005](docs/decisions/0005-status-enums.md) | **Bộ status chốt** — giải mâu thuẫn giữa 3 tài liệu |
| [0006](docs/decisions/0006-booking-concurrency.md) | Chống trùng lịch bằng `EXCLUDE USING gist` |
| [0007](docs/decisions/0007-api-type-contract.md) | Type FE sinh từ OpenAPI, không viết tay |
| [0008](docs/decisions/0008-public-listings-sync.md) | Quy tắc đồng bộ `public_listings` |
| [0009](docs/decisions/0009-chat-firestore-projection.md) | Chat: Firestore projection realtime, **PostgreSQL là source of truth**, outbox/retry, R2 |
| [0011](docs/decisions/0011-long-term-fixed-packages.md) | Thuê dài hạn = **gói cố định theo THÁNG LỊCH** (1/2/3/6/9/12), khách chỉ nêu nguyện vọng ngày nhận |

### Công cụ Claude (`.claude/`)

Kỷ luật code đã đóng gói thành skill/agent — **dùng chúng, đừng tự nhớ luật rời rạc**.

| Loại | Tên | Khi nào |
| --- | --- | --- |
| skill | `frontend-feature` | Trước khi viết bất cứ thứ gì ở `apps/web` |
| skill | `backend-endpoint` | Trước khi thêm/sửa endpoint/module/DTO ở `apps/api` |
| skill | `database-change` | Trước khi đụng `schema.prisma`/migration/seed |
| skill | `shared-code` | Khi thấy logic/giá trị lặp lần 2, hoặc code cross-tuyến web↔api |
| skill | `verify-changes` | Trước khi chạy build/lint/test/typecheck — chỉ xác minh phần vừa sửa, không quét cả workspace |
| agent | `navigator` (haiku) | Định vị file/symbol cần đọc mà không quét cả file — tiết kiệm token |
| agent | `reviewer` (opus) | Review diff theo chuẩn senior trước khi commit |

Skill tự kích hoạt theo mô tả; nếu quên thì gọi tay. `navigator` đọc `docs/CODEMAP.md` trước tiên.

**Mức chất lượng:** làm ra **product hoàn thiện**, không phải làm-cho-xong-task. List lớn → phân trang/filter/sort server-side + index (thiếu thư viện thì cài); đủ trạng thái loading/rỗng/lỗi; xử lý edge case; thao tác fail-một-phần bọc transaction. Không để lại bug đi vá sau. Token là thứ yếu so với đúng và đủ.

## 3. Kiến trúc đã chốt — không được tự đổi

| Hạng mục | Quyết định |
| --- | --- |
| Repo | Monorepo pnpm workspace: `apps/web`, `apps/api`, `apps/worker`, `packages/{types,validators,config,ui}`, `prisma`, `docs` |
| Frontend | Next.js App Router + TS strict, route groups `(public)` `(auth)` `(manage)`, Server Components mặc định |
| UI | Ant Design + `@ant-design/nextjs-registry`. Style riêng dùng **CSS Modules + AntD token** — ADR 0003 |
| Form | React Hook Form + Yup + `@hookform/resolvers` |
| State | Redux Toolkit = UI/client state · TanStack Query = server data/cache · **URL searchParams = filter/paging** — ADR 0004 |
| Calendar | Custom resource-timeline scheduler: `@tanstack/react-virtual` + `@dnd-kit`, qua abstraction `CalendarScheduler` |
| Backend | NestJS modular monolith (KHÔNG microservices), Express adapter |
| DB | **PostgreSQL 16** + Prisma — ADR 0001. ID `String @id @db.Char(26)` (ULID), snake_case `@@map`/`@map`, tiền `Decimal @db.Decimal(14,2)`, thời gian `@db.Timestamptz(3)`, JSON dùng `jsonb`, status là String (union type ở `packages/types` — ADR 0005) |
| Chống trùng lịch | Bảng `vehicle_occupancies` + `EXCLUDE USING gist` — ADR 0006. **Không** dựa vào check ở tầng app |
| Auth | Firebase Auth chỉ là provider login → NestJS verify ID token → phát **httpOnly session cookie** — ADR 0002 |
| API type | FE import từ `packages/types/src/api.generated.ts` sinh bằng `openapi-typescript` — ADR 0007 |
| RBAC | Role/permission lưu DB, **guard backend là nguồn bảo vệ chính** |
| Thuê dài hạn | **Gói cố định** 1/2/3/6/9/12 tháng; ngày trả = ngày nhận + N **tháng lịch** (server tính, client không gửi); khách nêu nguyện vọng ngày nhận, gian hàng chốt lịch khi duyệt; ưu đãi cam kết thời hạn theo THÁNG, không cộng dồn — ADR 0011 |
| Chat | **PostgreSQL là source of truth** (mọi tin/thành viên/đính kèm/đã đọc); Firestore chỉ là projection realtime ~30–50 tin gần nhất; đồng bộ outbox/retry; attachment ở Cloudflare R2 — ADR 0009 |
| Deploy MVP | 1 VPS 4GB RAM / 40GB SSD |

## 4. Quyết định package (chốt trong session 22/07/2026)

Tài liệu để mở một số chỗ, đã chốt như sau:

| Vấn đề | Chốt | Lý do |
| --- | --- | --- |
| Validation backend | `class-validator` + `class-transformer` | `@nestjs/swagger` sinh OpenAPI tự động từ decorator. Zod phải thêm lib bắc cầu và Swagger mất chính xác |
| Validation env | `zod` | Type inference tốt hơn joi |
| Validation frontend | `yup` | Bắt buộc theo tài liệu |
| Test runner | Jest cho `apps/api` · Vitest cho `apps/web` | Default của từng hệ sinh thái; Vitest + decorator NestJS là nguồn lỗi không đáng |
| HTTP adapter | Express (không Fastify) | `firebase-admin` + middleware ecosystem hợp Express hơn |
| Icons | Chỉ `@ant-design/icons` | Bỏ `lucide-react` — 2 bộ icon là nợ kỹ thuật |
| Styling | CSS Modules | AntD v5 đã có CSS-in-JS riêng; thêm styled-components là 2 runtime chồng nhau và ép `'use client'` khắp nơi — ADR 0003 |

Bổ sung ngoài tài liệu, đã thống nhất đưa vào base:
`turbo` (task runner monorepo) · `@nestjs/terminus` (health ping DB) · `@nestjs/throttler` + `helmet` (rate limit/CORS theo production checklist) · `nestjs-pino` + `pino-http` (log có cấu trúc + request-id) · `ulid` (sinh ID char(26)) · `husky` + `lint-staged` · `@tanstack/react-query-devtools` · `cookie-parser` (ADR 0002) · `openapi-typescript` (ADR 0007) · `@testcontainers/postgresql` (test đụng lịch cần Postgres thật — ADR 0006).

## 5. Cấm tuyệt đối

- ❌ Sửa source `../Firebase-code/`
- ❌ `redux-saga` ở MVP
- ❌ FullCalendar Premium / Bryntum / bất kỳ thư viện calendar tính phí nào
- ❌ `react-big-calendar` cho màn lịch chính
- ❌ `styled-components` — dùng CSS Modules + AntD token (ADR 0003)
- ❌ Inline style — ngoại lệ duy nhất: CSS custom property cho giá trị chỉ biết lúc runtime (vị trí event bar trên lịch)
- ❌ Hard code role/status/permission/text nghiệp vụ trong component — dùng `packages/types` + `constants/`
- ❌ String literal trần cho status — luôn `BOOKING_STATUS.ACTIVE`, không bao giờ `'active'` (ADR 0005)
- ❌ API tenant-sensitive nhận `tenant_id` từ body/query — backend lấy từ membership/scope
- ❌ Nhét role/permission/tenant_id vào session JWT — quyền luôn đọc từ DB mỗi request (ADR 0002)
- ❌ Client tự set `approved_public` / `tenant.status` / quyết định lịch trống
- ❌ Module khác `ListingsService` ghi vào `public_listings` (ADR 0008)
- ❌ Module khác `OccupancyService` ghi vào `vehicle_occupancies` (ADR 0006)
- ❌ Dùng `number` cho tiền — `Decimal` ở BE, string ở JSON (ADR 0007)
- ❌ Nhân `số tháng × 30` để suy lịch hay giá gói thuê dài hạn — dùng `addCalendarMonthsVn` / `longTermPackages` (ADR 0011)
- ❌ Trưng chênh lệch giá dài hạn ↔ giá ngày như một khuyến mãi, hay hiện `discountPercent` (của TỰ LÁI) khi khách đang chọn dài hạn (ADR 0011)
- ❌ Tạo microservices sớm
- ❌ `any` tràn lan — nếu bắt buộc phải có comment lý do

## 6. Ba lằn ranh bảo mật xuyên suốt mọi phase

1. **Tenant scope**: backend luôn lấy `tenant_id` từ membership/session, không tin client.
2. **Approval**: public xe / active shop phải đi qua `approval_tasks`; chống trùng lịch bằng constraint DB (ADR 0006), **không** bằng check ở tầng app — `POST /calendar/check-conflict` chỉ là preview cho UX.
3. **Audit**: mọi action admin/platform quan trọng ghi `audit_logs`.

## 7. Đổi tên role so với source cũ

| Firebase cũ | Mới |
| --- | --- |
| `owner` | `shop_owner` |
| `admin` (trong tenant) | `shop_manager` |
| `staff` | `shop_staff` |
| `viewer` | `shop_viewer` |
| super admin whitelist UID | `platform_admin` / `platform_staff` (+ `reviewer`/`support`/`finance_admin` mở sau) |

## 8. Ghi chú kỹ thuật từ Phase 0 (base)

> **Trạng thái hiện tại (đang ở đâu / làm gì tiếp) → `docs/completion-roadmap.md`.**
> Dưới đây là các ghi chú kỹ thuật base **còn giá trị lâu dài** (bẫy version/build) — giữ để không vấp lại.

| Vấn đề | Cách giải |
| --- | --- |
| **Version thực tế** | Next 16.2 · React 19.2 · NestJS 11.1 · Prisma 7.9 · AntD 6.5 · TS 5.9. **KHÔNG dùng TS 7** — `typescript-eslint` peer `<6.1.0`, TS 7 làm chết lint |
| **Prisma 7 bỏ `url` trong schema** | Thêm `prisma/prisma.config.ts` + driver adapter `@prisma/adapter-pg`. `createPrismaClient()` ở `@xeprime/prisma` là factory chung cho service/seed/test. Cần `previewFeatures=["postgresqlExtensions"]` + `experimental.extensions` |
| **`@prisma/client-runtime-utils`** | Phải khai báo tường minh trong `prisma/package.json` deps, nếu không bản compiled `node dist` báo MODULE_NOT_FOUND |
| **rootDir trong tsconfig chung** | `rootDir`/`outDir` phải nằm ở `tsconfig.build.json` của từng package, KHÔNG ở config `extends` (TS resolve tương đối với file khai báo) |
| **`nest build` chỉ emit 1 file** | Tắt `incremental` trong `nest.json` (deleteOutDir không xoá `.tsbuildinfo`) |
| **tsx/esbuild không emit decorator metadata** | `openapi.ts` chạy từ bản compiled (`nest build && node dist/openapi.js`) + `NestFactory.create(AppModule, { preview: true })` để né DB, kèm `dotenv` vì ConfigModule validate env lúc load |
| **pnpm 11 chặn build script** | `pnpm-workspace.yaml`: `onlyBuiltDependencies` + `verifyDepsBeforeRun: false` (không thì `pnpm exec` tự chạy lại install và fail) |
| Docker daemon | Bật rồi tắt bất thường; nếu `up` treo là đang kéo image lần đầu. Gặp network/container mồ côi thì `docker compose down --remove-orphans` + xoá network trùng tên |

Base Phase 0 (đã commit `0a76adf`): 11 bảng lõi + `vehicle_occupancies` (schema + constraint từ Phase 0, logic đầy đủ Phase 4 — ADR 0006); seed 3 scope (platform admin / shop owner / customer) idempotent; API/pages tối thiểu. Chi tiết tiến độ các phase sau: `docs/completion-roadmap.md`.

## 9. Convention API

- Success: `{ "data": ..., "meta": ... }`
- Error: `{ "error": { "code": "...", "message": "...", "details": ... } }`
- Pagination: `page`, `limit`, `total`, `hasNext`
- Date/time: lưu **UTC** (`timestamptz`), hiển thị **`Asia/Ho_Chi_Minh`** ở frontend (tài liệu cũ ghi `Asia/Bangkok` — cùng UTC+7, không DST, nhưng dùng đúng tên vùng Việt Nam)
- Tiền: `Decimal` ở BE → **string** trong JSON, không bao giờ `number` (ADR 0007)

## 10. Ghi chú môi trường máy dev

| Thứ | Trạng thái |
| --- | --- |
| Node | v24.18.0 |
| pnpm | 11.1.3 (qua corepack) |
| Docker | CLI + daemon 20.10.13 — **đã chạy** (xác nhận 22/07/2026, `docker version` trả cả client lẫn server) |
| `psql` client | Chưa cài (không bắt buộc nếu dùng Docker: `docker compose exec db psql`) |
| Firebase Admin credential | **Chưa xác nhận có service account JSON**. Nếu chưa có → `AuthGuard` dùng mock token local + adapter để cắm Firebase Admin sau, không phải sửa guard |

## 11. Lộ trình 9 phase

| Phase | Nội dung |
| --- | --- |
| 1 | Auth / RBAC / Tenant / Layout |
| 2 | Shop approval + Vehicle core |
| 3 | Public listing + Marketplace |
| 4 | Booking request + Booking core + Calendar |
| 5 | Notification + Review ✅ · Chat (ADR 0009 — Firestore projection, đợt sau) |
| 6 | Finance / Thu chi / Công nợ |
| 7 | Admin platform đầy đủ |
| 8 | Migration từ Firestore + chạy song song |
| 9 | QA / hardening / production |

Tiến độ thực tế từng phase (đang làm tới đâu): `docs/completion-roadmap.md`.
Chi tiết nghiệp vụ từng phase: `docs/xeprime_build_plan_nextjs_nestjs_prod.md`.
Kỷ luật code theo loại việc: `.claude/skills/` (xem bảng mục 2).
