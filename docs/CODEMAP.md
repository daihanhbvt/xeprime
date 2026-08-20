# CODEMAP — cái gì nằm ở đâu

Chỉ mục để nhảy thẳng tới nơi cần, không quét mù. `navigator` agent đọc file này trước tiên. Khi thêm khái niệm cross-cutting mới, thêm một dòng vào đây.

## Nguồn sự thật (single source of truth)

| Khái niệm | File | ADR |
| --- | --- | --- |
| Status (booking/tenant/vehicle/…) — union + nhãn + màu | `packages/types/src/status/` | 0005 |
| Trạng thái nào chiếm lịch | `packages/types/src/status/booking.ts` (`BOOKING_STATUS_OCCUPYING`) | 0006 |
| Role / scope / permission key | `packages/types/src/rbac.ts` | — |
| **Quyền Vehicle 360 — miền nào lộ dữ liệu gì** (giấy tờ · bảo dưỡng/KM · bàn giao tách 3–4 mức) | `packages/types/src/rbac.ts` (khối `vehicles.documents.*`, `vehicles.maintenance.*`, `vehicles.odometer.*`, `handovers.*`) · bảng đọc nhanh ở [`04_FLEET_MANAGEMENT.md`](design-briefs/04_FLEET_MANAGEMENT.md) §4.1 | — |
| Convention response `{data,meta}` / error code | `packages/types/src/api.ts` | 0007 |
| Type FE sinh từ OpenAPI (KHÔNG sửa tay) | `packages/types/src/api.generated.ts` | 0007 |
| Yup schema dùng chung | `packages/validators/src/` | — |
| **Danh mục lọc** (hãng xe / kiểu dáng / nhiên liệu / tiện ích) — nội dung ở **DB**, không phải hằng số | bảng `catalog_items` · `apps/api/src/modules/catalog/` · FE `apps/web/src/features/catalog/` | — |
| **Banner hero trang chủ** — platform admin quản lý, public lấy tối đa 3 | bảng `marketplace_banners` · `apps/api/src/modules/banners/` · FE `apps/web/src/features/banners/` + `BannerCarousel` | — |
| **Khoảng thuê** `{pickupAt, returnAt}` — lịch đôi + tab ngày/giờ, dùng chung | `apps/web/src/components/form/RentalDateTimeRangeField.tsx` (bọc react-day-picker) | — |
| **Thuê dài hạn** — gói cố định, tháng lịch, nguyện vọng nhận xe, mốc ưu đãi cam kết | `packages/types/src/long-term.ts` (hằng + `addCalendarMonthsVn` + tier); FE hiển thị nguyện vọng ở `apps/web/src/lib/long-term.ts` | 0011 |
| **Ngày date-only** (`YYYY-MM-DD` ↔ cột `@db.Date`) | `apps/api/src/common/date-only.ts` | — |
| **Chuẩn hoá SĐT Việt Nam** (`09…`/`84…`/`+84…` → `84…`) — định danh khách trong sổ khách | `packages/types/src/phone.ts` · re-export `apps/api/src/common/phone.ts` | — |
| **Ngôn ngữ giao diện** — danh sách locale, cookie `XP_LOCALE`, bản đồ `Intl`, múi giờ | `apps/web/src/i18n/config.ts` | 0012 |
| **Chuỗi giao diện** (vi/en) — chia theo namespace tính năng | `apps/web/messages/{vi,en}/*.json`, danh sách ở `apps/web/src/i18n/namespaces.ts` | 0012 |

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
| **Việc cần làm của xe — nguồn DUY NHẤT** cho cả thẻ danh sách lẫn Hồ sơ 360 | `modules/vehicles/vehicle-alerts.service.ts` (`forVehicles` / `forVehicle` / `vehicleAlertScopeOf`) | Wave 8; scope theo TỪNG miền quyền, miền thiếu quyền không chạy truy vấn |
| **Nguồn xe & nghĩa vụ tài chính** (4 biến thể, CHECK theo biến thể ở migration) | `modules/vehicles/vehicle-source.service.ts` | Wave 4; writer duy nhất của `vehicle_source_details` |
| **File riêng tư của xe** (presign → PUT R2 → complete, signed GET ngắn hạn) | `modules/vehicles/vehicle-contracts.service.ts` (`presignFor`/`completeFor`/`downloadFor`) | lõi dùng chung cho hợp đồng nguồn, giấy tờ, chứng từ bảo dưỡng |
| **Giấy tờ xe** (phiên bản, hạn, lưu trữ, OCR review) | `modules/vehicles/documents/` (`vehicle-documents.controller.ts`, `document-metadata.ts`, `ocr-provider.ts`) | Wave 5/5.1; provider mặc định `OcrNotConfiguredProvider` → 503 `OCR_NOT_CONFIGURED` |
| **Bảo dưỡng & KM** (chu kỳ, phiếu, lịch sử KM chỉ-thêm) · **Trung tâm bảo dưỡng** toàn đội xe | `modules/vehicles/maintenance/` (`maintenance.service.ts`, `odometer.service.ts`, `maintenance-board.controller.ts`) | Wave 6; phiếu bảo dưỡng ghi `vehicle_occupancies` qua `OccupancyService` (ADR 0006) |
| **Bàn giao xe** (nháp → xác nhận, ảnh bằng chứng, KM có thẩm quyền) | `modules/bookings/handovers/` (`booking-handovers.controller.ts`, `handovers.service.ts`) | Wave 7; xác nhận trả xe là đường DUY NHẤT đẩy KM từ vận hành |
| **Hàng đợi "Thiếu KM trả"** toàn gian hàng | `modules/bookings/handovers/handover-queue.controller.ts` (`GET /handovers/missing-odometer`) | Wave 8; vị từ lọc phải TRÙNG `MaintenanceService.boardSummary` — lệch là tab và bảng nói hai số |
| **Chính sách thuê gian hàng** (cọc, bậc phí giao nhận, quá giờ, bậc giảm giá) | `modules/pricing/` (`shop-policies.controller.ts` → `shop/rental-policies`, `pricing.service.ts`) | Wave 2; kế thừa gian hàng ↔ ghi đè theo xe |
| Thông báo (in-app) | `modules/notification/` | Phase 5 |
| Đánh giá sau chuyến (+ public review) | `modules/review/` | Phase 5 |
| Chat (PG source of truth, Firestore projection sau cờ) | `modules/chat/` (+ `conversations.controller`) | ADR 0009 |
| **Sổ khách của GIAN HÀNG** (hồ sơ + ghi chú + giấy tờ riêng tư + mức rủi ro) — writer DUY NHẤT của `tenant_customers` | `modules/customers/` (`customers.service.ts` · `customer-documents.service.ts`) | S-01; `resolveWithinTx` là nơi DUY NHẤT quyết định "SĐT này là khách nào" |
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
| **Hiển thị tiền / ngày giờ / thời lượng thuê / km / gói dài hạn** — theo NGÔN NGỮ | `i18n/use-app-format.ts` (client: `useAppFormat()`) · `i18n/server-format.ts` (server: `getAppFormat()`) | một hiện thực, hai lối vào; tiền luôn VND, giờ luôn `Asia/Ho_Chi_Minh` (ADR 0012) |
| Phép tính thuần đằng sau (so sánh tiền, quy đổi múi giờ, đếm thời lượng) / classNames | `lib/money.ts` · `lib/datetime.ts` · `lib/cx.ts` | điểm extend dayjs duy nhất; **không** `dayjs.locale()`; so sánh tiền trên CHUỖI, không `Number()` (ADR 0007) |
| Nhãn status/vai trò/enum theo ngôn ngữ | `i18n/use-domain-label.ts` + namespace `Domain` | `<StatusTag meta={…} group="…">` — `meta` cấp MÀU, `group` cấp NHÃN |
| Lỗi API → câu tiếng người | `i18n/use-error-message.ts` + namespace `Errors` | ánh xạ từ **mã**, không hiện `message` tiếng Việt của backend |
| Bộ đổi ngôn ngữ (3 vị trí) | `components/i18n/LocaleSwitcher.tsx` | MarketHeader · manage Topbar · vỏ `(auth)`; Server Action ghi cookie rồi `router.refresh()` — URL không đổi |
| **Auth core dùng chung** (form email/SĐT + OTP + social, gợi ý đặt mật khẩu) | `features/auth/components/AuthPanel.tsx` | một logic, hai presentation — KHÔNG copy thành 2 bộ |
| **Đăng nhập KHÁCH** = modal ngay trên trang đang xem (`?auth=login\|register`) | `features/auth/components/{AuthModal,AuthModalProvider}.tsx` · mount ở `app/(public)/layout.tsx` | provider KHÔNG đọc `useSearchParams` (giữ static render); `AuthUrlSync` là leaf riêng |
| **Đăng nhập CỔNG QUẢN LÝ** = trang đầy đủ | `app/(manage)/manage/login/` | route CÔNG KHAI (AppShell + proxy bỏ qua) |
| "Sau khi đăng nhập đi đâu" + chống open redirect | `features/auth/post-auth-destination.ts` · `features/auth/safe-next.ts` | hàm thuần, có test; **không nơi nào mặc định `/manage`** |
| Tạo gian hàng (ShopRegistration) — nơi DUY NHẤT | `app/(manage)/manage/onboarding/` | chỉ mở bằng owner intent; `AppShell` KHÔNG tự bật |
| User không tenant ở `/manage` → màn lựa chọn | `features/shop/components/NoTenantState.tsx` | "chưa có shop" là trạng thái HỢP LỆ của khách |
| 403 khu nền tảng (khác 401) | `app/(manage)/manage/admin/layout.tsx` | không đẩy sang onboarding shop |
| Hồ sơ tài khoản KHÁCH (`/users/me`) | `features/account/` · `app/(public)/account/` | khác hồ sơ gian hàng `/manage/shop` |
| **Hồ sơ GIAN HÀNG** (`/manage/shop`): khối công khai + khối **chủ gian hàng** (nội bộ) | `features/shop/components/{ShopProfileWorkspace,ShopStatusBanner}.tsx` · BE `modules/tenants/` | Chờ duyệt = backend khoá ghi (`INVALID_STATUS_TRANSITION`). Đổi tỉnh ở đây là **dời chi nhánh mặc định** qua `BranchesService` — hai cột tỉnh trên `tenant_profiles` chỉ là bản sao |
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
| Trang chủ: Hero · gợi ý xe · địa điểm · gian hàng nổi bật · 4 bước · CTA · tab bar mobile | `features/marketplace/components/{HomeHero,VehiclePreview,FeaturedLocations,FeaturedHosts,RentalSteps,OwnerCta,MobileTabBar}.tsx` | Nội dung tĩnh ở `features/marketplace/constants.ts` |
| **Thẻ tìm kiếm trang chủ** (hero + thanh thu gọn dính header) — MỘT trạng thái, hai trình bày | `features/marketplace/search/` (`SearchExperience` → `SearchCard` + `StickySearchBar`) | Phân tầng loại xe → dịch vụ → form; sticky theo `IntersectionObserver` |
| **Cụm thu gọn cho trang khác** — quấn quanh bộ tìm kiếm sẵn có, chỉ bung khi nó cuộn khuất | `features/marketplace/search/SearchExperience.tsx` (`StickySearchOnly`) | Dùng ở `/search`; sửa ở đây LỌC TẠI CHỖ, không điều hướng |
| Dịch vụ khả dụng theo loại xe (**xe máy KHÔNG có "có tài xế"**) | `packages/types/src/status/vehicle.ts` (`vehicleServiceTypesFor`) | cùng kiểu với `vehicleFuelTypesFor` |
| **Luật "dịch vụ nào phát tham số URL nào"** — nguồn DUY NHẤT của serialize thẻ tìm kiếm | `features/marketplace/search/search-draft.ts` | 0004 · 0011 (dài hạn KHÔNG phát `pickupAt`/`returnAt`/`hourly`/`routeType`) |
| Xác thực SĐT / OTP: `PhoneVerifyControl`, `PhoneLoginForm`, `OtpCodeInput`, `use-phone-verify` | `features/phone-verification/` | Phase 4 + passwordless |
| Đặt xe khách (bottom-sheet/modal, từng bước) | `features/booking-requests/` (`RequestBookingFlow`, `RequestBookingModal`) | `guest-booking-passwordless.md` |
| Đơn thuê (list/table/detail drawer, thu tiền) · Yêu cầu thuê inbox | `features/bookings/` · inbox ở `features/booking-requests/` | Phase 4/6 |
| **Sổ khách của gian hàng** (danh sách + hồ sơ `/manage/customers/[id]`) | `features/customers/` · `app/(manage)/manage/customers/` | S-01; KHÁC `admin-customers` (giám sát nền tảng). Filter ở URL (ADR 0004) |
| Thu-Chi · Payments · Công nợ · Dashboard tài chính | `features/finance/` · `features/payments/` | Phase 6 |
| Hợp đồng thuê (xem/in `window.print`, print CSS toàn cục `[data-print-root]`) | `features/contracts/` · `app/(manage)/manage/contracts/[id]/` | Phase 6 §11.7 |
| Thông báo · Đánh giá · Chat · Thành viên · Duyệt hồ sơ · Xe · Tổng quan | `features/{notifications,reviews,chat,members,approvals,vehicles,dashboard}/` | Phase 2–6 |
| **Hồ sơ 360 của xe** (chỉ số + việc cần làm + đơn gần đây) · **Dải cảnh báo** dùng chung | `features/vehicles/components/{Vehicle360Overview,VehicleAlerts}.tsx` | Wave 8; KHÔNG suy lại cảnh báo ở client — đọc thẳng từ server |
| **Workspace sửa xe 6 tab** (`?tab=`) · wizard tạo xe 4 bước | `features/vehicles/components/{VehicleEditWorkspace,VehicleWizard,VehicleFormSections}.tsx` | tab hợp lệ ở `constants/routes.ts` (`VEHICLE_EDIT_TAB`); tab lạ rơi về `information` |
| **Việc cần làm + KM theo lô xe** (hook) · **làm mới MỌI bề mặt của xe** sau mutation miền khác | `features/vehicles/hooks/use-vehicle-alerts.ts` (`useVehicleAlerts`, `useInvalidateVehicleSurfaces`) | một hàm, một danh sách key — đừng để mỗi feature tự nhớ invalidate cái gì |
| Giá & chính sách theo xe · Nguồn xe & tài chính · Giấy tờ · Bảo dưỡng & KM (nội dung từng tab) | `features/rental-policies/` · `features/vehicles/components/VehicleSourceWorkspace.tsx` · `features/vehicle-documents/` · `features/vehicle-maintenance/` | Wave 2/4/5/6 |
| Bàn giao xe (nháp/xác nhận/ảnh) · hàng đợi "Thiếu KM trả" | `features/handovers/` (`HandoverPanel`, `HandoverDialog`, `MissingReturnKmQueue`) | Wave 7/8; hàng đợi hiện trong `/manage/maintenance` |
| Quản lý gian hàng nền tảng (list + khoá/mở khoá) | `features/admin-tenants/` · `app/(manage)/manage/admin/tenants/` | Phase 7 |
| Giám sát nền tảng: xe · đơn thuê · khách thuê | `features/{admin-vehicles,admin-bookings,admin-customers}/` · `app/(manage)/manage/admin/{vehicles,bookings,customers}/` | Phase 7 §11.1; filter ở URL (ADR 0004) |
| Ô liên hệ đã che + nút "xem đầy đủ" (dùng chung đơn/khách) | `components/data-display/MaskedContact.tsx` | bấm xem = 1 dòng audit ở BE |
| Đăng xuất/menu ở marketplace | `features/marketplace/components/MarketHeader.tsx` | dropdown `destroySession` |
| Hook: mobile breakpoint · user hiện tại · quyền · tenant scope | `hooks/{use-media-query,use-current-user,use-permissions,use-tenant-scope}.ts` | `useIsMobile` ≤640px |

## Database

| Cần gì | Ở đâu |
| --- | --- |
| Schema **52 model** (auth/tenant/vehicle/booking/finance/chat/catalog/…) | `prisma/schema.prisma` |
| Vehicle 360: `rental_policies` · `vehicle_source_details` · `vehicle_private_files` · `vehicle_documents(+_versions,+_ocr_jobs)` · `vehicle_maintenance_profiles` · `vehicle_odometer_readings` · `vehicle_maintenance_records(+_attachments)` · `vehicle_handovers(+_photos)` | `prisma/schema.prisma` (Wave 2→7) |
| Migration init (trigger + `EXCLUDE USING gist`) | `prisma/migrations/*_init/migration.sql` |
| Sổ khách: `tenant_customers` (unique `(tenant_id, normalized_phone)`) · `tenant_customer_notes` · `tenant_customer_documents`; composite FK từ `bookings`/`booking_requests`/`receipts` | `prisma/schema.prisma` (S-01) |
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

`docs/design/` — 13 tài liệu: brand, tầm nhìn, gap analysis, creative brief, mobile-first, nguyên tắc thiết kế, IA, UX guidelines, thứ tự thiết kế màn, ràng buộc triển khai, Figma master prompt, **Vehicle 360 (12 — có mục trạng thái triển khai)**, Figma Vehicle 360 prompts. Định nghĩa **sản phẩm lý tưởng**; ADR vẫn thắng khi mâu thuẫn. Bắt đầu ở `docs/design/README.md`.

## Vì sao (đọc khi cần lý do, đừng đoán)

`docs/decisions/` — **10 ADR (0001–0010)**. Mỗi quyết định kèm lý do và cái nó ghi đè. ADR thắng mọi tài liệu cũ khi mâu thuẫn.
