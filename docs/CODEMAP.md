# CODEMAP — cái gì nằm ở đâu

Chỉ mục để nhảy thẳng tới nơi cần, không quét mù. `navigator` agent đọc file này trước tiên. Khi thêm khái niệm cross-cutting mới, thêm một dòng vào đây.

## Nguồn sự thật (single source of truth)

| Khái niệm | File | ADR |
| --- | --- | --- |
| Status (booking/tenant/vehicle/…) — union + nhãn + màu | `packages/types/src/status/` | 0005 |
| Trạng thái nào chiếm lịch | `packages/types/src/status/booking.ts` (`BOOKING_STATUS_OCCUPYING`) | 0006 |
| Role / scope / permission key | `packages/types/src/rbac.ts` | — |
| Convention response `{data,meta}` / error code | `packages/types/src/api.ts` | 0007 |
| Type FE sinh từ OpenAPI (KHÔNG sửa tay) | `packages/types/src/api.generated.ts` | 0007 |
| Yup schema dùng chung | `packages/validators/src/` | — |

## Backend (`apps/api/src`)

| Cần gì | Ở đâu | Ghi chú |
| --- | --- | --- |
| Xác thực, session cookie | `modules/auth/` (`session.service.ts`, `token-verifier.ts`) | ADR 0002 |
| Guard: Auth / TenantScope / Permission | `common/guards/` | scope lấy từ membership |
| Decorator: `@CurrentUser` `@CurrentTenant` `@RequirePermissions` `@Public` | `common/decorators/index.ts` | — |
| Chuẩn hoá lỗi → `{error:{code}}` (gồm 23P01 → conflict) | `common/filters/all-exceptions.filter.ts` | ADR 0006 |
| Bọc `{data}` + Decimal→string | `common/interceptors/response.interceptor.ts` | ADR 0007 |
| DTO envelope + `@ApiProperty` | `common/dto/api-response.dto.ts` | ADR 0007 |
| Prisma client (adapter) | `prisma/prisma.service.ts` · factory ở `@xeprime/prisma` | ADR 0001 |
| **Ghi lịch xe — đường DUY NHẤT** | `modules/calendar/occupancy.service.ts` | ADR 0006 |
| Xác thực SĐT OTP (mock/eSMS) + gate booking | `modules/phone-verification/` (`otp-provider.ts`, `phone-verification.service.ts`) | Phase 4 §8; provider theo `OTP_MODE` |
| Best-effort userId cho endpoint `@Public()` | `common/optional-user.ts` | dùng ở public-booking-requests + phone-verify |
| Marketplace công khai + trang gian hàng `/public/shops/:slug` | `modules/public-listings/` (`public-listings.controller.ts`, `public-shops.controller.ts`) | ADR 0008 (đọc thẳng `vehicles`, chưa có snapshot) |
| **Đơn thuê** (create/update/transition, `createWithinTx` giữ lịch trong tx) | `modules/bookings/` | ADR 0006 |
| **Yêu cầu thuê** (public submit + approve→booking + `check-availability` preview) | `modules/booking-requests/` (`public-booking-requests.controller.ts`) | Phase 4; approve tạo booking → 23P01→409 |
| **Đăng nhập passwordless SĐT** (find-or-create theo phone, set-password) | `modules/auth/` (`resolveOrCreateUserByPhone`, `setPassword`) + `modules/phone-verification/` (purpose `login`) | ADR 0002; xem `docs/guest-booking-passwordless.md` |
| Xe + ảnh + tiện ích (submit public review) | `modules/vehicles/` | Phase 2–3 |
| Thông báo (in-app) | `modules/notification/` | Phase 5 |
| Đánh giá sau chuyến (+ public review) | `modules/review/` | Phase 5 |
| Chat (PG source of truth, Firestore projection sau cờ) | `modules/chat/` (+ `conversations.controller`) | ADR 0009 |
| **Thu-Chi** (danh mục + phiếu thu/chi + workflow duyệt + dashboard) | `modules/finance/` (`finance-categories`, `receipts`, `finance-overview`) | Phase 6 §12 |
| **Payments — writer DUY NHẤT của `booking.paid_amount`** (tx, increment/decrement) | `modules/payments/` | Phase 6; công nợ tính động = total−paid |
| **Hợp đồng** (snapshot từ booking, số HĐ cố định, idempotent theo booking) | `modules/contracts/` | Phase 6 §11.7 |
| Thành viên gian hàng (mời + đổi role) | `modules/members/` · RBAC `modules/rbac/` | — |
| Người dùng | `modules/users/` | — |
| Duyệt hồ sơ nền tảng (approval task) + **quản lý gian hàng (list + khoá/mở khoá)** | `modules/platform-admin/` (`platform-approval.service.ts`, `platform-tenants.service.ts`) | CLAUDE §6; khoá đổi `Tenant.status` (ADR 0008) |
| **Audit — GHI** (`AuditService.record(entry, tx)`) · **chưa có endpoint ĐỌC** | `modules/audit/` | CLAUDE §6.3; read endpoint là việc Phase 7 |
| Upload R2 (presign) · Firebase admin | `modules/storage/` · `modules/firebase/` | ADR 0009 |
| Env validate (zod) | `config/env.schema.ts` | OTP_MODE/AUTH_MODE/OTP_MAX_ATTEMPTS… |
| Module mẫu chuẩn (controller+guard+dto) | `modules/tenants/` | — |
| Sinh OpenAPI spec | `openapi.ts` (`nest build && node dist`) | ADR 0007 |

## Frontend (`apps/web/src`)

| Cần gì | Ở đâu | Ghi chú |
| --- | --- | --- |
| Format tiền / ngày giờ / classNames | `lib/money.ts` · `lib/datetime.ts` · `lib/cx.ts` | điểm extend dayjs duy nhất |
| Gọi API (`credentials:'include'`, bóc `data`) | `services/api-client.ts` | ADR 0002 |
| Query keys | `services/query-keys.ts` | — |
| Redux store + slices (chỉ client UI state) | `store/` | ADR 0004 |
| Filter/paging/range → **URL** | hook filter của feature (vd `features/calendar/hooks/use-calendar-filters.ts`) | ADR 0004 |
| Badge trạng thái (đọc meta từ types) | `components/data-display/StatusTag.tsx` | 0005 |
| Menu theo quyền · route constant | `constants/nav.ts` · `constants/routes.ts` | — |
| Provider (AntD/Redux/Query) | `app/providers.tsx` | — |
| Design token · CSS Modules · token.css↔theme.ts | `styles/theme.ts` · `styles/tokens.css` | ADR 0003 |
| Lịch (resource timeline) | `features/calendar/` | ADR 0006 |
| Marketplace + trang gian hàng `/shops/[slug]` (thẻ xe, chi tiết, hồ sơ shop) | `features/marketplace/` · `app/(public)/shops/[slug]/` | ADR 0008 |
| Xác thực SĐT / OTP: `PhoneVerifyControl`, `PhoneLoginForm`, `OtpCodeInput`, `use-phone-verify` | `features/phone-verification/` | Phase 4 + passwordless |
| Đặt xe khách (bottom-sheet/modal, từng bước) | `features/booking-requests/` (`RequestBookingFlow`, `RequestBookingModal`) | `guest-booking-passwordless.md` |
| Đơn thuê (list/table/detail drawer, thu tiền) · Yêu cầu thuê inbox | `features/bookings/` · inbox ở `features/booking-requests/` | Phase 4/6 |
| Thu-Chi · Payments · Công nợ · Dashboard tài chính | `features/finance/` · `features/payments/` | Phase 6 |
| Hợp đồng thuê (xem/in `window.print`, print CSS toàn cục `[data-print-root]`) | `features/contracts/` · `app/(manage)/manage/contracts/[id]/` | Phase 6 §11.7 |
| Thông báo · Đánh giá · Chat · Thành viên · Duyệt hồ sơ · Xe · Tổng quan | `features/{notifications,reviews,chat,members,approvals,vehicles,dashboard}/` | Phase 2–6 |
| Quản lý gian hàng nền tảng (list + khoá/mở khoá) | `features/admin-tenants/` · `app/(manage)/manage/admin/tenants/` | Phase 7 |
| Đăng xuất/menu ở marketplace | `features/marketplace/components/MarketHeader.tsx` | dropdown `destroySession` |
| Hook: mobile breakpoint · user hiện tại · quyền · tenant scope | `hooks/{use-media-query,use-current-user,use-permissions,use-tenant-scope}.ts` | `useIsMobile` ≤640px |

## Database

| Cần gì | Ở đâu |
| --- | --- |
| Schema **35 model** (auth/tenant/vehicle/booking/finance/chat/…) | `prisma/schema.prisma` |
| Migration init (trigger + `EXCLUDE USING gist`) | `prisma/migrations/*_init/migration.sql` |
| Migration viết tay từng phase (CHECK/constraint/partial index) | `prisma/migrations/<ts>_<name>/migration.sql` (booking_requests, finance, payments, phone_login…) |
| Seed (idempotent, 3 scope + danh mục finance) | `prisma/src/seed.ts` |
| Cấu hình CLI Prisma 7 | `prisma/prisma.config.ts` |

## Tham chiếu nghiệp vụ (đọc để hiểu "cái gì đang chạy", KHÔNG copy pattern)

| Cần gì | Ở đâu |
| --- | --- |
| Host Portal cũ (dashboard/xe/đơn/khách/lịch/tài chính…) | `../Firebase-code/Vietrent/js/app.js` |
| Marketplace khách thuê cũ | `../Firebase-code/Vietrent/market/index.html` |
| Backend cũ (Cloud Functions: OTP, sync listing, notify) | `../Firebase-code/xeprime-functions/functions/index.js` |

## Vì sao (đọc khi cần lý do, đừng đoán)

`docs/decisions/` — **9 ADR (0001–0009)**. Mỗi quyết định kèm lý do và cái nó ghi đè. ADR thắng mọi tài liệu cũ khi mâu thuẫn.
