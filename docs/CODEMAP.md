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
| **Danh mục lọc** (hãng xe / kiểu dáng / nhiên liệu / tiện ích) — nội dung ở **DB**, không phải hằng số | bảng `catalog_items` · `apps/api/src/modules/catalog/` · FE `apps/web/src/features/catalog/` | — |
| **Banner hero trang chủ** — platform admin quản lý, public lấy tối đa 3 | bảng `marketplace_banners` · `apps/api/src/modules/banners/` · FE `apps/web/src/features/banners/` + `BannerCarousel` | — |
| **Khoảng thuê** `{pickupAt, returnAt}` — lịch đôi + tab ngày/giờ, dùng chung | `apps/web/src/components/form/RentalDateTimeRangeField.tsx` (bọc react-day-picker) | — |

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
| **Dữ liệu trang chủ**: `/public/destinations` (tỉnh + số xe), `/public/shops` (gian hàng nổi bật) | `modules/public-listings/` (`public-destinations.controller.ts`, `listDestinations`/`listShops`) | groupBy snapshot; KHÔNG hardcode tỉnh ở FE |
| Điểm đánh giá theo XE trên thẻ marketplace (`ratingsByVehicle`) | `modules/public-listings/public-listings.service.ts` | groupBy `reviews` published, 1 query/trang |
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
| **Giám sát toàn hệ thống** (xe / đơn thuê / khách thuê — không tenant-scope) | `modules/platform-admin/` (`platform-vehicles.*`, `platform-bookings.*`, `platform-customers.*`) | Phase 7 §11.1; xe: ẩn/bỏ ẩn gọi `ListingsService` (ADR 0008); đơn & khách CHỈ ĐỌC |
| **Masking PII** (`maskPhone` / `maskEmail`) — endpoint giám sát luôn trả bản đã che | `common/mask.ts` | bỏ che qua `POST .../:id/contact`, quyền `platform.customers.view_pii`, ghi audit từng lần |
| Công nợ đơn = `max(0, total − paid)` — một định nghĩa duy nhất | `common/money.ts` (`bookingDebt`) | Phase 6: không denormalize cột công nợ |
| **Audit — GHI** (`AuditService.record(entry, tx)`) · **ĐỌC** ở `platform-audit.service.ts` | `modules/audit/` | CLAUDE §6.3 |
| Upload R2 (presign) · Firebase admin | `modules/storage/` · `modules/firebase/` | ADR 0009 |
| Env validate (zod) | `config/env.schema.ts` | OTP_MODE/AUTH_MODE/OTP_MAX_ATTEMPTS… |
| Module mẫu chuẩn (controller+guard+dto) | `modules/tenants/` | — |
| Sinh OpenAPI spec | `openapi.ts` (`nest build && node dist`) | ADR 0007 |

## Frontend (`apps/web/src`)

| Cần gì | Ở đâu | Ghi chú |
| --- | --- | --- |
| Format tiền (`formatMoneyVnd`, `isZeroMoney`) / ngày giờ / classNames | `lib/money.ts` · `lib/datetime.ts` · `lib/cx.ts` | điểm extend dayjs duy nhất; so sánh tiền trên CHUỖI, không `Number()` (ADR 0007) |
| **Auth core dùng chung** (form email/SĐT + OTP + social, gợi ý đặt mật khẩu) | `features/auth/components/AuthPanel.tsx` | một logic, hai presentation — KHÔNG copy thành 2 bộ |
| **Đăng nhập KHÁCH** = modal ngay trên trang đang xem (`?auth=login\|register`) | `features/auth/components/{AuthModal,AuthModalProvider}.tsx` · mount ở `app/(public)/layout.tsx` | provider KHÔNG đọc `useSearchParams` (giữ static render); `AuthUrlSync` là leaf riêng |
| **Đăng nhập CỔNG QUẢN LÝ** = trang đầy đủ | `app/(manage)/manage/login/` | route CÔNG KHAI (AppShell + proxy bỏ qua) |
| "Sau khi đăng nhập đi đâu" + chống open redirect | `features/auth/post-auth-destination.ts` · `features/auth/safe-next.ts` | hàm thuần, có test; **không nơi nào mặc định `/manage`** |
| Tạo gian hàng (ShopRegistration) — nơi DUY NHẤT | `app/(manage)/manage/onboarding/` | chỉ mở bằng owner intent; `AppShell` KHÔNG tự bật |
| User không tenant ở `/manage` → màn lựa chọn | `features/shop/components/NoTenantState.tsx` | "chưa có shop" là trạng thái HỢP LỆ của khách |
| 403 khu nền tảng (khác 401) | `app/(manage)/manage/admin/layout.tsx` | không đẩy sang onboarding shop |
| Hồ sơ tài khoản KHÁCH (`/users/me`) | `features/account/` · `app/(public)/account/` | khác hồ sơ gian hàng `/manage/shop` |
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
| Trang chủ: Hero · gợi ý xe · địa điểm · gian hàng nổi bật · 4 bước · CTA · tab bar mobile | `features/marketplace/components/{HeroSearch,VehicleRecommendations,FeaturedLocations,FeaturedHosts,RentalSteps,OwnerCta,MobileTabBar}.tsx` | Nội dung tĩnh ở `features/marketplace/constants.ts` |
| Xác thực SĐT / OTP: `PhoneVerifyControl`, `PhoneLoginForm`, `OtpCodeInput`, `use-phone-verify` | `features/phone-verification/` | Phase 4 + passwordless |
| Đặt xe khách (bottom-sheet/modal, từng bước) | `features/booking-requests/` (`RequestBookingFlow`, `RequestBookingModal`) | `guest-booking-passwordless.md` |
| Đơn thuê (list/table/detail drawer, thu tiền) · Yêu cầu thuê inbox | `features/bookings/` · inbox ở `features/booking-requests/` | Phase 4/6 |
| Thu-Chi · Payments · Công nợ · Dashboard tài chính | `features/finance/` · `features/payments/` | Phase 6 |
| Hợp đồng thuê (xem/in `window.print`, print CSS toàn cục `[data-print-root]`) | `features/contracts/` · `app/(manage)/manage/contracts/[id]/` | Phase 6 §11.7 |
| Thông báo · Đánh giá · Chat · Thành viên · Duyệt hồ sơ · Xe · Tổng quan | `features/{notifications,reviews,chat,members,approvals,vehicles,dashboard}/` | Phase 2–6 |
| Quản lý gian hàng nền tảng (list + khoá/mở khoá) | `features/admin-tenants/` · `app/(manage)/manage/admin/tenants/` | Phase 7 |
| Giám sát nền tảng: xe · đơn thuê · khách thuê | `features/{admin-vehicles,admin-bookings,admin-customers}/` · `app/(manage)/manage/admin/{vehicles,bookings,customers}/` | Phase 7 §11.1; filter ở URL (ADR 0004) |
| Ô liên hệ đã che + nút "xem đầy đủ" (dùng chung đơn/khách) | `components/data-display/MaskedContact.tsx` | bấm xem = 1 dòng audit ở BE |
| Đăng xuất/menu ở marketplace | `features/marketplace/components/MarketHeader.tsx` | dropdown `destroySession` |
| Hook: mobile breakpoint · user hiện tại · quyền · tenant scope | `hooks/{use-media-query,use-current-user,use-permissions,use-tenant-scope}.ts` | `useIsMobile` ≤640px |

## Database

| Cần gì | Ở đâu |
| --- | --- |
| Schema **40 model** (auth/tenant/vehicle/booking/finance/chat/catalog/…) | `prisma/schema.prisma` |
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

## Định hướng sản phẩm & thiết kế

`docs/design/` — 11 tài liệu (04/08/2026): brand, tầm nhìn, gap analysis, creative brief, mobile-first, nguyên tắc thiết kế, IA, UX guidelines, thứ tự thiết kế màn, ràng buộc triển khai, Figma master prompt. Định nghĩa **sản phẩm lý tưởng**; ADR vẫn thắng khi mâu thuẫn. Bắt đầu ở `docs/design/README.md`.

## Vì sao (đọc khi cần lý do, đừng đoán)

`docs/decisions/` — **9 ADR (0001–0009)**. Mỗi quyết định kèm lý do và cái nó ghi đè. ADR thắng mọi tài liệu cũ khi mâu thuẫn.
