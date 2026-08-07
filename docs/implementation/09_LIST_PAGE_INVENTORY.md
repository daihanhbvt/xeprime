# 09 — LIST PAGE INVENTORY (Wave 1C, Batch 1C-A)

> Ngày lập: 07/08/2026 · Batch **1C-A** — kiểm kê + test đặc tả. **0 file production đổi.**
> Mọi con số đo bằng `rg`/`glob` trên source, **không lấy lại từ tài liệu**. Chỗ nào chưa xác minh
> ghi thẳng `chưa kiểm`, không suy đoán ([standard](../design-briefs/_DESIGN_BRIEF_STANDARD.md) R1).

Tài liệu này trả lời mục 6–7 của chỉ thị 1C-A và là **đầu vào bắt buộc** cho 1C.3/1C.6.
Đối chiếu số liệu với [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md) ở §4.

---

## 0. Tiến độ rollout — WAVE 1C HOÀN THÀNH (cập nhật 1C-E, 07/08/2026)

**14/14 bảng cấp trang đã dùng `DataTable`.** Không còn `<Table>` AntD trực tiếp ở bất kỳ danh
sách quản lý nào.

| Route | Rủi ro | Đợt | Test |
| --- | --- | --- | --- |
| `/manage/admin/audit` | Thấp | 1C-D | 18 |
| `/manage/admin/plans` | TB | 1C-D | 18 |
| `/manage/admin/tenants` | TB | 1C-D | 26 |
| `/manage/admin/vehicles` | TB | 1C-D | 18 |
| `/manage/members` | **Cao** (quyền tenant) | 1C-E | 18 |
| `/manage/admin/staff` | **Cao** (quyền nền tảng) | 1C-E | 11 |
| `/manage/vehicles` | **Cao** (vận hành xe) | 1C-E | 28 |
| `/manage/receipts` | **Cao** (tiền) | 1C-E | 30 |
| `/manage/debts` | **Cao** (tiền) | 1C-E | — |
| `/manage/bookings` | **Cao** (chuyển trạng thái) | 1C-E | — |
| `/manage/booking-requests` | **Cao** (tạo đơn thuê) | 1C-E | — |
| `/manage/admin` (approvals) | **Cao** (governance) | 1C-E | — |
| `/manage/admin/bookings` | **Cao** (PII) | 1C-E | — |
| `/manage/admin/customers` | **Cao** (PII) | 1C-E | — |

### Consumer cuối cùng của từng component chung

| Component | Consumer |
| --- | --- |
| `DataTable` + `actionColumn` | **14 bảng** (11 `*Table.tsx` + 3 dựng trong `page.tsx`) |
| `RowActions` | 13 bảng (`BookingRequestTable` loại trừ có lý do — xem dưới) |
| `EntityIdentity` | **3** — `VehicleTable` (xe) · `members` · `admin/staff` (người) |
| `EmptyState` / `LoadingState` | qua `DataTable` ở cả 14 bảng + `Suspense` fallback ở 6 trang |
| `PermissionState` | **1** — `admin/layout.tsx` (403 khu quản trị) |
| `FilterBar` | **6** — audit · plans · tenants · admin/vehicles · members · admin/staff |
| `useUrlFilters` | **9/13** hook |
| `StickyFormActions` | **0** — xem "nợ còn lại" |

### Loại trừ có lý do (KHÔNG phải bỏ sót)

| Chỗ | Vì sao giữ nguyên |
| --- | --- |
| `use-calendar-filters` | Lịch **không phân trang** → luật trung tâm của `useUrlFilters` vô nghĩa |
| `use-marketplace-filters` + `FilterPanel` | Facet: mảng CSV, boolean `1`, "Áp dụng (N xe)" — khác hẳn lọc bảng quản lý |
| `use-approval-filters`, `use-booking-request-filters` | `status` mặc định là **`pending`**, không phải `'all'`. `useUrlFilters` xoá giá trị sentinel nên chọn "Tất cả" sẽ **âm thầm quay về `pending`** — phá nghĩa bộ lọc |
| Cột hành động của `BookingRequestTable` | Cặp CTA Duyệt/Từ chối là nút **chính**; `RowActions` render `type="text"` sẽ hạ cấp một quyết định tạo đơn thuê thật. Vẫn giữ `fixed: 'right'` + width theo `127:2060` |
| `<Table>` trong `AdminCustomerDetailDrawer` | Bảng con **trong panel chi tiết** (đơn của một khách), không phải danh sách cấp trang |
| `<Tag>` vai trò ở `members` / `admin/staff` | **Nhãn vai trò**, không phải trạng thái nghiệp vụ; `@xeprime/types` không có `*_ROLE_META` → chuyển sẽ phải bịa màu (P5) |
| `<Tag color="red">-N%</Tag>` ở `VehicleTable` | Nhãn khuyến mãi, không phải status |
| `<Result>` ở `contracts/[id]`, `finance`, `shop`, `vehicles/[id]`, `vehicles/[id]/edit` | **Trang chi tiết / dashboard, không phải danh sách** — ngoài phạm vi Wave 1C; `vehicles/[id]`, `/edit` còn bị chỉ thị 1C-E cấm đụng |
| `<Empty>` ở chat, marketplace, notifications, calendar, my-trips | Không phải bảng quản lý; đều là danh sách/lưới miền riêng |

### Nợ còn lại sau Wave 1C

| Nợ | Trạng thái |
| --- | --- |
| `StickyFormActions` chưa có consumer | Đã dựng + 19 test ở 1C-C; 5 form dài (`VehicleForm`, `ShopProfileForm`, `BookingFormDrawer`, `ReceiptFormDrawer`, `PlanFormModal`) chưa nối. `VehicleForm` bị chỉ thị 1C-E cấm đụng → **hoãn sang wave form** |
| `renderCard` mobile | **0/14 bảng**. Figma `127:2257` chỉ ánh xạ 7 bảng; P26 chưa chốt → giữ bảng cuộn ngang (D15.x) |
| D9 — 3 bảng dựng trong `page.tsx` | `members`, `admin/staff`, `admin/plans` vẫn nội tuyến. Tách file là việc cấu trúc, không phải hạ tầng Wave 1C |
| 4 hook filter chưa dời | 2 loại trừ vĩnh viễn + 2 loại trừ ngữ nghĩa (bảng trên) |
| `FilterBar` ở 8 trang còn lại | Bộ lọc vẫn nội tuyến trong `ManagePageHeader extra` — chạy đúng, chỉ chưa gom |

## 1. Phạm vi: 14 bảng cấp trang

15 file chứa `<Table>`. Trừ 1 bảng lồng trong drawer (`AdminCustomerDetailDrawer` — danh sách đơn
của một khách, không phải danh sách cấp trang) → **14 bảng cấp trang**, chia:

- **11** component `*Table.tsx` trong `features/`
- **3** dựng thẳng trong `page.tsx` (`members`, `admin/staff`, `admin/plans` — nợ D9)

Figma [`127:1564`](https://www.figma.com/design/GnaJwLjHkWH9BEkcT1lL7W/Untitled?node-id=127-1564)
kiểm kê **16**. Chênh 2, đã truy nguyên:

| Figma có | Code có gì |
| --- | --- |
| `Calendar` | `CalendarScheduler` — scheduler ảo hoá, **không** phải `<Table>`. Ngoại lệ có văn bản (`130:1752`) |
| `Subscription History` | **Không phải bảng**: `<ul>` trong [TenantPlanSection](../../apps/web/src/features/admin-plans/components/TenantPlanSection.tsx#L83) và `<List>` trong [PaymentHistory](../../apps/web/src/features/payments/components/PaymentHistory.tsx#L42) |

---

## 2. Kiểm kê ngang — thứ có và KHÔNG có

| Hạng mục | Số nơi | Ghi chú |
| --- | --- | --- |
| Phân trang server-side | **14/14** | `meta{page,limit,total,hasNext}`; `showSizeChanger` + `showTotal` ở cả 14 |
| Kích thước trang mặc định | 20 ở mọi module quản lý | ngoại lệ: notifications 15, my-trips 10 |
| **Sắp xếp — cột bảng** | **0/14** | **Không một `sorter` nào trong toàn repo.** Do đó `aria-sort` của `130:1658` hiện không có đối tượng áp dụng |
| Sắp xếp — tham số server | **2** | `sort` gửi lên API ở [vehicles/api.ts:26](../../apps/web/src/features/vehicles/api.ts#L26) và [bookings/api.ts:29](../../apps/web/src/features/bookings/api.ts#L29); UI là **một `Select` trong thanh lọc**, không phải header cột |
| **Chọn hàng (`rowSelection`)** | **0** | không tồn tại |
| **Hành động hàng loạt** | **0** | khớp brief 00 D5 |
| Cột cố định (`fixed: 'right'`) | **1/14** | chỉ [VehicleTable:114](../../apps/web/src/features/vehicles/components/VehicleTable.tsx#L114) — **D15.1** |
| `scroll={{ x: 'max-content' }}` | **15/15** | không nén cột (đúng `127:2097` R8) nhưng **không có `MIN_TABLE_WIDTH`** (trái R1) |
| Bóng gợi ý cuộn | **0** | trái `127:2097` R5 — D15.4 |
| **Chuyển thẻ ở ≤640px** | **0/14** | trái `127:2257` R1 |
| Width cột tường minh | **7 khai báo** toàn repo | 5 trong số đó là cột hành động: 130 · 190 · 60 · 70 · 70 — **không giá trị nào khớp thang Figma** (100 icon / 120 text) |
| Tiền canh phải | **7/7 cột tiền** ✅ | điểm code đã đúng sẵn |
| `<Result>` | 23 file | trừ `admin/layout` (403), `AppShell`, `DetailDrawer` → **20 nơi scaffold thật** |
| `<Empty>` · `<Spin>` · `<Skeleton>` | 23 · 27 · 8 | |
| `status="403"` | **1 file** | [admin/layout.tsx:36](<../../apps/web/src/app/(manage)/manage/admin/layout.tsx#L36>) — ngoài nhánh admin **không có** nhánh 403 nào |
| `<Tag>` trần làm status nghiệp vụ | 11 file | phân loại vi phạm/hợp lệ ở [04 D4](04_COMPONENT_DUPLICATES.md) |
| Nút icon-only thiếu tên khả truy cập | **5 nút / 3 file** | `VehicleTable` ×3 (chỉ `Tooltip`) · `members/page` ×1 · `admin/staff/page` ×1 — **D15.2** |
| Khối avatar+tên lặp | `<Avatar>` 7 nơi · tính initial **9** nơi | |

---

## 3. Kiểm kê filter

### 3.1 Mười ba hook

| Dùng `useUrlFilters` (3) | Giữ bản copy (10) |
| --- | --- |
| `use-admin-booking-filters` · `use-admin-customer-filters` · `use-admin-vehicle-filters` | `use-audit-filters` · `use-admin-tenant-filters` · `use-approval-filters` · `use-booking-request-filters` · `use-booking-filters` · **`use-calendar-filters`** · `use-debt-filters` · `use-receipt-filters` · `use-marketplace-filters` · `use-vehicle-filters` |

**Ứng viên gom = 9** (10 bản copy − `use-calendar-filters`, loại trừ theo chỉ thị 1C-A mục 15).

### 3.2 ⚠️ Khác biệt hành vi thật giữa bản copy và bản dùng chung

Không phải chỉ là trùng lặp — **hai bên xử lý `'all'` khác nhau**:

| | Xoá param khi giá trị là… |
| --- | --- |
| `useUrlFilters` ([use-url-filters.ts:38-45](../../apps/web/src/hooks/use-url-filters.ts#L38-L45)) | `undefined` · `null` · `''` · **`'all'`** · **`false`** |
| Mọi bản copy | `undefined` · `null` · `''` **— chỉ ba** |

Hệ quả đo được: `/manage/admin/tenants` bấm "Xoá bộ lọc" hiện vẫn để lại **`?status=all`** trong URL.
Chuyển sang `useUrlFilters` ở 1C.8 sẽ làm URL sạch hơn — **đó là đổi hành vi, phải nêu trong PR**.
Đã khoá bằng test đặc tả (`tenants-page.test.tsx`).

**Giống nhau ở cả 13 hook** (không có bản nào lệch): đổi filter bất kỳ → `params.delete('page')`;
ghi bằng `router.replace(..., { scroll: false })`. Quy tắc "reset về trang 1" của `127:2339` R6
**đã đúng ở toàn bộ 13 hook**.

### 3.3 Debounce

| Nơi | Độ trễ | Nguồn |
| --- | --- | --- |
| `VehicleFiltersBar` (ô tìm kiếm) | **400ms** | [VehicleFilters.tsx:21](../../apps/web/src/features/vehicles/components/VehicleFilters.tsx#L21) |
| `FilterPanel` marketplace (draft facet) | **300ms** | `useDebouncedValue(draft, 300)` |
| **Mọi ô tìm kiếm khác** | **0 — không debounce** | dùng `Input.Search` + `onSearch` (Enter / bấm nút) |

### 3.4 Ô tìm kiếm — nơi có, nơi không

**Có (8):** `vehicles` (debounce, có kiểm soát) · `bookings` · `members` · `admin/tenants` ·
`admin/vehicles` · `admin/bookings` · `admin/customers` · `admin/staff`.
**Không (6):** `booking-requests` · `receipts` · `debts` · `admin/audit` · `admin/plans` · `admin` (approvals).

> ⚠️ Figma `127:2339` ghi **Members = "❌ Không có search"** và **07 Finance = "✅ Có search"**.
> **Cả hai đều ngược với code**: `members/page.tsx` **có** ô tìm kiếm, `receipts` **không có**.
> Thêm bằng chứng cho quy tắc [00 §9.1](00_IMPLEMENTATION_OVERVIEW.md) — frame section 12 không
> đáng tin về *hiện trạng*. Ghi ở **P23**.

### 3.5 Ngoại lệ calendar

`use-calendar-filters` **loại trừ khỏi phạm vi gom** (chỉ thị 1C-A mục 15 + [04 D2](04_COMPONENT_DUPLICATES.md)):
lịch không phân trang nên quy tắc "reset về trang 1" không áp dụng, và `CalendarScheduler` là ngoại
lệ có văn bản trong Figma (`130:1752`).

---

## 4. Kiểm kê nền tảng form

| Mục | Trạng thái thật | Việc còn lại ở 1C.10 |
| --- | --- | --- |
| `NumberField` — tiền | ✅ **Đã có** `money` + nhóm nghìn kiểu VN + hậu tố `₫` ([:33](../../apps/web/src/components/form/NumberField.tsx#L33)) | — |
| `NumberField` — phần trăm | ❌ **Chưa có** | thêm variant `percent` (`62:1553`) |
| `TextAreaField` — đếm ký tự | ✅ **Đã có** `showCount={Boolean(maxLength)}` ([:38](../../apps/web/src/components/form/TextAreaField.tsx#L38)) | — |
| `DateTimeField` — khoảng ngày | ❌ **Chưa có** — chỉ `DatePicker` đơn | thêm variant `range` |
| Định dạng tiền hiển thị | ✅ [formatMoneyVnd](../../apps/web/src/lib/money.ts) là điểm gom duy nhất, thao tác **trên chuỗi** (ADR 0007) | không tự format ở nơi khác |
| Thanh hành động dính đáy | ❌ Chưa có; 19 nơi dùng `styles.actions`, trong đó **5 form dài** là ứng viên thật: `VehicleForm` · `ShopProfileForm` · `BookingFormDrawer` · `ReceiptFormDrawer` · `PlanFormModal` | tạo `StickyFormActions` |
| Inline style trong `components/form/` | ⚠️ **10 chỗ** (`marginBottom: 14`, `width: '100%'`) — vi phạm CLAUDE.md §5 | dời sang CSS Module khi chạm file (**D15.3**) |
| Nhãn ↔ ô nhập | ⚠️ Chỉ `TextField` có `useId()` + `htmlFor`. `NumberField`/`TextAreaField`/`SelectField`/`DateTimeField` **không** → ô nhập không có tên khả truy cập (**D14.4**) | sửa cùng 1C.10 |

---

## 5. Bảng phân loại rủi ro + hồ sơ từng trang

**Thang rủi ro** (theo chỉ thị 1C-A mục 6):
**Thấp** = chỉ đọc, không mutation · **TB** = có hành động hàng hoặc mutation đơn giản ·
**Cao** = tiền, chuyển trạng thái đơn thuê, vận hành xe, quyền tenant, hành động hàng loạt, hoặc
overlay lồng phức tạp.

| # | Route | Bảng | Cổng | Quyền dùng ở trang | Filter / Search | Hành động hàng | Trạng thái (E / NR / Err / 403) | Test | Rủi ro | Đợt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/manage/admin/audit` | `AuditLogTable` | Platform | — (gác ở layout) | filter, **không** search | Xem → drawer | E=NR chung · Err ✓ · 403 ✗ | — | **Thấp** | **B1** |
| 2 | `/manage/admin/plans` | inline `page.tsx` | Platform | — | **không** filter | Sửa · Ngừng bán | E chung · Err ✓ · 403 ✗ | — | TB | **B1** |
| 3 | `/manage/admin/tenants` | `AdminTenantTable` | Platform | — | search (Enter) + status | Xem → drawer (khoá/mở shop) | E=NR chung · Err ✓ · 403 ✗ | ✅ **1C-A** | TB | **B1** |
| 4 | `/manage/admin/vehicles` | `AdminVehicleTable` | Platform | — | search + 4 select | Xem → drawer (ẩn xe) | E=NR chung · Err ✓ · 403 ✗ | — | TB | **B2** |
| 5 | `/manage/vehicles` | `VehicleTable` | Shop | `VEHICLE_CREATE/UPDATE/DELETE` | search **debounce 400ms** + 5 select + sort | Xem · Sửa · Xoá (Popconfirm) | **E ≠ NR** ✓ · Err ✓ · 403 ✗ | ✅ **1C-A** | **Cao** (vận hành xe) | **B2** |
| 6 | `/manage/members` | inline `page.tsx` | Shop | `MEMBER_INVITE/REMOVE/UPDATE_ROLE` | search | Gỡ thành viên (Popconfirm) | E chung · Err ✓ · 403 ✗ | — | **Cao** (quyền tenant) | **B3** |
| 7 | `/manage/admin/staff` | inline `page.tsx` | Platform | — | search + role/status | Gỡ nhân sự (Popconfirm) | E chung · Err ✓ · 403 ✗ | — | **Cao** (bảo vệ admin cuối) | **B3** |
| 8 | `/manage/admin/bookings` | `AdminBookingTable` | Platform | — | search + multi | Xem → drawer (**reveal PII**) | E=NR chung · Err ✓ · 403 ✗ | — | **Cao** (PII) | **B3** |
| 9 | `/manage/admin/customers` | `AdminCustomerTable` | Platform | — | search | Xem → drawer (**PII + bảng lồng**) | E=NR chung · Err ✓ · 403 ✗ | — | **Cao** (PII) | **B3** |
| 10 | `/manage/admin` (approvals) | `ApprovalTable` | Platform | — | status | Xem → drawer (**duyệt/từ chối**) | E ✓ · Err ✓ · 403 ✗ | — | **Cao** (governance) | **B4** |
| 11 | `/manage/booking-requests` | `BookingRequestTable` | Shop | — ⚠️ | status + date | **Duyệt · Từ chối** (Popconfirm) | E ✓ · Err ✓ · 403 ✗ | — | **Cao** (tạo đơn thuê) | **B4** |
| 12 | `/manage/bookings` | `BookingTable` | Shop | `BOOKING_CREATE` | search + status + **sort** | Xem → drawer | E ✓ · Err ✓ · 403 ✗ | — | **Cao** (chuyển trạng thái) | **B4** |
| 13 | `/manage/receipts` | `ReceiptTable` | Shop | `RECEIPT_CREATE/APPROVE` | 2 select, **không** search | **Duyệt · Huỷ** (Popconfirm) | **E ≠ NR** ⚠️ (xem dưới) · Err ✓ · 403 ✗ | ✅ **1C-A** | **Cao** (tiền) | **B5** |
| 14 | `/manage/debts` | `DebtTable` | Shop | `PAYMENT_RECORD` | filter | **Thu tiền** → `RecordPaymentModal` | E ✓ · Err ✓ · 403 ✗ | — | **Cao** (tiền) | **B5** |

**Chú giải cột trạng thái**: `E` = empty · `NR` = no-results · `Err` = lỗi có nút thử lại ·
`403` = màn thiếu quyền riêng. `E=NR chung` nghĩa là **một** khối `<Empty>` chỉ đổi dòng mô tả.
`403 ✗` ở **14/14** — không trang nào có `PermissionState` riêng.

### Ba bất thường cần giữ nguyên khi gom

1. **`/manage/receipts`** — `hasFilters = Boolean(filters.type || filters.status)` **bỏ qua**
   `categoryId`/`from`/`to`. Lọc theo khoảng ngày mà không ra kết quả sẽ hiện *"Chưa có phiếu
   thu/chi nào"* (empty) thay vì no-results. Sai theo `134:2093`, **nhưng là hiện trạng** — đã khoá
   bằng test, sửa ở 1C.6 và ghi rõ trong PR.
2. **`/manage/vehicles`** — dùng `isError && !data` (không nháy lỗi khi refetch nền). Vài trang
   admin dùng `isError` trần. Gom về một hành vi **đổi hành vi ở nhóm sau**.
3. **`/manage/booking-requests`** — duyệt/từ chối yêu cầu thuê **không kiểm quyền ở frontend**
   (anomaly đã ghi ở CLAUDE.md §7 / brief 11 §3.4). **KHÔNG "sửa" trong wave giao diện.**

### Thứ tự đợt đề xuất (rủi ro thấp → cao)

```
B1  audit · plans · admin/tenants        ← chỉ đọc / mutation đơn giản, có test đại diện
B2  admin/vehicles · vehicles            ← pilot thật của DataTable
B3  members · admin/staff · admin/bookings · admin/customers   ← quyền + PII
B4  admin(approvals) · booking-requests · bookings             ← chuyển trạng thái
B5  receipts · debts                                            ← tiền, làm cuối
```

Trùng khớp thứ tự Wave 3x của [06](06_MIGRATION_ORDER.md) (3B monitoring trước, 3D finance sau).

---

## 6. Đối chiếu với 06_MIGRATION_ORDER.md

| Chỗ 06 ghi | Thực đo | Xử lý |
| --- | --- | --- |
| `features/**/components/*Table.tsx` — **10 file** | **11** | sửa: thiếu `ApprovalTable` |
| `app/(manage)/**/page.tsx` — **17 file** | **20 nơi** có scaffold `<Result>`; **14** là trang danh sách; **3** có bảng inline | sửa |
| `hooks/use-*-filters.ts` — **9 file (trừ calendar)** | 13 hook · 3 đã gom · **9 ứng viên** | ✅ số khớp, cách diễn đạt ở 06 dễ nhầm |
| Checkpoint *"9/13 hook filter dùng `useUrlFilters`"* | sau 1C sẽ là **12/13** (3 sẵn có + 9 gom), calendar loại trừ | sửa checkpoint |
| 1C.2 *"3 trang đại diện: vehicles, admin/tenants, receipts"* | ✅ **đã làm ở 1C-A**, 84 test | đóng |
| D9 — bảng inline **4 page** | **3** (`receipts` **có** `ReceiptTable.tsx` riêng) | sửa (đã ghi ở [04](04_COMPONENT_DUPLICATES.md)) |

---

## 7. Test đặc tả đã có sau 1C-A

| File | Số test | Khoá lại điều gì |
| --- | --- | --- |
| [vehicles-page.test.tsx](<../../apps/web/src/app/(manage)/manage/vehicles/vehicles-page.test.tsx>) | **28** | bản chuẩn: E≠NR, `isError && !data`, debounce 400ms, quyền 3 mức, popconfirm xoá, bảng-ở-mobile |
| [tenants-page.test.tsx](<../../apps/web/src/app/(manage)/manage/admin/tenants/tenants-page.test.tsx>) | **26** | bản đối lập: Empty dùng chung, search không kiểm soát, **`?status=all` còn lại trong URL**, không kiểm quyền |
| [receipts-page.test.tsx](<../../apps/web/src/app/(manage)/manage/receipts/receipts-page.test.tsx>) | **30** | bề mặt tiền: dấu `+`/`−`, cột hành động biến mất khi thiếu quyền, ma trận trạng thái duyệt/huỷ, `hasFilters` bỏ sót ngày |

**Tổng 84 test, tất cả xanh.** Ba file này là **cổng gác** của 1C.3/1C.6: mọi khác biệt hành vi khi
gom sẽ hiện thành test đỏ.

### ⚠️ Khoảng trống đã biết của bộ test

`Select` của AntD 6 **không chốt được lựa chọn dưới jsdom** bằng sự kiện tổng hợp — đã thử cả
`click` trên mục `role="option"` lẫn `ArrowDown`/`Enter`; `onChange` không chạy. Vì vậy đường
**"đổi filter bằng dropdown → ghi URL"** không được phủ.

Hợp đồng tương đương vẫn được khoá qua hai đường chạy thật: `URL → filters` (khẳng định trên tham
số truyền xuống hook dữ liệu) và `filters → URL` (nút "Xoá bộ lọc", ô tìm kiếm, đổi trang).

> **Bài học ghi lại**: bản đầu của ba bộ test dùng `expect(url).not.toContain('page=')` **một mình**
> cho đường ghi URL. Khi tương tác không chạy, URL là chuỗi rỗng và phép phủ định đó **đúng một
> cách vô nghĩa** — ba test xanh mà không kiểm gì. Đã sửa: mọi test ghi URL nay kèm một khẳng định
> **khẳng định** (`toHaveBeenCalledTimes` / `toContain`). Áp dụng quy tắc này cho mọi test viết sau.
