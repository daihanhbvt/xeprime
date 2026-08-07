# 03 — COMPONENT REGISTRY

> Ngày lập: 06/08/2026 · Wave 0B · **cập nhật sau Wave 1A**. **Đây là hợp đồng tái dùng.** Trước khi viết bất kỳ component nào trong migration, tra bảng này. Component mới chỉ được tạo khi có **≥2 nơi tiêu thụ thật** — không tạo trước.

## ⓪⁺⁺⁺⁺⁺⁺ WAVE 1C HOÀN THÀNH — Batch 1C-E (07/08/2026)

**14/14 bảng quản lý dùng `DataTable`.** Không còn `<Table>` AntD trực tiếp ở danh sách nào.
Bảng consumer cuối cùng + toàn bộ loại trừ có lý do: **[09 §0](09_LIST_PAGE_INVENTORY.md)**.

| Quyết định Wave 0B                                       | Kết quả thực tế                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **CREATE** 10 component                                  | ✅ 10/10 đã dựng. **9 có consumer**; `StickyFormActions` còn 0 (nợ, xem 09)                        |
| **EXTEND** `NumberField`/`TextAreaField`/`DateTimeField` | ✅ — `money`+counter đã có sẵn từ trước, thêm `percent`, `precision`, `showCount`, `help`, `range` |
| **EXTEND** `FilterPanel` giữ riêng marketplace           | ✅ không đụng                                                                                      |
| **REUSE** `StatusTag`                                    | ✅ giữ preset AntD (P5 vẫn mở, không đổi màu nào)                                                  |
| **KEEP-ANTD** Button · message · Pagination              | ✅                                                                                                 |

### API component chung đã đổi trong lúc rollout

| Component       | Thêm gì                                                       | Vì sao                                                                              |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `DataTable`     | `pagination` thành **tuỳ chọn**                               | `/manage/admin/plans` lấy cả danh sách một lần (Figma `130:1752` ghi nhận ngoại lệ) |
| `FilterBar`     | field `segmented`; `searchable` cho select                    | 3 consumer segmented; `searchable` giữ `showSearch` của nhật ký (~28 hành động)     |
| `FilterBar`     | `countActiveFilters` bỏ qua `'all'`                           | `'all'` là sentinel không-lọc toàn repo                                             |
| `FilterBar`     | khoảng ngày hiện `DD/MM/YYYY`, ghi `YYYY-MM-DD`               | giữ đúng cách `/manage/admin/audit` đang hiển thị                                   |
| `useUrlFilters` | `SetFiltersOptions.resetPage`                                 | tham số chỉ đổi giao diện không được đá về trang 1                                  |
| `RowActions`    | bọc icon `aria-hidden`; bọc nút disabled để tooltip hiện được | hai lỗi a11y đo được khi dựng                                                       |

### Lỗi đã sửa nhờ migration

| #      | Lỗi                                                                                               | Sửa ở                          |
| ------ | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| D15.2  | 5 nút icon không có tên khả truy cập                                                              | `RowActions` bắt buộc `label`  |
| D15.7  | Bấm nút trong cột hành động **cũng** kích hoạt click hàng → nút "Sửa" thực tế mở trang chi tiết   | `RowActions` chặn nổi bọt      |
| D15.9  | CSS nhắm `.ant-table-cell-fix-right` — AntD 6 đổi thành `-fix-end`, nền đục **không có tác dụng** | `DataTable.module.css`         |
| D15.10 | Icon AntD làm bẩn accessible name (`"eye Thu tiền"`)                                              | `RowActions`                   |
| D15.11 | Tooltip trên nút disabled không bao giờ hiện                                                      | `RowActions`                   |
| D15.12 | `?page=0` lọt xuống API                                                                           | `positiveIntParam`             |
| D15.1  | 13/14 bảng thiếu `fixed: 'right'`                                                                 | `actionColumn` — nay **14/14** |

## ⓪⁺⁺⁺⁺⁺ Wave 1C — Batch 1C-C: nền tảng filter + form (07/08/2026)

**108 test mới. 1 hook feature đã dời (bằng chứng), 13 trang danh sách CHƯA đụng.**

| Việc                    | Kết quả                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `FilterBar` mới         | [components/filter/FilterBar.tsx](../../apps/web/src/components/filter/FilterBar.tsx) — 28 test             |
| `StickyFormActions` mới | [components/form/StickyFormActions.tsx](../../apps/web/src/components/form/StickyFormActions.tsx) — 19 test |
| `useUrlFilters` mở rộng | thêm `SetFiltersOptions.resetPage` — 20 test (trước đây **không có test nào**)                              |
| `NumberField` mở rộng   | thêm `percent`, `precision`; `money` đã có sẵn — 17 test                                                    |
| `TextAreaField` mở rộng | thêm `showCount` tường minh, `help`, `aria-describedby` — 11 test                                           |
| `DateTimeField` mở rộng | thêm biến thể `range` (union theo kiểu) — 13 test                                                           |

### Bằng chứng của hợp đồng `useUrlFilters`: `use-receipt-filters`

Chọn hook này **chứ không phải marketplace**. Lý do: hành vi trước/sau **giống hệt** (trang tự quy
`'all'` → `undefined` trước khi gọi), nên **30 test đặc tả `/manage/receipts`** là cổng gác đủ chặt
— và chúng vẫn xanh sau khi dời. Marketplace bị loại vì mã hoá mảng CSV + boolean `1` (ngữ nghĩa
facet), kéo vào hook chung sẽ bẻ hợp đồng dùng cho 9 danh sách quản lý — đúng thứ chỉ thị 1C-C cấm.

**Còn 8 hook** chờ dời ở đợt rollout (9 ứng viên − 1 đã xong). `use-calendar-filters` **loại trừ
vĩnh viễn**, lý do ghi thẳng trong docblock của `useUrlFilters`.

### `FilterBar` ≠ `FilterPanel` — giữ riêng, có chủ đích

|           | `FilterBar` (mới)                       | `FilterPanel` (marketplace, giữ nguyên)       |
| --------- | --------------------------------------- | --------------------------------------------- |
| Dùng cho  | 14 bảng quản lý                         | 3 màn marketplace                             |
| Ngữ nghĩa | lọc bảng: search · select · khoảng ngày | facet: đếm kết quả sống, khoảng giá, mảng CSV |
| Nút chính | "Xoá bộ lọc"                            | "Áp dụng (N xe)"                              |
| Wire      | 1 tham số / 1 filter                    | CSV + boolean `1`                             |

Cả hai **đều dùng lại `ResponsiveDialog`** cho sheet mobile — không có lớp overlay thứ ba.

### Ba field đã dời khỏi inline style

`NumberField`, `TextAreaField`, `DateTimeField` nay dùng [field.module.css](../../apps/web/src/components/form/field.module.css)
(CLAUDE.md §5). `TextField`, `SelectField`, `AutoCompleteField` **vẫn còn inline style** — dời khi
chạm vào, không sửa hàng loạt (nợ D15.3 thu hẹp).

**Nợ D14.4 đã đóng một phần**: cả ba field nay có `useId()` + `htmlFor`, nên ô nhập có tên khả
truy cập và `getByLabelText` tìm được. `SelectField` chưa.

## ⓪⁺⁺⁺⁺ Wave 1C — Batch 1C-B: 6 primitive ĐÃ TẠO (07/08/2026)

**106 test mới, 0 consumer feature** — chưa migrate trang nào (đúng phạm vi 1C-B).

| Component                         | Đường dẫn                                                                                                                                                           | Test |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `EmptyState`                      | [components/feedback/EmptyState.tsx](../../apps/web/src/components/feedback/EmptyState.tsx)                                                                         | 12   |
| `LoadingState`                    | [components/feedback/LoadingState.tsx](../../apps/web/src/components/feedback/LoadingState.tsx)                                                                     | 11   |
| `PermissionState`                 | [components/feedback/PermissionState.tsx](../../apps/web/src/components/feedback/PermissionState.tsx)                                                               | 9    |
| `DataTable<T>` + `actionColumn()` | [components/data-display/DataTable.tsx](../../apps/web/src/components/data-display/DataTable.tsx)                                                                   | 32   |
| `RowActions`                      | [components/data-display/RowActions.tsx](../../apps/web/src/components/data-display/RowActions.tsx)                                                                 | 21   |
| `EntityIdentity` + `initialOf()`  | [components/data-display/EntityIdentity.tsx](../../apps/web/src/components/data-display/EntityIdentity.tsx) · [lib/initials.ts](../../apps/web/src/lib/initials.ts) | 21   |

**Không thêm barrel export**: `components/` hiện **không có** `index.ts` nào — thêm cho riêng hai
thư mục mới sẽ tạo hai kiểu import song song. Giữ import theo đường dẫn đầy đủ như 20 component cũ.

### Cố ý KHÔNG đưa vào `DataTable`

| Bỏ qua                                           | Vì sao                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Sắp xếp theo cột (`sorter`)                      | 1C-A đo **0/14** bảng có. Sắp xếp chỉ tồn tại ở `vehicles`/`bookings` dạng `Select` trong thanh lọc → tham số `sort` của API |
| Chọn hàng / hành động hàng loạt (`rowSelection`) | **0 nơi** trong repo (khớp brief 00 D5)                                                                                      |

Quy tắc §0 của tài liệu này: component chung cần **≥2 nơi tiêu thụ thật**. Cả hai đang là 0 → thêm
khi có consumer đầu tiên, không thêm trước.

### Ba lỗi phát hiện khi dựng (test bắt được, đã sửa ngay trong batch)

| #   | Lỗi                                                                                                                                                            | Cách phát hiện                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | CSS nhắm `.ant-table-cell-fix-right` — **AntD 6 đã đổi tên thành `-fix-end`** (thuật ngữ logical, hợp RTL). Nền đục của cột dính phải sẽ **không có tác dụng** | Test "render cột dính phải" đỏ → đọc DOM thật để lấy tên class |
| 2   | Icon `@ant-design/icons` render `role="img" aria-label="eye"`, lọt vào accessible name của nút có chữ → `"eye Thu tiền"`                                       | Test tên khả truy cập đỏ                                       |
| 3   | Tooltip gắn thẳng lên nút `disabled` **không bao giờ hiện** (`pointer-events: none`) → `disabledReason` mất tác dụng                                           | Test tooltip đỏ                                                |

## ⓪⁺⁺⁺ Wave 1C — Batch 1C.0: kiểm kê (chưa sửa code)

Đo bằng `rg`/`glob` trên source ngày 07/08/2026, **không lấy từ tài liệu**. Ba con số ở các mục
dưới đây sai và đã sửa tại chỗ.

### Bảng dữ liệu — 15 file, không phải 26

| Nhóm                                                    | Số     | Danh sách                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `*Table.tsx` (feature component)                        | **11** | `VehicleTable` · `BookingTable` · `BookingRequestTable` · `ReceiptTable` · `DebtTable` · `AdminVehicleTable` · `AdminTenantTable` · `AdminBookingTable` · `AdminCustomerTable` · `AuditLogTable` · `ApprovalTable` |
| `<Table>` dựng thẳng trong `page.tsx`                   | **3**  | `members` · `admin/staff` · `admin/plans` (D9)                                                                                                                                                                     |
| Bảng lồng trong drawer (không phải danh sách cấp trang) | **1**  | `AdminCustomerDetailDrawer` (đơn của một khách)                                                                                                                                                                    |

**14 bảng cấp trang.** §3.2 ghi _“`<Table>` AntD ở 26 file — 10 component + 14 `page.tsx`”_ —
sai; con số đó đếm nhầm. Figma `127:1564` kiểm kê **16 bảng**; chênh 2 là `Calendar` (ngoại lệ
scheduler, `130:1752`) và `Subscription History` — trong code **không phải `<Table>`**: nó là
`<ul>` trong [TenantPlanSection](../../apps/web/src/features/admin-plans/components/TenantPlanSection.tsx#L83)
và `<List>` trong [PaymentHistory](../../apps/web/src/features/payments/components/PaymentHistory.tsx#L42).

### Khoảng cách so với hợp đồng bảng của Figma

| Yêu cầu Figma                                                                              | Node             | Hiện trạng đo được                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cột Actions sticky phải                                                                    | `127:2060` R1    | **1/14** — chỉ [VehicleTable:114](../../apps/web/src/features/vehicles/components/VehicleTable.tsx#L114). 13 bảng còn lại **không** có `fixed: 'right'` dù bảng nào cũng bật cuộn ngang                                    |
| Width cột 100px (icon) / 120px (text)                                                      | `127:2060` R2    | 5/14 có width tường minh (130 · 190 · 60 · 70 · 70) — **không con số nào khớp thang Figma**                                                                                                                                |
| Min/preferred width mọi cột                                                                | `127:1725`       | Toàn repo chỉ **7** khai báo `width:` số. Không có `MIN_TABLE_WIDTH` ở đâu                                                                                                                                                 |
| `MIN_TABLE_WIDTH` cố định, không nén cột                                                   | `127:2097` R1–R2 | 15/15 dùng `scroll={{ x: 'max-content' }}` — không nén, nhưng cũng **không** có sàn bề rộng                                                                                                                                |
| Bóng gợi ý cuộn                                                                            | `127:2097` R5    | **0** — không nơi nào                                                                                                                                                                                                      |
| Chuyển thẻ ở ≤640px                                                                        | `127:2257` R1    | **0/14**                                                                                                                                                                                                                   |
| Tiền canh phải                                                                             | `127:1725`       | ✅ **7/7 cột tiền đã canh phải** — đây là điểm code đã đúng sẵn                                                                                                                                                            |
| Status badge, không cắt                                                                    | `127:1725`       | ✅ `StatusTag` không cắt                                                                                                                                                                                                   |
| `aria-label` nút icon                                                                      | `130:1658` §2.4  | **5 nút thiếu tên khả truy cập, ở 3 file**: `VehicleTable` (3, chỉ có `Tooltip`) · `members/page` (1) · `admin/staff/page` (1). `BookingTable` đã đúng (`aria-label="Xem"`); 4 bảng khác dùng nút **có chữ** nên đã có tên |
| `role="grid"` · `aria-sort` · điều hướng phím mũi tên · `caption` · `aria-live` số kết quả | `130:1658`       | **0** — AntD `<Table>` render `role="table"`, không roving tabindex                                                                                                                                                        |

> §1.2 ghi _“nút icon trong bảng hiện không có tên cho screen reader”_ cho **10 bảng** — thực tế
> chỉ **3 file / 5 nút**. Phần lớn cột hành động dùng `<Button type="link">` kèm chữ, đã có tên.

### Ba mục "EXTEND" ở §6 đã có sẵn một phần

| Mục                               | §6 nói         | Thực tế                                                                                                                                                             |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NumberField` variant `money`     | "EXTEND: thêm" | ✅ **Đã có** — prop `money` + `groupThousands` + hậu tố `₫` ([NumberField.tsx:33](../../apps/web/src/components/form/NumberField.tsx#L33)). Chỉ còn thiếu `percent` |
| `TextAreaField` character counter | "EXTEND: thêm" | ✅ **Đã có** — `showCount={Boolean(maxLength)}` ([TextAreaField.tsx:38](../../apps/web/src/components/form/TextAreaField.tsx#L38))                                  |
| `DateTimeField` variant `range`   | "EXTEND: thêm" | ❌ **Đúng là thiếu** — chỉ có `DatePicker` đơn                                                                                                                      |

**Phát sinh**: cả 3 field dùng `style={{ marginBottom: 14 }}` / `style={{ width: '100%' }}` —
**10 inline style** trong `components/form/`, vi phạm CLAUDE.md §5. Dời sang CSS Module khi chạm
file ở 1C.10.

### Filter — 13 hook, 3 dùng `useUrlFilters`

Khớp [04 D2](04_COMPONENT_DUPLICATES.md). Ứng viên gom = **9** (13 − 3 đã gom − `use-calendar-filters`
bị chỉ thị loại trừ). Thanh filter dùng chung: **2** (`VehicleFiltersBar`, `FilterPanel` marketplace);
phần còn lại dựng inline trong `ManagePageHeader extra` của từng `page.tsx`.

### Trạng thái — số đo

`<Result>` 23 file · `<Empty>` 23 · `<Spin>` 27 · `<Skeleton>` 8 · `status="403"` **đúng 1 file**
([admin/layout.tsx](<../../apps/web/src/app/(manage)/manage/admin/layout.tsx#L36>)). Khớp brief 00
B1: ngoài nhánh admin **không có** nhánh 403 nào.

### Định danh thực thể

`<Avatar>` 7 nơi · tính chữ-cái-đầu lặp **9 nơi** (`Topbar`, `ManageUserCard`, `AccountView`,
`MarketHeader`, `ShopHeader`, `BrandMark`, `FeaturedHosts`, `members/page`, `admin/staff/page`).
`DashboardView`/`PlatformDashboardView` cũng có `charAt(0)` nhưng là **viết hoa chữ đầu**, không
phải initial — không gom.

### Thanh hành động form

19 nơi dùng `styles.actions`; ứng viên `StickyFormActions` thật sự là **5 form dài**:
`VehicleForm` · `ShopProfileForm` · `BookingFormDrawer` · `ReceiptFormDrawer` · `PlanFormModal`
(khớp §6). 14 nơi còn lại là hàng nút trong dialog/drawer ngắn — **không** sticky.

---

## ⓪⁺⁺ Wave 1B — HOÀN THÀNH (Stage A/B/C)

**19/19 overlay nghiệp vụ đã dùng component chung.** Không còn `<Modal>`/`<Drawer>` trực tiếp
trong `features/`.

| Component chung    | Nơi tiêu thụ                                                                                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ResponsiveDialog` | 12 — `AuthModal` · `RequestBookingModal` · `FilterPanel` · `AddMemberModal` · `AddStaffModal` · `PlanFormModal` · `ReviewModal` · `CategoryManagerModal` · `RecordPaymentModal` · `TenantPlanSection` · modal lồng trong `AdminTenantDetailDrawer`/`AdminVehicleDetailDrawer`/`ApprovalDetailDrawer` |
| `DetailDrawer`     | 9 — 7 `*DetailDrawer` + 2 `*FormDrawer`                                                                                                                                                                                                                                                              |

**Cố ý loại trừ (1)**: [`MobileNav`](../../apps/web/src/components/layout/MobileNav.tsx) — Drawer
điều hướng, không phải hộp thoại tác vụ hay panel chi tiết. Giữ `<Drawer>` trực tiếp.

**Giữ nguyên primitive phù hợp**: 13 file dùng `Popconfirm` cho xác nhận tại chỗ · `App.useApp().message`
cho toast · `Modal.confirm` không xuất hiện ở đâu.

**Sửa lỗi kèm theo migration**: `size="88dvh"` sai prop ở 2 file (D14.1) · dialog đăng nhập
không có tên khả truy cập (D14.2) · `destroyOnClose` tên AntD 5 ở các file đã chuyển (D14.3).

## ⓪⁺ Wave 1B — Batch 1: hai primitive đã tạo

| Component              | Đường dẫn                                                                                             | Trạng thái                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **`ResponsiveDialog`** | [components/overlay/ResponsiveDialog.tsx](../../apps/web/src/components/overlay/ResponsiveDialog.tsx) | ✅ Đã tạo + 14 test. **Chưa có consumer** — migrate ở Batch 2 |
| **`DetailDrawer`**     | [components/overlay/DetailDrawer.tsx](../../apps/web/src/components/overlay/DetailDrawer.tsx)         | ✅ Đã tạo + 11 test. **Chưa có consumer** — migrate ở Batch 2 |

**Kiểm đếm thực tế (rg, không lấy từ tài liệu)**: 13 file dùng `<Modal>`, 13 file dùng `<Drawer>`, **6 file dùng cả hai** → **20 file overlay riêng biệt** phải migrate. Con số “13 modal” ở §2.1 và “7 detail drawer” ở §2.2 vẫn đúng nhưng không cộng lại được vì chồng lấn.

Hợp đồng mobile lấy từ Figma `130:1563` (8 quy tắc chuyển đổi), không suy từ hình:

- Modal `sm` (<480px) và mọi hộp xác nhận → **bottom sheet**, trần `85dvh`, có thanh nắm kéo
- Modal `md`/`lg` (≥480px) và mọi overlay có form → **toàn màn hình**, nút đóng là mũi tên ←
- Drawer chi tiết → **toàn màn hình luôn luôn** (quy tắc 3)

## ⓪ Thay đổi sau Wave 1A (token)

Wave 1A **không đụng component nào**, nhưng đổi nền token bên dưới chúng. Ảnh hưởng cần biết trước khi làm 1B/1C:

| Component                                          | Ảnh hưởng từ Wave 1A                                                                                                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**                                         | `colorPrimaryHover` giờ **đậm hơn** (`#c4920f`) thay vì sáng hơn (`#e3ba54`). Bốn variant Figma vẫn ánh xạ 1-1 vào `type`/`danger` — quyết định **KEEP-ANTD** không đổi. `controlHeight` vẫn 32 (Figma vẽ 40 — P16)                 |
| **Modal / Drawer**                                 | Token bề rộng đã có: `--xp-modal-width-sm/​/-lg` = 400/560/720 (`125:1611`), `--xp-drawer-width/-lg` = 560/720. `ResponsiveDialog` (1B) dùng thẳng, không tự chế số. `colorBgMask` + `boxShadowSecondary` đã theo Figma             |
| **Card**                                           | `borderRadiusLG` 12 → **10** (Figma `14:164`). Bóng card giờ là Elevation 1                                                                                                                                                         |
| **Table**                                          | `colorBorderSecondary` → `--xp-color-border-subtle`; `colorFillAlter`/`controlItemBgHover` giờ ám ấm theo `colorTextBase`. `DataTable` (1C) nên dùng `--xp-line-height-body` (20px) thay vì line-height toàn cục 1.5714 — xem nợ T2 |
| **Form fields**                                    | Vòng focus giờ là 3px 25% gold (`controlOutline`), trước gần như vô hình. `--xp-color-text-disabled` có sẵn cho CSS Module                                                                                                          |
| **StatusTag**                                      | **Không đổi.** Vẫn dùng AntD preset qua `StatusMeta.color`. Bốn token `--xp-color-*-bg` đã có nhưng **chưa nối vào** — xem P5 trước khi đổi                                                                                         |
| **EmptyState / Loading / Error / Permission** (1C) | Dùng `--xp-color-*-bg` + `--xp-color-text-tertiary`. ⚠️ `text-tertiary` trượt AA (2.72) — không dùng cho chữ mang thông tin, xem P18                                                                                                |
| **Navigation**                                     | Token sidebar tối đã khai báo, **chưa áp** (P1/Wave 1D)                                                                                                                                                                             |
| **Tất cả**                                         | Breakpoint dùng `useIsMobile()`/`useIsTablet()`/`useIsDesktop()` từ `XP_BREAKPOINTS`; **không gõ số**                                                                                                                               |

## 0. Bối cảnh hai phía

**Phía Figma** — quy chuẩn ở frame `122:1685` (Ownership Matrix, 18 component "đã shared") và `122:2052` (Variant Standard, ~150 biến thể, namespace `XePrime/{Category}/{Name}`, thuộc tính variant PascalCase, **cấm tiếng Việt trong tên variant**). Thứ tự ưu tiên Figma tự đề xuất: **Button → Modal → EmptyState → Input → DataTable**.

**Phía code** — 20 component dùng chung trong [apps/web/src/components/](../../apps/web/src/components/). **Không có** Button / Modal / Drawer / Card / DataTable / EmptyState / ErrorState / LoadingState — các màn dùng thẳng AntD.

⚠️ **Cảnh báo độ tin cậy Figma**: `122:1837` tự khai "0 duplicate, 15/15 Done"; `122:1567` lại ghi "module 03, 06–11: 0 local component — vẽ tay từng màn" và tổng chỉ **74 instance** trên 1057 node. A3 đo được frame `18:4` chỉ có **1** instance. Kết luận: **danh sách 18 component là kế hoạch, không phải hiện trạng đã dựng.** Coi bảng variant `122:2052` là _đặc tả yêu cầu_, và kiểm chứng từng cái khi inspect chi tiết.

**Quyết định**: `REUSE` (dùng nguyên) · `EXTEND` (thêm variant/props vào cái đang có) · `CREATE` (tạo mới) · `DEPRECATE` (bỏ) · `KEEP-ANTD` (tiếp tục dùng thẳng AntD, không bọc).

---

## 1. Actions

### 1.1 Button

|                                |                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**                      | `XePrime/Button` `125:1571` (page-level) + owner `01 Foundations`                                                                                                                                                                             |
| **Variant Figma** (`122:2052`) | `Size: SM/MD/LG` × `Variant: Primary/Secondary/Ghost/Danger` × `State: Default/Hover/Pressed/Disabled` = **48 biến thể**                                                                                                                      |
| **Thực tế trong `125:1571`**   | Chỉ render **4** nút: Primary (nền gold `#d6a02c`, **chữ tối**), Secondary (nền trắng + viền), Ghost (chữ xám, không nền), Danger (nền đỏ, chữ trắng). Ghi chú Figma: _"Hiện có 2 buttons ở Marketplace"_                                     |
| **Code**                       | ❌ Không có. Dùng thẳng `<Button>` của AntD, ~200 chỗ                                                                                                                                                                                         |
| **Import path**                | `antd`                                                                                                                                                                                                                                        |
| **Props hiện tại**             | AntD: `type` (`primary`/`default`/`text`/`link`/`dashed`), `danger`, `size`, `icon`, `loading`, `disabled`, `shape`                                                                                                                           |
| **Ánh xạ variant**             | Primary → `type="primary"` · Secondary → `type="default"` · Ghost → `type="text"` · Danger → `danger`                                                                                                                                         |
| **Responsive**                 | Không có quy tắc. Figma mobile dùng nút full-width trong sticky footer (`23:1872`, `65:3069`) — chưa được token hoá                                                                                                                           |
| **A11y**                       | AntD lo focus ring + `disabled`; nút chỉ-icon **phải** có `aria-label` — hôm nay chỉ [Topbar.tsx:45](../../apps/web/src/components/layout/Topbar.tsx#L45) và `ManagePageHeader` làm đúng, `VehicleTable` dùng `Tooltip` thay cho `aria-label` |
| **QUYẾT ĐỊNH**                 | **KEEP-ANTD** — bốn variant của Figma ánh xạ 1-1 vào `type`/`danger` của AntD. Bọc lại chỉ tạo một tầng gián tiếp không mang thêm thông tin. **Wave 1B chỉ chỉnh seed token + kiểm 4 variant khớp thị giác.**                                 |
| **Ngoại lệ**                   | Nếu Figma yêu cầu nút chữ-tối-trên-gold mà AntD tính ra chữ trắng → thêm `components.Button.primaryColor` vào `antdTheme` (ngoại lệ có ghi lý do cho quy tắc "chỉ seed token")                                                                |
| **Module tiêu thụ**            | Tất cả                                                                                                                                                                                                                                        |

### 1.2 IconButton

|                     |                                                                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**           | Không có component riêng. Xuất hiện bên trong `Fleet/ActionMenu` `58:2857` và các thanh action bảng                                                                                     |
| **Code**            | ❌ Không có. Pattern lặp: `<Tooltip title="X"><Button type="text" icon={<YOutlined/>} /></Tooltip>`                                                                                     |
| **Nơi lặp**         | [VehicleTable.tsx:118-141](../../apps/web/src/features/vehicles/components/VehicleTable.tsx#L118-L141) và 9 bảng khác — xem [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md) D3 |
| **Variant cần**     | `default` / `danger`; kèm `Popconfirm` hoặc không                                                                                                                                       |
| **A11y**            | ⚠️ **Khiếm khuyết hiện tại**: `Tooltip` **không** thay được `aria-label`. Nút icon trong bảng hiện không có tên cho screen reader                                                       |
| **QUYẾT ĐỊNH**      | **CREATE** `RowActions` — nhận `actions: {key, icon, label, danger?, confirm?, onClick}[]`, tự đặt `aria-label` từ `label`. Sửa luôn lỗ a11y. Wave 1C                                   |
| **Module tiêu thụ** | 10 bảng                                                                                                                                                                                 |

---

## 2. Overlay

### 2.1 Modal / Dialog

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**           | `XePrime/Modal` `125:1611` · variant `Size: SM/MD/LG` × `HasFooter: Yes/No` = **6**. Ghi chú: _"Hiện 9 biến thể ad-hoc"_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Code**            | ❌ Không có wrapper. `<Modal>` AntD ở **13 file**: [PlanFormModal](../../apps/web/src/features/admin-plans/components/PlanFormModal.tsx) · [AddStaffModal](../../apps/web/src/features/admin-staff/components/AddStaffModal.tsx) · [AddMemberModal](../../apps/web/src/features/members/components/AddMemberModal.tsx) · [RecordPaymentModal](../../apps/web/src/features/payments/components/RecordPaymentModal.tsx) · [ReviewModal](../../apps/web/src/features/reviews/components/ReviewModal.tsx) · [CategoryManagerModal](../../apps/web/src/features/finance/components/CategoryManagerModal.tsx) · [RequestBookingModal](../../apps/web/src/features/booking-requests/components/RequestBookingModal.tsx) · [AuthModal](../../apps/web/src/features/auth/components/AuthModal.tsx) · [TenantPlanSection](../../apps/web/src/features/admin-plans/components/TenantPlanSection.tsx) · [FilterPanel](../../apps/web/src/features/marketplace/components/FilterPanel.tsx) · 3 drawer admin |
| **Props hiện tại**  | AntD: `open`, `onCancel`, `onOk`, `title`, `footer`, `width`, `confirmLoading`, `destroyOnClose`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Responsive**      | ⚠️ **Vấn đề cốt lõi**: Figma đặc tả modal desktop → **bottom sheet** ở mobile (`23:2086`, `66:1313`, `68:2726`, `79:6563`, `88:3151`, `97:4377`, `114:3714`, `115:4858` — **≥15 frame**). Code hôm nay: hai file tự làm bằng `useIsMobile()` + đổi `Modal`↔`Drawer` ([AuthModal](../../apps/web/src/features/auth/components/AuthModal.tsx), [RequestBookingModal](../../apps/web/src/features/booking-requests/components/RequestBookingModal.tsx), [FilterPanel](../../apps/web/src/features/marketplace/components/FilterPanel.tsx)); **10 modal còn lại giữ nguyên modal trên mobile**                                                                                                                                                                                                                                                                                                                                                                                                     |
| **A11y**            | AntD lo focus trap + `Esc`. Cần `title` thật (không để `null`) để có accessible name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **QUYẾT ĐỊNH**      | **CREATE** `ResponsiveDialog` — bọc `Modal`/`Drawer(placement="bottom")` theo `useIsMobile()`, props `{open, onClose, title, footer, size: 'sm'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 'md' | 'lg'}`. Gom 3 bản tự chế + phủ 10 modal chưa responsive. **Đây là component có giá trị cao nhất của cả đợt.** Wave 1B |
| **Đọc trước**       | `122:3705` `shared-overlay` · `130:1563` `overlay-responsive-mapping`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Module tiêu thụ** | 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 2.2 Drawer

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**           | Không có component riêng — hoà vào `XePrime/Modal` (Size=LG) và bottom-sheet mobile                                                                                                                                                                                                                                                                                                                                                      |
| **Code**            | ❌ Không có wrapper. `<Drawer>` ở **13 file**, hai vai trò khác hẳn nhau: **(a) Detail drawer bên phải** — 7 file `*DetailDrawer.tsx`; **(b) Form drawer** — [BookingFormDrawer](../../apps/web/src/features/bookings/components/BookingFormDrawer.tsx), [ReceiptFormDrawer](../../apps/web/src/features/finance/components/ReceiptFormDrawer.tsx); **(c) Nav drawer** — [MobileNav](../../apps/web/src/components/layout/MobileNav.tsx) |
| **Variant cần**     | `detail` (đọc) · `form` (ghi, có footer submit/cancel) · `nav`                                                                                                                                                                                                                                                                                                                                                                           |
| **QUYẾT ĐỊNH**      | **CREATE** `DetailDrawer` (gom 7 bản) và **REUSE** `ResponsiveDialog` cho `form`. `MobileNav` giữ `Drawer` trực tiếp. Wave 1B                                                                                                                                                                                                                                                                                                            |
| **Module tiêu thụ** | 13                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### 2.3 Mobile sheet

|                |                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Figma**      | ≥15 frame `mobile-*-sheet` / `mobile-*-drawer`. Quy chuẩn ở `127:2463` `mobile-filter-sheet-standard`                    |
| **Code**       | ❌ Không có. Chỉ 3 chỗ tự chế (xem 2.1)                                                                                  |
| **QUYẾT ĐỊNH** | Không tạo component riêng — là **variant mobile của `ResponsiveDialog`**. Tạo hai component sẽ tách đôi hành vi. Wave 1B |

---

## 3. Hiển thị dữ liệu

### 3.1 Card

|                         |                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**               | `Vehicle Card` (owner 01, consumer 03/06) · `122:1567` ghi "Cards: 2 variants + 3 types" ở module 02                                                                               |
| **Code**                | Có **một** card nghiệp vụ thật: [VehicleCard](../../apps/web/src/features/marketplace/components/VehicleCard.tsx) (+ `.module.css` 210+ dòng). `<Card>` AntD chỉ dùng ở **6 file** |
| **Props `VehicleCard`** | Nhận listing item, tự dựng link phủ thẻ (`z-index` 1) với nút nổi bên trên (`z-index` 2)                                                                                           |
| **Responsive**          | `VehicleCard` có breakpoint riêng trong module CSS                                                                                                                                 |
| **QUYẾT ĐỊNH**          | **REUSE** `VehicleCard` cho marketplace. **CREATE** `EntityCard` cho biến-thể-thẻ-của-bảng ở mobile (xem 3.3) — hai thứ khác nhau, không gộp                                       |
| **Module tiêu thụ**     | marketplace (3 màn)                                                                                                                                                                |

### 3.2 Table / DataTable

|                          |                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Figma**                | `XePrime/DataTable` `125:2673` · variant `HasPagination × HasFilter × Density: Default/Compact` = **8**. Audit riêng: `127:1564` inventory · `127:1725` column spec · `127:2060` sticky actions · `127:2097` horizontal scroll · `130:1658` a11y · `130:1752` exceptions |
| **Code**                 | ❌ Không có wrapper. `<Table>` AntD ở **26 file** — 10 component `*Table.tsx` + 14 `page.tsx`                                                                                                                                                                            |
| **Props lặp ở mọi bảng** | `rowKey="id"` · `scroll={{ x: 'max-content' }}` · `pagination={{current, pageSize, total, showSizeChanger, showTotal, onChange}}` · `loading` · `onRow` click                                                                                                            |
| **Variant cần**          | pagination có/không · density · **sticky action column** (`fixed: 'right'`) · **chuyển sang thẻ ở mobile**                                                                                                                                                               |
| **Responsive**           | ⚠️ Hôm nay **mọi bảng đều `scroll x`, không bảng nào đổi sang thẻ ở mobile.** Figma có `127:2257` `mobile-card-transformation` + ~12 frame `mobile-*-card`. Brief 11 §7 gọi đây là systemic deviation: _"table-overflow instead of card conversion"_                     |
| **A11y**                 | `130:1658` `table-accessibility-notes` — chưa đọc. Hiện không có `caption`/`aria-label` trên bảng nào                                                                                                                                                                    |
| **QUYẾT ĐỊNH**           | **CREATE** `DataTable<T>` — gói `rowKey`/`scroll`/`pagination(meta)`/`loading`, và **`renderCard` tuỳ chọn** để dưới `--xp-bp-mobile` render danh sách thẻ. Đây là component thứ hai quan trọng nhất. Wave 1C                                                            |
| **Đọc trước**            | `127:1564` · `127:1725` · `127:2060` · `127:2097` · `127:2257` · `130:1658` · `130:1752`                                                                                                                                                                                 |
| **Module tiêu thụ**      | 26 file / 14 route                                                                                                                                                                                                                                                       |

### 3.3 StatusTag ✅

|                     |                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**           | `XePrime/StatusTag/Operation` `125:1718` · `XePrime/StatusTag/Public` `125:1727` · bản gốc `Fleet/OperationStatusTag` `58:2828` + `Fleet/PublicStatusTag` `58:2841`. `XePrime/Badge` `125:2703` (`Type: Status/Count/Label × Color: Gold/Green/Red/Gray/Blue` = 15) |
| **Code**            | ✅ [components/data-display/StatusTag.tsx](../../apps/web/src/components/data-display/StatusTag.tsx)                                                                                                                                                                |
| **Import**          | `@/components/data-display/StatusTag`                                                                                                                                                                                                                               |
| **Props**           | `{ value: TStatus \| null \| undefined; meta: Readonly<Record<TStatus, StatusMeta>>; fallbackLabel?: string }`                                                                                                                                                      |
| **Thiết kế**        | Component **không biết** status nào cả — nhận bảng meta từ `@xeprime/types` (ADR 0005). Status có trong DB nhưng thiếu meta → hiện giá trị thô thay vì ô trống                                                                                                      |
| **Variant**         | Màu đến từ `StatusMeta.color` = **AntD preset** (`'green'`, `'gold'`, `'red'`…), không phải token XePrime                                                                                                                                                           |
| **QUYẾT ĐỊNH**      | **REUSE** — kiến trúc đúng, giữ nguyên hợp đồng. ⚠️ Nếu Figma yêu cầu màu chính xác từ `--xp-color-*-bg` thì phải đổi `StatusColor` từ preset AntD sang token → **P5** ở [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md), **không tự quyết**                       |
| **Vi phạm cần dọn** | 11 file dùng `<Tag>` trần thay vì `StatusTag` — xem [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md) D4                                                                                                                                                     |
| **Module tiêu thụ** | vehicles, bookings, booking-requests, finance, members, admin-*                                                                                                                                                                                                     |

### 3.4 Filter bar

|                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**           | `XePrime/FilterBar` (`Type: Chips/Dropdown/Combined` = 3) · `XePrime/Chip` `125:2696` (2 states) · `XePrime/SearchBar` `125:1650` (`Size SM/MD × HasFilter` = 4). Quy chuẩn: `127:2339` `global-filter-standard` · `127:2463` mobile sheet                                                                                                                                                                                                                          |
| **Code**            | ❌ Không có bản dùng chung. Ba hình thái riêng: **(a)** [VehicleFiltersBar](../../apps/web/src/features/vehicles/components/VehicleFilters.tsx) — Input debounce 400ms + 5 Select; **(b)** filter inline trong `page.tsx` (admin/vehicles, admin/bookings, members, receipts…) — `Input` + `Segmented` + `Select` dựng tại chỗ; **(c)** [FilterPanel](../../apps/web/src/features/marketplace/components/FilterPanel.tsx) — Modal/Drawer responsive cho marketplace |
| **Props**           | `VehicleFiltersBar: { filters, onChange(patch) }` — hợp đồng tốt, ghép thẳng với `use-*-filters`                                                                                                                                                                                                                                                                                                                                                                    |
| **Responsive**      | Chỉ `FilterPanel` responsive. `VehicleFiltersBar` và filter inline **tràn ngang trên mobile** dù Figma có 8 frame `mobile-*-filter*`                                                                                                                                                                                                                                                                                                                                |
| **QUYẾT ĐỊNH**      | **CREATE** `FilterBar` — nhận `fields: FilterField[]` (`search` \| `select` \| `segmented`) + `{filters, onChange}`, tự debounce ô search, tự thu vào sheet dưới `--xp-bp-mobile`. **EXTEND** `FilterPanel` giữ riêng cho marketplace (ngữ nghĩa khác: facet + khoảng giá). Wave 1C                                                                                                                                                                                 |
| **Module tiêu thụ** | 14 route danh sách                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 3.5 Entity identity (avatar + tên + phụ đề)

|                      |                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**            | `XePrime/Avatar` `125:1643` (`Size XS/SM/MD/LG/XL × Type Image/Initials/Icon` = 15). Ghi chú: _"Hiện ad-hoc everywhere"_ — consumer 02,03,04,05,06,08,09,10,11                                                                                                                                                                                                                                                                  |
| **Code**             | ❌ Không có. Pattern lặp nguyên khối: `<Avatar shape="square" size={44} src={…} icon={<CarOutlined/>} />` + `<div className={styles.name}>` + `<div className={styles.meta}>` — [VehicleTable.tsx:50-66](../../apps/web/src/features/vehicles/components/VehicleTable.tsx#L50-L66), lặp ở `AdminVehicleTable`, `AdminCustomerTable`, `AdminTenantTable`, `members/page.tsx`, `ManageUserCard`, `ConversationList`, `ShopHeader` |
| **Có sẵn liên quan** | [Logo](../../apps/web/src/components/brand/Logo.tsx) — `{variant: 'full'\|…, size: 'md'\|…, tone: 'default'\|…}` ✅ · [BrandMark](../../apps/web/src/features/marketplace/components/BrandMark.tsx) — `{brand: string}` (logo hãng xe, **khác vai trò**) · [Stars](../../apps/web/src/components/data-display/Stars.tsx) — `{value, size: 'sm'\|'md'}` ✅                                                                       |
| **QUYẾT ĐỊNH**       | **CREATE** `EntityIdentity` — `{avatarSrc?, fallbackIcon?, name, subtitle?, size?}`. ≥8 nơi tiêu thụ, vượt xa ngưỡng. **REUSE** `Logo`, `Stars`, `BrandMark` nguyên trạng. Wave 1C                                                                                                                                                                                                                                              |
| **A11y**             | Avatar ảnh cần `alt`; avatar chữ-cái phải `aria-hidden` (tên đã có ở text bên cạnh)                                                                                                                                                                                                                                                                                                                                             |

---

## 4. Trạng thái

Bốn mục dưới đây **cùng một gốc**: hôm nay mỗi `page.tsx` tự dựng. Xem [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md) D1.

### 4.1 Loading

|                |                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**      | `XePrime/LoadingState` `55:110` (bản gốc `04 Onboarding/LoadingState`) · quy chuẩn `134:2011` `loading-standard`                                                                                                |
| **Code**       | ❌ Không có. `<Spin>`/`<Skeleton>` ở **42 file**. Ba hình thái: `<Spin size="large" className={styles.state}/>` làm Suspense fallback (14 trang) · `loading` prop của `Table` · `<Skeleton>` trong drawer/panel |
| **QUYẾT ĐỊNH** | **CREATE** `LoadingState` (`{variant: 'block'\|'inline'\|'skeleton', rows?}`). Wave 1C                                                                                                                          |

### 4.2 Empty / No-results

|                          |                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**                | `XePrime/EmptyState` `125:1692` · variant `Type: Empty/NoResults/Error/PermissionDenied × Permission: Create/ViewOnly` = **8**. Quy chuẩn `134:2093` `empty-vs-noresults-vs-unavailable`                                                                                               |
| **Code**                 | ❌ Không có wrapper. `<Empty>` ở **23 file**. `PlaceholderPage` chỉ là ca đặc biệt (`Empty` + tiêu đề)                                                                                                                                                                                 |
| **Phân biệt quan trọng** | Code **đã** phân biệt đúng ở R14: `hasFilters ? "Không tìm thấy xe khớp bộ lọc" + nút Xoá bộ lọc : "Gian hàng chưa có xe nào" + nút Thêm xe` ([vehicles/page.tsx:88-107](<../../apps/web/src/app/(manage)/manage/vehicles/page.tsx#L88-L107>)). Nhưng logic đó **chép tay ở 14 trang** |
| **QUYẾT ĐỊNH**           | **CREATE** `EmptyState` — hợp nhất 4 `Type` của Figma vào **một** component (Figma đã tự gộp Error vào EmptyState `Type=Error`, xem `122:1837`). Wave 1C                                                                                                                               |

### 4.3 Error

|                         |                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Figma**               | `XePrime/EmptyState` `Type=Error` · quy chuẩn `134:2194` `error-and-recovery-standard`                             |
| **Code**                | ❌ Không có. `<Result status="error">` + nút "Thử lại" gọi `refetch()` ở **25 file**, câu chữ khác nhau từng trang |
| **Khiếm khuyết đã ghi** | Brief 11 §7: _"bare-text errors without retry"_ ở các bề mặt chat                                                  |
| **QUYẾT ĐỊNH**          | **CREATE** — là `EmptyState variant="error"` với `onRetry`. Wave 1C                                                |

### 4.4 Permission denied

|                             |                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Figma**                   | `55:83` `PermissionNotice` · `55:84` `FeatureUnavailable` (symbol) · `65:3851` `Feature Unavailable` · ~24 frame `*-permission-denied` · ma trận `134:2482` `401-403-notenant-matrix` + `134:2556` `permission-control-matrix` |
| **Code**                    | ❌ Không có. `<Result status="403">` rải rác; [admin/layout.tsx](<../../apps/web/src/app/(manage)/manage/admin/layout.tsx>) gác cả nhánh admin; `NoTenantState` là ca riêng                                                    |
| **Ba trạng thái KHÁC NHAU** | `401` chưa đăng nhập → `AppShell` đá về login · `403` thiếu quyền → `Result 403` · `no-tenant` → `NoTenantState`. Figma `134:2482` phân biệt đủ ba                                                                             |
| **QUYẾT ĐỊNH**              | **CREATE** `PermissionState` (`{kind: 'forbidden'\|'view-only'\|'unavailable'}`). ⚠️ **Chỉ hiển thị** — guard backend vẫn là lớp chặn thật (CLAUDE.md §3). Wave 1C                                                             |
| **REUSE**                   | `NoTenantState`, `PlaceholderPage` giữ nguyên                                                                                                                                                                                  |

---

## 5. Điều hướng

|                   |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**         | `XePrime/Shell/Sidebar` `125:1740` + `Shell/Sidebar` `59:871` (**11 biến thể "active page"**) · `47:5` expanded (240px) · `47:77` collapsed (64px) · `14:1423`/`14:1531`/`14:1619` portal-shell · `XePrime/Breadcrumb` `125:1672` (Levels 2/3/4) · `XePrime/Dropdown` `125:1717` · `XePrime/Pagination/Desktop` `117:1203` + `/Mobile` `117:1220`                                                                                                                                                                                                                                                                                                                       |
| **Code**          | ✅ Đầy đủ và có cấu trúc tốt: [AppShell](../../apps/web/src/components/layout/AppShell.tsx) · [Sidebar](../../apps/web/src/components/layout/Sidebar.tsx) · [Topbar](../../apps/web/src/components/layout/Topbar.tsx) · [MobileNav](../../apps/web/src/components/layout/MobileNav.tsx) · [ManageMenu](../../apps/web/src/components/layout/ManageMenu.tsx) · [ManageUserCard](../../apps/web/src/components/layout/ManageUserCard.tsx) · [ManagePageHeader](../../apps/web/src/components/layout/ManagePageHeader.tsx) · [use-manage-nav](../../apps/web/src/components/layout/use-manage-nav.tsx) · marketplace riêng: `MarketHeader`, `MarketFooter`, `MobileTabBar` |
| **Nguồn dữ liệu** | [constants/nav.ts](../../apps/web/src/constants/nav.ts) — `SHOP_NAV`/`PLATFORM_NAV`, `navForScope`, `mobileTabsForScope`, `matchSelectedKey`, `groupKeyOf`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Chênh lệch**    | ① **Sidebar sáng vs tối** (P1) ② **không có trạng thái collapsed** — Figma có `47:77`; code chỉ có token `--xp-shell-sidebar-collapsed-width` **không nơi nào dùng** ③ chiều rộng 232 vs 240 ④ ẩn ở 992px vs ranh Figma 1024px ⑤ **không có Breadcrumb** dù Figma có `125:1672` với 7 module tiêu thụ                                                                                                                                                                                                                                                                                                                                                                   |
| **QUYẾT ĐỊNH**    | **EXTEND** `Sidebar` (thêm collapsed + tông tối sau P1) · **REUSE** phần còn lại · **CREATE** `Breadcrumb`? → **hoãn**: hiện chưa route nào sâu quá 3 cấp và `ManagePageHeader` đã có nút back. Chỉ tạo khi inspect chi tiết chứng minh cần. Wave 1D                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Pagination**    | **KEEP-ANTD** — `Table.pagination`. Chỉ đảm bảo `showTotal`/`showSizeChanger` thống nhất qua `DataTable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

## 6. Form

|           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma** | `XePrime/InputField` `125:2691` · `XePrime/Input` variant `Type: Text/Password/Search/Number × State: Default/Focus/Error/Disabled × Size: SM/MD` = **32** · `XePrime/Calendar` (Single/Range × SM/MD) · component cục bộ A4: `62:1546` Money Input · `62:1553` Percentage Input · `62:1560` Policy Toggle · `62:1565` Feature Chip · `62:1574` Image Upload Slot · `62:1581` Character Counter · `62:1623` Sticky Form Actions · `62:1532` Field Marker · `62:1536` Sensitive Field Indicator · `55:100` ImageUploadField |
| **Code**  | ✅ **Tầng đầy đủ nhất hiện có** — 9 field trong [components/form/](../../apps/web/src/components/form/)                                                                                                                                                                                                                                                                                                                                                                                                                    |

| Component              | Import                        | Props                                       | Figma đối ứng                            | Quyết định                                                                                                 |
| ---------------------- | ----------------------------- | ------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `TextField<T>`         | `@/components/form/TextField` | RHF-generic `TextFieldProps<T>`             | `XePrime/Input Type=Text`                | **REUSE**                                                                                                  |
| `TextAreaField<T>`     | ↑                             | `TextAreaFieldProps<T>`                     | —                                        | **EXTEND**: thêm `Character Counter` (`62:1581`)                                                           |
| `NumberField<T>`       | ↑                             | `NumberFieldProps<T>`                       | `Type=Number`                            | **EXTEND**: thêm variant `money` (`62:1546`) và `percent` (`62:1553`) — **thay vì tạo `MoneyInput` riêng** |
| `SelectField<T>`       | ↑                             | `SelectFieldProps<T>` + `SelectFieldOption` | `XePrime/Dropdown`                       | **REUSE**                                                                                                  |
| `AutoCompleteField<T>` | ↑                             | `AutoCompleteFieldProps<T>`                 | —                                        | **REUSE**                                                                                                  |
| `DateTimeField<T>`     | ↑                             | `DateTimeFieldProps<T>`                     | `XePrime/Calendar`                       | **EXTEND**: variant `range`                                                                                |
| `SwitchField<T>`       | ↑                             | `SwitchFieldProps<T>`                       | `Policy Toggle` `62:1560`                | **REUSE**                                                                                                  |
| `ImageUploadField`     | ↑                             | có test ✅                                  | `55:100` + `Image Upload Slot` `62:1574` | **REUSE**                                                                                                  |
| `ImageGalleryField`    | ↑                             | —                                           | `Image Gallery Strip` `65:3630`          | **REUSE**                                                                                                  |

**Nhất quán tốt**: cả 9 field đều generic theo `FieldValues` của React Hook Form và nhận `control` — hợp đồng thống nhất, khớp CLAUDE.md §3 (RHF + Yup + `@hookform/resolvers`).

**Còn thiếu**:

- **CREATE `StickyFormActions`** (`62:1623`) — thanh hành động dính đáy. Figma dùng cho mọi form dài; mobile thì full-width. ≥5 form tiêu thụ (`VehicleForm`, `ShopProfileForm`, `BookingFormDrawer`, `ReceiptFormDrawer`, `PlanFormModal`). Wave 1C
- **CREATE `SensitiveFieldMarker`** (`62:1532` + `62:1536`) — đánh dấu trường mà sửa sẽ knock-back duyệt (brief 04). **Chỉ dùng ở fleet** → để trong `features/vehicles/`, **không** đẩy lên `components/`
- **CREATE `FeatureChip`** (`62:1565`) — tiện ích xe. Cũng chỉ fleet + marketplace → cân nhắc ở Wave 2

**Validator**: [packages/validators](../../packages/validators/src/index.ts) đã có `vehicleFormSchema`, `registerShopSchema`, `shopProfileSchema`, `accountProfileSchema`, `bookingPeriodSchema`, `phoneSchema`, `moneySchema`. **REUSE**, không tạo schema mới trùng.

---

## 7. Feedback

### 7.1 Toast / Notification (feedback)

|                   |                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**         | `XePrime/Toast` `125:1632` · variant `Type: Success/Error/Warning/Info × HasAction` = **8** · quy chuẩn `134:2291` `success-feedback-standard`                                                    |
| **Code**          | `App.useApp().message` từ `AntdApp` ([providers.tsx:58](../../apps/web/src/app/providers.tsx#L58)). Dùng ở mọi mutation: `message.success('Đã xoá xe')` / `message.error(getErrorMessage(error))` |
| **QUYẾT ĐỊNH**    | **KEEP-ANTD** — `message` API đã đúng chuẩn, có context, hợp `AntdApp`. Wave 1B chỉ kiểm 4 `Type` khớp thị giác. **Không bọc.**                                                                   |
| **Cần chuẩn hoá** | Câu chữ: `getErrorMessage()` ([services/api-client.ts](../../apps/web/src/services/api-client.ts)) đã là điểm gom duy nhất ✅                                                                     |

### 7.2 Notifications (nghiệp vụ — chuông)

|                         |                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**               | R05/R06 `32:762` bell-unread · `32:806` popover · `32:894` empty · `32:945` loading/error · R27 `91:1203`…`91:1607` (bản shop) · `91:1853` no-destination · `91:1967` routing-current · `91:2080` routing-**future** · `91:2571` channels-**future** · 📱 `32:1357`, `40:6`, `40:44`, `91:2696`, `91:2752` |
| **Code**                | ✅ [NotificationBell](../../apps/web/src/features/notifications/components/NotificationBell.tsx)                                                                                                                                                                                                           |
| **Props**               | `{ context: NotificationContext }` — `'manage'` \| `'customer'`                                                                                                                                                                                                                                            |
| **Thiết kế**            | **Đã đúng shared-engine rule của brief** (02 = engine + khách, 07 = shop): một implementation, hai context, `notificationHref(n, context)` quyết định click-through ([lib/notification-display.tsx](../../apps/web/src/features/notifications/lib/notification-display.tsx))                               |
| **QUYẾT ĐỊNH**          | **REUSE** — kiến trúc khớp brief. ⚠️ `91:2080` và `91:2571` là **future** → không code                                                                                                                                                                                                                     |
| **Khiếm khuyết đã ghi** | Brief 11 §7: _"list-not-item notification routing"_ (02/07) — là defect nghiệp vụ, **không sửa trong wave giao diện**                                                                                                                                                                                      |
| **Module tiêu thụ**     | `Topbar` (manage) · `MarketHeader` (customer)                                                                                                                                                                                                                                                              |

---

## 8. Miền nghiệp vụ

### 8.1 Chat

|                   |                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**         | R06 (khách): `32:7`…`32:694` + 📱 `32:1098`, `39:307`…`39:505` · R27 (shop): `90:1203`…`90:2386` + 📱 `90:2532`…`90:2928`                                                                                                    |
| **Code**          | ✅ [features/chat/](../../apps/web/src/features/chat/): `ChatView` · `ConversationList` · `ThreadPanel` · `MessageComposer` · `ChatWithShopButton` · `ChatRealtimeContext` · `use-chat-unread-count` · `lib/firebase-client` |
| **Kiến trúc**     | ADR 0009 — PostgreSQL là source of truth; Firestore chỉ projection ~30–50 tin gần nhất; outbox/retry; attachment ở R2                                                                                                        |
| **QUYẾT ĐỊNH**    | **REUSE** toàn bộ. Migration chỉ chạm bố cục/khoảng cách của `ChatView`/`ThreadPanel`. **Không đụng `ChatRealtimeContext` hay `firebase-client`.**                                                                           |
| **⚠️ Không code** | `90:2386` shared-inbox-**future-concept** — brief 07 Q2/Q3 (shared vs assigned, read-per-member) **chưa chốt**                                                                                                               |
| **Ghi chú quyền** | Chat **không có permission key nào** (brief 07 Q6, anomaly đã ghi nhận). Không "sửa" trong wave UI                                                                                                                           |

### 8.2 Payment

|                   |                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**         | R24: `77:4980` record default · `77:5383` validation · `77:5515` overpayment-**current** · `77:5646` guard-**target** · `78:1201` submitting · `77:5780` success · `78:1360` history · `78:1522`/`78:1718`/`78:1902` void · 📱 `78:2582`…`78:2882` |
| **Code**          | ✅ [features/payments/](../../apps/web/src/features/payments/): `RecordPaymentModal` · `PaymentHistory` · `use-payments` · `schema.ts`                                                                                                             |
| **QUYẾT ĐỊNH**    | **REUSE**. `RecordPaymentModal` → **EXTEND** dùng `ResponsiveDialog` (Figma có `78:2582` mobile sheet)                                                                                                                                             |
| **⚠️ Không code** | `77:5646` guard-**target** — brief 06 Q2 (chính sách thu vượt) **chưa chốt**                                                                                                                                                                       |
| **Ràng buộc**     | Tiền: `Decimal` ở BE → **string** trong JSON (ADR 0007). [lib/money.ts](../../apps/web/src/lib/money.ts) `formatMoneyVnd` là điểm format duy nhất — **REUSE**, không tự format                                                                     |

### 8.3 People management (thành viên / nhân sự)

|                    |                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**          | R26 members: `87:1204`…`88:2750` · R38 staff: `113:3033`…`114:3283`. `122:1685` không tách hai — Figma coi staff là bản sao members ("Mirrors tenant member management", `113:3018`)                                                                                                                                   |
| **Code**           | Hai feature **song song, gần như giống hệt**: [features/members/](../../apps/web/src/features/members/) (`AddMemberModal`, `use-members`, `use-member-mutations`, `constants`) vs [features/admin-staff/](../../apps/web/src/features/admin-staff/) (`AddStaffModal`, `use-staff`, `use-staff-mutations`, `constants`) |
| **Khác biệt thật** | Vai trò khác (`TENANT_ROLE` vs `PLATFORM_ROLE`) · endpoint khác (`/members` vs `/platform/staff`) · bảo vệ khác (last-admin protection chỉ có ở staff) · bảng members render **trong `page.tsx`**, staff cũng vậy — cả hai **không** có component `*Table.tsx` riêng                                                   |
| **QUYẾT ĐỊNH**     | **KHÔNG gộp thành một component.** Ranh giới bảo mật khác nhau; gộp sẽ tạo một component biết cả hai scope — đúng thứ CLAUDE.md §5 cấm. Thay vào đó **REUSE** `DataTable` + `EntityIdentity` + `ResponsiveDialog` ở cả hai. Xem [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md) D6                            |

### 8.4 PII / MaskedContact ✅

|                     |                                                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Figma**           | R36 `107:2709` reveal-current · `107:2927` loading/success · `107:3151` error/permission · `107:3952` **target** · R35 `106:1764` exact phone · `106:2591` detail contact · `107:1698` masked-only |
| **Code**            | ✅ [MaskedContact](../../apps/web/src/components/data-display/MaskedContact.tsx)                                                                                                                   |
| **Props**           | `{ masked, revealed?, canReveal, loading?, onReveal }`                                                                                                                                             |
| **Thiết kế**        | Docstring nêu đúng ràng buộc: _bấm xem là hành động có ghi audit ở backend — nút phải do người dùng bấm, không tự bung khi mở drawer_                                                              |
| **QUYẾT ĐỊNH**      | **REUSE** nguyên trạng. ⚠️ `107:3952` là **design-target** → không code. Reveal governance (lý do, hạn mức, thông báo cho khách) là brief 09 Q3/Q5 **chưa chốt**                                   |
| **Module tiêu thụ** | `admin-bookings`, `admin-customers`                                                                                                                                                                |

---

## 9. Tổng kết quyết định

| Quyết định    | Số lượng | Danh sách                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REUSE**     | **14**   | `StatusTag` · `MaskedContact` · `Stars` · `Logo` · `BrandMark` · `TextField` · `SelectField` · `AutoCompleteField` · `SwitchField` · `ImageUploadField` · `ImageGalleryField` · `NotificationBell` · chat (6 file) · payments (2 file) · `VehicleCard` · `NoTenantState` · `PlaceholderPage` · `AppShell`/`Topbar`/`MobileNav`/`ManageMenu`/`ManageUserCard`/`ManagePageHeader` |
| **EXTEND**    | **5**    | `Sidebar` (collapsed + tông tối, chờ P1) · `NumberField` (money/percent) · `TextAreaField` (counter) · `DateTimeField` (range) · `FilterPanel` (giữ riêng marketplace)                                                                                                                                                                                                          |
| **CREATE**    | **10**   | `ResponsiveDialog` · `DetailDrawer` · `DataTable` · `EmptyState` (gồm error + no-results) · `LoadingState` · `PermissionState` · `FilterBar` · `RowActions` · `EntityIdentity` · `StickyFormActions`                                                                                                                                                                            |
| **KEEP-ANTD** | **3**    | `Button` · `message` (toast) · `Pagination`                                                                                                                                                                                                                                                                                                                                     |
| **DEPRECATE** | **0**    | — không có component nào cần bỏ                                                                                                                                                                                                                                                                                                                                                 |
| **HOÃN**      | **2**    | `Breadcrumb` (chưa đủ nhu cầu) · `packages/ui` (chỉ một app tiêu thụ)                                                                                                                                                                                                                                                                                                           |

**Mọi mục "component dùng chung tối thiểu" trong đề bài đều đã có quyết định sở hữu.** 0 mục để trống.

**Nơi đặt 10 component CREATE**: `apps/web/src/components/` theo nhóm hiện có —
`components/overlay/` (mới): `ResponsiveDialog`, `DetailDrawer` ·
`components/data-display/`: `DataTable`, `EntityIdentity`, `RowActions` ·
`components/feedback/` (mới): `EmptyState`, `LoadingState`, `PermissionState` ·
`components/filter/` (mới): `FilterBar` ·
`components/form/`: `StickyFormActions`.

**Không** đưa vào `packages/ui` — xem [00_IMPLEMENTATION_OVERVIEW.md §4.1](00_IMPLEMENTATION_OVERVIEW.md).

---

## 10. Vỏ portal sau Wave 1D (07/08/2026)

| Component             | Vai trò                                                          | Trạng thái                                                     |
| --------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `AppShell`            | Khung `/manage`: xác thực, tenant scope, 3 lối thoát khỏi khung  | Không tính offset ở JS — `flex` lo phần đó                     |
| `Sidebar`             | Điều hướng desktop, **nền tối**, 232 ↔ 64                        | Nút thu gọn có `aria-expanded` + `aria-controls`               |
| `ManageMenu`          | Vẽ cây menu. `tone: light \| dark`, `collapsed`                  | **Một cây cho cả hai trạng thái** (`inlineCollapsed` của AntD) |
| `ManageUserCard`      | Danh tính + vai trò + đăng xuất. `tone`, `collapsed`             | Không lộ email/điện thoại                                      |
| `Topbar`              | Breadcrumb · chat · chuông · ngữ cảnh gian hàng · menu tài khoản | Cao 56px                                                       |
| `ManageBreadcrumb` 🆕 | Ngữ cảnh trang, nhãn lấy từ **chính cây menu**                   | Không có sổ tra cứu route → tiêu đề                            |
| `ManagePageHeader`    | `<h1>` + dòng phụ + vùng hành động                               | Cỡ chữ token **h2**, không phải h1                             |
| `MobileNav`           | Thanh tab dưới đáy + Drawer menu đầy đủ                          | **Drawer AntD trực tiếp** — ngoại lệ có chủ ý, xem 04 §D17     |
| `usePortalLogout` 🆕  | Ba bước đăng xuất, một bản cài đặt                               | 2 lối vào: thẻ người dùng + menu avatar                        |
| `decorativeIcon` 🆕   | Bọc icon thành `aria-hidden`                                     | Consumer: `RowActions` (D15.10) + `MobileNav` (D16.1)          |

**Không thuộc vỏ manage**: `MarketHeader`, `MarketFooter`, `MobileTabBar` — khu khách hàng,
route group `(public)`, **không** bọc `AppShell` (có test chốt).

---

## 11. Pilot Wave 2 — Fleet List (`/manage/vehicles`, 07/08/2026)

Pilot chứng minh nền tảng Wave 1 đủ dùng: **không một workaround riêng cho trang nào**, và
component chung duy nhất phải sửa là một lỗ hổng **generic** (xem 08 §Wave 2).

| Nền tảng                      | Dùng ở Fleet List                               | Ghi chú                                   |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `DataTable`                   | bảng desktop **+ `renderCard` mobile**          | **Consumer `renderCard` đầu tiên** — 1/14 |
| `FilterBar`                   | 5 field + slot `actions` cho "Sắp xếp"          | Gỡ bản sao cũ, xem 04 §D20                |
| `RowActions`                  | bảng `maxInline` mặc định · thẻ `maxInline={0}` | Một định nghĩa hành động cho cả hai       |
| `EntityIdentity`              | ô định danh bảng (`md`) · thẻ mobile (`lg`)     |                                           |
| `StatusTag`                   | 2 trục trạng thái, cả bảng lẫn thẻ              | `VEHICLE_*_STATUS_META` không đổi         |
| `PermissionState`             | màn 403 cấp trang                               | **Mới ở Wave 2** (`58:2061`)              |
| `EmptyState` / `LoadingState` | qua `DataTable`                                 |                                           |
| `ManagePageHeader`            | tiêu đề + nút "Thêm xe"                         |                                           |

**Không dựng** `VehicleDataTable`, `VehicleEmptyState`, `VehicleFilterBar`, `VehicleRowActions`,
wrapper bảng responsive thứ hai, hook breakpoint thứ hai, hay hệ status-tag thứ hai.

**`renderCard` sau Pilot: 1/14.** Mười ba bảng còn lại vẫn cuộn ngang ở mobile — rollout theo
module ở Wave 3, không mở rộng ở đây.
