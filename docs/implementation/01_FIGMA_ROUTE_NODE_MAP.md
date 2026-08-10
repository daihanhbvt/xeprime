# 01 — FIGMA ROUTE ↔ NODE MAP

> Ngày lập: 06/08/2026 · Wave 0B. Nguồn: [FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md) (độ sâu 1) + cây route thực tế (`find apps/web/src/app -name page.tsx` → **37 file**).
> Link node: `https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=<ID, ":" → "-">`

## Cách đọc

**Mapping confidence**

| Mức | Nghĩa |
| --- | --- |
| **CAO** | Tên frame khớp trực tiếp route/nghiệp vụ, section owner rõ, không dính mục A nào |
| **TRUNG BÌNH** | Suy được từ section + tên, nhưng chưa inspect chi tiết hoặc thiếu một viewport |
| **THẤP** | Có node nhưng ranh giới không chắc (dính A1/A2/A6/A7) |
| **KHÔNG CÓ** | Không tìm thấy frame Figma nào cho route này |

**Detailed inspection required** — có phải inspect chi tiết frame trước khi code không (mặc định: **Có**, vì Wave 0A mới ở độ sâu 1; ghi "Có + <việc thêm>" khi cần thêm gì).

⚠️ **Sửa lỗi phân loại catalog**: 18 frame `audit-log-*` / `audit-detail-*` / `mobile-audit-*` của section 10 bị catalog gán `AUDIT`/`NO` do heuristic theo tên. Chúng là **màn production** của `/manage/admin/audit` (R35). Xem [00_IMPLEMENTATION_OVERVIEW.md §9.2](00_IMPLEMENTATION_OVERVIEW.md).

---

## A. Bảng tổng — 37 route

| # | Route | Context | Module | Page file | Feature chính | Section Figma | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | `/` | customer | marketplace | [(public)/page.tsx](<../../apps/web/src/app/(public)/page.tsx>) | `marketplace` | 02 | CAO |
| R02 | `/listings/[id]` | customer | marketplace | [(public)/listings/[id]/page.tsx](<../../apps/web/src/app/(public)/listings/[id]/page.tsx>) | `marketplace` | 02 (+06) | CAO |
| R03 | `/shops/[slug]` | customer | marketplace | [(public)/shops/[slug]/page.tsx](<../../apps/web/src/app/(public)/shops/[slug]/page.tsx>) | `marketplace` | 02 | CAO |
| R04 | `/account` | customer | account | [(public)/account/page.tsx](<../../apps/web/src/app/(public)/account/page.tsx>) | `account` | 03 | CAO |
| R05 | `/trips` | customer | reviews | [(public)/trips/page.tsx](<../../apps/web/src/app/(public)/trips/page.tsx>) | `reviews` | 03 | CAO |
| R06 | `/chat` | customer | chat | [(public)/chat/page.tsx](<../../apps/web/src/app/(public)/chat/page.tsx>) | `chat` | 03 | CAO |
| R07 | `/forgot-password` | customer | auth | [(auth)/forgot-password/page.tsx](<../../apps/web/src/app/(auth)/forgot-password/page.tsx>) | — | — | **KHÔNG CÓ** |
| R08 | `/reset-password` | customer | auth | [(auth)/reset-password/page.tsx](<../../apps/web/src/app/(auth)/reset-password/page.tsx>) | — | — | **KHÔNG CÓ** |
| R09 | `/manage/login` | shop+platform | auth | [manage/login/page.tsx](<../../apps/web/src/app/(manage)/manage/login/page.tsx>) | `auth` | 04 | CAO |
| R10 | `/manage/onboarding` | shop | onboarding | [manage/onboarding/page.tsx](<../../apps/web/src/app/(manage)/manage/onboarding/page.tsx>) | `shop` | 04 | CAO |
| R11 | `/manage` (shop) | shop | dashboard | [manage/page.tsx](<../../apps/web/src/app/(manage)/manage/page.tsx>) | `dashboard` | — | **KHÔNG CÓ** |
| R12 | `/manage` (platform) | platform | dashboard | ↑ cùng file | `platform-dashboard` | 09 | CAO |
| R13 | `/manage` (no-tenant) | shop | onboarding | ↑ cùng file → `NoTenantState` | `shop` | 04 + 01 | CAO |
| R14 | `/manage/vehicles` | shop | fleet | [manage/vehicles/page.tsx](<../../apps/web/src/app/(manage)/manage/vehicles/page.tsx>) | `vehicles` | 05 | CAO |
| R15 | `/manage/vehicles/new` | shop | fleet | [manage/vehicles/new/page.tsx](<../../apps/web/src/app/(manage)/manage/vehicles/new/page.tsx>) | `vehicles` | 05 | CAO |
| R16 | `/manage/vehicles/[id]` | shop | fleet | [manage/vehicles/[id]/page.tsx](<../../apps/web/src/app/(manage)/manage/vehicles/[id]/page.tsx>) | `vehicles` | 05 | CAO |
| R17 | `/manage/vehicles/[id]/edit` | shop | fleet | [manage/vehicles/[id]/edit/page.tsx](<../../apps/web/src/app/(manage)/manage/vehicles/[id]/edit/page.tsx>) | `vehicles` | 05 | CAO |
| R18 | `/manage/bookings` | shop | rental | [manage/bookings/page.tsx](<../../apps/web/src/app/(manage)/manage/bookings/page.tsx>) | `bookings` | 06 | CAO |
| R19 | `/manage/booking-requests` | shop | rental | [manage/booking-requests/page.tsx](<../../apps/web/src/app/(manage)/manage/booking-requests/page.tsx>) | `booking-requests` | 06 | CAO |
| R20 | `/manage/calendar` | shop | rental | [manage/calendar/page.tsx](<../../apps/web/src/app/(manage)/manage/calendar/page.tsx>) | `calendar` | 06 | CAO |
| R21 | `/manage/contracts/[id]` | shop | rental | [manage/contracts/[id]/page.tsx](<../../apps/web/src/app/(manage)/manage/contracts/[id]/page.tsx>) | `contracts` | 06 | CAO |
| R22 | `/manage/finance` | shop | finance | [manage/finance/page.tsx](<../../apps/web/src/app/(manage)/manage/finance/page.tsx>) | `finance` | 07 | CAO |
| R23 | `/manage/receipts` | shop | finance | [manage/receipts/page.tsx](<../../apps/web/src/app/(manage)/manage/receipts/page.tsx>) | `finance` | 07 | CAO |
| R24 | `/manage/debts` | shop | finance | [manage/debts/page.tsx](<../../apps/web/src/app/(manage)/manage/debts/page.tsx>) | `finance` + `payments` | 07 | CAO |
| R25 | `/manage/shop` | shop | settings | [manage/shop/page.tsx](<../../apps/web/src/app/(manage)/manage/shop/page.tsx>) | `shop` | 04 | CAO |
| R26 | `/manage/members` | shop | org | [manage/members/page.tsx](<../../apps/web/src/app/(manage)/manage/members/page.tsx>) | `members` | 08 | CAO |
| R27 | `/manage/chat` | shop | org | [manage/chat/page.tsx](<../../apps/web/src/app/(manage)/manage/chat/page.tsx>) | `chat` | 08 | CAO |
| R28 | `/manage/customers` | shop | org | [manage/customers/page.tsx](<../../apps/web/src/app/(manage)/manage/customers/page.tsx>) | — *(placeholder)* | 08 | CAO |
| R29 | `/manage/pickup-areas` | shop | settings | [manage/pickup-areas/page.tsx](<../../apps/web/src/app/(manage)/manage/pickup-areas/page.tsx>) | — *(placeholder)* | 04 | CAO |
| R30 | `/manage/drivers` | shop | fleet | [manage/drivers/page.tsx](<../../apps/web/src/app/(manage)/manage/drivers/page.tsx>) | — *(placeholder)* | 05 | CAO |
| R31 | `/manage/trash` | shop | fleet | [manage/trash/page.tsx](<../../apps/web/src/app/(manage)/manage/trash/page.tsx>) | — *(placeholder)* | 05 | CAO |
| R32 | `/manage/admin` | platform | governance | [manage/admin/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/page.tsx>) | `approvals` | 09 | CAO |
| R33 | `/manage/admin/tenants` | platform | governance | [manage/admin/tenants/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/tenants/page.tsx>) | `admin-tenants` | 09 (+11) | CAO |
| R34 | `/manage/admin/vehicles` | platform | governance | [manage/admin/vehicles/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/vehicles/page.tsx>) | `admin-vehicles` | 09 | CAO |
| R35 | `/manage/admin/bookings` | platform | privacy | [manage/admin/bookings/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/bookings/page.tsx>) | `admin-bookings` | 10 | CAO |
| R36 | `/manage/admin/customers` | platform | privacy | [manage/admin/customers/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/customers/page.tsx>) | `admin-customers` | 10 | CAO |
| R37 | `/manage/admin/audit` | platform | privacy | [manage/admin/audit/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/audit/page.tsx>) | `admin-audit` | 10 | CAO ⚠️ |
| R38 | `/manage/admin/staff` | platform | billing | [manage/admin/staff/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/staff/page.tsx>) | `admin-staff` | 11 | **THẤP** (A2) |
| R39 | `/manage/admin/plans` | platform | billing | [manage/admin/plans/page.tsx](<../../apps/web/src/app/(manage)/manage/admin/plans/page.tsx>) | `admin-plans` | 11 | CAO |

> R11/R12/R13 là **ba trải nghiệm của cùng một `page.tsx`** (`/manage`) — brief 11 §3.1 gọi là "three-way overload", cố ý. Tổng file page = 37; tổng hàng = 39 vì tách 3 trải nghiệm đó.

**Route trong Figma nhưng KHÔNG có trong code:** `/search` (cụm "Marketplace Results", `18:567` + 4 màn state). Xem [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A6 → quyết định **P4** ở [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md). Tạm map các frame đó vào R01 (kết quả render ngay trên `/`, ADR 0004) và đánh dấu "chờ quyết định".

**Route trong code nhưng KHÔNG có trong Figma:** `/forgot-password`, `/reset-password` (R07/R08), `/manage` shop dashboard (R11). Xem §C.

---

## B. Chi tiết từng route

Ký hiệu: 🖥 desktop · ▭ tablet · 📱 mobile · ◐ state · 🔐 permission-denied.

### R01 — `/` Marketplace Home
- **Feature**: [features/marketplace/](../../apps/web/src/features/marketplace/) — `HeroSearch`, `FilterPanel`, `VehicleCard`, `FeaturedHosts`, `FeaturedLocations`, `RentalSteps`, `OwnerCta`, `MarketHeader/Footer`, `MobileTabBar`
- **Flow-summary**: `18:1663` Section Header · nhãn `23:3378`–`23:3385` (A–H)
- 🖥 `18:4` (home populated, 1440×2955) · `18:1047` (filter panel open) · `18:567` (results filtered — thuộc `/search` chưa tồn tại, A6)
- ▭ `23:7` (home) · `23:259` (results)
- 📱 `23:896` (home) · `23:1053` (search expanded) · `23:1100` (results filtered) · `23:1206` (filter sheet) · `23:2086` (auth sheet)
- ◐ `18:1298` loading · `18:1449` filtered-empty · `18:1510` API error · `18:1402` no-inventory *(catalog gán AUDIT — cần inspect lại)* · 📱 `23:1294` / `23:1352` / `23:1405`
- 🔐 không có (route công khai)
- **Confidence**: CAO cho home; **THẤP** cho cụm results (A6)
- **Inspect**: Có + đếm instance để xác nhận A3 (frame `18:4` chỉ có 1 instance `117:1250`)
- **Phụ thuộc**: Wave 1A token · 1B Button/Chip · 1C FilterBar

### R02 — `/listings/[id]` Chi tiết xe công khai
- **Feature**: `ListingDetailView`, `ListingReviews`, `VehicleRecommendations`, [booking-requests/components/RequestBookingButton](../../apps/web/src/features/booking-requests/components/RequestBookingButton.tsx)
- 🖥 `21:4` (populated) · `21:676` (gallery lightbox) · `21:776` (reviews full) · `21:911` (booking entry — **A7**, điểm vào; flow đặt xe thuộc section 06)
- ▭ `23:389` · 📱 `23:1684` top · `23:1765` scrolled · `23:1872` sticky actions · `23:1923` gallery fullscreen
- ◐ dùng chung state của R01; **thiếu frame loading/error riêng cho detail**
- **Confidence**: CAO (trừ ranh giới A7 → theo brief: 01 sở hữu điểm vào, 05 sở hữu flow)
- **Inspect**: Có + `21:911` để chốt nó chỉ là CTA hay lặp cả flow (A7)
- **Phụ thuộc**: 1B Overlay (lightbox) · 2 sau Fleet pilot

### R03 — `/shops/[slug]` Trang gian hàng công khai
- **Feature**: `ShopHeader`, `ShopVehicleGrid`
- 🖥 `21:303` populated · `21:705` no-vehicles · ▭ `23:540` · 📱 `23:1961` profile · `23:2019` vehicles
- ◐ empty = `21:705`; **thiếu loading/error**
- **Confidence**: CAO · **Inspect**: Có

### R04 — `/account` Hồ sơ khách
- **Feature**: [features/account/AccountView](../../apps/web/src/features/account/components/AccountView.tsx) · `PhoneVerifyControl`
- 🖥 `23:4522` default · `23:4595` edit profile · ◐ `23:4668` states (gộp) · 📱 `23:4996` · `23:5054` edit
- ▭ **không có**
- **Confidence**: TRUNG BÌNH — `23:4668` gộp nhiều state trong một frame, phải tách khi inspect
- **Inspect**: Có + tách `23:4668`; giải A1 (`23:5193` B — Desktop: Đăng ký & Tài khoản có phải bản sao?)

### R05 — `/trips` Chuyến của tôi + đánh giá
- **Feature**: [features/reviews/MyTripsView](../../apps/web/src/features/reviews/components/MyTripsView.tsx) · `ReviewModal`
- 🖥 `26:630` mixed · `26:795` upcoming/active · `26:876` completed
- ◐ `26:1027` empty · `26:1075` loading · `26:1179` API error · `26:1216` signed-out & expired
- Review dialog: `26:119` default · `26:219` validation · `26:320` submitting · `26:421` error · `23:6369` success + reviewed
- 📱 `23:6629` · `23:6730` status nav · `23:6789` empty/error · `23:6851`/`23:6931`/`23:7012` review drawer
- ▭ **không có**
- **Confidence**: CAO (độ phủ trạng thái tốt nhất toàn file) · **Inspect**: Có
- **Ghi chú**: brief 02 phân loại trips là 🟡 partial (list-only, không có trip detail/cancel) — Figma **không** vẽ trip detail, khớp với code

### R06 — `/chat` Tin nhắn khách
- **Feature**: [features/chat/](../../apps/web/src/features/chat/) — `ChatView`, `ConversationList`, `ThreadPanel`, `MessageComposer`, `ChatRealtimeContext`
- 🖥 `32:7` default · `32:139` unread · `32:225` new empty thread · `32:305` sending
- ◐ `32:503` send error · `32:580` empty list · `32:609` loading · `32:668` API error · `32:694` signed-out/expired
- 📱 `32:1098` list · `39:307` thread · `39:366` attachment · `39:457` reconnecting · `39:505` send failed
- ▭ **không có**
- **Confidence**: CAO · **Inspect**: Có
- **Phụ thuộc**: ADR 0009 (Firestore projection) — UI đổi được, cơ chế realtime **không** đụng trong wave giao diện

### R07 / R08 — `/forgot-password`, `/reset-password`
- **Feature**: page tự chứa, dùng `Alert` + form
- **Figma**: ❌ **KHÔNG CÓ node nào.** Section 03 phủ auth modal/OTP/register, không phủ forgot/reset. Brief 00 sở hữu 2 route này về mặt nghiệp vụ.
- **Confidence**: KHÔNG CÓ
- **Hành động**: giữ nguyên UI hiện tại, chỉ áp token Wave 1A. Ghi vào backlog **P9** (design thiếu 2 màn).

### R09 — `/manage/login` Đăng nhập cổng quản lý
- **Feature**: [features/auth/AuthPanel](../../apps/web/src/features/auth/components/AuthPanel.tsx) · `PhoneLoginForm`
- 🖥 `41:11` owner entry marketplace · `41:101` login owner-intent · ◐ `41:140` validation error · 📱 `41:459` owner entry · `41:531` login
- **Confidence**: CAO · **Inspect**: Có
- **Phụ thuộc**: ADR 0002 (httpOnly session cookie) — chỉ đổi hình thức, không đổi cơ chế

### R10 — `/manage/onboarding` Tạo gian hàng
- **Feature**: [features/shop/ShopRegistration](../../apps/web/src/features/shop/components/ShopRegistration.tsx)
- 🖥 `41:223` default · ◐ `41:269` validation · `41:315` submitting · `41:360` API error · `41:427` success transition · `41:406` existing tenant
- 📱 `41:599` · `41:637` validation · `41:676` transition · ▭ `53:27` tablet-shop-registration
- **Confidence**: CAO · **Inspect**: Có

### R11 — `/manage` Dashboard gian hàng
- **Feature**: [features/dashboard/](../../apps/web/src/features/dashboard/) — `ManageHome`, `DashboardView`, `DashboardPanel`, `StatCard`, `BookingMiniList`
- **Figma**: ❌ **KHÔNG CÓ frame dashboard gian hàng.** Section 01 có `14:1423`/`14:1531`/`14:1619` (`portal-shell-*`) nhưng đó là vỏ, không phải nội dung dashboard.
- **Confidence**: KHÔNG CÓ
- **Khớp với brief 11 §6**: shop dashboard là "thin-but-covered", không có brief riêng — Figma cũng bỏ trống. Nhất quán.
- **Hành động**: chỉ áp token + shell mới. Không redesign. Backlog **P10**.

### R12 — `/manage` Dashboard nền tảng
- **Feature**: [features/platform-dashboard/PlatformDashboardView](../../apps/web/src/features/platform-dashboard/components/PlatformDashboardView.tsx)
- 🖥 `92:1268` default · `92:1435` KPI detail · `92:1678` pending approvals · `92:1855` recent tenants · `92:2461` KPI confirmed · `92:2574` KPI drill-down
- ◐ `92:2015` zero/empty · `92:2128` loading · `92:2289` API error · 🔐 `92:2375`
- ▭ `93:1201` · 📱 `93:1333` · `93:1428` KPI cards · `93:1540` pending approvals · `93:1665` navigation · ◐📱 `93:1724`
- **Confidence**: CAO — độ phủ đầy đủ nhất (có cả tablet) · **Inspect**: Có

### R13 — `/manage` NoTenantState
- **Feature**: [features/shop/NoTenantState](../../apps/web/src/features/shop/components/NoTenantState.tsx)
- 🖥 `41:183` no-tenant-default · `14:1704` portal-no-tenant-state (Foundations) · 📱 `41:572`
- **Confidence**: CAO · **Inspect**: Có + đối chiếu 2 bản (`41:183` vs `14:1704`) chọn canonical

### R14 — `/manage/vehicles` Danh sách xe ⭐ PILOT
- **Feature**: [VehicleTable](../../apps/web/src/features/vehicles/components/VehicleTable.tsx) · [VehicleFiltersBar](../../apps/web/src/features/vehicles/components/VehicleFilters.tsx) · `use-vehicle-filters` · `use-vehicles`
- 🖥 `58:5` default · `58:432` search active · `58:675` filters applied · `58:966` view-only
- ◐ `58:1351` empty-create · `58:1461` empty-no-create · `58:1563` no-results · `58:1725` loading · `58:1956` error · 🔐 `58:2061`
- ▭ `58:2144` compact list
- 📱 `58:2405` cards · `58:2517` filter sheet · `58:2593` applied filters · `58:2710` empty/no-results · `58:2767` loading/error
- **Component cục bộ**: `58:2828` Fleet/OperationStatusTag · `58:2841` Fleet/PublicStatusTag · `58:2857` Fleet/ActionMenu · `58:2891` Fleet/StateDisplay · `59:871` Shell/Sidebar
- **Permission**: `vehicles.view` (xem) · `vehicles.create` / `update` / `delete` (nút)
- **Confidence**: CAO — **10 trạng thái, đủ 3 viewport, có component định nghĩa sẵn. Đây là lý do chọn làm pilot.**
- **Inspect**: Có — inspect đầy đủ cả 10 state + 4 component `Fleet/*`
- **Phụ thuộc**: 1A · 1B · 1C · 1D (bắt buộc xong hết trước)
- **Quyết định mục tiêu 10/08/2026**: thay table desktop/tablet bằng **card grid ở mọi viewport**.
  Ảnh fleet tối do chủ dự án cung cấp chỉ tham khảo bố cục và thứ bậc thông tin; màu sắc và style
  vẫn theo XePrime Foundations. Cập nhật toàn bộ state R14 trong Figma trước khi sửa code. Card chỉ
  dùng dữ liệu Fleet/API hiện có; không sao chép các metric doanh thu/chi phí/lãi lỗ từ ảnh tham
  khảo nếu backend chưa cung cấp.

### R15 — `/manage/vehicles/new` Tạo xe
- **Feature**: [VehicleForm](../../apps/web/src/features/vehicles/components/VehicleForm.tsx) · `vehicleFormSchema` ([packages/validators](../../packages/validators/src/index.ts))
- 🖥 `60:7` basic info · `60:141` details · `60:327` pricing · `60:490` media+features
- ◐ `60:821` validation · `60:943` uploading · `60:1066` gallery max · `60:1218` duplicate code · `60:1354` plan limit
- 📱 `62:975` basic · `62:1080` pricing · `62:1162` media · `62:1436` validation/upload error
- **Component cục bộ (A4)**: `62:1546` Money Input · `62:1553` Percentage Input · `62:1565` Feature Chip · `62:1574` Image Upload Slot · `62:1581` Character Counter · `62:1623` Sticky Form Actions · `62:1532` Field Marker · `62:1536` Sensitive Field Indicator · `62:1560` Policy Toggle
- **Confidence**: CAO · **Inspect**: Có + 9 component A4 (Money Input và Sticky Form Actions gần chắc là cross-module)

### R16 — `/manage/vehicles/[id]` Chi tiết xe
- **Feature**: [VehicleDetailView](../../apps/web/src/features/vehicles/components/VehicleDetailView.tsx) · `VehiclePublicReviewPanel`
- 🖥 `65:7` draft incomplete · `65:240` ready-submit · `65:482` submit confirmation · `65:652` missing requirements · `65:904` pending review · `65:1099` needs revision · `65:1298` rejected · `65:1609` approved public · `65:1793` hidden · `65:1978` sensitive knockback
- ◐ `65:2168` delete confirm · `65:2275` delete occupancy conflict · `65:2378` loading/error
- 📱 `65:2919` · `65:3008` publication checklist · `65:3069` submit sheet · `65:3101` revision/rejected · `65:3282` sensitive warning · `65:3349` delete confirm · `65:3430` delete conflict
- **Component cục bộ (A4)**: `65:3566` Vehicle Detail Header · `65:3581` Specification Group · `65:3598` Price Summary · `65:3613` Feature Tags · `65:3630` Image Gallery Strip · `65:3681` Two-Axis Status Summary · `65:3702` Public Review Panel · `65:3754` Requirements Checklist · `65:3763` Reviewer Reason Panel · `65:3803` Publication Status Alert · `65:3812` Sensitive Edit Result
- **Confidence**: CAO — độ phủ vòng đời tốt nhất toàn file · **Inspect**: Có

### R17 — `/manage/vehicles/[id]/edit` Sửa xe
- 🖥 `62:5` default · `62:265` edit approved w/ sensitive fields · ◐ `62:628` sensitive edit confirmation · `62:769` saving error · 🔐 `62:893`
- 📱 `62:1297` · `62:1386` sensitive confirm
- **Confidence**: CAO · **Inspect**: Có

### R18 — `/manage/bookings` Đơn thuê
- **Feature**: `BookingTable` · `BookingFormDrawer` · `BookingDetailDrawer`
- 🖥 `72:205` default · `72:465` filters · `72:642` view-only · ◐ `72:893` empty · `72:1112` loading/error
- Form: `72:1431` create · ◐ `72:1739` conflict preview · `72:2060` server conflict · `72:2380` validation · `72:2702` reschedule · `72:3026` reschedule conflict
- Detail theo status: `72:3238` reserved · `72:3467` confirmed · `72:3692` active · `72:3931` completed · `72:4265` cancelled · `72:4570` transition confirm · `72:4834` invalid/concurrent
- 📱 `72:5097` … `72:5581`
- **Confidence**: CAO · **Inspect**: Có
- **Ràng buộc**: ADR 0006 — `POST /calendar/check-conflict` chỉ là preview UX; chặn thật ở `EXCLUDE USING gist`. `72:1739` (preview) và `72:2060` (server conflict) là **hai màn khác nhau**, không được gộp.

### R19 — `/manage/booking-requests` Đơn đặt xe (inbox shop)
- **Feature**: `BookingRequestTable` · `use-booking-request-mutations`
- 🖥 `68:200` default · `68:426` filters · `68:588` view-only · ◐ `68:813` empty · `68:887` loading/error
- Duyệt: `68:1076` approval confirm · `68:1234` conflict · `68:1379` already processed · `68:1615` rejection **current** · `68:1836` rejection **design target** · `68:2063` expanded detail
- 📱 `68:2468` … `68:3036`
- **Confidence**: CAO · **Inspect**: Có
- ⚠️ `68:1836` tên là "design-target" → **không phải hiện trạng**. Xem [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) loại C/D.

### R20 — `/manage/calendar` Lịch thuê xe
- **Feature**: [CalendarScheduler](../../apps/web/src/features/calendar/components/CalendarScheduler.tsx) · `CalendarToolbar` · `@tanstack/react-virtual` + `@dnd-kit`
- 🖥 `72:5809` 7-day · `72:6073` 14-day dense · `72:6398` no vehicles · `72:6584` no events · ◐ `72:6843` loading/error · 🔐 `72:7084` · `74:1414` readonly hover · `74:1649` event detail **concept**
- 📱 `74:2153` horizontal · `74:2289` agenda
- **Confidence**: TRUNG BÌNH — `74:1649` gán "concept", brief 05 xếp calendar interactions là ⬜ placeholder
- **Inspect**: Có + phân định rõ frame nào là hiện trạng vs concept
- **Ràng buộc**: token `--xp-calendar-*` + `XP_METRICS` phải khớp; đổi chiều cao hàng làm lệch toạ độ JS

### R21 — `/manage/contracts/[id]` Hợp đồng
- **Feature**: [ContractDocument](../../apps/web/src/features/contracts/components/ContractDocument.tsx) + `@media print` trong `globals.css`
- 🖥 `74:1047` entry create-or-open · `74:1219` document screen · `74:1354` **print** · ◐ `74:1933` loading/error · 🔐 `74:1995` · `74:2056` stale snapshot
- 📱 `74:2380` · `74:2455` error/permission
- **Confidence**: CAO · **Inspect**: Có + `74:1354` (print) phải map sang `[data-print-root]`, không phải màn thường

### R22 — `/manage/finance` Tài chính
- 🖥 `77:1205` default · `77:1392` custom period · `77:2391` no-drilldown **(current)** · `77:2497` drilldown **(target)**
- ◐ `77:1675` zero activity · `77:1862` loading · `77:2251` error · 🔐 `77:2329`
- ▭ `77:2765` (1024×768) · 📱 `77:2855` · `77:2943` period selector · `77:3005` zero/loading · `77:3076` error/permission
- **Confidence**: CAO · **Inspect**: Có
- ⚠️ `77:2497` "drilldown-target" = chưa có. Brief 06 xếp reports/charts/exports là ❌ missing.

### R23 — `/manage/receipts` Thu chi
- **Feature**: `ReceiptTable` · `ReceiptFormDrawer` · `CategoryManagerModal`
- 🖥 `79:1360` ledger · `79:1594` filtered · `79:1767` sources · ◐ `79:1987` empty · `79:2064` loading/error · `79:2170` view-only
- Tạo/chi tiết: `79:2654` · `79:2843` validation · `79:3038` submitting/success · `79:3235` pending · `79:3418` approved · `79:3599` cancelled
- Duyệt/huỷ: `79:4647` approve confirm · `79:4808` cancel **current** · `79:5039` cancel **target-reason** · `79:5197` cancel collection risk
- Category: `79:5425` · `79:5561` create/rename · `79:5706` delete · `79:5833` system locked
- 📱 `79:6175` … `79:6712`
- **Confidence**: CAO · **Inspect**: Có · ⚠️ `79:3960` "approve-cancel-combined" 100×100 — node rác/thu nhỏ, cần xác minh

### R24 — `/manage/debts` Công nợ
- **Feature**: `DebtTable` · [RecordPaymentModal](../../apps/web/src/features/payments/components/RecordPaymentModal.tsx) · `PaymentHistory`
- 🖥 `77:3255` default · `77:3565` overdue · `77:3807` upcoming · `77:3997` unpaid · ◐ `77:4539` empty · `77:4647` loading/error · `77:4823` view-only
- Thu tiền: `77:4980` default · `77:5383` validation · `77:5515` overpayment **current** · `77:5646` guard **target** · `78:1201` submitting · `77:5780` success
- Lịch sử/huỷ: `78:1360` history · `78:1522` void confirm · `78:1718` void success · `78:1902` void error
- 📱 `78:2279` … `78:2882`
- **Confidence**: CAO · **Inspect**: Có · ⚠️ `77:5646` "guard-target" = chưa có (brief 06 Q2 overpayment policy chưa chốt)

### R25 — `/manage/shop` Hồ sơ gian hàng
- **Feature**: [ShopProfileForm](../../apps/web/src/features/shop/components/ShopProfileForm.tsx) · `ShopStatusCard`
- 🖥 `42:6` editable owner · `42:130` brand/description · `42:329` address/legal · `42:418` banking
- ◐ `42:548` uploading · `42:632` upload validation · `42:720` upload unavailable · `42:908` saving · `42:994` save error · `44:5` save success · 🔐 `42:1297`
- Trạng thái tenant: `44:394` draft · `44:491` submit confirm · `44:588` submitting/error · `44:685` pending · `44:785` needs revision · `44:886` rejected · `44:978` active · `44:138` pending review · `44:265` read-only · `44:2505` permission denied · `44:2612` invalid transition · `44:2791` suspended **current-gap** · `44:2830` suspended **future-concept**
- Thông báo: `44:1088` approved · `44:2405` rejected
- ▭ `53:74` · 📱 `42:1532` … `44:2246`
- **Component cục bộ**: `55:76` ShopStatusCard *(UNKNOWN)* · `55:83` PermissionNotice · `55:84` FeatureUnavailable · `55:100` ImageUploadField *(UNKNOWN)* · `55:110` XePrime/LoadingState
- **Confidence**: CAO · **Inspect**: Có + giải A4 cho `55:76`/`55:100`

### R26 — `/manage/members` Người dùng gian hàng
- 🖥 `87:1204` default · `87:1370` search/filter · `87:1525` **horizontal scroll (1280px)** · `87:1692` manager view · ◐ `87:1835` empty · `87:1887` loading/error · 🔐 `87:1939`
- Thêm: `88:1201` · `88:1385` validation · `88:1573` not-found · `88:1758` already-member · `88:1943` reactivated
- Vai trò/xoá: `88:2228` change role confirm · `88:2405` change role error · `88:2573` remove confirm · `88:2750` remove success
- 📱 `88:2906` … `88:3352`
- **Confidence**: CAO · **Inspect**: Có
- **Ghi chú**: `87:1525` là frame 1280px — bằng chứng Figma có quy chuẩn overflow bảng ở 1280. Dùng cho [07_VISUAL_QA_MATRIX.md](07_VISUAL_QA_MATRIX.md).

### R27 — `/manage/chat` Chat gian hàng
- 🖥 `90:1203` default · `90:1326` unread · `90:1458` selected thread · `90:1715` sending · ◐ `90:1835` error/reconnecting · `90:1948` empty · `90:2002` loading/error · `90:2085` membership lost
- Shared inbox: `90:2222` **current** · `90:2386` **future-concept**
- 📱 `90:2532` … `90:2928`
- **Confidence**: CAO · **Inspect**: Có · ⚠️ `90:2386` future → không code (brief 07 Q2–Q3 chưa chốt)

### R28 — `/manage/customers` *(placeholder)*
- **Code**: `PlaceholderPage`; nav `comingSoon: true`
- 🖥 `91:2186` customers-feature-unavailable · 📱 `91:2784`
- **Confidence**: CAO · **Inspect**: Có (frame ngắn)
- **Phân loại**: **G — PLACEHOLDER**. Figma vẽ đúng trạng thái "chưa có" → code được, nhưng chỉ là màn thông báo.

### R29 — `/manage/pickup-areas` *(placeholder)*
- 🖥 `44:2722` pickup-areas-unavailable · 📱 `44:2318`
- **Confidence**: CAO · **Phân loại**: G

### R30 — `/manage/drivers` *(placeholder)*
- 🖥 `65:2489` drivers-feature-unavailable · 📱 `65:3511` (dùng chung)
- **Confidence**: CAO · **Phân loại**: G

### R31 — `/manage/trash` *(placeholder)*
- 🖥 `65:2576` trash-feature-unavailable
- **Confidence**: CAO · **Phân loại**: G · ⚠️ **không có frame mobile riêng**

### R32 — `/manage/admin` Duyệt hồ sơ
- **Feature**: `ApprovalTable` · `ApprovalDetailDrawer`
- 🖥 `97:1212` pending · `97:1408` filters · `97:1562` decided · `97:1728` **horizontal scroll** · ◐ `97:1889` empty · `97:1989` loading/error · 🔐 `97:2155`
- Chi tiết: `97:2354` tenant approval · `97:2611` empty snapshot · `97:2860` vehicle approval · `97:3124` timeline
- Quyết định: `97:3421` approve confirm · `97:3529` revision reason · `97:3640` reject reason · `97:3751` processing/success · `97:3778` conflict
- Future: `97:3807` cross-task history · `97:3958` review criteria
- 📱 `97:4099` … `97:4486`
- **Confidence**: CAO · **Inspect**: Có · ⚠️ 2 frame `future-*` → loại E

### R33 — `/manage/admin/tenants` Gian hàng
- 🖥 `97:4597` default · `97:4813` search/filter · `97:4942` scroll · ◐ `97:5154` empty · `97:5257` loading/error · 🔐 `97:5385`
- Chi tiết: `97:5467` active · `97:5710` suspended · `97:5945` counts+plan
- Khoá/mở: `97:6185` lock optional reason · `97:6375` lock mandatory reason · `97:6567` lock success/conflict · `97:6605` unlock confirm · `97:6791` unlock success/conflict · `97:6829` suspension notification **gap**
- **Gói dịch vụ (section 11)**: `115:2330` current plan · `115:2489` no plan · `115:2601` subscription history · `115:2879` queued · `115:3036` scroll · `115:3171` assign · `115:3309` assign conflict · `115:3485` assign success · `115:3643` renew preview · `115:3832` change future · `115:3935` cancel future · `115:4021` cancel current · `115:4116` cancel success/conflict · `115:4212` derived expiry · `115:4274` quota enforcement · `115:4336` future shop subscription · `115:4400` **missing** invoice/payment
- 📱 `98:1218` … `98:1597` · `115:4583` … `115:4897`
- **Confidence**: CAO · **Inspect**: Có
- ⚠️ Route này bị **hai section** phủ (09 monitoring + 11 subscription) — trong code là `TenantPlanSection` bên trong `AdminTenantDetailDrawer`. Không mâu thuẫn, nhưng chia batch phải gộp.

### R34 — `/manage/admin/vehicles` Xe toàn hệ thống
- 🖥 `99:1212` default · `99:1516` filters · `99:1676` scroll · ◐ `99:1779` empty · `99:1873` loading · 🔐 `99:1975`
- Chi tiết: `99:2057` approved · `99:2180` hidden · `99:2288` pending
- Ẩn/hiện: `99:2506` hide reason · `99:2710` hide success · `99:2750` hide conflict · `99:2792` unhide confirm · `99:2997` unhide processing · `99:3051` vehicle suspended tenant · `99:3105` future governance context
- 📱 `99:3175` … `99:3599`
- **Confidence**: CAO · **Inspect**: Có
- **Ràng buộc**: ADR 0008 — chỉ `ListingsService` ghi `public_listings`. UI ẩn/hiện gọi endpoint moderate, không ghi trực tiếp.

### R35 — `/manage/admin/bookings` Giám sát đơn thuê
- **Feature**: `AdminBookingTable` · `AdminBookingDetailDrawer` · [MaskedContact](../../apps/web/src/components/data-display/MaskedContact.tsx)
- 🖥 `106:1213` default · `106:1490` search · `106:1643` filters · `106:1764` exact phone · `106:1887` date basis · `106:1996` scroll
- ◐ `106:2122` empty · `106:2218` loading/error · 🔐 `106:2346`
- Chi tiết: `106:2433` · `106:2591` contact (PII)
- 📱 `106:2861` … `106:3271`
- **Flow-summary/route note**: `106:1205` ghi thẳng "Route: /manage/admin/bookings · Permission: platform.bookings.view · Read-only · Masked PII" — **frame ghi chú route hiếm hoi, độ tin cậy mapping cao nhất toàn file**
- **Confidence**: CAO · **Inspect**: Có

### R36 — `/manage/admin/customers` Giám sát khách thuê + PII reveal
- 🖥 `107:1212` default · `107:1459` search · `107:1595` exact contact · `107:1698` masked-only · `107:1823` scroll · ◐ `107:1925` empty · `107:3638` loading/error · 🔐 `107:3784`
- Chi tiết: `107:2013` masked · `107:2235` counts · `107:2468` requests · `107:3860` reopened
- PII reveal: `107:2709` **current** · `107:2927` loading/success · `107:3151` error/permission · `107:3952` **design-target**
- 📱 `107:4178` … `107:4671`
- **Route note**: `107:1204` ghi permission `platform.customers.view` + `platform.customers.view_pii`
- **Confidence**: CAO · **Inspect**: Có
- ⚠️ **Ràng buộc bảo mật**: mỗi lần reveal ghi `audit_logs` (CLAUDE.md §6.3). `107:3952` là target → loại C/D, không được code như hiện trạng.

### R37 — `/manage/admin/audit` Nhật ký hệ thống ⚠️
- **Feature**: `AuditLogTable` · `AuditLogDetailDrawer` · `use-audit-filters` *(bản copy, không dùng `useUrlFilters`)*
- 🖥 `109:1260` default · `109:1486` filters · `109:1642` reveal filter · `109:1779` scroll · ◐ `109:1892` empty · `109:1974` loading/error · 🔐 `110:1210`
- Chi tiết: `110:1283` standard · `110:1496` PII reveal · `110:1711` before/after · `110:1895` actor deleted · `110:2101` missing · `110:2986` diff **target** · `110:3217` target link **future**
- 📱 `110:3456` list · `110:3580` filters · `110:3631` card · `110:3730` detail · `110:3789` JSON diff viewer · `110:3820` error/permission
- **Route note**: `109:1246` ghi "Route: /manage/admin/audit · Permission: platform.audit.view (admin-only)"
- **Confidence**: CAO — ⚠️ **nhưng catalog Wave 0A gán toàn bộ nhóm này `AUDIT`/`NO`.** Đây là false negative của heuristic tên. Coi như `PRODUCTION_*`.
- **Inspect**: Có

### R38 — `/manage/admin/staff` Nhân sự nền tảng
- 🖥 `113:3033` default · `113:3293` search/filter · `113:3460` scroll · ◐ `113:3604` empty · `113:3687` loading/error · 🔐 `113:3829`
- Thêm: `114:1210` · `114:1411` validation · `114:1613` not-found · `114:1816` existing · `114:2019` reactivated
- Vai trò/xoá: `114:2205` change role standard · `114:2673` change role **super-admin** · `114:2882` conflict · `114:3081` remove confirm · `114:3283` remove conflict
- 📱 `114:3489` … `114:3829`
- **Confidence**: **THẤP** — **A2**: hai bộ nhãn "Batch 1 — Platform Staff Management" (`113:3017`+`113:3019` vs `114:3904`+`114:3905`–`3908`) trùng tên trong cùng section. Chưa rõ có hai phiên bản màn staff hay không.
- **Inspect**: **Bắt buộc trước tiên** — so con của `114:3905`–`3908` với các frame lẻ; nếu cả hai bộ đều đầy đủ → **cần người dùng chốt bản canonical** (quyết định **P2**).
- **Ràng buộc**: brief 10 — last-admin protection.

### R39 — `/manage/admin/plans` Gói dịch vụ
- 🖥 `114:3917` default · `114:4108` active · `114:4271` archived · `114:4406` scroll · ◐ `114:4596` empty/loading/error · 🔐 `114:4695`
- Tạo/sửa: `114:4784` create · `114:5033` validation · `114:5285` duplicate code · `114:5535` unlimited · `114:5785` edit future sales · `114:6038` edit archived **current** · `114:6300` edit archived warning · `114:6486` archive confirm · `114:6606` archive success/conflict
- 📱 `114:6747` … `114:7073`
- **Confidence**: CAO · **Inspect**: Có
- **Ràng buộc**: ADR 0010 — 4 mục "Hoãn" không được code.

---

## C. Khoảng trống mapping

### C1 — Route có code, không có Figma (3)

| Route | Ghi chú | Hành động |
| --- | --- | --- |
| `/forgot-password` (R07) | Section 03 phủ auth modal/OTP/register, bỏ forgot/reset | Chỉ áp token; backlog **P9** |
| `/reset-password` (R08) | ↑ | ↑ |
| `/manage` shop dashboard (R11) | Khớp với brief 11 §6 ("thin-but-covered") | Chỉ áp token + shell; backlog **P10** |

### C2 — Figma có, code không có (1)

| Cụm Figma | Route đề xuất | Trạng thái |
| --- | --- | --- |
| Marketplace Results (`18:567`, `18:1298`, `18:1449`, `18:1510`, `23:259`, `23:1100`…) | `/search` | **Chưa quyết định** — A6 → **P4** |

### C3 — Độ phủ tablet: 10/39 route

Chỉ 10 node `PRODUCTION_TABLET` toàn file: R01 (`23:7`, `23:259`), R02 (`23:389`), R03 (`23:540`), R10 (`53:27`), R14 (`58:2144`), R22 (`77:2765`), R25 (`53:74`, `53:170`), R12 (`93:1201`).

**29/39 route không có frame tablet.** Brief 00 Q9 / 01 Q9 ghi "no tablet rules" là `Unknown`. → **P3** (A10).

Thêm một mâu thuẫn nội bộ Figma: frame tablet dùng **hai** chiều rộng khác nhau — `768px` (section 02, 04, 05) và `1024×768` (section 07, 09). Foundations định nghĩa Tablet = 641–1024. Không rõ 768 hay 1024 là điểm kiểm chuẩn.

### C4 — Độ phủ trạng thái không đều

| Trạng thái | Route có frame |
| --- | --- |
| Default | 39/39 |
| Loading | ~30 |
| Empty / No-results | ~30 (nhiều route gộp empty và no-results vào 1 frame — sai theo `134:2093` "empty-vs-noresults-vs-unavailable") |
| Error | ~30 |
| Permission-denied | ~24 |
| **Tất cả 5** | R14 · R16 · R32 · R33 · R34 · R35 · R36 · R38 · R39 · R12 |

Route thiếu nhiều nhất: R02, R03 (không có loading/error riêng), R31 (không có mobile), R04/R05/R06 (không có tablet).

---

## D. Frame "current vs target/future" — KHÔNG được code như hiện trạng

Figma đánh dấu rõ ràng nhiều cặp. Đây là danh sách phải chuyển sang [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) loại C/D/E:

| Route | Frame "current" | Frame "target/future/concept/gap" |
| --- | --- | --- |
| R19 | `68:1615` rejection-current | `68:1836` rejection-**design-target** |
| R22 | `77:2391` no-drilldown | `77:2497` drilldown-**target** |
| R23 | `79:4808` cancel-current | `79:5039` cancel-**target-reason** |
| R24 | `77:5515` overpayment-current | `77:5646` guard-**target** |
| R25 | `44:2791` suspended-current-**gap** | `44:2830` suspended-**future-concept** |
| R27 | `90:2222` shared-inbox-current | `90:2386` shared-inbox-**future-concept** |
| R32 | — | `97:3807` **future**-cross-task-history · `97:3958` **future**-review-criteria |
| R33 | — | `97:6829` suspension-notification-**gap** · `115:4336` **future**-shop-subscription · `115:4400` **missing**-invoice-payment |
| R34 | — | `99:3105` **future**-governance-context |
| R36 | `107:2709` pii-reveal-current | `107:3952` pii-reveal-**design-target** |
| R37 | — | `110:2986` diff-**target** · `110:3217` target-link-**future** |
| R20 | — | `74:1649` calendar-event-detail-**concept** |
| R28 | — | `91:2271` custom-roles-**boundary** · `91:2371` member-invites-**boundary** · `91:2471` platform-support-chat-**boundary** · `91:2571` notification-channels-**future** |

**23 frame** thuộc nhóm này. Việc Figma tự đánh dấu là điểm mạnh — nhưng nó chứng minh nguyên tắc §10.2 của [00_IMPLEMENTATION_OVERVIEW.md](00_IMPLEMENTATION_OVERVIEW.md): **Figma không phải bằng chứng backend có thật.**
