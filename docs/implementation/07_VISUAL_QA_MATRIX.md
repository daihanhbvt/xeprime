# 07 — VISUAL QA MATRIX

> Ngày lập: 06/08/2026 · Wave 0B. Quy trình kiểm thị giác thủ công cho mọi wave ở [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md).
> **Vì sao thủ công**: repo hiện **không có visual regression test, không có test a11y, không có test responsive**, và 14 trang danh sách không có test nào ([00_IMPLEMENTATION_OVERVIEW.md §8](00_IMPLEMENTATION_OVERVIEW.md)). Ma trận này là lớp bảo vệ duy nhất cho phần thị giác.

## 0⁺⁺⁺. Batch 1C-D — 4 route đã đổi, QA thị giác CÒN NỢ ⚠️

Bốn route `/manage/admin/{audit,plans,tenants,vehicles}` đã dùng nền tảng Wave 1C. Đã xác minh
bằng 80 test đặc tả, **chưa QA thị giác**. Những thay đổi **nhìn thấy được** cần soi:

| #   | Thay đổi                                                                     | Ở đâu                                                      |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Bộ lọc rời khỏi `ManagePageHeader extra`, xuống thành hàng `FilterBar` riêng | cả 4 route                                                 |
| 2   | Nút hành động trong bảng: `type="link"` (xanh) → `type="text"` (chữ thường)  | cả 4 route                                                 |
| 3   | Tải lần đầu: spinner/bảng rỗng → **skeleton**                                | cả 4 route                                                 |
| 4   | Cột hành động **dính phải** lần đầu tiên, có nền đục + bóng phân tách        | cả 4 route                                                 |
| 5   | Cột có bề rộng tường minh → tỉ lệ cột đổi so với auto-layout cũ              | cả 4 route                                                 |
| 6   | Cuộn ngang bắt đầu ở `minWidth` cố định thay vì `max-content`                | audit 1110 · plans 980 · tenants 950 · admin/vehicles 1120 |
| 7   | `/manage/admin/tenants`: ô tìm kiếm **debounce 400ms** thay vì nhấn Enter    | tenants                                                    |
| 8   | `/manage/admin/tenants`: URL không còn `?status=all`                         | tenants                                                    |
| 9   | Ở ≤640px bộ lọc (trừ ô tìm) vào **bottom sheet**                             | cả 4 route                                                 |
| 10  | `/manage/admin/audit`: khoảng ngày vẫn `DD/MM/YYYY` — **không được đổi**     | audit                                                      |

Chưa route nào có `renderCard`: bốn bảng này không nằm trong 7 bảng được Figma `127:2257` ánh xạ
thẻ (P26). Ở mobile chúng vẫn là bảng cuộn ngang — **kiểm không tràn ngang ở 360px**.

## 0⁺⁺. Wave 1C — QA thị giác sẽ nợ những gì

Batch **1C.0 không đổi code** nên **không nợ QA**. Danh sách dưới đây là những gì các batch sau
của 1C **sẽ** phải kiểm — ghi trước để không phát sinh bất ngờ ở cuối wave. Gói áp dụng: **LIST**
(14 route × S1–S6, S8, S9, S10 × {1440, 1280, 390}).

| #   | Sẽ phải kiểm                                                            | Vì sao (nguồn)                                   |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Cột hành động **dính phải** khi cuộn ngang ở 13 bảng lần đầu có nó      | D15.1 — đây là thay đổi nhìn thấy rõ nhất của 1C |
| 2   | Nền cột dính **đục** (không nhìn xuyên) + đường kẻ/bóng trái            | `127:2060` R3–R4                                 |
| 3   | Bảng → thẻ ở ≤640px ở các route có ánh xạ Figma                         | `127:2257` · P26                                 |
| 4   | Không cuộn ngang `<body>` ở 360px sau khi chuyển thẻ                    | `127:2097` R8                                    |
| 5   | Bóng gợi ý còn cột bên phải xuất/hiện đúng lúc                          | D15.4 · `127:2097` R5                            |
| 6   | Trạng thái rỗng: header cột còn hay mất (theo kết luận **P31**)         | D15.5                                            |
| 7   | Refetch nền **không** làm mất filter và không nháy loading toàn trang   | `134:2011` R4–R5                                 |
| 8   | Câu chữ empty ≠ no-results ở đủ 14 route                                | `134:2093` · §4.4                                |
| 9   | 403 hiện `PermissionState`, **không** đá về login                       | `134:2482`                                       |
| 10  | Tiền vẫn canh phải và không xuống dòng sau khi qua `DataTable`          | `127:1725` · §7.2                                |
| 11  | Thanh hành động dính đáy ở 5 form dài, không đè `MobileNav`             | `62:1623` · §4.9                                 |
| 12  | Bộ lọc mobile mở bằng `ResponsiveDialog` sheet, không phải sheet tự chế | P28                                              |

## 0⁺. Wave 1B — QA thị giác CÒN NỢ ⚠️

Wave 1B **không chạy được app** (cần Docker + Postgres + API), nên chưa có QA thị giác. Đã xác
minh bằng 235 test + typecheck + lint. Còn nợ, ưu tiên theo rủi ro:

| #   | Cần kiểm                                                    | Vì sao                                                                           |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Luồng đặt xe đủ 4 bước ở 360/390px                          | Overlay đổi từ modal 460px sang full-screen mobile                               |
| 2   | Đăng nhập/đăng ký ở 360px                                   | Bottom sheet đổi bo góc + trần chiều cao sang token                              |
| 3   | 7 panel chi tiết ở mobile                                   | Lần đầu chuyển sang toàn màn hình (trước đây tràn ngang)                         |
| 4   | Modal lồng trong drawer (khoá shop, ẩn xe, duyệt, thu tiền) | Thứ tự chồng lớp + trả focus                                                     |
| 5   | Bề rộng panel 480/520/640 → 560/720                         | 5 panel đổi bề rộng thấy được                                                    |
| 6   | 5 dialog 520 → 560px                                        | P22                                                                              |
| 7   | Trạng thái tải: `Spin` → `Skeleton` ở 6 panel               | Đổi hình thức chờ                                                                |
| 8   | Đóng-mở lại `RequestBookingModal` reset về bước 1           | **Không kiểm được trong jsdom** — AntD giữ cây con cũ tới khi hoạt ảnh đóng xong |
| 9   | Safe-area đáy trên iPhone                                   | Padding mới trong `ResponsiveDialog`                                             |

## 0. Trạng thái Wave 1A — QA thị giác CÒN NỢ ⚠️

Wave 1A đổi nền token nhưng **chưa chạy được gói SMOKE** (cần app chạy thật: Docker + Postgres + API). Thay vào đó đã xác minh bằng:

- **Diff token tính toán của AntD (before/after)**: 18/27 token bề mặt đổi giá trị — danh sách ở báo cáo Wave 1A
- **Đo tương phản WCAG**, chốt bằng test trong [theme.test.ts](../../apps/web/src/styles/theme.test.ts)
- **104 test đơn vị** xanh, gồm `AppShell.test.tsx` (vỏ shop portal) và `AuthModal.test.tsx` (xác thực khách)

**Còn nợ trước khi bắt đầu Wave 1B — chạy gói SMOKE và soi riêng những thay đổi nhìn thấy được sau:**

| #   | Thay đổi                                                    | Kiểm ở đâu                               |
| --- | ----------------------------------------------------------- | ---------------------------------------- |
| 1   | Nền trang `#f6f5f1` → `#faf9f7` (sáng hơn)                  | Mọi trang                                |
| 2   | Viền `#ebddbf` (ám vàng) → `#e8e4dd` (xám ấm)               | Mọi bảng, input, card                    |
| 3   | Chữ `#2a2318` → `#1a1a1a`                                   | Mọi trang                                |
| 4   | Bóng card/dropdown đổi sang Elevation 1/2 (nhẹ hơn, ấm hơn) | Card, dropdown, select                   |
| 5   | **Bo góc card 12px → 10px**                                 | Card, modal                              |
| 6   | **Vòng focus 2px mờ → 3px gold 25%**                        | Mọi input, nút                           |
| 7   | **Hover nút primary sáng → đậm** (`#e3ba54` → `#c4920f`)    | Mọi nút primary                          |
| 8   | **`Typography.Title level={3}` 24px → 20px**                | `ManagePageHeader` (mọi trang `/manage`) |
| 9   | **`level={4}` 20px → 16px**                                 | `ShopRegistration`                       |
| 10  | Nền header bảng / hover hàng ám ấm nhẹ                      | Mọi bảng                                 |

Không đổi (đã xác minh bằng diff): `colorPrimary`, `colorSuccess/Error/Warning`, `controlHeight`, `borderRadius`, `colorLink`, `colorBgContainer`, `zIndexPopupBase`.

---

## 1. Breakpoint kiểm

| Chiều rộng | Ứng với Figma                          | Vì sao có trong danh sách                                                                                                                  | Frame Figma đối chứng                                                  |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **1440**   | Desktop (biên trên) · Wide (biên dưới) | Chiều rộng gốc của **243 frame** desktop                                                                                                   | `58:5`, `18:4`, `92:1268`, …                                           |
| **1280**   | Desktop                                | **Figma vẽ riêng frame 1280** để kiểm tràn bảng                                                                                            | `87:1525` members-horizontal-scroll · `127:2148` 1280px-table-examples |
| **1024**   | Ranh Tablet/Desktop                    | Ranh giới `--xp-bp-tablet`. Nơi sidebar chuyển chế độ                                                                                      | `127:2169` 1024px-overflow-examples · `77:2765` (1024×768) · `93:1201` |
| **768**    | Tablet                                 | Chiều rộng của 8/10 frame tablet                                                                                                           | `23:7`, `58:2144`, `53:27`, `53:74` · `127:2194` tablet-table-examples |
| **390**    | Mobile                                 | Chiều rộng của **194 frame** mobile                                                                                                        | `58:2405`, `23:896`, …                                                 |
| **360**    | Mobile (biên dưới thực tế)             | **Không có frame Figma nào.** Nhưng 360px là chiều rộng Android phổ biến nhất VN — nếu bố cục 390 vỡ ở 360 thì lỗi đến tay người dùng thật | —                                                                      |

⚠️ **360 là điểm kiểm bắt buộc dù Figma không vẽ.** Mọi bố cục mobile phải chịu được 360 mà không tràn ngang.
⚠️ **768 vs 1024**: Figma dùng cả hai cho "tablet" — mâu thuẫn nội bộ, xem **P3**. Cho tới khi chốt, kiểm **cả hai**.

## 2. Trạng thái kiểm

| #   | Trạng thái            | Cách tạo                                                             | Quy chuẩn Figma                                                   |
| --- | --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| S1  | **Default**           | Dữ liệu bình thường (seed)                                           | frame `*-default`                                                 |
| S2  | **Loading**           | Chặn mạng / throttle 3G                                              | `134:2011` loading-standard · `55:110`                            |
| S3  | **Empty**             | Tenant/tài khoản chưa có dữ liệu                                     | `134:2093` · `125:1692`                                           |
| S4  | **No results**        | Có dữ liệu **nhưng** filter không khớp                               | `134:2093` — ⚠️ **phải khác S3**                                  |
| S5  | **Error**             | Trả 500 từ API                                                       | `134:2194` error-and-recovery                                     |
| S6  | **Permission denied** | Đăng nhập role thiếu quyền                                           | `134:2482` · `134:2556`                                           |
| S7  | **Long content**      | Tên xe/gian hàng/khách rất dài, mô tả 4000 ký tự, số tiền 10+ chữ số | —                                                                 |
| S8  | **Table overflow**    | Nhiều cột hơn chiều rộng                                             | `127:2097` horizontal-scroll-behavior                             |
| S9  | **Sticky Actions**    | Cuộn ngang bảng có `fixed:'right'`; cuộn dọc form dài                | `127:2060` sticky-actions-standard · `62:1623`                    |
| S10 | **Mobile cards**      | Bảng chuyển sang thẻ ở ≤640px                                        | `127:2257` mobile-card-transformation                             |
| S11 | **Overlay behavior**  | Mở modal/drawer/sheet                                                | `122:3705` shared-overlay · `130:1563` overlay-responsive-mapping |

## 3. Ma trận breakpoint × trạng thái

`✔` = phải kiểm · `—` = không áp dụng · `◆` = điểm rủi ro cao, ưu tiên

|                   | 1440 | 1280 | 1024 | 768 | 390 | 360 |
| ----------------- | ---- | ---- | ---- | --- | --- | --- |
| S1 Default        | ✔    | ✔    | ✔    | ✔   | ✔   | ✔   |
| S2 Loading        | ✔    | —    | ✔    | —   | ✔   | —   |
| S3 Empty          | ✔    | —    | ✔    | ✔   | ✔   | —   |
| S4 No results     | ✔    | —    | —    | —   | ✔   | —   |
| S5 Error          | ✔    | —    | —    | —   | ✔   | —   |
| S6 Permission     | ✔    | —    | —    | —   | ✔   | —   |
| S7 Long content   | ◆    | ◆    | ✔    | ✔   | ◆   | ◆   |
| S8 Table overflow | ✔    | ◆    | ◆    | ◆   | —   | —   |
| S9 Sticky Actions | ✔    | ◆    | ✔    | ✔   | ◆   | ◆   |
| S10 Mobile cards  | —    | —    | —    | —   | ◆   | ◆   |
| S11 Overlay       | ✔    | —    | ✔    | ✔   | ◆   | ◆   |

**Tổng ô phải kiểm: 46 ô / route.** Không chạy toàn bộ 46 ô cho mọi route — dùng gói kiểm ở §5.

## 4. Tiêu chí đạt

### 4.1 Toàn cục (mọi breakpoint, mọi route)

- [ ] **Không cuộn ngang ở `<body>`** — cuộn ngang chỉ được nằm trong vùng của chính nó (bảng, thanh chip)
- [ ] Không chữ bị cắt, không chồng lấp
- [ ] Vùng chạm ≥ 44×44px ở ≤640px
- [ ] Focus ring nhìn thấy trên mọi phần tử tương tác (theo `14:196`, sau Wave 1A)
- [ ] Không hex trần — mọi màu từ `var(--xp-*)` hoặc AntD token
- [ ] Khoảng cách chỉ dùng thang 4/8/16/24/32
- [ ] Tương phản chữ đạt WCAG AA (4.5:1 chữ thường, 3:1 chữ lớn/UI)

### 4.2 S1 Default

- [ ] Bố cục khớp frame Figma tương ứng (đối chiếu ảnh cạnh nhau)
- [ ] Cấp tiêu đề đúng ngữ nghĩa (H1 cho tiêu đề trang — sau P6)
- [ ] Mục sidebar đang chọn khớp route (`matchSelectedKey`)

### 4.3 S2 Loading

- [ ] Không nhảy bố cục (layout shift) khi dữ liệu về
- [ ] Skeleton ~cùng chiều cao với nội dung thật
- [ ] Refetch nền **không** hiện lại loading toàn trang (bảo vệ hành vi `isError && !data`)

### 4.4 S3 Empty vs S4 No results ⚠️

Đây là cặp hay sai nhất. **Phải khác nhau ở cả 3 chiều:**

|                 | S3 Empty                              | S4 No results                   |
| --------------- | ------------------------------------- | ------------------------------- |
| Câu chữ         | "Gian hàng chưa có xe nào"            | "Không tìm thấy xe khớp bộ lọc" |
| Hành động chính | "Thêm xe đầu tiên" (nếu có quyền tạo) | "Xoá bộ lọc"                    |
| Điều kiện       | `total === 0` và **không** có filter  | `total === 0` và **có** filter  |

- [ ] Hai màn khác nhau thật, không dùng chung một `Empty`
- [ ] Nút tạo chỉ hiện khi có quyền (biến thể `Permission: Create/ViewOnly` của `125:1692`)

### 4.5 S5 Error

- [ ] **Có nút "Thử lại"** gọi `refetch()` — không phải chỉ text (khiếm khuyết brief 11 §7)
- [ ] Câu chữ từ `getErrorMessage()`, không nuốt lỗi
- [ ] Lỗi trong drawer/modal hiện **trong** overlay, không phá bố cục

### 4.6 S6 Permission denied

- [ ] Phân biệt đúng **ba** trường hợp (`134:2482`): `401` chưa đăng nhập → về login · `403` thiếu quyền → `PermissionState kind="forbidden"` · no-tenant → `NoTenantState`
- [ ] Chế độ chỉ-xem: nút ghi **ẩn**, không phải disabled không giải thích
- [ ] ⚠️ **Nhắc**: ẩn nút không bảo vệ gì. Kiểm bằng gọi API trực tiếp rằng backend vẫn trả 403

### 4.7 S7 Long content

Dữ liệu kiểm bắt buộc:

| Trường                        | Giá trị kiểm                             |
| ----------------------------- | ---------------------------------------- |
| Tên xe                        | 255 ký tự (max theo `vehicleFormSchema`) |
| Tên gian hàng                 | 255 ký tự                                |
| Mô tả                         | 4000 ký tự                               |
| Số tiền                       | `999.999.999.999 ₫`                      |
| Tên khách                     | tên Việt dài đầy đủ + dấu                |
| Biển số / mã xe               | 80 ký tự                                 |
| Lý do từ chối / ghi chú duyệt | đoạn dài, nhiều dòng                     |

- [ ] Ô bảng cắt bằng `ellipsis` + `Tooltip`, **không** đẩy vỡ cột
- [ ] Tiêu đề drawer/modal xuống dòng hoặc cắt, không tràn
- [ ] Số tiền **không** xuống dòng giữa chừng

### 4.8 S8 Table overflow

- [ ] Cuộn ngang nằm trong container bảng, `<body>` **không** cuộn ngang
- [ ] Có gợi ý thị giác rằng còn cột bên phải (bóng/gradient theo `127:2097`)
- [ ] Header dính khi cuộn dọc
- [ ] Ở 1280 và 1024: đối chiếu với `127:2148` / `127:2169`

### 4.9 S9 Sticky Actions

- [ ] Cột hành động `fixed: 'right'` giữ vị trí khi cuộn ngang, có bóng phân tách
- [ ] Ở mobile: `StickyFormActions` dính đáy, **không** che nội dung cuối form
- [ ] Nút sticky không đè lên `MobileNav` bottom bar (kiểm z-index)
- [ ] Bàn phím ảo mở ra không đẩy thanh sticky lên giữa màn hình

### 4.10 S10 Mobile cards

- [ ] Bảng thành danh sách thẻ ở ≤640px (`127:2257`)
- [ ] Mỗi thẻ có: định danh (avatar+tên+phụ đề) · status · 2–3 trường chính · menu hành động
- [ ] Chạm vào thẻ = hành động chính (giống `onRow` click ở desktop)
- [ ] Phân trang thành `XePrime/Pagination/Mobile` (`117:1220`)
- [ ] **Không** còn cuộn ngang

### 4.11 S11 Overlay

- [ ] ≤640px: modal → **bottom sheet** (`ResponsiveDialog`)
- [ ] `Esc` đóng · click nền đóng · focus bị bẫy bên trong · trả focus về nút mở
- [ ] Nền trang **không cuộn** khi overlay mở
- [ ] Modal lồng trong drawer: thứ tự chồng lớp đúng
- [ ] Ở 360px: sheet không cao quá viewport; nội dung dài thì cuộn **trong** sheet
- [ ] Overlay có `title` thật (accessible name)

## 5. Gói kiểm theo wave

Không chạy 46 ô × 39 route mỗi lần. Dùng gói:

| Gói         | Route                                                                                                 | Ô kiểm                                  | Dùng ở wave  |
| ----------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------ |
| **SMOKE**   | 6 đại diện: `/`, `/manage/vehicles`, `/manage/bookings`, `/manage/finance`, `/manage/admin`, `/trips` | S1 × 6 breakpoint = **36**              | 1A, mọi wave |
| **OVERLAY** | 13 overlay                                                                                            | S11 × {1440, 390, 360} = **39**         | 1B           |
| **LIST**    | 14 route danh sách                                                                                    | S1–S6, S8, S9, S10 × {1440, 1280, 390}  | 1C           |
| **SHELL**   | 39 route manage                                                                                       | S1 × {1440, 1024, 390}                  | 1D           |
| **FULL**    | 1 route                                                                                               | **46 ô**                                | 2 (pilot)    |
| **MODULE**  | route của module                                                                                      | S1–S6, S9, S10, S11 × {1440, 1024, 390} | 3A–3L        |
| **AUDIT**   | 39 route                                                                                              | Toàn bộ                                 | 5            |

## 6. Ma trận theo route (gói MODULE / AUDIT)

Trạng thái nào **có frame Figma** cho từng route — ô trống nghĩa là Figma không vẽ, phải tự quyết theo quy chuẩn chung.

| Route                  | S2    | S3    | S4    | S5    | S6    | ▭768  | ▭1024 | 📱390 |
| ---------------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| R01 `/`                | ✔     | ✔     | ✔     | ✔     | —     | ✔     |       | ✔     |
| R02 `/listings/[id]`   |       |       |       |       | —     | ✔     |       | ✔     |
| R03 `/shops/[slug]`    |       | ✔     |       |       | —     | ✔     |       | ✔     |
| R04 `/account`         | ✔     | ✔     |       | ✔     |       |       |       | ✔     |
| R05 `/trips`           | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R06 `/chat`            | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R07/R08 forgot/reset   |       |       |       |       |       |       |       |       |
| R09 `/manage/login`    |       |       |       | ✔     | —     |       |       | ✔     |
| R10 onboarding         | ✔     |       |       | ✔     |       | ✔     |       | ✔     |
| R11 dashboard shop     |       |       |       |       |       |       |       |       |
| R12 dashboard platform | ✔     | ✔     |       | ✔     | ✔     |       | ✔     | ✔     |
| R13 no-tenant          |       |       |       |       |       |       |       | ✔     |
| **R14 vehicles ⭐**    | **✔** | **✔** | **✔** | **✔** | **✔** | **✔** |       | **✔** |
| R15 vehicle new        | ✔     |       |       | ✔     |       |       |       | ✔     |
| R16 vehicle detail     | ✔     |       |       | ✔     |       |       |       | ✔     |
| R17 vehicle edit       |       |       |       | ✔     | ✔     |       |       | ✔     |
| R18 bookings           | ✔     | ✔     |       | ✔     |       |       |       | ✔     |
| R19 booking-requests   | ✔     | ✔     |       | ✔     |       |       |       | ✔     |
| R20 calendar           | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R21 contracts          | ✔     |       |       | ✔     | ✔     |       |       | ✔     |
| R22 finance            | ✔     | ✔     |       | ✔     | ✔     |       | ✔     | ✔     |
| R23 receipts           | ✔     | ✔     | ✔     | ✔     | ✔     |       |       | ✔     |
| R24 debts              | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R25 shop profile       | ✔     |       |       | ✔     | ✔     | ✔     |       | ✔     |
| R26 members            | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R27 chat shop          | ✔     | ✔     |       | ✔     |       |       |       | ✔     |
| R28–R31 placeholder    | —     | ✔     | —     | —     | —     |       |       | ✔*    |
| R32 approvals          | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R33 admin tenants      | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R34 admin vehicles     | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R35 admin bookings     | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R36 admin customers    | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R37 admin audit        | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R38 admin staff        | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |
| R39 admin plans        | ✔     | ✔     |       | ✔     | ✔     |       |       | ✔     |

`*` R31 `/manage/trash` **không có frame mobile** — tự áp quy chuẩn chung.

**Quy tắc cho ô trống**: Figma không vẽ ≠ được bỏ qua. Áp quy chuẩn toàn cục (`134:2011` loading · `134:2093` empty · `134:2194` error · `134:2482` permission) và ghi vào PR rằng trạng thái này tự suy ra.

## 7. Kiểm riêng theo ngữ cảnh

### 7.1 Bảo mật / riêng tư (R35, R36, R37)

- [ ] Mặc định mọi liên hệ **đã masking**
- [ ] Nút "xem đầy đủ" chỉ hiện khi có `platform.customers.view_pii`
- [ ] Reveal **không tự bung** khi mở drawer — phải do người dùng bấm
- [ ] Sau reveal, giá trị đầy đủ **không** rò sang ô khác/ảnh chụp danh sách
- [ ] Kiểm `audit_logs` có bản ghi sau mỗi lần reveal
- Nguồn: `134:3234` privacy-consistency-audit · `113:1814` privacy-threat-audit

### 7.2 Tiền (R22, R23, R24, R39)

- [ ] Tiền hiển thị qua `formatMoneyVnd` — **không** tự format
- [ ] Không nơi nào dùng `number` cho tiền (ADR 0007 — string trong JSON)
- [ ] Số âm / số 0 / rất lớn hiển thị đúng
- [ ] Hành động không đảo ngược (huỷ phiếu, void thanh toán) có xác nhận đúng mức nghiêm trọng
- Nguồn: `134:3324` financial-consequence-feedback · `115:5757` security-financial-audit

### 7.3 Lịch (R20)

- [ ] Chiều cao hàng / chiều rộng cột khớp `--xp-calendar-*`
- [ ] Vị trí event bar khớp `calendar-position.test.ts`
- [ ] Header dính + cột tài nguyên dính hoạt động cùng lúc
- [ ] ⚠️ Đổi bất kỳ token `--xp-calendar-*` nào → **chạy lại `calendar-position.test.ts`**

### 7.4 In (R21)

- [ ] `@media print` chỉ hiện `[data-print-root]`
- [ ] Không có sidebar/topbar trên bản in
- [ ] Đối chiếu `74:1354` contract-document-print

### 7.5 Ngôn ngữ

- [ ] Mọi text từ `@xeprime/types` / `constants/`, không literal trần (CLAUDE.md §5)
- [ ] Thuật ngữ nhất quán: _khách thuê · gian hàng · chủ gian hàng · đơn thuê · quản trị nền tảng_
- [ ] ⚠️ Thực thể yêu cầu thuê có **3 tên** đang dùng ("Yêu cầu thuê" / "Đơn đặt xe" / "yêu cầu đặt xe") — brief 11 §10 ghi nhận, chưa chốt. **Giữ nguyên từng bề mặt**, không tự thống nhất
- Nguồn: `134:3128` vietnamese-terminology-standard · `134:2967` status-vocabulary-map

## 8. Kiểm a11y (mọi wave)

- [ ] Chỉ dùng bàn phím đi hết được luồng chính
- [ ] Thứ tự tab hợp lý; không bẫy focus ngoài overlay
- [ ] Nút chỉ-icon có `aria-label` (⚠️ **khiếm khuyết hiện tại** — `Tooltip` không thay được)
- [ ] Bảng có accessible name
- [ ] Ảnh có `alt`; avatar chữ-cái `aria-hidden`
- [ ] Thông báo lỗi liên kết với ô nhập (`aria-describedby`)
- [ ] `prefers-reduced-motion` được tôn trọng (đã có ở [globals.css:103](../../apps/web/src/styles/globals.css#L103))
- Nguồn: `134:2736` accessibility-audit · `134:2865` focus-and-keyboard-standard · `130:1658` table-accessibility-notes · `103:1989` · `113:2044` · `65:5835`

## 9. Mẫu ghi kết quả

Mỗi wave đính kèm bảng này vào PR:

```
Wave: 1C · Gói: LIST · Ngày: ____ · Người kiểm: ____

| Route | 1440 | 1280 | 390 | Ghi chú |
| /manage/vehicles       | ✅ | ✅ | ⚠️ | thẻ mobile: giá xuống dòng ở 360 → đã sửa |
| /manage/bookings       | ✅ | ✅ | ✅ | |
| …

Ảnh trước/sau: <đường dẫn>
Ô không kiểm được: <lý do>
Khác biệt so với Figma: <mô tả + node ID + đã ghi vào backlog chưa>
```

**Quy tắc**: ô "chưa kiểm" **không** được để trống — ghi lý do. Wave có ô chưa kiểm không đạt định nghĩa "xong" ([06 §0.2](06_MIGRATION_ORDER.md)).

---

## 0⁺⁺⁺⁺. Wave 1C — QA thị giác CÒN NỢ TOÀN BỘ ⚠️

Wave 1C **chưa chạy được app** (cần Docker + Postgres + API), nên **không ô nào** trong gói LIST
được kiểm bằng mắt. Đã xác minh bằng 623 test + typecheck + lint + build.

**14 route danh sách** cần gói **LIST** (S1–S6, S8, S9, S10 × {1440, 1280, 390}) + 360px.

Thay đổi nhìn thấy được do Wave 1C tạo ra — soi đúng những chỗ này trước:

| #   | Thay đổi                                                                             | Phạm vi              |
| --- | ------------------------------------------------------------------------------------ | -------------------- |
| 1   | Cột hành động **dính phải** lần đầu (trước chỉ 1/14 bảng có)                         | 14 bảng              |
| 2   | Nền cột dính phải đục + bóng phân tách khi cuộn                                      | 14 bảng              |
| 3   | Cuộn ngang bắt đầu ở `minWidth` cố định thay vì `max-content`                        | 14 bảng (900–1180px) |
| 4   | Cột có bề rộng tường minh → tỉ lệ cột đổi so với auto-layout                         | 14 bảng              |
| 5   | Tải lần đầu: spinner/bảng rỗng → **skeleton**                                        | 14 bảng              |
| 6   | Nút hành động `type="link"` (xanh) → `type="text"`                                   | 9 bảng               |
| 7   | Bộ lọc rời `ManagePageHeader extra` xuống hàng `FilterBar`                           | 6 trang              |
| 8   | ≤640px bộ lọc vào **bottom sheet**                                                   | 6 trang              |
| 9   | `/manage/admin/tenants`: tìm kiếm debounce 400ms thay vì Enter; URL bỏ `?status=all` | tenants              |
| 10  | `/manage/vehicles`: ô định danh dùng `EntityIdentity` (avatar 44px giữ nguyên)       | vehicles             |
| 11  | `members` / `admin/staff`: avatar đổi sang thang `sm` (32px)                         | 2 trang              |
| 12  | 403 khu quản trị: `Result` → `PermissionState` (icon ổ khoá thay vì minh hoạ AntD)   | admin/*              |

**Điểm rủi ro cao nhất**: `minWidth` là con số **suy diễn** cho 11/14 bảng (P25 chưa chốt) — nếu
đặt quá rộng, bảng cuộn ngang sớm hơn cần thiết ở 1280px. Đây là ô QA số 1.

**Không có `renderCard`**: ở ≤640px cả 14 bảng vẫn cuộn ngang. Phải kiểm **không tràn ngang
`<body>` ở 360px** trên cả 14 route.

---

## 0⁺⁺⁺⁺⁺. Wave 1D — QA THỊ GIÁC CÒN NỢ TOÀN BỘ ⚠️

**Phân biệt rõ hai thứ** (yêu cầu của chỉ thị 1D-C):

|                                 | Đã làm                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Kiểm tự động / cấu trúc**     | ✅ 312 test vỏ+điều hướng · typecheck · ESLint · Prettier · `git diff --check` · **22 cặp tương phản đo bằng công thức WCAG 2.1** |
| **QA thị giác (nhìn bằng mắt)** | ❌ **CHƯA LẦN NÀO**                                                                                                               |

**Phụ thuộc còn thiếu, chính xác**: ứng dụng cần **Docker daemon + PostgreSQL 16 + `apps/api`
đang chạy** thì `/manage/*` mới render (mọi trang gọi `/auth/me`; không có nó `AppShell` dọn
phiên rồi đá về `/manage/login`). Môi trường này chưa dựng được — nên **không một khẳng định
thị giác nào** trong báo cáo Wave 1D được đưa ra.

### Ô phải chạy khi có môi trường

Wave 1D đổi **tông màu của toàn bộ 25 route `/manage` cùng một lúc** — đây là diện QA rộng nhất
từ đầu dự án.

| Route đại diện          | Trách nhiệm                            |
| ----------------------- | -------------------------------------- |
| `/manage`               | dashboard gian hàng                    |
| `/manage/vehicles`      | list + `DataTable` cuộn ngang          |
| `/manage/receipts`      | tiền                                   |
| `/manage/members`       | tổ chức gian hàng                      |
| `/manage/admin`         | giám sát nền tảng                      |
| `/manage/admin/tenants` | quản trị nền tảng                      |
| `/manage/drivers`       | placeholder                            |
| `/`                     | khách hàng — **phải KHÔNG có sidebar** |

× 7 bề rộng: **360 · 390 · 640 · 1023 · 1024 · 1025 · 1440**

### Ô ưu tiên cao nhất

1. **1023 / 1024 / 1025** — ranh vừa dời 992→1024. Sai là hai chế độ điều hướng cùng hiện.
2. **Sidebar thu gọn ở 1440 và 1280** — icon căn tâm cột 64px cần `!important` đè AntD.
3. **360px** — 5 tab, nhãn "Đơn đặt xe" cắt ellipsis; kiểm không tràn ngang.
4. **Cỡ tiêu đề trang** — mọi trang đổi 20px → 24px cùng lúc.
5. **Drawer mobile nền tối** trên nền `mask` của AntD.
6. **`DataTable` cuộn ngang** bên trong vỏ mới — vỏ không được tự tràn.
7. **Modal/Drawer chồng lớp** trên thanh tab dưới đáy (z 100 vs popup base 1000).

---

## 0⁺⁺⁺⁺⁺⁺. Wave 2 Pilot — QA THỊ GIÁC CÒN NỢ ⚠️

|                                 | Đã làm                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Kiểm tự động / cấu trúc**     | ✅ 45 test trang + 24 test `RowActions` · typecheck · ESLint · Prettier · `git diff --check` · build |
| **QA thị giác (nhìn bằng mắt)** | ❌ **CHƯA**                                                                                          |

**Phụ thuộc còn thiếu, chính xác**: `/manage/vehicles` gọi `GET /vehicles` (dữ liệu gian hàng)
và `GET /auth/me`. Cần **Docker daemon + PostgreSQL 16 + `apps/api` chạy + phiên đăng nhập của
một tài khoản có `vehicles.view`**. Môi trường này chưa dựng được ⇒ **không** khẳng định bất kỳ
điều gì về pixel, mật độ bảng, hay hành vi cuộn.

Đã đối chiếu Figma bằng cách đọc frame trực tiếp (`58:5`, `58:1563`, `58:2061`, `58:2405`,
`58:2517`, `58:2144`) — đó là đối chiếu ĐẶC TẢ, không phải QA thị giác.

### Ô phải chạy khi có môi trường — 7 bề rộng × 10 trạng thái desktop + 5 mobile

**Ưu tiên cao nhất:**

1. **640 ↔ 641px** — ranh bảng↔thẻ. Sai là mất hẳn một hình thái.
2. **360px** — thẻ không được cắt nội dung; nút ⋮ 44px không được đè lên giá.
3. **Cuộn ngang bảng ở 1024px** với `minWidth: 900` + cột hành động dính phải, nền đục.
4. **Menu ⋮ trên thẻ** — hộp xác nhận "Xoá xe này?" phải hiện đúng chỗ, không bị cắt bởi mép thẻ.
5. **Link phủ thẻ** — bấm vùng nút ⋮ KHÔNG được điều hướng sang trang chi tiết.
6. **Bottom-sheet lọc ở mobile** (`58:2517`) chồng lớp đúng trên thanh tab dưới đáy.
7. **Màn 403** (`58:2061`) — thay toàn bộ nội dung, sidebar/topbar vẫn còn.
8. **Tablet 768px** — Figma `58:2144` RỖNG, không có gì để đối chiếu; xác nhận bảng desktop
   dùng được ở bề rộng này.

---

## Wave 3A — Visual QA CÒN NỢ (3 route Fleet)

Chặn: `/manage/vehicles/new`, `/manage/vehicles/[id]`, `/manage/vehicles/[id]/edit` đều gọi
`/vehicles` + `/auth/me`, nên cần **Docker + PostgreSQL 16 + `apps/api` đang chạy + phiên đăng
nhập có `vehicles.view`/`create`/`update`**. Môi trường hiện tại không dựng được.

Đã đối chiếu Figma bằng cách đọc frame trực tiếp (`60:7`, `60:141`, `60:327`, `60:490`, `62:5`,
`65:240`, `65:4844`) — đó là **so đặc tả**, không phải visual QA. Không tuyên bố đã kiểm pixel,
mật độ hay cuộn.

**Ưu tiên khi chạy được:**

1. **360px** — form không tràn ngang; nhóm radio "Loại phương tiện" không vỡ hàng; bàn phím số
   bật đúng ở ô tiền/năm/số chỗ.
2. **Thanh hành động dính** ở form dài: không đè lên field cuối, an toàn vùng home-indicator iOS,
   và **không chồng lên bottom tab bar** ở ≤1024px.
3. **640 ↔ 641 và 1024 ↔ 1025** — chi tiết xe chuyển từ hai cột sang một cột; cột giá phải nhảy
   LÊN TRƯỚC thông số kỹ thuật (`order: -1`), không rơi xuống đáy.
4. **Upload ảnh**: kéo-thả, tiến trình, ảnh đại diện + thư viện 20 ảnh, sắp xếp lại thứ tự.
5. **Giá trị dài**: tên xe/mô tả dài không phá bố cục thẻ giá và tiêu đề trang.
6. **Màn 403** ở cả ba route — thay toàn bộ nội dung, sidebar/topbar vẫn còn.
7. **Danh sách điều kiện gửi duyệt** — trạng thái đạt/chưa đạt đọc được bằng CHỮ, không chỉ bằng
   màu icon (kiểm bằng chế độ đơn sắc).
8. **Giá sau khuyến mãi** ở form và ở chi tiết phải ra cùng một con số.

## Quyết định QA mới cho `/manage/vehicles` (10/08/2026)

Route này sẽ chuyển sang card grid ở mọi viewport. Sau khi redesign được triển khai, checklist
table overflow/sticky action column không còn là tiêu chí đích riêng cho R14. Phải kiểm:

- 1440px: 3–4 card cân đối theo content width, không tạo một card quá rộng.
- 1024px/768px: 2 card mỗi hàng, filter và action không tràn.
- 390px/360px: 1 card mỗi hàng, ảnh, giá, status và menu hành động không bị cắt.
- Ảnh thiếu có fallback đúng; ảnh khác tỷ lệ không làm chiều cao grid bất thường.
- Tên/code/biển số dài; status dài; giá lớn; nhiều status cùng lúc.
- Loading skeleton, empty, no-results, error/retry và permission giữ hình thái card-first.
- Màu sắc, radius, shadow, typography và focus lấy từ XePrime token, không theo ảnh tham khảo tối.
- Không hiển thị metric không có trong DTO/API chỉ vì ảnh tham khảo có.
