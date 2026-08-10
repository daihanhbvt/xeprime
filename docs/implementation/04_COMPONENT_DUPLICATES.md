# 04 — COMPONENT DUPLICATES

> Ngày lập: 06/08/2026 · Wave 0B. Trùng lặp **đã đo bằng grep trên source**, không suy đoán.
> Nguyên tắc §10.7 của [00_IMPLEMENTATION_OVERVIEW.md](00_IMPLEMENTATION_OVERVIEW.md): **gom trùng lặp NGAY TRƯỚC wave động vào nó, không phải sau.**

## Tổng quan

| ID      | Pattern                                                        | Số nơi                             | Đích gom                                    | Risk    | Wave             |
| ------- | -------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- | ------- | ---------------- |
| **D1**  | Scaffold trạng thái danh sách (error/empty/no-results/loading) | **17 page + 8 component**          | `EmptyState` + `LoadingState` + `DataTable` | **CAO** | 1C               |
| **D2**  | Hook filter URL tự chế                                         | **10 / 13**                        | `useUrlFilters`                             | TB      | 1C               |
| **D3**  | Cột hành động của bảng (icon + tooltip + popconfirm)           | **10 bảng**                        | `RowActions`                                | Thấp    | 1C               |
| **D4**  | `<Tag>` trần thay vì `StatusTag`                               | **11 file**                        | `StatusTag` + `*_STATUS_META`               | TB      | 1C               |
| **D5**  | Modal↔Drawer responsive tự chế                                 | **3 bản chế + 10 chưa responsive** | `ResponsiveDialog`                          | **CAO** | 1B               |
| **D6**  | Detail drawer                                                  | **7 file**                         | `DetailDrawer`                              | TB      | 1B               |
| **D7**  | Khối "avatar + tên + phụ đề"                                   | **≥8 nơi**                         | `EntityIdentity`                            | Thấp    | 1C               |
| **D8**  | `Suspense fallback={<Spin .../>}` + `.state` CSS               | **11 page**                        | `LoadingState`                              | Thấp    | 1C               |
| **D9**  | Bảng dựng thẳng trong `page.tsx` (không có `*Table.tsx`)       | **4 page**                         | tách ra `*Table.tsx`                        | Thấp    | theo module      |
| **D10** | Điểm gãy breakpoint hard-code                                  | **21 giá trị**                     | 3 token                                     | **CAO** | ~~1A~~ → dời dần |
| **D11** | Bí danh token trùng vai trò                                    | **9 token**                        | ✅ **Đã gom (Wave 1A)**                     | —       | 1A ✔             |
| **D12** | Hai hệ đổ bóng song song (XePrime vs AntD)                     | 2 hệ                               | ✅ **Đã gom (Wave 1A)**                     | —       | 1A ✔             |

### Đối chiếu số liệu — Batch 1C.0 (07/08/2026)

Đo lại bằng `rg` trước khi gom. Bảng tổng ở trên giữ nguyên ID; cột "Số nơi" sửa như sau:

| ID     | Doc ghi               | Đo được                                                                                                                                                             | Ghi chú                                                       |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **D1** | 17 page + 8 component | **23 file có `<Result>`** (gồm 3 file không phải scaffold danh sách: `admin/layout.tsx` = 403, `AppShell.tsx`, `DetailDrawer.tsx` = primitive 1B) → **20 nơi thật** | `<Empty>` 23 file                                             |
| **D2** | 10/13 giữ bản copy    | ✅ **đúng** — 3 dùng `useUrlFilters`, 10 giữ copy. Trừ `use-calendar-filters` → **9 ứng viên gom**                                                                  | —                                                             |
| **D3** | 10 bảng + 2 inline    | **11 `*Table.tsx` + 3 inline = 14 bảng cấp trang** (`admin/plans` bị bỏ sót ở doc cũ)                                                                               | +1 bảng lồng trong `AdminCustomerDetailDrawer`, ngoài phạm vi |
| **D7** | ≥8 nơi                | `<Avatar>` **7** · tính initial **9**                                                                                                                               | 2 `charAt(0)` khác là viết-hoa-chữ-đầu, không gom             |
| **D8** | 11 page               | `<Spin>` **27 file** toàn repo; `Suspense fallback` + `.state` là tập con                                                                                           | Đếm chính xác từng nơi ở 1C.1                                 |
| **D9** | 4 page                | **3** — `members`, `admin/staff`, `admin/plans`. `receipts` **có** `ReceiptTable.tsx` riêng                                                                         | Doc cũ tính nhầm `receipts`                                   |

**D3 — phát hiện quan trọng, ngược với doc cũ.** Doc ghi _"`fixed: 'right'` có ở đa số"_. Thực tế
**đúng 1/14** bảng có (`VehicleTable`). Figma `127:2060` quy tắc 1 bắt buộc sticky cho 14/16 bảng
và `127:2093`–`127:2096` tự khai "05/06/09–11 đã có sticky" — **không đúng với code**. Đây là
khoảng cách lớn nhất của Wave 1C, không phải a11y.

**D3 — lỗ a11y hẹp hơn doc mô tả.** Chỉ **5 nút icon ở 3 file** thiếu tên khả truy cập
(`VehicleTable` ×3 dùng `Tooltip` thay `aria-label`, `members/page` ×1, `admin/staff/page` ×1).
`BookingTable` đã có `aria-label`; 4 bảng khác dùng nút có chữ nên vốn đã có tên.

### Cập nhật sau Wave 1B — D5 và D6 ĐÃ GOM ✅

**D5 (overlay tự chế responsive) và D6 (detail drawer) đóng.** 19 overlay nghiệp vụ giờ dùng
`ResponsiveDialog`/`DetailDrawer`; 3 bản tự chế nhánh mobile (`AuthModal`, `RequestBookingModal`,
`FilterPanel`) đã bỏ, kèm luôn lỗi `size="88dvh"` ở 2 trong 3 bản đó.

Ngoài ra đã xoá 6 khối CSS `.center` mồ côi (khung căn giữa cho `Spin`) vì `DetailDrawer` lo
trạng thái tải, và gỡ `.drawerRoot` của `AuthModal` (bo góc 18px + `max-height: 84vh` viết tay)
— hai giá trị đó nay lấy từ token trong `ResponsiveDialog`.

### Cập nhật sau Wave 1A

**D11 — bí danh token: ĐÃ GOM.** 9 token trùng vai trò (`color-bg-layout`, `color-border-secondary`, `gold-deep`, `gold-wash`, `color-bg-sand`, `shadow-sm/md/lg`) giờ trỏ `var()` về token canonical thay vì mang giá trị riêng. Không còn hai nguồn giá trị; `theme.test.ts` có test chặn tái phát. 134 consumer **không phải sửa dòng nào**. Bảng đầy đủ: [02 §16](02_DESIGN_TOKEN_MAP.md).

**D12 — đổ bóng: ĐÃ GOM.** Trước Wave 1A, CSS Module dùng bóng nâu ấm còn AntD dùng bóng xám ba lớp — hai hệ hiển thị cạnh nhau. Giờ cả hai lấy từ Elevation 1/2/3 (`14:173`/`14:176`/`14:179`).

**D10 — breakpoint: ĐỔI CÁCH LÀM, KHÔNG gom hàng loạt.** Design-brief 00 §9.4 (nguồn có thẩm quyền về responsive) chỉ định migrate _“as files are touched rather than in a bulk change”_ — thắng kế hoạch Wave 0B. Wave 1A đã làm phần nền: 3 token + `XP_BREAKPOINTS` + `useIsMobile/useIsTablet/useIsDesktop`. ~21 điểm gãy trong `.module.css` dời dần theo wave module. Xem [02 §13](02_DESIGN_TOKEN_MAP.md).

**D13 (MỚI) — 9 tham chiếu CSS chết trong `CalendarScheduler`.** Không phải trùng lặp mà là **lỗi đang chạy** phát hiện khi rà token: 9 `var(--xp-*)` chưa từng được khai báo, không fallback. Chi tiết + bảng ánh xạ sẵn: [02 §19](02_DESIGN_TOKEN_MAP.md) (nợ T1). Sửa ở wave lịch, không phải wave token.

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

| Chiều                             | Biến thể quan sát được                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Điều kiện lỗi**                 | `isError && !data` (vehicles) vs `isError` trần (một số admin page) — bản sau **nháy lỗi khi refetch nền** |
| **Phân biệt empty vs no-results** | ✅ vehicles, bookings, receipts, debts · ❌ một số admin page chỉ có một `Empty` chung                     |
| **Nút trong empty**               | có/không tuỳ `canCreate`; không nhất quán ai kiểm quyền                                                    |
| **Câu chữ**                       | 17 tiêu đề lỗi khác nhau ("Không tải được danh sách xe" / "…đơn thuê" / …)                                 |
| **Điều kiện loading**             | `!isFetching && items.length === 0` vs chỉ dựa `loading` prop của `Table`                                  |
| **Permission-denied**             | Chỉ vài trang có; đa số dựa `admin/layout.tsx` gác cả nhánh                                                |

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

[useUrlFilters](../../apps/web/src/hooks/use-url-filters.ts) đã tồn tại và docstring **tự khai**: _"Các feature cũ vẫn giữ bản copy của riêng chúng — dời dần sang đây khi chạm vào."_

| Dùng `useUrlFilters` ✅ (3)                           | Giữ bản copy ❌ (10)                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `admin-bookings/hooks/use-admin-booking-filters.ts`   | `admin-audit/hooks/use-audit-filters.ts`                |
| `admin-customers/hooks/use-admin-customer-filters.ts` | `admin-tenants/hooks/use-admin-tenant-filters.ts`       |
| `admin-vehicles/hooks/use-admin-vehicle-filters.ts`   | `approvals/hooks/use-approval-filters.ts`               |
|                                                       | `booking-requests/hooks/use-booking-request-filters.ts` |
|                                                       | `bookings/hooks/use-booking-filters.ts`                 |
|                                                       | `calendar/hooks/use-calendar-filters.ts`                |
|                                                       | `finance/hooks/use-debt-filters.ts`                     |
|                                                       | `finance/hooks/use-receipt-filters.ts`                  |
|                                                       | `marketplace/hooks/use-marketplace-filters.ts`          |
|                                                       | `vehicles/hooks/use-vehicle-filters.ts`                 |

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

| Loại                                                                        | Ví dụ                                                                                                                           | Xử lý                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Vi phạm thật** — hiển thị status nghiệp vụ bằng `<Tag>` trần, màu tự chọn | `members/page.tsx`, `admin/staff/page.tsx`, `AdminCustomerDetailDrawer`                                                         | **Chuyển sang `StatusTag`**; nếu thiếu `*_STATUS_META` thì bổ sung vào `@xeprime/types` (ADR 0005) |
| **Hợp lệ** — `<Tag>` không mang status                                      | `VehicleTable` `<Tag color="red">-{discountPercent}%</Tag>` (nhãn khuyến mãi) · `CategoryManagerModal` (nhãn danh mục hệ thống) | **Giữ nguyên**                                                                                     |
| **Cần xác minh**                                                            | `AccountView`, `PaymentHistory`, `TenantPlanSection`, `VehicleDetailView`                                                       | Đọc từng chỗ ở Wave 1C                                                                             |

### Migration risk: **TRUNG BÌNH**

Vi phạm CLAUDE.md §5 (_"String literal trần cho status — luôn `BOOKING_STATUS.ACTIVE`"_). Nhưng chuyển sang `StatusTag` **có thể đổi màu hiển thị** nếu `*_STATUS_META` khai màu khác màu đang hard-code → khác biệt thị giác cần chụp ảnh trước/sau.

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

| Cặp                                                              | Vì sao giữ riêng                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `members/` ↔ `admin-staff/`                                      | Ranh giới bảo mật khác (tenant vs platform). Gom sẽ tạo component biết cả hai scope — CLAUDE.md §5 cấm |
| `FilterPanel` (marketplace) ↔ `FilterBar` (danh sách quản lý)    | Ngữ nghĩa khác: facet + khoảng giá vs lọc bảng                                                         |
| `VehicleCard` (marketplace) ↔ `EntityCard` (thẻ mobile của bảng) | Một cái là sản phẩm bán hàng, một cái là hàng dữ liệu                                                  |
| `use-calendar-filters`                                           | Lịch không phân trang — quy tắc "reset page" không áp dụng                                             |
| `Logo` ↔ `BrandMark`                                             | Logo XePrime vs logo hãng xe                                                                           |
| `packages/ui`                                                    | Chỉ một app tiêu thụ — xem [00_IMPLEMENTATION_OVERVIEW.md §4.1](00_IMPLEMENTATION_OVERVIEW.md)         |

---

## Kết toán cuối Wave 1C (1C-E · 07/08/2026)

| ID                                | Trước Wave 1C                     | Sau Wave 1C                                                                                                                             | Trạng thái          |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| **D1** scaffold trạng thái        | 20 nơi                            | **0 nơi ở danh sách quản lý** (`<Result>` còn 9: 5 trang chi tiết/dashboard ngoài phạm vi, 3 hạ tầng, 0 danh sách)                      | ✅ Đóng             |
| **D2** hook filter tự chế         | 10/13                             | **4/13** — 2 loại trừ vĩnh viễn (calendar, marketplace), 2 loại trừ ngữ nghĩa (approvals, booking-requests: mặc định `pending` ≠ `all`) | ✅ Đóng có loại trừ |
| **D3** cột hành động              | 14 bảng, **1** có `fixed:'right'` | **14/14** qua `actionColumn`; 13 dùng `RowActions`                                                                                      | ✅ Đóng             |
| **D4** `<Tag>` trần               | 11 file                           | Còn 3 chỗ, **đều hợp lệ**: nhãn vai trò ×2 (không có `*_ROLE_META` — P5), nhãn khuyến mãi ×1                                            | ✅ Đóng có loại trừ |
| **D5/D6** overlay                 | —                                 | ✅ đã đóng ở Wave 1B                                                                                                                    |
| **D7** khối định danh             | ≥8 nơi                            | `EntityIdentity` ×3 (`VehicleTable`, `members`, `admin/staff`); `initialOf` gom 9 bản chép tay                                          | ✅ Đóng phần bảng   |
| **D8** `Suspense` + `.state`      | 11 page                           | `LoadingState` ở 6 trang đã migrate; còn ở các trang ngoài phạm vi                                                                      | 🟡 Một phần         |
| **D9** bảng dựng trong `page.tsx` | 3                                 | **3** — tách file là việc cấu trúc, không phải hạ tầng Wave 1C                                                                          | 🟡 Hoãn             |
| **D10** breakpoint                | 21 giá trị                        | Dời dần theo file (brief 00 §9.4)                                                                                                       | 🟡 Theo kế hoạch    |

**Nợ mới ghi nhận**: `StickyFormActions` có 0 consumer (5 form dài chờ wave form; `VehicleForm` bị
chỉ thị 1C-E cấm đụng) · `renderCard` mobile 0/14 (chờ P26).

---

## D17 — `MobileNav` dùng thẳng `Drawer` của AntD ✅ NGOẠI LỆ CÓ CHỦ Ý

**Nhìn qua thì giống trùng lặp**: Wave 1B đã dựng `DetailDrawer` bọc `Drawer`, và `MobileNav`
cũng mở một `Drawer`. Tại sao không gom?

**Vì hai thứ khác NGỮ NGHĨA, không chỉ khác giao diện.** `DetailDrawer` nghĩa là _"chi tiết của
một thực thể nghiệp vụ"_ — nó có tiêu đề là tên thực thể, vùng hành động tác động lên thực thể
đó, và người dùng đọc nó như đang xem một bản ghi. Menu điều hướng không phải một bản ghi. Nhét
menu vào `DetailDrawer` là nói dối về ngữ nghĩa và kéo theo cả bộ hành vi không liên quan
(nút hành động trên thực thể, khoảng đệm cho nội dung chi tiết).

`Drawer` của AntD **vẫn là primitive đúng** ở đây, nên `MobileNav` gọi thẳng nó. Đây KHÔNG phải
"dựng primitive drawer thứ hai" — có test chốt cả hai điều: không import `DetailDrawer`, và
không tự dựng `position: fixed` để giả làm drawer.

**Kết luận: không gom. Không mở lại nếu không có lý do mới.**

---

## D18 — Hai thanh điều hướng dưới đáy ✅ ĐÚNG, KHÔNG GOM

`MobileNav` (cổng quản lý) và `MobileTabBar` (marketplace) trông giống nhau nhưng phục vụ hai
khu tách biệt và có hành vi khác nhau ở đúng chỗ quan trọng:

|                       | `MobileNav`           | `MobileTabBar`                       |
| --------------------- | --------------------- | ------------------------------------ |
| Khu                   | `(manage)`            | `(public)`                           |
| Lọc                   | quyền tenant/platform | trạng thái đăng nhập                 |
| Tab chưa đủ điều kiện | **ẩn hẳn**            | hiện, bấm vào **mở modal đăng nhập** |
| Ranh breakpoint       | 1024 (chính tắc)      | 760 _(chưa dời — xem nợ)_            |

Gộp hai cái này là trộn ranh giới khách hàng ↔ gian hàng — điều CLAUDE.md mục 6 cấm.

---

## D20 — `VehicleFiltersBar` từng là bản sao của `FilterBar` ✅ ĐÃ GOM (Wave 2)

Trước Pilot Wave 2, `VehicleFilters.tsx` tự dựng lại toàn bộ thanh lọc: hàng flex-wrap, bề rộng
ô tìm kiếm, debounce 400ms viết tay, và một breakpoint `576px` **không thuộc thang XePrime**.
Đó là bản sao của `FilterBar` (Wave 1C) — cùng bài toán, giải hai lần, gãy ở hai chỗ khác nhau.

Nay `VehicleFiltersBar` chỉ còn **khai định nghĩa filter của Fleet** và truyền vào `FilterBar`.
`VehicleFilters.module.css` từ 4 khối rớt còn **1** (bề rộng ô sắp xếp).

**Cái được giữ lại có chủ ý**: ô "Sắp xếp" KHÔNG phải một `field` của `FilterBar` mà nằm ở slot
`actions`. Nó không lọc dữ liệu; gộp vào sẽ khiến `countActiveFilters` luôn đếm ≥1 (mặc định
`newest`), nút "Xoá bộ lọc" hiện vĩnh viễn, huy hiệu số trên nút "Bộ lọc" ở mobile luôn sai, và
"Xoá bộ lọc" sẽ nuốt luôn sắp xếp — hành vi đã có test khoá từ Wave 1C. Figma đồng ý: `58:129`
đặt nó ở lề phải cụm lọc, `58:2429` đặt cạnh nút "Bộ lọc".

---

## D21 — CSS chết ở Fleet List ✅ ĐÃ DỌN (Wave 2)

- `VehicleTable.module.css`: 4 class chết (`.cell`, `.name`, `.meta`, `.rowClickable`) còn lại
  sau khi Wave 1C chuyển sang `EntityIdentity`/`DataTable`. `.meta` còn tham chiếu
  **`--xp-text-secondary`** — một token **không tồn tại** (tên đúng là `--xp-color-text-secondary`),
  kèm fallback `rgba()` thô. Đã xoá cả bốn.
- `vehicles-page.module.css`: **không file nào import** — đã xoá hẳn.

---

## D22 — Thanh hành động form dựng tay ở `VehicleForm` ✅ ĐÃ GỘP (Wave 3A)

`VehicleForm` tự dựng `.actions` (flex + hai `Button` + breakpoint riêng **576px**) trong khi
`StickyFormActions` đã tồn tại từ Wave 1C và chưa có consumer nào. Đã thay bằng component chung:
mất một bản sao bố cục, mất luôn **breakpoint 576px không chính tắc** (chỉ 640/1024 được phép).

## D23 — Trạng thái tải/lỗi dựng tay ở 3 route Fleet ✅ ĐÃ GỘP (Wave 3A)

`new` / `[id]` / `[id]/edit` dùng `<Skeleton>` và `<Result status="404|error">` trần thay vì
`LoadingState` / `EmptyState`. Đã chuyển hết sang component chung. Kèm theo là một sửa hành vi
thật: **404 không còn mời "Thử lại"** — thử lại một bản ghi không tồn tại là ngõ cụt
(`EmptyState` R10).

## D24 — Ba route Fleet KHÔNG gác quyền ✅ ĐÃ VÁ (Wave 3A)

Nghiêm trọng nhất của Wave 3A: cả ba route đều dựng nội dung mà **không kiểm tra quyền nào**.
`/new` dựng form tạo cho người không có `vehicles.create`; `/[id]/edit` dựng form sửa cho người
không có `vehicles.update`; `/[id]` hiện toàn bộ bản ghi cho người không có `vehicles.view`.

Đã thay bằng `PermissionState` cấp trang (cùng khuôn với Wave 2 `58:2061`, Figma `62:893` cho
edit). Hai route chi tiết/sửa còn **không gọi API** khi thiếu quyền — bớt một request chắc chắn
bị guard backend từ chối.

⚠️ Đây là lớp trải nghiệm. Lớp chặn thật vẫn là guard backend; không route nào dựa vào việc ẩn nút.
