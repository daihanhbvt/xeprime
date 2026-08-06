# 04 — COMPONENT DUPLICATES

> Ngày lập: 06/08/2026 · Wave 0B. Trùng lặp **đã đo bằng grep trên source**, không suy đoán.
> Nguyên tắc §10.7 của [00_IMPLEMENTATION_OVERVIEW.md](00_IMPLEMENTATION_OVERVIEW.md): **gom trùng lặp NGAY TRƯỚC wave động vào nó, không phải sau.**

## Tổng quan

| ID | Pattern | Số nơi | Đích gom | Risk | Wave |
| --- | --- | --- | --- | --- | --- |
| **D1** | Scaffold trạng thái danh sách (error/empty/no-results/loading) | **17 page + 8 component** | `EmptyState` + `LoadingState` + `DataTable` | **CAO** | 1C |
| **D2** | Hook filter URL tự chế | **10 / 13** | `useUrlFilters` | TB | 1C |
| **D3** | Cột hành động của bảng (icon + tooltip + popconfirm) | **10 bảng** | `RowActions` | Thấp | 1C |
| **D4** | `<Tag>` trần thay vì `StatusTag` | **11 file** | `StatusTag` + `*_STATUS_META` | TB | 1C |
| **D5** | Modal↔Drawer responsive tự chế | **3 bản chế + 10 chưa responsive** | `ResponsiveDialog` | **CAO** | 1B |
| **D6** | Detail drawer | **7 file** | `DetailDrawer` | TB | 1B |
| **D7** | Khối "avatar + tên + phụ đề" | **≥8 nơi** | `EntityIdentity` | Thấp | 1C |
| **D8** | `Suspense fallback={<Spin .../>}` + `.state` CSS | **11 page** | `LoadingState` | Thấp | 1C |
| **D9** | Bảng dựng thẳng trong `page.tsx` (không có `*Table.tsx`) | **4 page** | tách ra `*Table.tsx` | Thấp | theo module |
| **D10** | Điểm gãy breakpoint hard-code | **21 giá trị** | 3 token | **CAO** | 1A |

**D10 nằm trong [02_DESIGN_TOKEN_MAP.md §9](02_DESIGN_TOKEN_MAP.md)** — ghi lại ở đây để không sót khi rà duplicate.

---

## D1 — Scaffold trạng thái danh sách ⚠️ TRÙNG LẶP LỚN NHẤT

### Files

**17 `page.tsx` chứa `<Result status="error">` + nút "Thử lại" → `refetch()`:**

```
(manage)/manage/vehicles/page.tsx          (manage)/manage/admin/page.tsx
(manage)/manage/bookings/page.tsx          (manage)/manage/admin/tenants/page.tsx
(manage)/manage/booking-requests/page.tsx  (manage)/manage/admin/vehicles/page.tsx
(manage)/manage/members/page.tsx           (manage)/manage/admin/bookings/page.tsx
(manage)/manage/receipts/page.tsx          (manage)/manage/admin/customers/page.tsx
(manage)/manage/debts/page.tsx             (manage)/manage/admin/audit/page.tsx
(manage)/manage/finance/page.tsx           (manage)/manage/admin/staff/page.tsx
(manage)/manage/shop/page.tsx              (manage)/manage/admin/plans/page.tsx
(manage)/manage/contracts/[id]/page.tsx
```

**+8 nơi khác lặp cùng chuỗi "Thử lại":** `vehicles/[id]/page.tsx` · `vehicles/[id]/edit/page.tsx` · [AccountView](../../apps/web/src/features/account/components/AccountView.tsx) · [AdminBookingDetailDrawer](../../apps/web/src/features/admin-bookings/components/AdminBookingDetailDrawer.tsx) · [AdminCustomerDetailDrawer](../../apps/web/src/features/admin-customers/components/AdminCustomerDetailDrawer.tsx) · [AdminVehicleDetailDrawer](../../apps/web/src/features/admin-vehicles/components/AdminVehicleDetailDrawer.tsx) · [TenantPlanSection](../../apps/web/src/features/admin-plans/components/TenantPlanSection.tsx) · [PlatformDashboardView](../../apps/web/src/features/platform-dashboard/components/PlatformDashboardView.tsx)

**Tổng: 25 nơi.**

### Consumer hiện tại
Mọi route danh sách của cả ba context (customer/shop/platform).

### Khác biệt giữa các bản

Bản chuẩn nhất là [vehicles/page.tsx:77-121](<../../apps/web/src/app/(manage)/manage/vehicles/page.tsx#L77-L121>):

```tsx
{isError && !data ? (
  <Result status="error" title="Không tải được danh sách xe" subTitle="…" extra={<Button …>Thử lại</Button>} />
) : !isFetching && items.length === 0 ? (
  hasFilters
    ? <Empty description="Không tìm thấy xe khớp bộ lọc"><Button …>Xoá bộ lọc</Button></Empty>
    : <Empty description="Gian hàng chưa có xe nào">{canCreate ? <Button …>Thêm xe đầu tiên</Button> : null}</Empty>
) : (
  <VehicleTable … />
)}
```

Các bản khác lệch ở:

| Chiều | Biến thể quan sát được |
| --- | --- |
| **Điều kiện lỗi** | `isError && !data` (vehicles) vs `isError` trần (một số admin page) — bản sau **nháy lỗi khi refetch nền** |
| **Phân biệt empty vs no-results** | ✅ vehicles, bookings, receipts, debts · ❌ một số admin page chỉ có một `Empty` chung |
| **Nút trong empty** | có/không tuỳ `canCreate`; không nhất quán ai kiểm quyền |
| **Câu chữ** | 17 tiêu đề lỗi khác nhau ("Không tải được danh sách xe" / "…đơn thuê" / …) |
| **Điều kiện loading** | `!isFetching && items.length === 0` vs chỉ dựa `loading` prop của `Table` |
| **Permission-denied** | Chỉ vài trang có; đa số dựa `admin/layout.tsx` gác cả nhánh |

### Đích gom (canonical)

`EmptyState` + `LoadingState` + `PermissionState` + `DataTable` — xem [03_COMPONENT_REGISTRY.md §4](03_COMPONENT_REGISTRY.md).

Hình dạng đề xuất, để `page.tsx` chỉ còn khai báo:

```tsx
<DataTable
  query={{ data, isError, isFetching, refetch }}
  empty={{ title: 'Gian hàng chưa có xe nào', action: canCreate && <Button…/> }}
  noResults={{ active: hasFilters, onClear: () => setFilters(CLEARED) }}
  error={{ title: 'Không tải được danh sách xe' }}
  columns={columns} meta={meta} onPageChange={…}
/>
```

### Migration risk: **CAO**

- Chạm **25 file** ở cả ba context.
- Điều kiện lỗi hiện **không đồng nhất** — gom về một hành vi sẽ **đổi hành vi** ở các trang dùng `isError` trần (hết nháy lỗi khi refetch). Đây là cải thiện, nhưng vẫn là thay đổi hành vi → phải nêu rõ trong PR, không lặng lẽ.
- Trang nào đang **thiếu** phân biệt empty/no-results sẽ **được thêm** — cũng là đổi hành vi.
- **Không có test nào** phủ 14 trang danh sách → phải bổ sung test trước khi gom (xem [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md) Wave 1C).

### Wave đề xuất: **1C**, và **bắt buộc xong trước Wave 2 (pilot Fleet List)**.

---

## D2 — Hook filter URL tự chế

### Files

[useUrlFilters](../../apps/web/src/hooks/use-url-filters.ts) đã tồn tại và docstring **tự khai**: *"Các feature cũ vẫn giữ bản copy của riêng chúng — dời dần sang đây khi chạm vào."*

| Dùng `useUrlFilters` ✅ (3) | Giữ bản copy ❌ (10) |
| --- | --- |
| `admin-bookings/hooks/use-admin-booking-filters.ts` | `admin-audit/hooks/use-audit-filters.ts` |
| `admin-customers/hooks/use-admin-customer-filters.ts` | `admin-tenants/hooks/use-admin-tenant-filters.ts` |
| `admin-vehicles/hooks/use-admin-vehicle-filters.ts` | `approvals/hooks/use-approval-filters.ts` |
| | `booking-requests/hooks/use-booking-request-filters.ts` |
| | `bookings/hooks/use-booking-filters.ts` |
| | `calendar/hooks/use-calendar-filters.ts` |
| | `finance/hooks/use-debt-filters.ts` |
| | `finance/hooks/use-receipt-filters.ts` |
| | `marketplace/hooks/use-marketplace-filters.ts` |
| | `vehicles/hooks/use-vehicle-filters.ts` |

Cả 10 bản copy đều gọi `router.replace` trực tiếp.

### Khác biệt

`useUrlFilters` chuẩn hoá 3 hành vi: ① giá trị rỗng/`'all'`/`false` → **xoá** param (không ghi `?status=all`) ② đổi filter bất kỳ (trừ khi tự set `page`) → **về trang 1** ③ `router.replace` + `scroll: false`.

Bản copy **có thể** thiếu ① hoặc ②. Ca đáng ngờ nhất: `use-calendar-filters` (không phải danh sách phân trang — có thể **cố tình** khác) và `use-marketplace-filters` (đi cùng [filter-params.ts](../../apps/web/src/features/marketplace/filter-params.ts) đã có test riêng).

### Đích gom
`useUrlFilters` + `positiveIntParam`, mỗi feature chỉ giữ hàm `parse`.

### Migration risk: **TRUNG BÌNH**
- Nếu một bản copy **cố tình** không reset `page`, gom sẽ đổi hành vi phân trang.
- `use-marketplace-filters` có [filter-params.test.ts](../../apps/web/src/features/marketplace/filter-params.test.ts) bảo vệ → an toàn nhất, làm trước.
- `use-calendar-filters` — **loại trừ khỏi phạm vi gom** cho tới khi có lý do; lịch không phân trang.

### Wave: **1C**, làm từng file, mỗi file một commit. Không gom cả 10 trong một PR.

---

## D3 — Cột hành động của bảng

### Files (10 bảng)

`VehicleTable` · `BookingTable` · `BookingRequestTable` · `ReceiptTable` · `DebtTable` · `AdminVehicleTable` · `AdminTenantTable` · `AdminBookingTable` · `AdminCustomerTable` · `AuditLogTable` · `ApprovalTable` + bảng inline trong `members/page.tsx`, `admin/staff/page.tsx`

### Pattern lặp

[VehicleTable.tsx:110-145](../../apps/web/src/features/vehicles/components/VehicleTable.tsx#L110-L145):
```tsx
{ title: '', key: 'actions', align: 'right', fixed: 'right', width: 130,
  render: (_, row) => (
    <Space size="small">
      <Tooltip title="Xem"><Button type="text" icon={<EyeOutlined/>} onClick={…}/></Tooltip>
      {canEdit ? <Tooltip title="Sửa"><Button type="text" icon={<EditOutlined/>} …/></Tooltip> : null}
      {canDelete ? <Popconfirm …><Button type="text" danger icon={<DeleteOutlined/>} loading={…}/></Popconfirm> : null}
    </Space>
  ) }
```

### Khác biệt
`width` (130 / 120 / 90…) · thứ tự nút · có/không `Popconfirm` · `fixed: 'right'` có ở đa số nhưng **không phải tất cả**.

### Đích gom
`RowActions` — `{actions: {key, icon, label, danger?, confirm?, loading?, hidden?, onClick}[]}` + helper sinh cột `actionColumn(actions)` chuẩn hoá `width`/`fixed`/`align`.

### Migration risk: **THẤP** — thuần trình bày.
**Lợi ích phụ quan trọng**: sửa luôn lỗ a11y (`Tooltip` không thay được `aria-label`; nút icon trong bảng hiện **không có tên cho screen reader**).

Figma có quy chuẩn riêng: `127:2060` `sticky-actions-standard` — **đọc trước khi gom**.

### Wave: **1C**

---

## D4 — `<Tag>` trần thay vì `StatusTag`

### Files (11)

`admin/staff/page.tsx` · `members/page.tsx` · `receipts/page.tsx` · [AccountView](../../apps/web/src/features/account/components/AccountView.tsx) · [AdminBookingDetailDrawer](../../apps/web/src/features/admin-bookings/components/AdminBookingDetailDrawer.tsx) · [AdminCustomerDetailDrawer](../../apps/web/src/features/admin-customers/components/AdminCustomerDetailDrawer.tsx) · [TenantPlanSection](../../apps/web/src/features/admin-plans/components/TenantPlanSection.tsx) · [CategoryManagerModal](../../apps/web/src/features/finance/components/CategoryManagerModal.tsx) · [PaymentHistory](../../apps/web/src/features/payments/components/PaymentHistory.tsx) · [VehicleDetailView](../../apps/web/src/features/vehicles/components/VehicleDetailView.tsx) · [VehicleTable](../../apps/web/src/features/vehicles/components/VehicleTable.tsx)

### Phân loại — **không phải tất cả đều là vi phạm**

| Loại | Ví dụ | Xử lý |
| --- | --- | --- |
| **Vi phạm thật** — hiển thị status nghiệp vụ bằng `<Tag>` trần, màu tự chọn | `members/page.tsx`, `admin/staff/page.tsx`, `AdminCustomerDetailDrawer` | **Chuyển sang `StatusTag`**; nếu thiếu `*_STATUS_META` thì bổ sung vào `@xeprime/types` (ADR 0005) |
| **Hợp lệ** — `<Tag>` không mang status | `VehicleTable` `<Tag color="red">-{discountPercent}%</Tag>` (nhãn khuyến mãi) · `CategoryManagerModal` (nhãn danh mục hệ thống) | **Giữ nguyên** |
| **Cần xác minh** | `AccountView`, `PaymentHistory`, `TenantPlanSection`, `VehicleDetailView` | Đọc từng chỗ ở Wave 1C |

### Migration risk: **TRUNG BÌNH**
Vi phạm CLAUDE.md §5 (*"String literal trần cho status — luôn `BOOKING_STATUS.ACTIVE`"*). Nhưng chuyển sang `StatusTag` **có thể đổi màu hiển thị** nếu `*_STATUS_META` khai màu khác màu đang hard-code → khác biệt thị giác cần chụp ảnh trước/sau.

### Wave: **1C** (cùng đợt `DataTable`, vì phần lớn nằm trong cột bảng)

---

## D5 — Modal ↔ Drawer responsive tự chế ⚠️

### Files

**Đã tự chế responsive (3):** [AuthModal](../../apps/web/src/features/auth/components/AuthModal.tsx) · [RequestBookingModal](../../apps/web/src/features/booking-requests/components/RequestBookingModal.tsx) · [FilterPanel](../../apps/web/src/features/marketplace/components/FilterPanel.tsx) — cả ba dùng `useIsMobile()` rồi chọn `Modal` hay `Drawer`.

**Chưa responsive (10):** `PlanFormModal` · `AddStaffModal` · `AddMemberModal` · `RecordPaymentModal` · `ReviewModal` · `CategoryManagerModal` · `TenantPlanSection` (modal nội bộ) · 3 modal trong `AdminTenantDetailDrawer`/`AdminVehicleDetailDrawer`/`ApprovalDetailDrawer`.

### Khác biệt
Ba bản tự chế **không** chia sẻ code — mỗi bản tự quyết `placement`, `height`, xử lý footer, và cách đóng. `AuthModal` có test ([AuthModal.test.tsx](../../apps/web/src/features/auth/components/AuthModal.test.tsx)), hai bản kia không.

### Bằng chứng đây là khiếm khuyết, không phải lựa chọn
Figma đặc tả bottom sheet ở mobile cho **≥15 luồng**: `23:2086` auth · `66:1313` booking dates · `68:2726` approval · `79:6563` approve/cancel receipt · `88:3151` add member · `97:4377` approve · `114:3714` add staff · `115:4858` cancel subscription · `65:3069` submit review · `58:2517` fleet filter · `78:2582` record payment · …

### Đích gom
`ResponsiveDialog` — [03_COMPONENT_REGISTRY.md §2.1](03_COMPONENT_REGISTRY.md).

### Migration risk: **CAO**
- Gom 3 bản tự chế = đổi hành vi ở 3 luồng **quan trọng nhất** (đăng nhập, đặt xe, lọc marketplace). `AuthModal.test.tsx` và `FilterPanel.test.tsx` bảo vệ 2/3; `RequestBookingModal` **không có test** → viết test trước khi đụng.
- Thêm responsive cho 10 modal còn lại = **thêm hành vi mới** trên mobile. Đây là mục tiêu, nhưng phải QA riêng từng cái ở 390/360px.

### Wave: **1B** — phải xong trước 1C (`DataTable` sẽ mở drawer chi tiết) và trước Wave 2.

---

## D6 — Detail drawer

### Files (7)

[AuditLogDetailDrawer](../../apps/web/src/features/admin-audit/components/AuditLogDetailDrawer.tsx) · [AdminBookingDetailDrawer](../../apps/web/src/features/admin-bookings/components/AdminBookingDetailDrawer.tsx) · [AdminCustomerDetailDrawer](../../apps/web/src/features/admin-customers/components/AdminCustomerDetailDrawer.tsx) · [AdminTenantDetailDrawer](../../apps/web/src/features/admin-tenants/components/AdminTenantDetailDrawer.tsx) · [AdminVehicleDetailDrawer](../../apps/web/src/features/admin-vehicles/components/AdminVehicleDetailDrawer.tsx) · [ApprovalDetailDrawer](../../apps/web/src/features/approvals/components/ApprovalDetailDrawer.tsx) · [BookingDetailDrawer](../../apps/web/src/features/bookings/components/BookingDetailDrawer.tsx)

Mỗi cái kèm một `.module.css` riêng.

### Pattern lặp
`<Drawer open width={…} onClose title={…}>` → `Skeleton` khi loading → `Result` khi lỗi → `Descriptions`/khối tự dựng khi có data. Vài cái còn chứa `Modal` lồng bên trong (hành động khoá/ẩn/duyệt).

### Khác biệt
`width` (520 / 560 / 640 / 720…) · có/không `Table` lồng bên trong (`AdminCustomerDetailDrawer` có) · có/không modal hành động lồng · bố cục header.

### Đích gom
`DetailDrawer` — `{open, onClose, title, width?, query: {isLoading, isError, refetch}, children}`, đảm nhiệm loading/error/close; nội dung vẫn của từng feature.

### Migration risk: **TRUNG BÌNH**
Không đổi hành vi nếu chỉ nhấc phần khung. Rủi ro nằm ở modal lồng — `ResponsiveDialog` (D5) phải xong trước, nếu không sẽ gom hai lần.

### Wave: **1B**, ngay sau `ResponsiveDialog`.

---

## D7 — Khối "avatar + tên + phụ đề"

### Files (≥8)
`VehicleTable` ([:50-66](../../apps/web/src/features/vehicles/components/VehicleTable.tsx#L50-L66)) · `AdminVehicleTable` · `AdminCustomerTable` · `AdminTenantTable` · `members/page.tsx` · `admin/staff/page.tsx` · [ManageUserCard](../../apps/web/src/components/layout/ManageUserCard.tsx) · [ConversationList](../../apps/web/src/features/chat/components/ConversationList.tsx) · [ShopHeader](../../apps/web/src/features/marketplace/components/ShopHeader.tsx) · [Topbar](../../apps/web/src/components/layout/Topbar.tsx) (initial từ `displayName`)

### Khác biệt
`shape` (`square` cho xe, tròn cho người) · `size` (44 / 40 / 32 / 24) · icon fallback (`CarOutlined` / `UserOutlined` / `ShopOutlined`) · cách tính chữ-cái-đầu (lặp ở `Topbar` và `ManageUserCard`).

### Đích gom
`EntityIdentity` — `{avatarSrc?, shape?, fallbackIcon?, name, subtitle?, size?}` + hàm `initialOf(name)` dùng chung.

### Migration risk: **THẤP** — thuần trình bày, không có test nào phụ thuộc.
Figma: `XePrime/Avatar` `125:1643` quy định 5 size (XS/SM/MD/LG/XL) — **ánh xạ 4 size hiện có vào 5 bậc đó khi gom**, đừng giữ số px trần.

### Wave: **1C**

---

## D8 — `Suspense fallback={<Spin/>}` + class `.state`

### Files (11 page)
Mọi page đọc `useSearchParams` (bắt buộc bọc `Suspense` với route tĩnh của Next).

Mỗi page tự khai `.state` trong `.module.css` riêng — **11 định nghĩa CSS gần giống nhau** cho cùng một khối căn giữa.

### Đích gom
`LoadingState variant="block"`, và một class `.state` chung (hoặc bỏ hẳn, để `LoadingState` tự lo layout).

### Migration risk: **THẤP**

### Wave: **1C** (đi kèm D1)

---

## D9 — Bảng dựng thẳng trong `page.tsx`

### Files (4)
`members/page.tsx` · `admin/staff/page.tsx` · `receipts/page.tsx` (một phần) · `admin/plans/page.tsx`

Bốn trang này **không có** `*Table.tsx` riêng — `ColumnsType` khai ngay trong page, khác với 10 trang còn lại.

### Đích gom
Không phải "gom" mà là **đồng nhất cấu trúc**: tách thành `MemberTable.tsx`, `StaffTable.tsx`, `PlanTable.tsx` cho khớp pattern feature ([00_IMPLEMENTATION_OVERVIEW.md §5](00_IMPLEMENTATION_OVERVIEW.md)).

### Migration risk: **THẤP** — thuần di chuyển file.
Làm ở **wave của chính module đó**, không gom vào 1C — nếu không sẽ đụng cùng file hai lần.

---

## D10 — Điểm gãy breakpoint hard-code

**21 giá trị rời rạc** vs 4 breakpoint Figma. Chi tiết + quyết định cơ chế: [02_DESIGN_TOKEN_MAP.md §9](02_DESIGN_TOKEN_MAP.md). **Risk CAO. Wave 1A.**

---

## Thứ tự gom bắt buộc

```
Wave 1A ──► D10 (breakpoint)                       [nền tảng, mọi thứ khác dựa vào]
Wave 1B ──► D5 (ResponsiveDialog) ──► D6 (DetailDrawer)
Wave 1C ──► D1 (state scaffold) ──► D8, D3, D7, D4, D2
Theo module ──► D9
```

**Ràng buộc:** D6 sau D5 (drawer chứa modal lồng) · D1 sau D5/D6 (`DataTable` mở drawer) · **toàn bộ 1A–1C xong trước Wave 2 (pilot)**.

## Cái KHÔNG gom

| Cặp | Vì sao giữ riêng |
| --- | --- |
| `members/` ↔ `admin-staff/` | Ranh giới bảo mật khác (tenant vs platform). Gom sẽ tạo component biết cả hai scope — CLAUDE.md §5 cấm |
| `FilterPanel` (marketplace) ↔ `FilterBar` (danh sách quản lý) | Ngữ nghĩa khác: facet + khoảng giá vs lọc bảng |
| `VehicleCard` (marketplace) ↔ `EntityCard` (thẻ mobile của bảng) | Một cái là sản phẩm bán hàng, một cái là hàng dữ liệu |
| `use-calendar-filters` | Lịch không phân trang — quy tắc "reset page" không áp dụng |
| `Logo` ↔ `BrandMark` | Logo XePrime vs logo hãng xe |
| `packages/ui` | Chỉ một app tiêu thụ — xem [00_IMPLEMENTATION_OVERVIEW.md §4.1](00_IMPLEMENTATION_OVERVIEW.md) |
