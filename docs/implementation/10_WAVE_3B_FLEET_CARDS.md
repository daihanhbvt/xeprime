# Wave 3B — Trải nghiệm thẻ xe ở `/manage/vehicles`

Đổi hình thái chính của danh sách xe từ **bảng** sang **lưới thẻ**, kèm một endpoint tổng hợp
nhỏ trong module `vehicles` để thẻ có số liệu thật thay vì số bịa.

> **Đợt 3B-R1 (10/08/2026) — dựng lại theo Figma.** Figma đã vẽ lại toàn bộ R14 thành cụm
> `fleet-list-v2-*`; node `58:*` cũ **không còn tồn tại**. Phần bổ sung/ghi đè ở §11 cuối file.

## 1. Phạm vi đã làm

|                         |                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Route đổi               | `/manage/vehicles` — lưới thẻ ở desktop, danh sách hàng ngang ở mobile. **Không còn chế độ bảng**          |
| Route kiểm tra tích hợp | `/manage/vehicles/[id]` · `/manage/vehicles/[id]/edit` · `/manage/calendar`                                |
| Backend                 | **Thêm** `GET /vehicles/stats` (in-module, tenant-scoped). Không đụng schema, không đụng endpoint nào khác |

## 2. Phân loại dữ liệu — cái gì có thật

Nguồn: `VehicleListItemDto` (contract sinh từ OpenAPI) + hai bảng `bookings`, `receipts`.

### A — có sẵn từ API danh sách

`id` `code` `name` `plateNumber` `vehicleType` `serviceType` `brand` `model` `manufactureYear`
`seatCount` `bodyType` `discountPercent` `operationStatus` `publicStatus` `mainImageUrl`
`weekdayPrice` `weekendPrice` `updatedAt`

### B — tổng hợp được an toàn (endpoint mới)

| Chỉ số          | Nguồn                                              | Ghi chú                       |
| --------------- | -------------------------------------------------- | ----------------------------- |
| Đơn đang chạy   | `booking.status = 'active'`                        | `groupBy` ở DB                |
| Đơn hoàn thành  | `booking.status = 'completed'`                     |                               |
| Tổng thu luỹ kế | `receipt.type = 'income' AND status = 'approved'`  | Chỉ trả khi có `finance.view` |
| Tổng chi luỹ kế | `receipt.type = 'expense' AND status = 'approved'` |                               |
| Lãi/lỗ luỹ kế   | thu − chi, **cùng phạm vi luỹ kế**                 | Tính ở FE từ hai số trên      |

### C — KHÔNG hỗ trợ, không dựng

| Chỉ số                                | Vì sao                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Doanh thu / Chi phí **theo kỳ**       | Không có hợp đồng khoảng thời gian cho thu/chi theo xe. Cắt theo `receipt.createdAt` là **sai nghiệp vụ**: ngày ghi phiếu lệch ngày phát sinh. → **Không dựng bộ chọn kỳ**, đúng chỉ thị "no reliable API contract → do not add a fake selector" |
| Cảnh báo Đăng kiểm / Bảo dưỡng / BHXH | **Không có cột nào trong `schema.prisma`**: không có hạn đăng kiểm, không có số km bảo dưỡng, không có bảo hiểm. Dựng được thì phải thêm bảng + workflow nhắc hạn — vượt xa phạm vi wave này                                                     |
| Trạng thái "còn trống" tính từ lịch   | `operationStatus` là trạng thái vận hành do người dùng đặt, **không phải** kết luận từ booking/occupancy. Suy ra "còn trống" từ nhãn này là sai                                                                                                  |

**Không có nhãn nào trùng số.** Thẻ chỉ hiện Tổng thu/Tổng chi/Lãi luỹ kế — không có cặp
"Doanh thu/Tổng thu" cùng giá trị dưới hai tên khác nhau.

## 3. Endpoint mới

```
GET /vehicles/stats?ids=<id,id,...>   (tối đa 100)
→ { data: [{ vehicleId, activeBookings, completedBookings, totalIncome?, totalExpense? }] }
```

- `@RequirePermissions(VEHICLE_VIEW)` + `@TenantScoped()`; `tenantId` từ membership
- Thiếu `finance.view` → **không chạy truy vấn `receipt`** và hai trường tiền vắng mặt khỏi
  response. Không phải ẩn ở UI — số liệu không rời khỏi DB
- Tách khỏi `GET /vehicles` có chủ đích: dashboard, calendar-resources và picker đơn đều gọi
  danh sách xe mà không cần tổng hợp nặng

## 4. Component

**Dùng lại:** `AppShell` `ManagePageHeader` `FilterBar` `EntityIdentity` `StatusTag` `RowActions`
(kèm `Popconfirm` xác nhận xoá) `EmptyState` `Pagination` `Skeleton` `Button` `Segmented`
`formatMoneyVnd` `useUrlFilters`.

**Thêm mới (domain Fleet, compose primitive chung — không dựng lại primitive nào):**

| File                        | Vai trò                                                   |
| --------------------------- | --------------------------------------------------------- |
| `VehicleManagementCard.tsx` | Một thẻ xe                                                |
| `VehicleCardGrid.tsx`       | Lưới + trạng thái tải/rỗng/không-kết-quả/lỗi + phân trang |
| `VehicleListRow.tsx`        | Một xe ở dạng hàng ngang (mobile) — thêm ở 3B-R1          |
| `row-actions.tsx`           | **Một** định nghĩa hành động cho cả thẻ lẫn hàng ngang    |
| `use-vehicle-card-stats.ts` | Query chỉ số theo id của **trang hiện tại**               |

`VehicleTable` đã bị xoá ở 3B-R1 (§11.2); `row-actions.tsx` giờ phục vụ thẻ desktop và hàng
ngang mobile — một bộ hành động, một bộ quyền, một câu chữ xác nhận.

## 5. Bố cục

⚠️ **Số liệu mục này đã bị §11.3 thay thế.** Bố cục 3B đầu tiên dùng sàn thẻ 360px (3 cột ở
1440px) vì Figma chưa có frame; 3B-R1 đo lại theo `186:1672` và chốt sàn 200px → **5 cột ở
1440px**, đúng thiết kế.

## 6. Quyền

| Quyền             | Hiệu lực trên thẻ                                                                   |
| ----------------- | ----------------------------------------------------------------------------------- |
| `vehicles.view`   | Thiếu → `PermissionState` thay toàn trang                                           |
| `vehicles.create` | Mở nút "Thêm xe" + "Thêm xe đầu tiên"                                               |
| `vehicles.update` | Mở "Sửa"                                                                            |
| `vehicles.delete` | Mở "Xoá" (kèm xác nhận nêu đích danh xe)                                            |
| `finance.view`    | **Backend** quyết có trả tiền hay không; thẻ tự ẩn cả cụm tài chính khi trường vắng |

## 7. Hành động

- Xem → `/manage/vehicles/[id]`
- Sửa → `/manage/vehicles/[id]/edit`
- Lịch → `/manage/calendar?q=<biển số ?? tên>` — **chưa có route lịch riêng theo xe**; màn lịch
  dùng chung nhận `q` lọc theo tên/biển số, nên lọc về đúng xe thay vì bịa route mới
- Xoá → `Popconfirm` dùng chung, nêu tên + mã + biển số, cảnh báo ràng buộc lịch. Không
  `window.confirm`, không xoá lạc quan

## 8. Kiểm tra đã chạy

|                                               |                            |
| --------------------------------------------- | -------------------------- |
| `vehicles-cards.test.tsx` (mới)               | **26 passed**              |
| `vehicles-page.test.tsx` (bảng, `view=table`) | **49 passed**              |
| Fleet + data-display + form                   | **220 passed**, 8 file     |
| `tsc --noEmit` (api)                          | sạch                       |
| `tsc --noEmit` (web)                          | sạch                       |
| ESLint file đổi                               | 0 lỗi                      |
| Prettier · `git diff --check`                 | sạch                       |
| `pnpm contract`                               | sinh lại OpenAPI + type FE |

## 9. Kiểm chứng hình ảnh

**Đã kiểm trên app đang chạy** (`http://192.168.1.210:3000`) bằng Chrome headless qua CDP với
phiên đăng nhập thật: lưới 1900px và 1440px, mobile 390px, đo tràn ngang ở 6 bề rộng, và gọi
thẳng `GET /vehicles/stats` xác nhận số liệu thật.

**Chưa kiểm:** so pixel với frame Figma (Figma không có frame cho hình thái thẻ mới — đây là
thay đổi do prompt Wave 3B chỉ định, prompt thắng design theo đúng quy tắc đã nêu).

## 10. Hạn chế còn lại

1. **Không có chỉ số theo kỳ** → không có bộ chọn kỳ. Cần backend bổ sung trường thời điểm phát
   sinh cho phiếu thu/chi trước khi làm.
2. **Không có cảnh báo hạn đăng kiểm/bảo dưỡng/bảo hiểm** — thiếu cột trong DB.
3. **Lịch theo xe** đang lọc bằng `q` (contains), không phải một route riêng theo `vehicleId`.
4. Thẻ và bảng cùng tồn tại; bảng vẫn giữ toàn bộ hợp đồng cột của Wave 2.

---

## 11. Đợt 3B-R1 — dựng lại theo Figma `fleet-list-v2-*` (10/08/2026)

Đợt 3B đầu tiên làm khi Figma **chưa có** frame cho hình thái thẻ, nên bố cục do prompt mô tả.
Figma sau đó đã vẽ đủ 14 frame mới; đợt này chỉnh code về đúng thiết kế đó.

### 11.1 Node đã inspect

Section `57:2` "05 - Fleet Management", tiêu đề batch: **"Batch 1 — Fleet List v2 (5-col Card
Grid + Mobile List) — Redesign 2026-08-10"**.

| Frame                               | Node                    | Kích thước         |
| ----------------------------------- | ----------------------- | ------------------ |
| `fleet-list-v2-desktop`             | `186:1549`              | 1440×1080          |
| `fleet-list-v2-search`              | `188:4240`              | 1440×1080          |
| `fleet-list-v2-filters`             | `188:4514`              | 1440×1080          |
| `fleet-list-v2-view-only`           | `188:4913`              | 1440×1080          |
| `fleet-list-v2-empty-create`        | `188:1553`              | 1440×1080          |
| `fleet-list-v2-no-results`          | `188:1685`              | 1440×1080          |
| `fleet-list-v2-loading`             | `188:1826`              | 1440×1080          |
| `fleet-list-v2-error`               | `188:2158`              | 1440×1080          |
| `fleet-list-v2-permission-denied`   | `188:2290`              | 1440×1080          |
| `fleet-list-v2-mobile`              | `186:2374`              | 390×912            |
| `fleet-list-v2-mobile-filter-sheet` | `188:3971`              | 390×844            |
| `fleet-list-v2-mobile-empty`        | `188:4086`              | 390×844            |
| `fleet-list-v2-mobile-no-results`   | `188:4129`              | 390×855            |
| `fleet-list-v2-mobile-loading`      | `188:4172`              | 390×844            |
| Thẻ xe · hàng hành động             | `186:1673` · `186:1713` | 209.6×405 · 190×24 |
| Hàng mobile                         | `186:2408`              | 390×139            |

### 11.2 Vì sao **bỏ hẳn chế độ bảng**

Ba nguồn độc lập cùng nói một điều, nên `VehicleTable.tsx` + `.module.css` bị xoá và nút chuyển
lưới/bảng biến mất:

1. Figma node `185:4474` ghi thẳng: _"⚠️ CÁC MÀN HÌNH FLEET LIST DẠNG BẢNG BÊN DƯỚI ĐÃ ĐƯỢC THAY
   THẾ BỞI THIẾT KẾ CARD GRID MỚI"_ — và **không có** frame bảng nào trong cụm v2.
2. Prompt 3B-R1 ràng buộc list view bằng _"if it exists in Figma"_.
3. Brief `04_FLEET_MANAGEMENT.md` §7.1: _"Do not add a table/grid switcher unless a later product
   requirement proves that large fleets need it."_

"List view" của thiết kế v2 chính là **hàng ngang ở mobile** (tên batch nói rõ "+ Mobile List"),
không phải bảng desktop. Tham số URL `view` cũng bị gỡ.

### 11.3 Hình học đo trên app thật

| Viewport | Cột            | Bề rộng thẻ | Gap cột | Tỉ lệ ảnh | Tràn ngang |
| -------- | -------------- | ----------- | ------- | --------- | ---------- |
| 360      | 1 (hàng ngang) | 342         | —       | ảnh 80×60 | 0          |
| 390      | 1 (hàng ngang) | 372         | —       | ảnh 80×60 | 0          |
| 640      | 1 (hàng ngang) | 622         | —       | ảnh 80×60 | 0          |
| 768      | 3              | 226         | 12      | 1.714     | 0          |
| 1024     | 4              | 228         | 12      | 1.714     | 0          |
| 1280     | 4              | 230         | 12      | 1.714     | 0          |
| **1440** | **5**          | **213.6**   | **12**  | **1.714** | **0**      |
| 1920     | 7              | 217.7       | 12      | 1.714     | 0          |

Figma ở 1440: 5 thẻ × 209.6 + 4 × 12 = 1096. Code khoá **bề rộng thẻ** (`minmax(200px, 1fr)`)
chứ không khoá số cột, nên 1440 ra đúng 5 cột và màn rộng hơn thì thêm cột với thẻ vẫn ~210px —
thay vì 5 thẻ bị kéo giãn để lại khoảng trống lớn.

### 11.4 Hai lỗi hình học chỉ lộ ra khi đo

| Lỗi                                                                             | Nguyên nhân                                                                                                                     | Sửa                                         |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Khung ảnh mang tỉ lệ **1.500 / 0.750** của từng file thay vì 1.714              | `img { height: 100% }` trong luồng phải giải theo chiều cao cha, mà chiều cao cha lại do ảnh quyết định → rơi về tỉ lệ tự nhiên | `img { position: absolute; inset: 0 }`      |
| Thẻ trong cùng hàng lệch **6px** bề rộng                                        | `<li>` là flex container, thẻ là flex item cỡ theo nội dung nên thẻ dùng ảnh dự phòng hẹp hơn                                   | `.cell > * { flex: 1 }`                     |
| Nút "Xoá" bị **cắt cụt** trên thẻ                                               | 4 nút kèm icon rộng ~250px trong thân thẻ 186px                                                                                 | bỏ icon — Figma `186:1713` chỉ có chữ       |
| **Tràn ngang 4px** ở 360px (lỗi của `FilterBar` dùng chung, mọi trang đều dính) | nút "Bộ lọc" (89px) bị flex bóp xuống 77px rồi tràn khỏi `Badge` bọc ngoài                                                      | `.mobileTop > :not(.search) { flex: none }` |

### 11.5 Đổi ở component dùng chung (đều opt-in, 13 trang còn lại không đổi hành vi)

| Component    | Thêm                    | Vì sao                                                             |
| ------------ | ----------------------- | ------------------------------------------------------------------ |
| `FilterBar`  | `searchPlacement="row"` | Figma `186:1639` cho ô tìm kiếm một hàng riêng full-width          |
| `FilterBar`  | `showActiveChips`       | Figma `188:4514` — chip filter đang bật, gỡ được từng cái          |
| `RowActions` | `align="start"`         | Hàng nút chiếm trọn một hàng trên thẻ, không phải ô cuối hàng bảng |

### 11.6 Lệch có chủ đích so với Figma

| Figma vẽ                                                                | Code làm                     | Lý do                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Chip cảnh báo "Đăng kiểm: 15 ngày", "Bảo dưỡng: 500km", "BHXH: 30 ngày" | **không dựng**               | Không có cột nào trong `schema.prisma`. Prompt: _"Do not fabricate unsupported data"_ (ưu tiên 1 > 3)         |
| Nhãn "LÃI DỰ KIẾN"                                                      | **"LÃI LUỸ KẾ"**             | Số thật là thu − chi luỹ kế. Prompt: _"If only cumulative values are available, use clear cumulative labels"_ |
| Thẻ chỉ có trạng thái **vận hành**                                      | thêm **công khai** ở góc ảnh | Prompt liệt kê "Public status" là dữ liệu bắt buộc; đặt ở góc ảnh để không phá hàng specs 185px của Figma     |
| Padding khung 20px, gap dòng 20px                                       | 24px (`--xp-space-lg`)       | Token thắng số đo lẻ (ADR 0003). Lệch 4px                                                                     |

### 11.7 Đã kiểm bằng mắt / bằng đo

Chrome headless qua CDP, phiên đăng nhập thật, `http://192.168.1.210:3000`:

- **Ảnh chụp**: lưới desktop 1440 (2 lượt — trước/sau khi sửa nút bị cắt), hàng ngang mobile 390,
  không-kết-quả 1440, filter đang bật 1440.
- **Đo DOM**: bề rộng thẻ · gap · tỉ lệ ảnh · số cột · tràn ngang ở 8 viewport (§11.3).
- **Chưa chụp**: rỗng-chưa-có-xe (cần gian hàng trống), bottom sheet mobile (cần thao tác click) —
  cả hai đã khoá bằng unit test.

### 11.8 Kiểm tra

|                                              |                         |
| -------------------------------------------- | ----------------------- |
| `vehicles-cards.test.tsx` (thẻ + mobile)     | **29 passed**           |
| `vehicles-page.test.tsx` (cấp trang)         | **31 passed**           |
| Toàn bộ web (do đụng 2 component dùng chung) | **933 passed**, 53 file |
| `tsc --noEmit` (web) · ESLint · Prettier     | sạch                    |

### 11.9 Chỉnh sau review thiết kế (đối chiếu ảnh app ↔ ảnh Figma)

Ba điểm chủ dự án chỉ ra khi so hai ảnh cạnh nhau:

| Vấn đề                                           | Sửa                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Dropdown lọc không mang nhãn như Figma           | `FilterBar` thêm opt-in `compactFields`: pill 32px, hiện `Nhãn: Giá trị` kể cả sau khi chọn (`labelRender`) |
| Nút Xem/Sửa/Lịch/Xoá phẳng, không có nền và viền | `RowActions` thêm opt-in `variant="outlined"` → `type="default"` + nền chìm; hành động phá huỷ nền đỏ nhạt  |
| Màn rộng ra **7 thẻ**, khối chỉ số trong thẻ vỡ  | Lưới chặn ở **5 cột**: sàn track = `max(200px, (100% − 4×gap) / 5)` — hết chỗ thì thẻ nở, không thêm cột    |

Sàn track hai vế là mấu chốt: vế `200px` lo màn hẹp (bớt cột), vế `1/5 bề rộng` lo màn rộng
(chặn cột thứ sáu). Không cần media query nào, nên sidebar thu/mở cũng không làm lệch số cột.

Đo lại sau khi sửa: 1280 → 4 cột · 1440 → **5** · 1680 → **5** · 1920 → **5** · 2560 → **5**;
tỉ lệ ảnh giữ 1.714 ở mọi bề rộng, tràn ngang 0. Toàn bộ web: **933 passed**, 53 file.

### 11.10 Figma cập nhật lần 2 — thanh lọc một hàng + nút nền màu

Sau đợt 11.9, chủ dự án đối chiếu ảnh app ↔ ảnh Figma và chỉ ra thanh lọc + nút vẫn chưa khớp.
Kiểm lại thì **Figma đã đổi tiếp**: `186:1639` không còn là `search-field` (1136×42, một hàng
riêng) mà thành `search-filter-bar` (1136×**34**, node con `197:*`) — tức ô tìm kiếm nay nằm
**cùng hàng** với cụm lọc. Bố cục đo được:

| Thành phần                     | Node        | Số đo                       |
| ------------------------------ | ----------- | --------------------------- |
| `search-input`                 | `197:1547`  | 240×34, x = 0 (KHÔNG giãn)  |
| `separator` (gạch dọc)         | `197:1550`  | 1×20, x = 252               |
| `filter-Loại xe / Dịch vụ / …` | `197:1551…` | cao 29, cách nhau đúng 12px |
| `sort-dropdown`                | `197:1568`  | 135×27, dồn mép phải        |

→ Gỡ hẳn prop `searchPlacement` (thêm ở 11.5 cho bố cục cũ, nay không còn nơi dùng) và dồn tất
cả vào `compactFields`: tìm kiếm 240px cố định, gạch dọc, pill 32px, sắp xếp dồn phải.

#### Màu nút — đo pixel thay vì ước lượng

Đợt 11.9 dựng nút có **viền**; Figma không có viền nào. Lấy màu bằng cách render node
`186:1713` ra PNG rồi đọc pixel qua canvas (xác nhận lại trên `186:1760` — trùng khít):

| Nút        | Figma fill | Figma text | Token XePrime                                |
| ---------- | ---------- | ---------- | -------------------------------------------- |
| Xem        | `#f9f5e7`  | `#a8871c`  | `primary-light` + `primary-active` (#a9761a) |
| Sửa · Lịch | `#efefee`  | `#615c54`  | `bg-muted` + `text-secondary` (#6b6560)      |
| Xoá        | `#fbe9e9`  | `#dc2626`  | `error-bg` + `error` — **khớp từng chữ số**  |

`#dc2626` trùng đúng `--xp-color-error` là bằng chứng thiết kế dựng trên bảng màu XePrime, nên
ba sắc thái này ánh xạ thẳng sang cặp `color`/`variant="filled"` của AntD thay vì tự tô nền —
tự tô sẽ phải nhân đôi class để tranh specificity và vẫn hỏng ở hover/disabled/loading.

Hai chỗ AntD lệch khỏi Figma nên phải đè **màu chữ** (chỉ màu chữ, nền để AntD lo):
hành động thường lấy `#1a1a1a` thay vì sắc phụ, và hành động chính lấy gold nhạt `#d6a02c` —
gold nhạt trên nền kem chỉ đạt ~2.2:1, không đọc nổi.

`RowAction` thêm cờ `primary` để "Xem" nhận sắc thương hiệu; `RowActions` thêm
`variant="filled"` (đổi tên từ `outlined` của 11.9 — không còn viền nào để mà "outline").

#### Đo lại trên app thật

|                         | Figma                             | App                               |
| ----------------------- | --------------------------------- | --------------------------------- |
| Số hàng thanh lọc       | 1                                 | **1**                             |
| Ô tìm kiếm              | 240×34                            | **240×32**                        |
| Khoảng cách pill        | 12                                | **12**                            |
| Nút                     | 45/41/44/42 × 24                  | **46/42/45/44 × 24**              |
| Khoảng cách nút         | 6                                 | **6**                             |
| Viền nút                | không                             | `rgba(0,0,0,0)`                   |
| Màu chữ Xem · Sửa · Xoá | `#a8871c` · `#615c54` · `#dc2626` | `#a9761a` · `#6b6560` · `#dc2626` |

Toàn bộ web: **933 passed**, 53 file. Tràn ngang 0 ở cả `/manage/vehicles` lẫn `/manage/bookings`.

---

## 12. Wave 3B-R2 — Wizard tạo/sửa xe theo Figma `193:*`

Figma đã vẽ lại **lần thứ ba**: cụm tạo/sửa chuyển sang `193:*` (5 bước), cụm chi tiết sang
`200:*`. Node `60:*`, `62:*`, `65:7…65:2378` mà code đang chú thích **không còn tồn tại**.

### 12.1 Ánh xạ ảnh → route → node

| Ảnh                                                              | Route / trạng thái           | Node                                                              | Kích thước    |
| ---------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- | ------------- |
| Chi tiết đã duyệt / nháp / cần sửa / bị ẩn / chờ duyệt / từ chối | `/manage/vehicles/[id]`      | `200:1555` `200:1724` `200:2012` `200:2114` `200:2215` `200:2311` | 1440×900–1254 |
| Chi tiết mobile                                                  | như trên                     | `200:2413`                                                        | 390×921       |
| Tạo bước 1–5                                                     | `/manage/vehicles/new`       | `193:1553` `193:1661` `193:1779` `193:1889` `193:2009`            | 1440×900/988  |
| Lỗi validate khi tạo                                             | như trên                     | `193:2687`                                                        | 1440×900      |
| Sửa bước 1 + cảnh báo công khai                                  | `/manage/vehicles/[id]/edit` | `193:2297`                                                        | 1440×900      |
| Hộp xác nhận thay đổi nhạy cảm                                   | như trên                     | `193:2568`                                                        | 1440×900      |
| Mobile tạo 1/3/4, xác nhận, sửa, lỗi                             | cả hai route                 | `193:3231` `193:3327` `193:3426` `193:3530` `193:3635` `193:3735` | 390×844       |

### 12.2 Đã làm

| Hạng mục                       | Kết quả                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VehicleWizard.tsx`            | Vỏ wizard dùng chung: thẻ thanh bước (`Steps` của AntD, vòng tròn 28px) + thẻ nội dung + hàng nút trong thẻ — Figma `193:1590`/`193:1615`                                                      |
| Tạo xe                         | **5 bước** đúng nhãn Figma, bước 5 là màn xác nhận với 4 thẻ tổng kết, mỗi thẻ có "Chỉnh sửa" quay đúng bước và giữ nguyên giá trị                                                             |
| Sửa xe                         | **5 bước** đúng nhãn Figma (`Thông tin chung · Hình ảnh xe · Thiết lập giá · Điều khoản thuê · Xác nhận lại`), bước 5 liệt kê **chỉ thứ đã đổi** kèm cũ → mới                                  |
| Trường nhạy cảm                | `sensitive-changes.ts` đọc `VEHICLE_PUBLIC_SENSITIVE_FIELDS` ở `packages/types` — **cùng hằng số backend dùng**, không chép tay                                                                |
| Hộp xác nhận                   | `ResponsiveDialog` dùng chung (bẫy focus, sheet ở mobile, `confirmLoading` chặn gửi trùng)                                                                                                     |
| "Lưu nháp" / "Lưu & Gửi duyệt" | Hai hành vi backend có thật: `POST /vehicles` và `POST /vehicles/:id/submit-public`. Bước hai hỏng → báo "đã tạo xe nhưng chưa gửi duyệt được", không báo lỗi tạo (bấm lại sẽ sinh xe thứ hai) |
| Bố cục bước 1                  | Thứ tự và nhãn theo `193:1617`: **Tên xe trái, Mã xe phải**; "Loại xe" đổi từ radio sang dropdown theo `193:1636`                                                                              |

### 12.3 Lệch có chủ đích

| Figma                                          | Code                                               | Lý do                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Nút lùi ghi "Quay lại"                         | chữ "Quay lại", `aria-label="Quay lại bước trước"` | `ManagePageHeader` đã có nút "Quay lại" rời trang; hai nút trùng tên khả truy cập trên một màn là lỗi a11y |
| Cảnh báo nhạy cảm liệt kê 4 trường             | code nhận **8** trường                             | `VEHICLE_PUBLIC_SENSITIVE_FIELDS` là 8; câu Figma là văn tóm tắt, không phải đặc tả                        |
| Luồng sửa không có frame cho thông số kỹ thuật | gộp vào "Thông tin chung"                          | Bỏ đi thì `plateNumber` (trường nhạy cảm) không sửa được ở đâu cả                                          |

### 12.4 CHƯA làm — còn nợ

- **Chi tiết xe chưa dựng lại theo `200:*`** (6 frame desktop + 1 mobile). Màn hiện tại vẫn là bản Wave 3A.
- Các frame phụ của chi tiết: `65:482` xác nhận gửi duyệt · `65:652` thiếu điều kiện · `65:2168`/`65:2275` xoá · `65:2576`/`65:2663` placeholder · 7 frame mobile `65:3008…65:3511`.
- Đối chiếu ảnh cho bước 2–5 khi tạo, bước 2–5 khi sửa, hộp xác nhận nhạy cảm, và toàn bộ mobile `193:3231…193:3735`.
- Cảnh báo "còn thay đổi chưa lưu" khi rời wizard giữa chừng.

### 12.5 Kiểm tra

`tsc --noEmit` sạch · ESLint sạch · **125 passed** (5 file: tạo 25, sửa 20, thẻ 29, trang 31, khác).
Đã chụp và đối chiếu: **tạo bước 1** và **sửa bước 1** ở 1440px.
