# 07 — VISUAL QA MATRIX

> Ngày lập: 06/08/2026 · Wave 0B. Quy trình kiểm thị giác thủ công cho mọi wave ở [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md).
> **Vì sao thủ công**: repo hiện **không có visual regression test, không có test a11y, không có test responsive**, và 14 trang danh sách không có test nào ([00_IMPLEMENTATION_OVERVIEW.md §8](00_IMPLEMENTATION_OVERVIEW.md)). Ma trận này là lớp bảo vệ duy nhất cho phần thị giác.

## 1. Breakpoint kiểm

| Chiều rộng | Ứng với Figma | Vì sao có trong danh sách | Frame Figma đối chứng |
| --- | --- | --- | --- |
| **1440** | Desktop (biên trên) · Wide (biên dưới) | Chiều rộng gốc của **243 frame** desktop | `58:5`, `18:4`, `92:1268`, … |
| **1280** | Desktop | **Figma vẽ riêng frame 1280** để kiểm tràn bảng | `87:1525` members-horizontal-scroll · `127:2148` 1280px-table-examples |
| **1024** | Ranh Tablet/Desktop | Ranh giới `--xp-bp-tablet`. Nơi sidebar chuyển chế độ | `127:2169` 1024px-overflow-examples · `77:2765` (1024×768) · `93:1201` |
| **768** | Tablet | Chiều rộng của 8/10 frame tablet | `23:7`, `58:2144`, `53:27`, `53:74` · `127:2194` tablet-table-examples |
| **390** | Mobile | Chiều rộng của **194 frame** mobile | `58:2405`, `23:896`, … |
| **360** | Mobile (biên dưới thực tế) | **Không có frame Figma nào.** Nhưng 360px là chiều rộng Android phổ biến nhất VN — nếu bố cục 390 vỡ ở 360 thì lỗi đến tay người dùng thật | — |

⚠️ **360 là điểm kiểm bắt buộc dù Figma không vẽ.** Mọi bố cục mobile phải chịu được 360 mà không tràn ngang.
⚠️ **768 vs 1024**: Figma dùng cả hai cho "tablet" — mâu thuẫn nội bộ, xem **P3**. Cho tới khi chốt, kiểm **cả hai**.

## 2. Trạng thái kiểm

| # | Trạng thái | Cách tạo | Quy chuẩn Figma |
| --- | --- | --- | --- |
| S1 | **Default** | Dữ liệu bình thường (seed) | frame `*-default` |
| S2 | **Loading** | Chặn mạng / throttle 3G | `134:2011` loading-standard · `55:110` |
| S3 | **Empty** | Tenant/tài khoản chưa có dữ liệu | `134:2093` · `125:1692` |
| S4 | **No results** | Có dữ liệu **nhưng** filter không khớp | `134:2093` — ⚠️ **phải khác S3** |
| S5 | **Error** | Trả 500 từ API | `134:2194` error-and-recovery |
| S6 | **Permission denied** | Đăng nhập role thiếu quyền | `134:2482` · `134:2556` |
| S7 | **Long content** | Tên xe/gian hàng/khách rất dài, mô tả 4000 ký tự, số tiền 10+ chữ số | — |
| S8 | **Table overflow** | Nhiều cột hơn chiều rộng | `127:2097` horizontal-scroll-behavior |
| S9 | **Sticky Actions** | Cuộn ngang bảng có `fixed:'right'`; cuộn dọc form dài | `127:2060` sticky-actions-standard · `62:1623` |
| S10 | **Mobile cards** | Bảng chuyển sang thẻ ở ≤640px | `127:2257` mobile-card-transformation |
| S11 | **Overlay behavior** | Mở modal/drawer/sheet | `122:3705` shared-overlay · `130:1563` overlay-responsive-mapping |

## 3. Ma trận breakpoint × trạng thái

`✔` = phải kiểm · `—` = không áp dụng · `◆` = điểm rủi ro cao, ưu tiên

| | 1440 | 1280 | 1024 | 768 | 390 | 360 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 Default | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| S2 Loading | ✔ | — | ✔ | — | ✔ | — |
| S3 Empty | ✔ | — | ✔ | ✔ | ✔ | — |
| S4 No results | ✔ | — | — | — | ✔ | — |
| S5 Error | ✔ | — | — | — | ✔ | — |
| S6 Permission | ✔ | — | — | — | ✔ | — |
| S7 Long content | ◆ | ◆ | ✔ | ✔ | ◆ | ◆ |
| S8 Table overflow | ✔ | ◆ | ◆ | ◆ | — | — |
| S9 Sticky Actions | ✔ | ◆ | ✔ | ✔ | ◆ | ◆ |
| S10 Mobile cards | — | — | — | — | ◆ | ◆ |
| S11 Overlay | ✔ | — | ✔ | ✔ | ◆ | ◆ |

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

| | S3 Empty | S4 No results |
| --- | --- | --- |
| Câu chữ | "Gian hàng chưa có xe nào" | "Không tìm thấy xe khớp bộ lọc" |
| Hành động chính | "Thêm xe đầu tiên" (nếu có quyền tạo) | "Xoá bộ lọc" |
| Điều kiện | `total === 0` và **không** có filter | `total === 0` và **có** filter |

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

| Trường | Giá trị kiểm |
| --- | --- |
| Tên xe | 255 ký tự (max theo `vehicleFormSchema`) |
| Tên gian hàng | 255 ký tự |
| Mô tả | 4000 ký tự |
| Số tiền | `999.999.999.999 ₫` |
| Tên khách | tên Việt dài đầy đủ + dấu |
| Biển số / mã xe | 80 ký tự |
| Lý do từ chối / ghi chú duyệt | đoạn dài, nhiều dòng |

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

| Gói | Route | Ô kiểm | Dùng ở wave |
| --- | --- | --- | --- |
| **SMOKE** | 6 đại diện: `/`, `/manage/vehicles`, `/manage/bookings`, `/manage/finance`, `/manage/admin`, `/trips` | S1 × 6 breakpoint = **36** | 1A, mọi wave |
| **OVERLAY** | 13 overlay | S11 × {1440, 390, 360} = **39** | 1B |
| **LIST** | 14 route danh sách | S1–S6, S8, S9, S10 × {1440, 1280, 390} | 1C |
| **SHELL** | 39 route manage | S1 × {1440, 1024, 390} | 1D |
| **FULL** | 1 route | **46 ô** | 2 (pilot) |
| **MODULE** | route của module | S1–S6, S9, S10, S11 × {1440, 1024, 390} | 3A–3L |
| **AUDIT** | 39 route | Toàn bộ | 5 |

## 6. Ma trận theo route (gói MODULE / AUDIT)

Trạng thái nào **có frame Figma** cho từng route — ô trống nghĩa là Figma không vẽ, phải tự quyết theo quy chuẩn chung.

| Route | S2 | S3 | S4 | S5 | S6 | ▭768 | ▭1024 | 📱390 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 `/` | ✔ | ✔ | ✔ | ✔ | — | ✔ | | ✔ |
| R02 `/listings/[id]` | | | | | — | ✔ | | ✔ |
| R03 `/shops/[slug]` | | ✔ | | | — | ✔ | | ✔ |
| R04 `/account` | ✔ | ✔ | | ✔ | | | | ✔ |
| R05 `/trips` | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R06 `/chat` | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R07/R08 forgot/reset | | | | | | | | |
| R09 `/manage/login` | | | | ✔ | — | | | ✔ |
| R10 onboarding | ✔ | | | ✔ | | ✔ | | ✔ |
| R11 dashboard shop | | | | | | | | |
| R12 dashboard platform | ✔ | ✔ | | ✔ | ✔ | | ✔ | ✔ |
| R13 no-tenant | | | | | | | | ✔ |
| **R14 vehicles ⭐** | **✔** | **✔** | **✔** | **✔** | **✔** | **✔** | | **✔** |
| R15 vehicle new | ✔ | | | ✔ | | | | ✔ |
| R16 vehicle detail | ✔ | | | ✔ | | | | ✔ |
| R17 vehicle edit | | | | ✔ | ✔ | | | ✔ |
| R18 bookings | ✔ | ✔ | | ✔ | | | | ✔ |
| R19 booking-requests | ✔ | ✔ | | ✔ | | | | ✔ |
| R20 calendar | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R21 contracts | ✔ | | | ✔ | ✔ | | | ✔ |
| R22 finance | ✔ | ✔ | | ✔ | ✔ | | ✔ | ✔ |
| R23 receipts | ✔ | ✔ | ✔ | ✔ | ✔ | | | ✔ |
| R24 debts | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R25 shop profile | ✔ | | | ✔ | ✔ | ✔ | | ✔ |
| R26 members | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R27 chat shop | ✔ | ✔ | | ✔ | | | | ✔ |
| R28–R31 placeholder | — | ✔ | — | — | — | | | ✔* |
| R32 approvals | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R33 admin tenants | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R34 admin vehicles | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R35 admin bookings | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R36 admin customers | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R37 admin audit | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R38 admin staff | ✔ | ✔ | | ✔ | ✔ | | | ✔ |
| R39 admin plans | ✔ | ✔ | | ✔ | ✔ | | | ✔ |

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
- [ ] Thuật ngữ nhất quán: *khách thuê · gian hàng · chủ gian hàng · đơn thuê · quản trị nền tảng*
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
