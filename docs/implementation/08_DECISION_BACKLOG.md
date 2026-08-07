# 08 — DECISION BACKLOG

> Ngày lập: 06/08/2026 · Wave 0B.
> **Nguyên tắc §10.10**: mâu thuẫn thì **ghi**, không đoán. Mỗi mục dưới đây ghi rõ: ai quyết được, nó chặn cái gì, và điều gì xảy ra nếu không có câu trả lời.
> Backlog này **bổ sung** cho, không thay thế, register ~110 câu hỏi mở của design-briefs (brief 11 §8) và 15 quyết định gating ở [design-briefs/README §9](../design-briefs/README.md). Mục nào trùng thì ghi tham chiếu chéo.

## Bảng tổng

| ID      | Quyết định                                           | Loại              | Ai quyết             | Chặn                          | Mức                 |
| ------- | ---------------------------------------------------- | ----------------- | -------------------- | ----------------------------- | ------------------- |
| **P1**  | Sidebar sáng hay tối                                 | Sản phẩm/Thiết kế | Chủ dự án + Thiết kế | ~~Wave 1D~~                   | ✅ **ĐÃ CHỐT: TỐI** |
| **P2**  | Bản canonical của màn staff (A2)                     | Figma             | Chủ dự án + Thiết kế | Wave 3G (R38)                 | 🔴 **CHẶN**         |
| **P3**  | Chuẩn tablet: có bắt buộc? 768 hay 1024?             | Sản phẩm          | Chủ dự án            | Mọi QA tablet                 | 🟠 Cao              |
| **P4**  | Có tạo route `/search` riêng không (A6)              | Sản phẩm          | Chủ dự án            | Wave 3I (R01/R02)             | 🟠 Cao              |
| **P5**  | `StatusTag` giữ preset AntD hay dùng token `*-bg`    | Kỹ thuật/Thiết kế | Kỹ thuật + Thiết kế  | Wave 1A (4 token), 1C         | 🟠 Cao              |
| **P6**  | Cấp heading của `ManagePageHeader`                   | Kỹ thuật          | Kỹ thuật             | Wave 1D                       | 🟡 TB               |
| **P7**  | Hai hệ đổ bóng song song (XePrime vs AntD)           | Kỹ thuật          | Kỹ thuật             | Wave 1A/1B                    | 🟡 TB               |
| **P8**  | Cơ chế token breakpoint trong `@media`               | Kỹ thuật          | Kỹ thuật             | **Wave 1A** (phần breakpoint) | 🟠 Cao              |
| **P9**  | Thiếu thiết kế `/forgot-password`, `/reset-password` | Thiết kế          | Thiết kế             | Wave 3L                       | 🟢 Thấp             |
| **P10** | Thiếu thiết kế dashboard gian hàng                   | Thiết kế          | Thiết kế             | Wave 3L                       | 🟢 Thấp             |
| **P11** | Nút chết (Google/Facebook login, lưu xe)             | Sản phẩm          | Chủ dự án            | Wave 3I, 3J                   | 🟡 TB               |
| **P12** | Bắt buộc lý do khi huỷ phiếu thu (C14)               | Sản phẩm          | Chủ dự án            | Wave 4                        | 🟡 TB               |
| **P13** | Độ tin cậy frame audit section 12                    | Figma             | _(đã tự giải)_       | —                             | ✅ Đóng             |
| **P14** | 14 mục UNKNOWN cần inspect                           | Figma             | Kỹ thuật _(tự giải)_ | wave tương ứng                | 🟡 TB               |
| **P15** | **Hai bộ giá trị token trong cùng file Figma**       | Figma/Thiết kế    | Chủ dự án + Thiết kế | Toàn bộ hệ token              | 🔴 **CHẶN**         |
| **P16** | Chiều cao control mặc định 32 hay 40                 | Thiết kế          | Thiết kế             | Wave component                | 🟡 TB               |
| **P17** | Bậc viền “mảnh hơn” không có nguồn Figma             | Thiết kế          | Thiết kế             | — _(đã dẫn xuất)_             | 🟢 Thấp             |
| **P18** | 4 cặp màu trượt WCAG AA                              | A11y/Thiết kế     | Chủ dự án + Thiết kế | — _(đã pin)_                  | 🟠 Cao              |
| **P19** | Figma chưa định nghĩa màu link                       | Thiết kế          | Thiết kế             | — _(giữ hành vi cũ)_          | 🟢 Thấp             |

### Đã đóng trong Wave 1A

| ID        | Kết luận                                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P7** ✅ | Hai hệ đổ bóng → gộp về Elevation 1/2/3 của Figma; `boxShadow`/`boxShadowSecondary`/`boxShadowTertiary` là **seed token** của AntD nên ánh xạ chúng không phá quy tắc “chỉ seed token”                                    |
| **P8** ✅ | Cơ chế breakpoint → **phương án (a)**: hằng số `XP_BREAKPOINTS` trong TS + 3 CSS token; **không** thêm PostCSS. Và theo brief 00 §9.4, **không** gom 21 breakpoint hàng loạt — dời khi chạm file                          |
| **P6** 🟡 | Cấp heading: đã ánh xạ `fontSizeHeading1..5` = 32/24/20/16/14 nên `Typography.Title` khớp thang Figma. Nhưng `ManagePageHeader` vẫn dùng `level={3}` (giờ ra 20px). Đổi sang `level={1}` là việc của **Wave 1D** — vẫn mở |

---

## A. Quyết định sản phẩm

### P1 — Sidebar sáng hay tối ✅ ĐÃ CHỐT (Wave 1D, 07/08/2026)

> **Kết luận: TỐI.** Chủ dự án chốt dùng sidebar tối của Figma Foundations làm điều hướng
> chính tắc cho cổng quản lý/nền tảng, với 3 token đã có sẵn từ Wave 1A (`--xp-shell-sidebar-bg`
> `#1e1b16` · `--xp-shell-sidebar-text` `#e8e4dd` · `--xp-shell-sidebar-active` `#d6a02c`).
> Không dựng thêm biến thể sidebar sáng, trừ khi cần tạm thời để so sánh khi migrate.
>
> Batch 1D.0 đã kiểm chứng ngược lại Figma: **cả hai** nguồn sidebar (`14:1423` Foundations và
> `47:5` section 05) đều render nền tối — quyết định khớp thiết kế, không ghi đè nó. Riêng
> frame `134:3751` (navigation-audit) ghi "cream background": đây là **lần thứ tư** một frame
> audit section 12 sai về hiện trạng, xử lý theo [00 §9.1](00_IMPLEMENTATION_OVERVIEW.md) —
> chỉ đọc như ý định, không đọc như trạng thái.
>
> **Hệ quả đo được** (Batch 1D.0, đo bằng công thức WCAG 2.1 chứ không ước lượng): hai token
> mà menu hiện đang dùng **trượt** trên nền tối — `--xp-color-text-secondary` `#6b6560` = **2.99**
> và `--xp-gold-deep` `#a9761a` = **4.33**. Chúng nằm ở
> [ManageMenu.module.css:22](../../apps/web/src/components/layout/ManageMenu.module.css#L22),
> [:36](../../apps/web/src/components/layout/ManageMenu.module.css#L36) và
> [ManageUserCard.module.css:32](../../apps/web/src/components/layout/ManageUserCard.module.css#L32).
> Đổi nền mà không đổi ba chỗ này là ship menu không đọc được. Token thay thế đạt AA:
> `--xp-shell-sidebar-text` (13.54) và `--xp-shell-sidebar-active` (7.29).

**Mâu thuẫn (bối cảnh lúc còn mở)**

- **Code**: [Sidebar.module.css:9](../../apps/web/src/components/layout/Sidebar.module.css#L9) → `background: var(--xp-color-bg-container)` = **`#ffffff`** (sáng)
- **Figma Foundations**: `--xp-shell-sidebar-bg` `14:92` = **`#1e1b16`** (gần đen ấm) · `--xp-shell-sidebar-text` `14:96` = `#e8e4dd` · `--xp-shell-sidebar-active` `14:100` = `#d6a02c`
- Foundations còn có 3 frame vỏ (`14:1423` full · `14:1531` collapsed · `14:1619` mobile) và section 05 có `59:871` `Shell/Sidebar` với **11 biến thể active-page**

**Vì sao không tự quyết được**: đây không phải chi tiết token — nó lật tông màu của **25/39 route** (mọi trang `/manage`), kéo theo tương phản logo, màu icon menu, badge trên nền tối, drawer mobile, `ManageUserCard`. Đây là quyết định thương hiệu.

~~**Chặn**: toàn bộ **Wave 1D**~~ — đã gỡ chặn 07/08/2026.

---

## A0. Quyết định mở ra ở Batch 1D.0 / 1D-A

| ID      | Câu hỏi                                                                                                                                       | Chặn | Khuyến nghị                                                                                                                     | Mức     |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **P37** | Có gom nhóm menu gian hàng theo Figma (tách **Tài chính** khỏi **Quản lý**, thành 4 nhóm) không? Thuần trình bày — cùng tập mục lá, cùng href | 1D-B | **Có** — khớp Figma `14:1462`, không lộ thêm route nào                                                                          | 🟡 TB   |
| **P38** | `134:3823` đòi sidebar nền tảng có **bảng màu riêng**; P1 chỉ cho một bộ tối                                                                  | 1D-B | **Một bộ**, phân biệt bằng nhãn scope thay vì bảng màu thứ hai (nhân đôi diện tích QA tương phản)                               | 🟡 TB   |
| **P39** | Nhớ trạng thái thu gọn bằng cookie (đúng SSR, không nháy) hay `localStorage` (đơn giản, nháy khi tải)? Repo hiện **không có** hạ tầng lưu nào | 1D-B | **Cookie** — vỏ nằm trên màn hình đầu ở mọi route manage                                                                        | 🟡 TB   |
| **P40** | Figma đặt "Đăng xuất" thành một dòng trong sidebar (`47:73`); code có ở **cả** thẻ người dùng lẫn menu avatar trên topbar                     | 1D-B | **Giữ cả hai**, chỉ đổi trình bày — bỏ lối trên topbar là đổi thói quen đã hình thành mà không có tài liệu sản phẩm nào yêu cầu | 🟢 Thấp |

### Đã tự giải trong Batch 1D.0 / 1D-A

| Câu hỏi                                                                 | Kết luận                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--xp-shell-sidebar-width` 232 hay 240? (bước 1D.2)                     | **232 — Foundations sở hữu giá trị này.** `14:1424` = 232, `47:5` = 240. P1 chỉ đích danh "sidebar tối của Figma **Foundations**", và Wave 1A đã lấy token từ đúng cụm frame đó. `47:5`/`59:871` là bản section 05 lệch nhịp (item 40px vs 34px, nhóm khác). **Không đổi token.** |
| Bề rộng thu gọn?                                                        | **64 ở cả hai nguồn** (`14:1532`, `47:77`) — `--xp-shell-sidebar-collapsed-width` đã đúng, không đổi                                                                                                                                                                              |
| Nút thu gọn nằm đâu?                                                    | Foundations **không vẽ**; lấy từ `47:12` (mở → chevron-left, góc phải khối brand) và `47:82` (thu gọn → chevron-right, dưới logo)                                                                                                                                                 |
| Chỉ báo mục đang mở trên nền tối                                        | **Không có thanh gạch trái.** Phóng to `14:1432` cho thấy: nền bo góc sáng hơn nền sidebar + **icon màu gold** + nhãn sáng hơn. Bản render nhỏ dễ nhìn nhầm icon gold thành thanh accent                                                                                          |
| Menu Figma có mục mà code không có (Hợp đồng, Gói dịch vụ) và ngược lại | **Không đổi `nav.ts`.** `Gói dịch vụ` = `admin-plans`, gác bằng `platform.billing.manage` — thêm vào menu gian hàng là lộ route nền tảng (luật 5). Bỏ 4 mục `comingSoon` là ẩn route đang truy cập được mà không có tài liệu (luật 6)                                             |

---

### P2 — Bản canonical của màn staff 🔴 CHẶN

**Mâu thuẫn**: section 11 có **hai bộ nhãn "Batch 1 — Platform Staff Management"** trùng tên:

- Bộ 1: `113:3017` (BATCH 1) + `113:3019` (DESKTOP — Danh sách nhân viên nền tảng)
- Bộ 2: `114:3904` (Batch 1) + `114:3905`–`114:3908` (4 nhãn nhóm tiếng Việt)

Dấu hiệu design được sinh **hai đợt**. Có thể tồn tại hai phiên bản màn staff.

**Nguồn**: [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A2 — đã đánh dấu "**Cần người dùng chốt: Có**".

**Chặn**: Wave 3G, route R38 `/manage/admin/staff`.

**Việc trước khi hỏi**: kỹ thuật inspect con của `114:3905`–`3908` so với frame lẻ `113:3033`/`114:1210`. Nếu bộ 2 chỉ là **nhãn nhóm** cho cùng các frame lẻ → **không cần hỏi**, tự đóng. Chỉ hỏi nếu cả hai bộ chứa màn hoàn chỉnh khác nhau.

**Nếu không trả lời**: bỏ R38 khỏi Wave 3G, làm R39 (plans) trước.

---

### P3 — Chuẩn tablet 🟠

**Ba vấn đề chồng nhau**:

1. **Độ phủ**: chỉ **10/1057 node** là `PRODUCTION_TABLET`; **29/39 route không có frame tablet**
2. **Chiều rộng không nhất quán**: Figma dùng **768px** (section 02, 04, 05) và **1024×768** (section 07, 09) — trong khi Foundations `14:186` định nghĩa Tablet = **641–1024px**
3. **Không có luật**: brief 00 Q9 và 01 Q9 ghi thẳng _"no tablet rules"_ là `Unknown`

**Nguồn**: [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A10 (đã đánh "Cần người dùng chốt: Có") + [design-briefs/README §9](../design-briefs/README.md) mục 14.

**Ba câu hỏi cần trả lời**:

- (a) Tablet có phải viewport **được hỗ trợ** không, hay chỉ cần không vỡ?
- (b) Nếu có: **768** hay **1024** là điểm kiểm chuẩn?
- (c) 29 route không có frame tablet thì suy ra từ desktop hay từ mobile?

**Chặn**: mọi ô tablet trong [07_VISUAL_QA_MATRIX.md](07_VISUAL_QA_MATRIX.md).

**Nếu không trả lời**: QA **cả 768 và 1024**, tiêu chí "không vỡ, không cuộn ngang" thay vì "khớp Figma". Đây là mặc định an toàn, đã áp dụng trong ma trận QA.

---

### P4 — Route `/search` 🟠

**Mâu thuẫn**: Figma section 02 có cụm "Marketplace Results" (`18:567` filtered · `18:1298` loading · `18:1449` filtered-empty · `18:1510` error · `23:259` tablet · `23:1100` mobile) — nhưng **route `/search` không tồn tại** trong [routes.ts](../../apps/web/src/constants/routes.ts). Code render kết quả ngay trên `/` với filter đẩy ra URL (ADR 0004).

`/search` là đề xuất 🆕 trong `docs/design/07_INFORMATION_ARCHITECTURE.md` và `09_PAGE_DESIGN_ORDER.md` (Wave 1.2).

**Nguồn**: [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A6 — "Cần người dùng chốt: Có".

**Hai lựa chọn**:

- (a) **Giữ kết quả trên `/`** — 6 frame results map vào R01 như biến thể trạng thái. Rẻ, không đụng IA, hợp ADR 0004
- (b) **Tạo `/search` riêng** — thêm route, thêm SEO surface, phải chia lại trách nhiệm `/` vs `/search`. Là **tính năng mới**, không phải migration

**Khuyến nghị kỹ thuật (không phải quyết định)**: (a). ADR 0004 đã chốt filter sống ở searchParams; `/?q=…&type=…` đã chia sẻ được và sống sót reload. `/search` chỉ có giá trị nếu sản phẩm muốn SEO landing riêng cho từng truy vấn — đó là câu hỏi marketing, không phải kỹ thuật.

**Chặn**: Wave 3I. **Nếu không trả lời**: làm R01 phần home, hoãn cụm results.

---

### P11 — Nút chết 🟡

**Vấn đề**: hai nút **trông như nút thật nhưng không hoạt động**:

- **G7** — nút đăng nhập Google/Facebook trong `AuthModal` (brief 11 §3.7: _"⬜ buttons fail"_)
- **G8** — nút lưu xe yêu thích trên trang chi tiết (brief 01: _"⬜ dead button"_)

Figma vẽ cả hai **trong màn bình thường**, không đánh dấu unavailable.

**Vì sao phải quyết trước khi migrate**: khi vẽ lại màn theo Figma, cám dỗ tự nhiên là làm nút "đẹp và hoạt động". Nguyên tắc §0.4 của [06](06_MIGRATION_ORDER.md) cấm điều đó. Nhưng giữ nguyên nút chết cũng là lựa chọn xấu.

**Ba lựa chọn**: (a) **ẩn** cho tới khi có backend · (b) giữ, thêm thông báo "sắp có" khi bấm · (c) triển khai thật (→ chuyển sang loại D, cần wave riêng)

**Chặn**: Wave 3I (G8), Wave 3J (G7). **Nếu không trả lời**: mặc định (a) — ẩn, an toàn nhất, revert dễ.

---

### P12 — Bắt buộc lý do khi huỷ phiếu thu 🟡

**Mâu thuẫn**: Figma có `79:4808` `cancel-receipt-current` và `79:5039` `cancel-receipt-**target-reason**`. Bản target bắt buộc nhập lý do; brief 06 xác nhận hôm nay **không** bắt buộc.

**Đây là thay đổi quy tắc nghiệp vụ, không phải UI.** Đã chuyển từ loại C sang **D** trong [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) (mục D30).

Liên quan: brief 06 Q1 (maker-checker cho phiếu thu) — [design-briefs/README §9](../design-briefs/README.md) mục 8.

**Chặn**: Wave 4. **Nếu không trả lời**: migrate `79:4808` (current), bỏ qua `79:5039`.

---

## B. Quyết định pháp lý / riêng tư

Không có mục **mới** phát sinh từ Wave 0B. Toàn bộ nằm trong brief 09 và đã được [design-briefs/README §9](../design-briefs/README.md) liệt kê. Ghi lại đây vì chúng **chặn** UI:

| Ref      | Nội dung                                               | Chặn UI nào                                                  |
| -------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| 09 Q1–Q2 | Cơ sở pháp lý + thời hạn lưu PII/audit                 | `107:3952` pii-reveal-**design-target** (E14) — không code   |
| 09 Q3/Q5 | Governance reveal: lý do, hạn mức, thông báo cho khách | ↑                                                            |
| 09 (D17) | Quyền của chủ thể dữ liệu                              | Không có UI nào                                              |
| 02 Q1    | Sự kiện nào tới khách, qua kênh nào                    | `91:2571` notification-channels-**future** (E8) — không code |

**Quy tắc trong lúc chờ**: mọi bề mặt PII giữ nguyên hành vi hiện tại — masking mặc định, reveal do người dùng bấm, ghi `audit_logs` mỗi lần. [07 §7.1](07_VISUAL_QA_MATRIX.md) kiểm điều này ở mọi wave chạm R35/R36.

---

## C. Quyết định thương mại

Không có mục mới. Tham chiếu [design-briefs/README §9](../design-briefs/README.md):

| Ref   | Nội dung                                                                                       | Ánh xạ Figma                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 10 Q2 | Hệ quả khi gói hết hạn                                                                         | `115:4212` derived-expiry-behavior (hiển thị hiện trạng — migrate được)                                   |
| 10 Q9 | Nghĩa vụ hoá đơn / e-invoice                                                                   | `115:4400` **missing**-invoice-payment (E17) — không code                                                 |
| 05 Q1 | Duyệt yêu cầu có mang giá marketplace vào booking không (hôm nay mọi booking chuyển đổi là 0đ) | Ảnh hưởng `68:1076` approval-confirmation — **hiển thị 0đ là đúng hiện trạng**, không "sửa" trong wave UI |
| 06 Q2 | Chính sách thu vượt                                                                            | `77:5646` guard-**target** (E16) — không code                                                             |

⚠️ **05 Q1 đáng chú ý cho migration**: brief 11 §9 xếp "the zero-đồng conversion" là rủi ro #2. Khi migrate `68:1076`, màn sẽ hiển thị `0 ₫` — **đó là hiện trạng đúng**, không được che giấu hay tự điền giá.

---

## D. Chức năng cần backend

**30 mục loại D** ở [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md). Không lặp lại ở đây. Ba mục đáng nêu vì chúng **đã được ADR yêu cầu nhưng chưa làm**:

| Ref     | Nội dung                                         | Vì sao đặc biệt                                                                                                                                                                |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D21** | CSRF · thu hồi phiên · gia hạn trượt             | **ADR 0002 bắt buộc, code chưa có.** Brief 11 §9 rủi ro #6: _"the one place an accepted ADR and the code disagree"_. Không phải việc của wave UI, nhưng phải có người theo dõi |
| D5      | `blocked_range` / bảo dưỡng gắn vào availability | Enum đã có, **không writer**. ADR 0006 nói `vehicle_occupancies` chỉ `OccupancyService` được ghi                                                                               |
| D14/D19 | `TenantDocument` / `TenantInvite`                | Model có, **không code path**                                                                                                                                                  |

---

## E. Mâu thuẫn Figma ↔ code

### P5 — `StatusTag`: preset AntD hay token `*-bg` 🟠

**Hiện trạng**: [StatusMeta.color](../../packages/types/src/status/meta.ts) là **AntD preset color** (`'green'`, `'gold'`, `'red'`, `'blue'`…), không phải hex. Docstring giải thích: _"giữ nhất quán với design token thay vì tự chế màu"_.

**Figma**: `XePrime/StatusTag/Operation` `125:1718` + `/Public` `125:1727` + `XePrime/Badge` `125:2703` (`Color: Gold/Green/Red/Gray/Blue` — 5 màu, khớp preset AntD về **số lượng**). Foundations lại có 4 token `--xp-color-{success,warning,error,info}-bg` (`14:63/71/79/87`).

**Câu hỏi**: bốn token `*-bg` đó dùng ở đâu? Nếu là nền của status tag → phải đổi `StatusColor` từ preset AntD sang token XePrime, tức **đổi hợp đồng của `@xeprime/types`** (ADR 0005) và mọi `*_STATUS_META`.

**Chặn**: Wave 1A (có thêm 4 token không) và Wave 1C (dọn `<Tag>` trần — D4).

**Việc trước khi hỏi**: đọc giá trị `14:63/71/79/87` và so với preset AntD tương ứng. **Nếu gần giống → giữ preset**, thêm token chỉ để dùng cho `Alert`/banner. Chỉ leo thang nếu khác rõ rệt.

**Nếu không trả lời**: **giữ preset AntD**. Đây là mặc định an toàn — đổi `StatusColor` chạm cả `packages/types` lẫn `apps/api`.

---

### P6 — Cấp heading của `ManagePageHeader` 🟡

[ManagePageHeader.tsx:27](../../apps/web/src/components/layout/ManagePageHeader.tsx#L27) dùng `<Typography.Title level={3}>` → thẻ `h3`, 24px. Vai trò ngữ nghĩa là **tiêu đề trang** → phải là `h1`; Figma `type/H1` `14:116` = **32/40 Bold**.

**Ba hệ quả**: (a) sai ngữ nghĩa a11y — trang không có `h1` · (b) sai cỡ chữ so với Figma · (c) `Typography.Title` lấy cỡ từ AntD, không từ token XePrime.

**Lựa chọn**: (a) đổi sang `level={1}` + token H1 — đúng nhất, nhưng **mọi tiêu đề trang to lên 24→32px** · (b) `level={1}` (đúng ngữ nghĩa) nhưng giữ 24px qua CSS · (c) giữ nguyên, ghi nhận lệch

**Quyết được bởi kỹ thuật.** Khuyến nghị: **(a)** — Figma nói 32px, và `h1` là đúng. Làm ở Wave 1D, có ảnh trước/sau.

---

### P7 — Hai hệ đổ bóng song song 🟡

Code có `--xp-shadow-sm/md/lg` (tông nâu ấm, khớp ý đồ Figma `14:172`) — nhưng **chỉ dùng trong CSS Module**. Modal/drawer/dropdown/popover của AntD dùng bóng riêng của AntD (xám trung tính).

Kết quả: card tự dựng có bóng ấm, modal AntD ngay cạnh có bóng xám. Figma chỉ định nghĩa **một** hệ 3 tầng.

**Lựa chọn**: (a) feed `--xp-shadow-*` vào `antdTheme.token.boxShadow*` — phá quy tắc "chỉ seed token", nhưng đây là seed token thật · (b) chấp nhận hai hệ · (c) bỏ `--xp-shadow-*`, dùng AntD hoàn toàn

**Quyết được bởi kỹ thuật.** Khuyến nghị: **(a)** — `boxShadow`, `boxShadowSecondary`, `boxShadowTertiary` **là** seed token của AntD, không phải token component. Không phá quy tắc. Làm ở Wave 1A sau khi đọc `14:173/176/179`.

---

### P8 — Cơ chế token breakpoint 🟠

**Vấn đề kỹ thuật**: CSS custom property **không dùng được trong `@media`**. `@media (max-width: var(--xp-bp-mobile))` không hoạt động. Nhưng code đang có **21 giá trị breakpoint rời rạc** cần gom về 3.

**Ba lựa chọn**:

|     | Cách                                                                                                                           | Ưu                                     | Nhược                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------- |
| (a) | Chỉ khai hằng số trong TS (`BREAKPOINTS` cạnh `XP_TOKENS`) + kỷ luật: `@media` chỉ được viết đúng 3 số đó, có **grep-test** ép | Không thêm dependency, không đổi build | Vẫn là số trần trong CSS                                                           |
| (b) | Thêm PostCSS `postcss-custom-media`                                                                                            | `@media (--xp-bp-mobile)` đọc tốt      | Thêm bước build; **CLAUDE.md cấm cài package không cần thiết**; đụng cấu hình Next |
| (c) | Chuyển sang container query                                                                                                    | Đúng hướng hiện đại                    | Viết lại toàn bộ responsive — vượt xa phạm vi migration                            |

**Quyết được bởi kỹ thuật.** Khuyến nghị: **(a)** — rẻ nhất, phù hợp nguyên tắc "không cài package", và grep-test cho hiệu lực thật (một test khẳng định không `@media` nào dùng px ngoài `640/1024/1440`). Ghi vào `theme.ts` để `useIsMobile()`/`useIsTablet()` dùng chung nguồn.

**Chặn**: phần breakpoint của Wave 1A. **Nếu không trả lời**: làm phần token màu/typo/radius/focus trước, hoãn breakpoint.

---

### P13 — Độ tin cậy frame audit section 12 ✅ ĐÃ ĐÓNG

**Đã tự giải trong Wave 0B.** Kết luận:

Frame `122:2305` (12.15 Token Consistency Audit) công bố "giá trị chuẩn" **sai 5/7 màu** so với chính section 01 Foundations của cùng file, sai cả radius (8 vs 10) và thang chữ (H1 28 vs 32). Frame `122:1837` (12.13) tự khai "0 duplicate, 15/15 Done" trong khi `122:1567` (12.11) ghi "module 03, 06–11: 0 local component — vẽ tay từng màn" và tổng chỉ 74 instance.

**Quy tắc chốt** (đã ghi vào [00 §9.1](00_IMPLEMENTATION_OVERVIEW.md)):

- **Foundations `14:*` là nguồn giá trị duy nhất.**
- Frame section 12 dùng để lấy **danh sách** và **quy chuẩn hành vi** (`127:2060` sticky actions, `134:2093` empty-vs-noresults…), **không** lấy giá trị số.
- `122:1685` (ownership) và `122:2052` (variant standard) là **đặc tả mong muốn**, kiểm chứng từng cái khi inspect.

Không cần hỏi ai.

---

### Ba lệch Figma ↔ code khác (kỹ thuật tự xử ở wave tương ứng)

| #   | Lệch                                                                          | Xử lý                                                                                       |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| E1  | `--xp-shell-sidebar-width` 232px (code) vs `47:5` 240px (Figma)               | Wave 1D — xác minh bằng `get_design_context`, đổi nếu đúng                                  |
| E2  | Sidebar ẩn ở 992px (code) vs ranh Tablet/Desktop 1024px (Figma)               | Wave 1D bước 1D.3                                                                           |
| E3  | `line-height` Body M: 1.5714 (code, →22px) vs 14/20 = 1.4286 (Figma `14:131`) | Wave 1A — commit riêng cuối wave; nếu QA cho thấy lệch quá nhiều thì **giữ code**, ghi nhận |

---

## F. Node Figma mơ hồ

**14 mục loại F** ở [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) (F1–F14). Phần lớn **kỹ thuật tự giải bằng inspect**, không cần hỏi ai. Chỉ hai mục leo thang:

- **F9** → **P2** (hai bộ Batch 1 staff)
- **F13** → **P3** (768 hay 1024)

Ngoài ra, một lỗi phân loại của Wave 0A **đã tự sửa trong wave này**, không cần quyết định:

> ⚠️ **Sửa catalog**: 18 frame `audit-log-*` / `audit-detail-*` / `mobile-audit-*` của section 10 (`109:1260` … `110:3217`) bị [FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md) gán `AUDIT` → eligibility `NO` do heuristic theo tên. Chúng là **màn production của route `/manage/admin/audit`**. Đã sửa ở [01_FIGMA_ROUTE_NODE_MAP.md](01_FIGMA_ROUTE_NODE_MAP.md) R37. Nếu không phát hiện, cả một route đã bị loại khỏi migration.

Ba mục "chưa vẽ" cần thiết kế bổ sung (không chặn, chỉ ghi nhận):

- **P9** — `/forgot-password`, `/reset-password`: section 03 phủ auth modal/OTP/register nhưng bỏ hai màn này. Trong lúc chờ: chỉ áp token, giữ nguyên UI.
- **P10** — dashboard gian hàng (`/manage`): không có frame. **Khớp với brief 11 §6** (_"thin-but-covered"_, chưa có brief riêng) — Figma và tài liệu nhất quán về khoảng trống này. Trong lúc chờ: chỉ áp token + shell mới, **không redesign**.
- Route `/manage/trash` không có frame mobile (R31).

---

## G. Phát sinh từ Wave 1A

### P15 — Hai bộ giá trị token trong cùng file Figma 🔴 CHẶN

**Phát hiện khi inspect cấp node.** File Figma chứa **hai hệ giá trị mạch lạc và mâu thuẫn nhau**, không phải sai lệch ngẫu nhiên:

|                  | **Hệ A — Foundations `14:*`** | **Hệ B — `XePrime/*` + audit §12**             |
| ---------------- | ----------------------------- | ---------------------------------------------- |
| Gold thương hiệu | **`#d6a02c`** (`14:9`)        | `#d4af37` (`125:1571`, `125:1611`, `122:2305`) |
| Chữ chính        | **`#1a1a1a`** (`14:46`)       | `#1a1612`                                      |
| Chữ phụ          | **`#6b6560`** (`14:50`)       | `#615c54`                                      |
| Error / Danger   | **`#dc2626`** (`14:75`)       | `#dc3545`                                      |
| Nền trang        | **`#faf9f7`** (`14:26`)       | `#faf8f5`                                      |
| Bo góc control   | **10px** (`14:164`)           | 8px                                            |
| Bo góc modal     | **10px**                      | 12px                                           |
| Label form       | **12px** (`14:137`)           | 13px                                           |
| Viền             | `#e8e4dd` (`14:38`)           | `#e8e4dd` ✓ _(bằng nhau)_                      |

**Wave 1A đã triển khai Hệ A.** Lý do:

1. Hợp đồng nguồn sự thật ([00 §9](00_IMPLEMENTATION_OVERVIEW.md)): Foundations sở hữu **giá trị token**, component definition sở hữu **hợp đồng biến thể**.
2. Swatch Foundations được đặt tên đúng bằng tên CSS variable (`--xp-color-primary`) — chúng **là** bề mặt khai báo token.
3. Hệ A khớp **chính xác** code đang chạy ở 6 token (primary, success, warning, error, info, radius) → chọn A = **không có hồi quy thương hiệu**; chọn B đổi màu gold toàn app.
4. Giá trị Hệ B là default phổ biến của web (`#d4af37` gold kim loại, `#dc3545` danger của Bootstrap) — giống default lúc dựng component hơn là quyết định thương hiệu.

**Cần chốt**: xác nhận Hệ A là đúng, hoặc chỉ định Hệ B. Nếu chọn B thì đây là **một dòng đổi token** — nhưng kéo theo đổi màu thương hiệu, đỏ lỗi, bo góc trên toàn sản phẩm và phải QA lại từ đầu.

**Nếu không trả lời**: giữ Hệ A (đang chạy, không hồi quy).

---

### P16 — Chiều cao control mặc định: 32 hay 40? 🟡

Figma `125:1571` (button `padding: 10px 20px`, chữ 15px) và `125:2691` (input `padding: 10px 12px`) đều ra **~40px** = AntD `size="large"`. Code đang chạy `controlHeight: 32` (mặc định AntD), nhưng một số nơi đã tự dùng `size="large"` (ví dụ [VehicleFiltersBar](../../apps/web/src/features/vehicles/components/VehicleFilters.tsx)).

Wave 1A **giữ 32** và khai báo cả 3 bậc (24/32/40) làm token. Đổi mặc định sang 40 làm cao lên mọi input/button/select ở 37 trang → thuộc wave component.

**Nếu không trả lời**: giữ 32.

---

### P17 — Bậc viền “mảnh hơn” 🟢

Foundations chỉ có 2 bậc viền: `border` `#e8e4dd` (`14:38`) và `border-strong` `#d4cfc6` (`14:42`). Code cần thêm một bậc **mảnh hơn** (`colorBorderSecondary` của AntD, 31 consumer). Giá trị cũ `#f4ecd9` ám vàng, không hợp bảng màu trung tính mới.

Wave 1A **dẫn xuất**: `--xp-color-border-subtle` = `#f5f3ef`, tái dùng tông `color-bg-muted` (`14:34`) thay vì chế màu mới. Cần thiết kế xác nhận hoặc cấp một giá trị chính thức.

---

### P18 — Bốn cặp màu trượt WCAG AA 🟠

Đã đo trong Wave 1A (brief 00 §16 ghi _“contrast ratios unverified”_ — nay đã verified):

| Cặp                            | Tỉ lệ    | Ghi chú                                                                                                    |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------- |
| `text-tertiary` trên nền trang | **2.72** | **Trượt từ trước Wave 1A** (bản cũ 2.99). Dùng cho biển số xe, nhãn thứ, dòng meta — là chữ mang thông tin |
| `warning` trên `warning-bg`    | **2.81** | Trượt cả 3:1                                                                                               |
| `success` trên `success-bg`    | **3.15** | Đạt 3:1, trượt 4.5:1                                                                                       |
| `error` trên `error-bg`        | **4.41** | Sát ngưỡng                                                                                                 |

**Wave 1A không tự sửa** vì brief 00 §16 ghi mức tuân thủ WCAG là `Unknown` (câu hỏi mở **Q7**) — ép AA là quyết định thay thiết kế. Bốn cặp đã được **pin bằng test** để không tệ thêm.

**Cần chốt**: (a) mức tuân thủ mục tiêu (A / AA / AAA) — chính là brief 00 Q7; (b) nếu AA thì làm đậm `text-tertiary` và 3 cặp status.

**Nếu không trả lời**: giữ giá trị Figma, không dùng `text-tertiary` cho chữ bắt buộc đọc được.

---

### P19 — Figma chưa định nghĩa màu link 🟢

Foundations không có token link. Đặt link = gold thương hiệu sẽ (a) là quyết định thiết kế không có nguồn, (b) làm `<Button type="link">` (ví dụ trong [MaskedContact](../../apps/web/src/components/data-display/MaskedContact.tsx)) tương phản rất kém trên nền trắng.

Wave 1A **giữ hành vi cũ**: không set `colorLink` trong `antdTheme`, để AntD dẫn xuất từ `colorInfo`; token `--xp-color-link` `#2563eb` / `--xp-color-link-hover` `#7aadff` chỉ soi lại giá trị đó.

⚠️ Hệ quả a11y: `#7aadff` trên trắng ≈ 2.4:1 — đây là hành vi **đang có sẵn**, không phải Wave 1A tạo ra. Gộp vào P18 khi chốt mức tuân thủ.

---

### T1 — 🔴 Lỗi đang chạy: 9 tham chiếu CSS chết ở `CalendarScheduler`

Không phải quyết định mà là **defect** phát hiện khi rà token. `CalendarScheduler` tham chiếu 9 biến `--xp-*` chưa từng khai báo, không fallback → vạch lưới, nền cuối tuần, cột hôm nay, bo góc và màu event bảo dưỡng đều không render đúng.

Bảng ánh xạ sẵn sàng ở [02 §19](02_DESIGN_TOKEN_MAP.md). Wave 1A **không sửa** vì (a) là feature component có wave + cổng QA riêng, (b) sửa đổi hình ảnh lịch mà wave token không QA được, (c) nhánh `maintenance` cần một bậc nền tím chưa có nguồn Figma.

**Cần**: xếp vào wave lịch (3E) hoặc làm sớm như một bugfix riêng.

---

## H. Phát sinh từ Wave 1B — Batch 1 (overlay)

### P20 — Đặc tả overlay Figma mâu thuẫn với token Wave 1A 🟡

Ba node Figma nói ba kiểu về cùng một thứ:

| Thuộc tính     | `122:3705` (12.19 Shared Overlay) | `130:1563` (12.32 Responsive Mapping) | Token Wave 1A (đang dùng)                            |
| -------------- | --------------------------------- | ------------------------------------- | ---------------------------------------------------- |
| Bo góc modal   | **12px**                          | —                                     | `--xp-border-radius` **10px** (Foundations `14:164`) |
| Nền mờ (scrim) | **`#000000` 50%**                 | **`rgba(26,22,18,0.4)`**              | `--xp-color-bg-overlay` **`rgba(26,26,26,0.45)`**    |
| Bề rộng drawer | **400px**                         | —                                     | `--xp-drawer-width` **560px** / `-lg` 720px          |
| Bề rộng modal  | SM 400 · MD 560 · LG 720          | —                                     | ✅ khớp                                              |

**Batch 1 giữ token Wave 1A** theo chỉ thị “không đổi hệ token, không chuyển sang bộ Figma phụ”. Bo góc 12px và scrim `#000000` thuộc **Hệ B** (xem P15) nên bị loại theo cùng một lý do. `rgba(26,22,18,0.4)` của `130:1563` rất gần token đang dùng — chênh lệch không đáng kể.

Riêng **bề rộng drawer 400px** là mâu thuẫn thật và chưa thuộc P15: code hiện dùng 480/520/640/720, token nói 560/720, Figma nói 400. Batch 2 sẽ ép các panel về `md`/`lg` — **đây là thay đổi nhìn thấy được**, cần chốt trước khi migrate 7 panel.

### P21 — Vị trí toast: Figma bottom-right, AntD top-center 🟢

`122:3705` đặc tả toast **bottom-right, offset 24px, tự tắt sau 5 giây**. `App.useApp().message` của AntD mặc định **top-center, 3 giây**. Chỉ thị Wave 1B cấm bọc toast riêng, nên Batch 1 **không đụng**. Nếu sản phẩm muốn theo Figma thì cấu hình `message` ở `ConfigProvider` (một chỗ), không phải bọc component.

### D14 — Lỗi tiềm ẩn phát hiện khi khảo sát (KHÔNG sửa ở Batch 1)

Rule 12 cấm sửa lỗi không liên quan; ghi lại để Batch 2 xử đúng chỗ:

| #         | Lỗi                                                                                                                                                                                                                                                       | Ở đâu                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D14.1     | `<Drawer size="88dvh">` — `size` của AntD chỉ nhận `'default' \| 'large'`; chiều cao phải là `height`. Bottom sheet hiện **không** cao 88dvh như ý định. **Có ở HAI file** (batch 1B.0 xác nhận)                                                          | [RequestBookingModal.tsx:51](../../apps/web/src/features/booking-requests/components/RequestBookingModal.tsx#L51) · [FilterPanel.tsx:367](../../apps/web/src/features/marketplace/components/FilterPanel.tsx#L367) |
| D14.2     | `title={null}` + `aria-label` → AntD **không** chuyển `aria-label` xuống phần tử `role="dialog"`, nên modal đăng nhập hiện **không có tên khả truy cập**                                                                                                  | [AuthModal.tsx:143](../../apps/web/src/features/auth/components/AuthModal.tsx#L143)                                                                                                                                |
| D14.3     | `destroyOnClose` (tên AntD 5) vẫn còn dùng; AntD 6 là `destroyOnHidden`                                                                                                                                                                                   | [ReceiptFormDrawer.tsx:60](../../apps/web/src/features/finance/components/ReceiptFormDrawer.tsx#L60) + mọi modal chưa migrate                                                                                      |
| **D14.4** | `TextAreaField`, `NumberField`, `SelectField` dùng `Form.Item label` mà **không nối `htmlFor`** — khác `TextField` (brief 00 §16 ghi `TextField` có `useId()`). Hệ quả: ô nhập **không có tên khả truy cập**, và `getByLabelText` không tìm ra trong test | [TextAreaField.tsx](../../apps/web/src/components/form/TextAreaField.tsx) · phát hiện khi viết test batch 1B.2                                                                                                     |
| **D14.5** | Xoá danh mục thu/chi **không có bước xác nhận** — bấm là gọi mutation ngay. Hành động phá huỷ không hoàn tác được mà không hỏi lại                                                                                                                        | [CategoryManagerModal.tsx](../../apps/web/src/features/finance/components/CategoryManagerModal.tsx)                                                                                                                |

### P22 — Bề rộng modal 520 → 560 sau khi migrate 🟢

Năm dialog đã migrate ở batch 1B.2 trước đây dùng bề rộng **mặc định của AntD (520px)**; nay dùng `size="md"` = **560px** (`--xp-modal-width`, Figma `125:1611`). Chênh **+40px** trên desktop.

Đây là hệ quả có chủ đích của quy tắc "không dùng bề rộng tuỳ tiện" — 520px không có trong thang token. Ghi lại để đợt QA thị giác không coi là hồi quy. Nếu sản phẩm muốn giữ 520 thì phải thêm một bậc token, không phải viết số trần trở lại.

Cả ba tự biến mất khi file chuyển sang `ResponsiveDialog`/`DetailDrawer` ở Batch 2 — `ResponsiveDialog` đã xử lý D14.2 bằng tiêu đề ẩn cho trình đọc màn hình thay vì `aria-label`.

---

## I. Phát sinh từ Wave 1C — Batch 1C.0 (kiểm kê, 07/08/2026)

### P23 — Frame `127:2339` khai sai hiện trạng URL-state 🟢 _(tự đóng)_

`127:2339` (12.30 Global Filter Standard) ghi ở cột **URL STATE** giá trị `⚠ Design Target` cho
**9/11 module** và kết luận: _"Đây là Design Targets — code hiện tại CHƯA implement URL state cho
filters"_.

**Sai.** Cả **13/13** hook filter đều ghi/đọc `searchParams` — đó là ADR 0004, đã chạy từ trước
Wave 0B. `useUrlFilters` chỉ là bản dùng chung; 10 hook còn lại có **bản copy** của cùng hành vi,
không phải thiếu hành vi.

Đây là ca thứ ba frame section 12 sai về hiện trạng (sau `122:2305` ở [P13](#p13--độ-tin-cậy-frame-audit-section-12--đã-đóng)
và `122:1837`). **Củng cố quy tắc [00 §9.1](00_IMPLEMENTATION_OVERVIEW.md)**: frame section 12 chỉ
dùng lấy _quy chuẩn hành vi mong muốn_, **không** lấy _đánh giá hiện trạng_. Không cần hỏi ai.

### P24 — Chip bộ lọc + "Xóa tất cả" + số kết quả: tính năng mới hay trong phạm vi 1C? 🟠

`127:2339` quy tắc 3–5 và 9 yêu cầu: applied filters hiện dạng **chip** dưới ô tìm kiếm · mỗi chip
có nút ✕ riêng · nút "Xóa tất cả bộ lọc" khi ≥2 filter active · **số kết quả luôn hiển thị**
("Hiển thị 1-10 / 245").

**Trong code hôm nay không có chip ở bất kỳ danh sách nào.** Nút xoá lọc có (một nút "Xoá bộ lọc"
trong `Empty`), nhưng chỉ xuất hiện khi **0 kết quả** — không phải khi có kết quả. Số tổng hiện
qua `showTotal` của AntD ("245 xe"), khác câu chữ Figma.

**Đây là UI mới, không phải migration.** Nguyên tắc [06 §0.4](06_MIGRATION_ORDER.md) cấm code mục
loại D/E/F, và rule 3 của Wave 1C cấm "implement unrelated missing features".

**Ba lựa chọn**: (a) `FilterBar` **có** khe chip nhưng Wave 1C để trống, bật ở wave module ·
(b) làm chip luôn trong 1C.9 (14 route đổi hình thức cùng lúc) · (c) bỏ, ghi nợ.

**Khuyến nghị kỹ thuật**: (a). **Nếu không trả lời**: (a).

### P25 — 11/14 bảng không có đặc tả cột 🟠

`127:1725` cho min/preferred width, align, wrap, flex, sticky **đầy đủ cho đúng 3 bảng**: Fleet
Vehicles, Booking Requests, Bookings. Bảng tổng `MIN_TABLE_WIDTH` phủ thêm 7 tên nữa (Calendar,
Debts, Members, Approval Queue, Platform Bookings, Audit Log, Platform Staff) nhưng **chỉ có tổng**,
không có từng cột. Còn lại (Receipts, Tenants, Platform Vehicles, Platform Customers, Plans) **không
có gì**.

**Cần chốt**: suy width cho 11 bảng còn lại theo quy tắc của 3 bảng có spec, hay chờ thiết kế?

**Nếu không trả lời**: `DataTable` **không** áp width mặc định; mỗi bảng khai `minWidth` khi migrate
ở wave module của nó, dùng thang từ 3 bảng có spec (identity 140–180 · tiền 100–120 · ngày 90–100 ·
status 100–120 · actions 100). Ghi rõ giá trị nào là suy diễn.

### P26 — 7/14 bảng không có ánh xạ thẻ mobile 🟠

`127:2257` ánh xạ card cho **7 bảng** (Fleet, Booking Requests, Bookings, Debts, Members, Approval
Queue, Platform Staff). `127:1725` lại ghi `MOBILE: Card` cho **10 bảng**. Không có ánh xạ nào cho
Receipts, Tenants, Platform Vehicles, Platform Customers, Audit Log, Plans, Platform Bookings.

Chuyển bảng sang thẻ là **đổi hành vi ở 14 route** ([06](06_MIGRATION_ORDER.md) rủi ro CAO).

**Nếu không trả lời**: `DataTable` nhận `renderCard` **tuỳ chọn**; bảng nào Figma có ánh xạ thì
migrate ở wave module của nó, bảng nào không có thì **giữ cuộn ngang** và ghi lý do — đúng
checkpoint 1C ("mọi bảng có `renderCard` hoặc lý do ghi rõ tại sao không").

### P27 — Mức tuân thủ a11y bảng: `role="grid"` tới đâu? 🟠

`130:1658` yêu cầu `role="grid"`, `aria-sort`, **điều hướng Arrow Up/Down giữa hàng**, `Home/End`,
`aria-live` số kết quả, `caption`/`aria-labelledby`, skip-link "Nhảy đến bảng dữ liệu".

AntD `<Table>` render `role="table"`, **không** có roving tabindex và không nhận `caption`. Làm đủ
`role="grid"` + phím mũi tên nghĩa là **tự quản lý focus trên thân bảng của AntD** — rủi ro cao,
vượt xa "một tầng bọc".

**Tách làm hai mức**:

- **Mức 1 (làm được ở 1C, rẻ, không đụng nội thất AntD)**: `aria-label`/`aria-labelledby` cho bảng ·
  `aria-label` mọi nút icon · `aria-live="polite"` cho số kết quả · `aria-sort` khi có cột sort.
- **Mức 2 (không làm ở 1C)**: `role="grid"` + roving tabindex + Arrow/Home/End + skip-link.

**Khuyến nghị**: mức 1 ở Wave 1C, mức 2 vào Wave 5 (`5.5 Audit a11y`) hoặc một PR riêng.
**Nếu không trả lời**: mức 1.

### P28 — `127:2463` mobile filter sheet dùng Hệ B 🟢 _(đóng theo P15/P20)_

Sheet spec ghi gold **`#D4AF37`**, bo góc **16px**, backdrop `rgba(26,22,18,0.4)`, trần `85vh`,
handle bar `#E8E4DD`, header 56px, nút Áp dụng 48px.

`#D4AF37` và bo góc 16px thuộc **Hệ B** ([P15](#p15--hai-bộ-giá-trị-token-trong-cùng-file-figma)) →
loại theo đúng lý do đã dùng ở [P20](#p20--đặc-tả-overlay-figma-mâu-thuẫn-với-token-wave-1a).
Trần `85vh` ≈ `SHEET_MAX_HEIGHT = '85dvh'` đã có trong `ResponsiveDialog` (Wave 1B) — **khớp**.
Nút 48px = `controlHeight` bậc 40 + padding, liên quan [P16](#p16--chiều-cao-control-mặc-định-32-hay-40).

**Kết luận**: `FilterBar` mobile **tái dùng `ResponsiveDialog` size `sm` / `mobileMode="sheet"`**,
không tự chế sheet mới (rule 10 của Wave 1C). Không cần hỏi ai.

### P29 — Timeout 10 giây khi tải lâu 🟡

`134:2011` quy tắc 8: sau **10s** hiển thị _"Tải lâu hơn bình thường. Bạn có thể thử lại."_ kèm nút
retry.

Không có cơ chế timeout nào trong repo; TanStack Query không có timeout mặc định và `staleTime` 30s
không liên quan. Đây là **hành vi mới**, cần một `useEffect` hẹn giờ trong `LoadingState`.

**Nếu không trả lời**: **không làm** ở 1C — `LoadingState` chỉ hiển thị, không đếm giờ. Ghi nợ.

### P30 — Câu chữ số kết quả lệch 🟢

Figma `130:1682` yêu cầu caption _"Danh sách xe — 245 kết quả"_; `127:2354` yêu cầu _"Hiển thị 1-10
/ 245"_. Code hiện dùng `showTotal: (total) => `${total} xe`` → **"245 xe"**, khác cả hai, và **khác
nhau giữa các bảng** (`245 xe` / `245 đơn` / …).

`DataTable` sẽ chuẩn hoá một khuôn. **Nếu không trả lời**: giữ khuôn hiện tại (`{total} {đơn vị}`)
và cho `DataTable` nhận `totalLabel` — đổi câu chữ 14 bảng cùng lúc là thay đổi nhìn thấy được,
không thuộc mục tiêu 1C.

### D15 — Lỗi/khoảng cách phát hiện khi kiểm kê (KHÔNG sửa ở 1C.0)

| #         | Nội dung                                                                                                                                                                | Ở đâu                                                                                                  | Xử ở bước                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **D15.1** | **13/14 bảng thiếu `fixed: 'right'`** trên cột hành động dù bảng nào cũng bật `scroll={{x:'max-content'}}` — cuộn ngang là mất luôn nút thao tác. Vi phạm `127:2060` R1 | mọi `*Table.tsx` trừ `VehicleTable`                                                                    | 1C.4                                                                                   |
| **D15.2** | 5 nút icon thiếu tên khả truy cập                                                                                                                                       | `VehicleTable` ×3 (`Tooltip` không thay được `aria-label`) · `members/page` ×1 · `admin/staff/page` ×1 | 1C.4                                                                                   |
| **D15.3** | **10 inline style** trong `components/form/` (`marginBottom: 14`, `width: '100%'`) — vi phạm CLAUDE.md §5                                                               | `NumberField`, `TextAreaField`, `DateTimeField`, `SelectField`, `TextField`, `AutoCompleteField`       | 1C.10 (khi chạm file)                                                                  |
| **D15.4** | Không có bóng gợi ý còn cột bên phải (`127:2097` R5) ở bất kỳ bảng nào                                                                                                  | 14 bảng                                                                                                | 1C.3                                                                                   |
| **D15.5** | Trạng thái rỗng **thay thế cả bảng** → mất header + mất luôn thanh phân trang; `134:2011` R3 cấm nhảy bố cục                                                            | 14 `page.tsx`                                                                                          | 1C.3 — quyết định: `DataTable` đặt empty **trong thân bảng** hay thay cả bảng? Xem P31 |
| **D15.6** | `admin/plans` bị bỏ sót khỏi danh sách D9 và khỏi phạm vi file Wave 1C ở [06](06_MIGRATION_ORDER.md)                                                                    | `admin/plans/page.tsx`                                                                                 | 1C.6                                                                                   |

### Bổ sung từ Batch 1C-A (kiểm kê + test đặc tả)

**P23 mở rộng — `127:2339` sai thêm hai ô về hiện trạng.** Frame ghi Members = _"❌ không có
search"_ và 07 Finance = _"✅ có search"_. **Cả hai đều ngược**: `members/page.tsx` **có** ô tìm
kiếm, `/manage/receipts` **không có**. Cùng loại lỗi với cột URL-STATE. Kết luận không đổi: frame
section 12 chỉ dùng lấy _quy chuẩn mong muốn_, không lấy _đánh giá hiện trạng_.

**P27 thu hẹp — `aria-sort` hiện không có đối tượng áp dụng.** Đo được **0/14 bảng có `sorter`**;
không một header cột nào sắp xếp được. Sắp xếp chỉ tồn tại ở `vehicles` và `bookings` dưới dạng
**một `Select` trong thanh lọc** (tham số `sort` gửi lên server). Vậy "mức 1" của P27 rút còn:
tên khả truy cập cho bảng · `aria-label` nút icon · `aria-live` số kết quả.

**D15.7 (MỚI) — bấm nút trong cột hành động cũng kích hoạt click của cả hàng.**
`VehicleTable` đặt `onRow.onClick` trên `<tr>` nhưng cột hành động **không** `stopPropagation`.
Đo bằng test: bấm "Sửa" sinh ra **hai** lần điều hướng theo thứ tự
`/manage/vehicles/{id}/edit` → `/manage/vehicles/{id}`. Điều hướng cuối cùng thắng, nên **nút Sửa
thực tế đưa người dùng tới trang chi tiết, không phải trang sửa**. Đây là lỗi đang chạy, không phải
lỗi do migration. Sửa ở **1C.4** khi dựng `RowActions` (thêm `stopPropagation`), ghi rõ trong PR vì
là **đổi hành vi thấy được**. Đã khoá hiện trạng bằng test đặc tả.

**D15.8 (MỚI) — bẫy test: khẳng định phủ định đúng một cách vô nghĩa.**
Bản đầu của ba bộ test đặc tả dùng `expect(url).not.toContain('page=')` **một mình** để kiểm đường
ghi URL. `Select` của AntD 6 không chốt được lựa chọn dưới jsdom → `router.replace` không chạy →
URL là chuỗi rỗng → phép phủ định đúng, **test xanh mà không kiểm gì**. Đã phát hiện và sửa trong
cùng batch. **Quy tắc từ nay**: mọi test kiểm đường ghi URL phải kèm một khẳng định **khẳng định**
(`toHaveBeenCalledTimes` / `toContain`). Ghi ở [09 §7](09_LIST_PAGE_INVENTORY.md).

### Bổ sung từ Batch 1C-C (nền tảng filter + form)

**P35 (MỚI) — `StickyFormActions` phải được nói cho biết mình nằm trong overlay 🟢**
Không có cách nào tự phát hiện đang ở trong `ResponsiveDialog`/`DetailDrawer` mà không sửa hai
overlay đó (ngoài phạm vi 1C-C). Giải pháp: prop `variant="inline"` **bắt buộc truyền tay** cho
`BookingFormDrawer`, `ReceiptFormDrawer`, `PlanFormModal` khi migrate ở đợt rollout — quên thì ra
**hai hàng nút dính cùng lúc**. Nếu muốn tự động: thêm một context nhỏ trong hai overlay, làm ở
đợt sau.

**P36 (MỚI) — `DateTimeField range` chưa có consumer 🟢**
Đã dựng theo chỉ thị 1C-C, có 13 test, nhưng **0 form RHF nào cần khoảng ngày hôm nay**. Nhu cầu
khoảng ngày có thật lại nằm ở **lọc** (`receipts` `from`/`to`, `admin/audit`) — chỗ đó dùng
`FilterBar` field `dateRange`, không phải RHF. Ghi lại để đợt sau biết: nếu tới Wave 5 vẫn không
consumer nào, cân nhắc bỏ thay vì nuôi code chết.

**D15.12 (MỚI) — `page=0` / `page=-1` từng lọt qua ở `use-receipt-filters`.**
Bản copy dùng `Number.isFinite` nên `?page=0` cho ra `page: 0` gửi lên API. `positiveIntParam` của
hook chung trả `undefined`. Sửa kèm theo lần dời; **8 bản copy còn lại vẫn dính** cho tới khi được
dời.

### Bổ sung từ Batch 1C-B (dựng 6 primitive)

**P32 (MỚI) — cố ý lệch `130:1683`: dùng `role="status"` thay vì `aria-live="assertive"` 🟢**
Figma yêu cầu `aria-live="assertive"` cho trạng thái rỗng của bảng. `EmptyState` **dùng
`role="status"`** (tương đương `polite`) cho `empty`/`no-results`, và `role="alert"` cho `error`.
Lý do: `assertive` **ngắt lời** trình đọc màn hình, dành cho việc khẩn; một danh sách rỗng sau khi
lọc không phải việc khẩn, và người dùng vừa tự tay bấm lọc nên đã biết mình gây ra nó. Ghi lại thay
vì im lặng lệch chuẩn. **Nếu thiết kế muốn đúng Figma**: đổi một dòng trong `EmptyState`.

**P33 (MỚI) — cột hành động canh phải (code) vs Center (Figma `127:1725`) 🟢**
`actionColumn()` đặt `align: 'right'`, giữ đúng cách **14/14** bảng đang hiển thị hôm nay. Figma ghi
`Center`. Đổi sang center là thay đổi thấy được ở mọi bảng cùng lúc — cùng loại với P22, để lại cho
đợt QA thị giác quyết. **Nếu không trả lời**: giữ `right`.

**P34 (MỚI) — bề rộng cột hành động mặc định 100px 🟢**
Theo `127:2060` R2 (100 icon / 120 text). Các bảng hiện dùng 130 · 190 · 60 · 70 · 70 — **không giá
trị nào khớp**. `actionColumn()` mặc định 100 và cho truyền `width`. Khi migrate ở 1C-C, bảng nào
dùng nút có chữ (`BookingRequestTable` 190px cho "Duyệt"/"Từ chối") **phải truyền tay**, nếu không
nút sẽ bị bó.

**D15.9 (MỚI) — AntD 6 đổi tên class cột dính: `-fix-right` → `-fix-end`.**
Bất kỳ CSS nào trong repo còn nhắm `ant-table-cell-fix-right` đều **đang không có tác dụng**. Đã
sửa trong `DataTable.module.css`; cần rà lại các `.module.css` khác ở đợt sau.

**D15.10 (MỚI) — icon AntD làm bẩn accessible name.**
`@ant-design/icons` render `role="img"` kèm `aria-label` là tên icon ("eye", "delete"). Nút/menu
item **có chữ** vì thế nhận tên `"eye Thu tiền"`. `RowActions` bọc `aria-hidden` để chữa. Mẫu này
áp dụng cho **mọi** nút có cả icon lẫn chữ trong repo — chưa rà hết ngoài `RowActions`.

**D15.11 (MỚI) — tooltip trên nút `disabled` không bao giờ hiện.**
`pointer-events: none` của nút disabled nuốt sự kiện chuột, nên lời giải thích "vì sao không bấm
được" không tới người dùng. `RowActions` bọc thêm một `span` để tooltip có chỗ bám. Chỗ nào khác
trong repo đang bọc `Tooltip` quanh nút disabled cũng dính lỗi này.

### P31 — Trạng thái rỗng: trong thân bảng hay thay cả bảng? 🟡

Hôm nay 14 `page.tsx` render `<Empty>` **thay cho** `<Table>` khi `items.length === 0`. Hệ quả:
mất header cột, mất phân trang, và bố cục nhảy khi dữ liệu về.

AntD hỗ trợ sẵn `locale.emptyText` → empty nằm **trong** thân bảng, header và phân trang giữ nguyên.
Đúng `134:2011` R3 (không nhảy bố cục) và `130:1683` (`aria-live` trên empty của bảng).

Nhưng đây là **thay đổi nhìn thấy được ở 14 route**, và ở trạng thái rỗng-không-lọc thì header cột
rỗng trông lạ.

**Khuyến nghị**: `DataTable` phân biệt — **no-results** (có filter) → trong thân bảng, giữ header để
người dùng thấy mình đang lọc cái gì; **empty** (chưa có dữ liệu) → thay cả bảng như hiện tại.
**Nếu không trả lời**: theo khuyến nghị, ghi rõ trong PR.

---

## Việc tiếp theo

**Trước khi Wave 1A bắt đầu, cần:**

**Sau Wave 1A — cần trước khi bắt đầu Wave 1B:**

| Ai                       | Việc                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chủ dự án + Thiết kế** | **P15** — xác nhận Hệ A (Foundations) là bộ giá trị đúng. Đây là câu hỏi gating lớn nhất hiện tại: nếu là Hệ B thì toàn bộ Wave 1A phải làm lại giá trị |
| **Chủ dự án**            | **P18 / brief 00 Q7** — mức tuân thủ WCAG mục tiêu. Quyết định này mở khoá 4 cặp màu và màu link                                                        |
| **Bất kỳ ai**            | Chạy gói **SMOKE** ở [07 §0](07_VISUAL_QA_MATRIX.md) — Wave 1A chưa QA thị giác được (cần app chạy thật)                                                |
| **Kỹ thuật**             | Xếp **T1** (lỗi CSS lịch) vào lịch làm                                                                                                                  |

**Vẫn còn từ Wave 0B:**

| Ai            | Việc                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chủ dự án** | Trả lời **P1** (sidebar) và **P3** (tablet). Hai câu này định hình phạm vi lớn nhất                                                                     |
| ~~Kỹ thuật~~  | ~~**P8** (cơ chế breakpoint), **P7** (đổ bóng)~~ — ✅ đã chốt trong Wave 1A                                                                             |
| **Kỹ thuật**  | **P6** (heading) còn lại phần `ManagePageHeader` → Wave 1D                                                                                              |
| **Kỹ thuật**  | **P5** — 4 token `*-bg` đã đọc và khai báo (`#f0fdf4`/`#fff7ed`/`#fef2f2`/`#eff6ff`); còn phải quyết `StatusTag` có bỏ preset AntD không, trước Wave 1C |
| **Kỹ thuật**  | Inspect A2 để **P2** tự đóng nếu bộ 2 chỉ là nhãn nhóm                                                                                                  |

**Sau Batch 1C.0 — cần trước khi viết component ở 1C.1:**

| Ai                       | Việc                                                        | Mặc định nếu im lặng                                   |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| **Chủ dự án**            | **P24** — chip bộ lọc là phạm vi 1C hay tính năng mới       | `FilterBar` chừa khe, không làm chip                   |
| **Thiết kế**             | **P25** — width cột cho 11 bảng chưa có spec                | Không áp width mặc định, suy theo thang 3 bảng có spec |
| **Chủ dự án + Thiết kế** | **P26** — 7 bảng chưa có ánh xạ thẻ mobile                  | `renderCard` tuỳ chọn, bảng thiếu spec giữ cuộn ngang  |
| **Kỹ thuật**             | **P27** — a11y bảng mức 1 hay mức 2                         | Mức 1                                                  |
| **Kỹ thuật**             | **P31** — empty trong thân bảng hay thay cả bảng            | No-results trong thân, empty thay cả bảng              |
| **Kỹ thuật**             | **P5** — vẫn còn mở, chặn 1C.7 (`<Tag>` trần → `StatusTag`) | Giữ preset AntD                                        |
| ~~Kỹ thuật~~             | ~~**P23**, **P28**~~                                        | ✅ tự đóng ở 1C.0                                      |

**Có thể hoãn tới đúng wave dùng đến**: P4 (→3I) · P9/P10 (→3L) · P11 (→3I/3J) · P12 (→4) · P29/P30 (→wave module) · F1–F8, F10–F12 (→wave module tương ứng).

---

## J. Kết toán cuối Wave 1C (1C-E · 07/08/2026)

### Quyết định VẪN MỞ, chặn wave sau

| ID                                                         | Trạng thái sau Wave 1C                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P5** — `StatusTag` giữ preset AntD hay dùng token `*-bg` | 🟠 **VẪN MỞ.** Wave 1C **không đổi màu status nào**. Hệ quả trực tiếp: nhãn vai trò ở `members`/`admin/staff` vẫn là `<Tag>` trần vì `@xeprime/types` không có `TENANT_ROLE_META`/`PLATFORM_ROLE_META` — tạo meta = chọn màu = chạm đúng câu hỏi P5 |
| **P25** — bề rộng cột cho bảng chưa có spec Figma          | 🟠 **VẪN MỞ, nay có hệ quả thật.** 11/14 `minWidth` là **suy diễn** (900–1180px). Đặt sai thì bảng cuộn ngang sớm hơn cần ở 1280px → **ô QA thị giác số 1**                                                                                         |
| **P26** — ánh xạ thẻ mobile                                | 🟠 **VẪN MỞ.** `renderCard` **0/14**; ở ≤640px cả 14 bảng vẫn cuộn ngang                                                                                                                                                                            |
| **P24** — chip bộ lọc                                      | 🟢 giữ nguyên quyết định: `FilterBar` chừa khe, không dựng chip                                                                                                                                                                                     |
| **P27** — mức a11y bảng                                    | 🟢 mức 1 đã làm (tên vùng, `aria-label` nút, `role="region"`); mức 2 (`role="grid"`, phím mũi tên) chưa                                                                                                                                             |
| **P31** — rỗng trong thân bảng hay thay cả bảng            | 🟢 đã chốt theo khuyến nghị: `EmptyState` **thay cả bảng** cho cả empty lẫn no-results                                                                                                                                                              |
| **P32–P36**                                                | 🟢 giữ nguyên như đã ghi ở 1C-B/1C-C                                                                                                                                                                                                                |
| **P1** (sidebar) · **P2** · **P3** · **P15** · **P18**     | 🔴/🟠 **không đụng ở Wave 1C** — vẫn chặn 1D và các wave sau                                                                                                                                                                                        |

### Loại trừ đã CHỐT ở Wave 1C (không mở lại nếu không có lý do mới)

1. `use-calendar-filters` — lịch không phân trang.
2. `use-marketplace-filters` + `FilterPanel` — ngữ nghĩa facet.
3. `use-approval-filters`, `use-booking-request-filters` — `status` mặc định `pending`, không phải
   `'all'`; `useUrlFilters` sẽ làm "Tất cả" âm thầm quay về `pending`.
4. Cột hành động `BookingRequestTable` — cặp CTA chính, không phải dải nút phụ.
5. `<Table>` trong `AdminCustomerDetailDrawer` — bảng con trong panel chi tiết.
6. Nhãn vai trò + nhãn khuyến mãi — không phải trạng thái nghiệp vụ (liên quan P5).

### Nợ chuyển tiếp

| Nợ                                             | Ghi chú                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `StickyFormActions` 0 consumer                 | 5 form dài chờ; `VehicleForm` bị chỉ thị 1C-E cấm đụng → wave form |
| `renderCard` 0/14                              | chờ P26                                                            |
| D9 — 3 bảng dựng trong `page.tsx`              | việc cấu trúc                                                      |
| `FilterBar` cho 8 trang còn lại                | bộ lọc vẫn nội tuyến, chạy đúng                                    |
| **T1** — 9 biến CSS chết ở `CalendarScheduler` | 🔴 **vẫn chưa sửa**, sang wave lịch                                |
| D14.4 — `SelectField` chưa có `htmlFor`        | 3 field kia đã sửa ở 1C-C                                          |
| D14.5 — xoá danh mục thu/chi không xác nhận    | chưa sửa                                                           |
| **QA thị giác Wave 1A + 1B + 1C**              | **toàn bộ còn nợ** — chưa lần nào chạy được app                    |

---

## Batch 1D-A — phát hiện khi đặc tả vỏ portal (07/08/2026)

Bốn lỗi có thật, tìm ra khi **viết test đặc tả**, không phải khi đọc code. Đều KHÔNG sửa ở
1D-A (batch này chỉ chốt hiện trạng); mỗi lỗi đã có một test đang xanh mô tả đúng cái sai.

| ID        | Lỗi                                                                                                                                                                                                                                                                                                     | Bằng chứng                                                                    | Sửa ở                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| **D16.1** | `MobileNav` dính đúng lỗi **D15.10** đã sửa cho `RowActions` ở Wave 1C: icon `@ant-design/icons` render `role="img"` + `aria-label`, nên trình đọc màn hình đọc tab "Lịch xe" là **"calendar Lịch xe"**, nút "Thêm" là **"ellipsis Thêm"**                                                              | `MobileNav.test.tsx` — "HIỆN TRẠNG: tên icon lọt vào tên truy cập được"       | 1D-B                                        |
| **D16.2** | `<nav>` của `MobileNav` **không có tên**, tab **không có `aria-current`**. `MobileTabBar` của khu khách hàng đã có cả hai (`aria-label="Điều hướng nhanh"` + `aria-current="page"`) — hai khu lệch chuẩn a11y                                                                                           | `MobileNav.test.tsx` — "HIỆN TRẠNG: tab KHÔNG có aria-current"                | 1D-B                                        |
| **D16.3** | Mục menu đang mở **chỉ phân biệt bằng màu** — không `aria-current`, không dấu hiệu nào khác. Vi phạm mục tiêu "active route communicated beyond colour"                                                                                                                                                 | `use-manage-nav.test.tsx` — "HIỆN TRẠNG: mục đang sáng KHÔNG có aria-current" | 1D-B                                        |
| **D16.4** | Comment ở [theme.ts:261](../../apps/web/src/styles/theme.ts#L261) khẳng định _"`theme.test.ts` có test chặn giá trị lạ"_ trong `@media`. **Không hề có test đó** — `theme.test.ts` chỉ kiểm `XP_BREAKPOINTS` suy ra từ token. 1D-A đã bù một phần bằng `layout-breakpoints.test.ts` (chỉ phủ 4 file vỏ) | `theme.test.ts` không có assertion nào về `@media`                            | 1D-B (sửa comment + cân nhắc mở rộng guard) |

### Kiểm kê breakpoint của vỏ portal

| Sự thật                            | Giá trị                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Thang chính tắc                    | 640 · **1024** · 1440                                                                     |
| Ranh hiện tại của **cả 4** file vỏ | **992px** (token `lg` của AntD, không thuộc thang XePrime)                                |
| Ranh lạ khác trong 4 file vỏ       | **không có** — đổi 992→1024 là phép thay thế cơ học                                       |
| `useIsDesktop()`                   | ≥ **1025px**                                                                              |
| Hệ quả                             | Dải **993–1024px mâu thuẫn**: CSS đã coi là desktop và hiện sidebar, JS vẫn coi là tablet |

Ngoài 4 file vỏ, còn ~30 file khác mang breakpoint ngoài thang (560 · 760 · 768 · 480 · 900 · 960).
**Không dời hàng loạt** — theo brief 00 §9.4, dời khi chạm file.

### Ranh giới quyền — bốn tầng, đã kiểm từng tầng

| Tầng               | Làm gì                                                                           | Không làm gì                                                                     |
| ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `proxy.ts` (Edge)  | Chỉ kiểm **có cookie `xp_session`** rồi điều hướng; giữ nguyên đích trong `next` | Không verify token, **không biết** user có phải nhân sự nền tảng                 |
| `AppShell`         | Phân biệt "đã đăng nhập / có gian hàng"; dọn phiên hỏng                          | **Không** đọc `usePermissions` (có test chốt)                                    |
| `admin/layout.tsx` | Chặn `/manage/admin/*` khi `platformRole` rỗng                                   | **Chỉ kiểm `platformRole` tồn tại, KHÔNG kiểm quyền cụ thể** — xem cảnh báo dưới |
| `useManageNav`     | Ẩn/hiện mục menu theo `permission`                                               | Không bảo vệ gì cả                                                               |

> ⚠️ **Chênh lệch có thật, không phải lỗi**: `admin/layout.tsx` chỉ đòi `platformRole` khác rỗng.
> Nên `platform_staff` gõ thẳng URL `/manage/admin/staff` **vẫn vào được khung trang** (dù menu
> đã ẩn mục đó), rồi API trả 403. Đúng theo ADR 0002 — guard backend là nơi chặn thật — nhưng
> trải nghiệm là một trang rỗng kèm lỗi, không phải một câu giải thích. Trùng vấn đề **B1** của
> brief 00. **Không sửa ở Wave 1D** (là việc nghiệp vụ, không phải việc vỏ), ghi lại để không
> ai tưởng nhầm menu là lớp phân quyền.

---

## Batch 1D-B — vỏ desktop đã dựng (07/08/2026)

### Quyết định đã đóng

| ID         | Kết luận                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P1** ✅  | Sidebar TỐI đã áp dụng. 232px mở rộng · 64px thu gọn — **không token kích thước nào phải đổi**                                                                                                                                                                                 |
| **P6** ✅  | `ManagePageHeader` là `<h1>`. **Cấp heading và cỡ chữ tách nhau**: `level={1}` cho ngữ nghĩa, `--xp-font-size-h2` (24px, đo từ `58:98`) cho thị giác. KHÔNG hạ cấp heading để lấy chữ nhỏ                                                                                      |
| **P39** ✅ | **Không persistence.** Repo không có hạ tầng lưu nào; chỉ thị 1D-B cấm dựng cơ chế thứ hai. `sidebarCollapsed` sống trong phiên. Đổi lại: state khởi tạo là hằng `false` ở cả server lẫn client ⇒ **không có hydration mismatch** — thứ mà bản `localStorage` sẽ phải đánh đổi |
| **P40** ✅ | Giữ **hai lối** đăng xuất (thẻ người dùng + menu avatar), nhưng **một bản cài đặt**: `usePortalLogout`                                                                                                                                                                         |
| **P37** ⏸  | Gom nhóm 4 nhóm — **chưa làm**. Đổi nhóm là đổi `nav.ts`, tức chạm cây điều hướng; 1D-B chỉ đổi trình bày. Chuyển sang 1D-C                                                                                                                                                    |
| **P38** ⏸  | Bảng màu riêng cho sidebar nền tảng — **không làm**. Một bộ tối cho cả hai scope                                                                                                                                                                                               |

### Bốn token dẫn xuất cho nền tối

Foundations chỉ cho 3 màu sidebar; nền tối cần thêm 4 bậc trạng thái. Dẫn xuất bằng `color-mix`
từ chính 3 màu đó (không phải màu mới), tỉ lệ chọn theo tương phản **đo được**, và phép đo nằm
trong `theme.test.ts` chứ không phải trong một ghi chú:

| Token                            | Trộn       | Tương phản                            |
| -------------------------------- | ---------- | ------------------------------------- |
| `--xp-shell-sidebar-hover`       | text 8%    | chữ trên nền này **11.12** ✅         |
| `--xp-shell-sidebar-selected-bg` | active 14% | chữ **10.54** · icon gold **5.67** ✅ |
| `--xp-shell-sidebar-muted`       | text 62%   | **5.96** trên nền sidebar ✅          |
| `--xp-shell-sidebar-border`      | text 14%   | 1.45 — đường kẻ, không phải chữ       |

Huy hiệu vai trò: `--xp-color-primary-contrast` trên `--xp-shell-sidebar-active` = **6.60** ✅.

### D16.1–D16.4 — trạng thái

| ID           | Trạng thái                                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D16.3** ✅ | `aria-current="page"` trên mục đang mở. Test khoá "chỉ MỘT mục có nó"                                                                               |
| **D16.4** ✅ | Comment sai ở `theme.ts` đã bỏ; `layout-breakpoints.test.ts` phủ 4 file vỏ                                                                          |
| **D16.1** ⏸  | Tên icon lọt vào tên tab của `MobileNav` — **1D-C** (batch sở hữu mobile)                                                                           |
| **D16.2** ⏸  | `<nav>` của `MobileNav` chưa có tên, tab chưa có `aria-current` — **1D-C**                                                                          |
| **D16.5** 🆕 | `MobileNav.module.css` còn `rgba(120, 88, 20, 0.06)` trong `box-shadow` — màu thô có từ trước Wave 1D. Có test chốt hiện trạng; **1D-C** phải xử lý |

### Ghi chú kiến trúc

- **Vỏ không tính offset ở JS.** `.shell` là flex, `.main` là `flex: 1` — đổi bề rộng cột sidebar
  là vùng nội dung tự bù. `min-width: 0` ở `.main` vẫn là thứ chặn bảng rộng đẩy tràn ngang.
- **Một cây menu cho cả hai trạng thái.** Thu gọn giao cho `inlineCollapsed` của AntD; `aria-label`
  đặt thẳng trên thẻ `<a>` để tên truy cập được sống sót khi AntD ẩn phần chữ bằng CSS.
- **`tone` prop trên `ManageMenu`/`ManageUserCard`.** Sidebar truyền `dark`; Drawer mobile giữ
  `light` cho tới 1D-C. Figma `14:1661` cho thấy drawer cũng tối — đó là việc của 1D-C, không
  phải bỏ sót.
- **Hai điều khiển bị GỠ**: dropdown "Tất cả chi nhánh" (một mục, không nối dữ liệu) thay bằng
  ngữ cảnh gian hàng đọc từ `user.tenant.name`. Ô tìm kiếm `⌘K` của Figma **không dựng** — chưa
  có API tìm kiếm nào đứng sau.
- **Breadcrumb lấy nhãn từ chính cây menu** (`matchSelectedKey`), không dựng sổ tra cứu
  route → tiêu đề. Không có bản thứ hai của tên trang để trôi khỏi sidebar.

---

## Batch 1D-C — tablet/mobile + kết toán Wave 1D (07/08/2026)

### Ranh giới responsive — nay chính tắc

|                 | Trước 1D-C                                             | Sau                                        |
| --------------- | ------------------------------------------------------ | ------------------------------------------ |
| CSS vỏ (4 file) | `max-width: 992px` (token `lg` của AntD)               | **`max-width: 1024px`** = `--xp-bp-tablet` |
| JS              | `useIsDesktop()` ≥ 1025                                | không đổi                                  |
| Dải 993–1024px  | **mâu thuẫn**: CSS hiện sidebar desktop, JS báo tablet | khít nhau                                  |

Hành vi ở ba điểm được hỏi: **1023px** và **1024px** → thanh tab + hamburger, không sidebar;
**1025px** → sidebar cố định, không thanh tab. Đúng một chế độ điều hướng tại một thời điểm.

### Đo tương phản — 22 cặp, 3 cặp TRƯỢT (và đều nằm trên nền SÁNG)

Nền tối: **19/19 đạt** (thấp nhất 5.67 — icon gold trên nền mục đang chọn). Ba cặp trượt đều
trên bề mặt sáng, tức là chỗ không ai ngờ:

| Cặp                                              | Đo được  | Xử lý                                                                                                       |
| ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------- |
| Tab thường: `text-tertiary` trên trắng           | **2.86** | → `--xp-color-text-secondary` (5.74). Lỗi CÓ SẴN từ trước Wave 1D                                           |
| Tab đang chọn: `gold-deep` trên trắng            | **3.97** | → `--xp-color-text` (17.40) + chữ đậm; **gold chuyển sang làm VẠCH chỉ báo**, nơi ngưỡng là 3:1 và gold đạt |
| Ô gian hàng topbar: `gold-deep` trên `gold-wash` | **3.68** | → nền `--xp-color-primary` + chữ `--xp-color-primary-contrast` (6.60). **Lỗi do chính 1D-B tạo ra**         |

> **Bài học ghi kèm số**: gold **không** dùng làm màu chữ nhỏ trên nền sáng được. Nó hợp lệ khi
> làm NỀN (chữ contrast lên trên: 6.60) hoặc làm thành phần ĐỒ HOẠ (vạch, viền focus — ngưỡng 3:1).
> Không token toàn cục nào bị đổi giá trị; chỉ đổi token nào dùng ở đâu.

### D16.x — kết toán

| ID                                                                              | Trạng thái                                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| D16.1 tên icon lọt vào nhãn tab                                                 | ✅ sửa — tách `decorativeIcon` ra `lib/`, nay có 2 consumer                                                                     |
| D16.2 `<nav>` chưa có tên, tab thiếu `aria-current`                             | ✅ sửa — hai landmark có tên riêng ("Điều hướng nhanh" / "Menu đầy đủ")                                                         |
| D16.3 mục đang mở chỉ phân biệt bằng màu                                        | ✅ sửa ở 1D-B                                                                                                                   |
| D16.4 comment sai ở `theme.ts`                                                  | ✅ sửa ở 1D-B                                                                                                                   |
| D16.5 màu thô trong đổ bóng `MobileNav`                                         | ✅ **gỡ hẳn** — bóng hướng xuống trên thanh sát đáy viewport vốn không nhìn thấy; `border-top` đã đủ                            |
| **D16.6** 🆕 `MobileTabBar` khớp tiền tố trần (`startsWith(href)` không có `/`) | ✅ sửa — cùng quy tắc với `matchSelectedKey`/`proxy.ts`. Hôm nay chưa route nào đụng nhau nên **không đổi hành vi**, chỉ gỡ bẫy |

### Quyết định đóng ở 1D-C

| ID                                     | Kết luận                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **P3** (chuẩn tablet)                  | ✅ **1024px** — cho vỏ portal. Ranh chính tắc, CSS và JS gãy cùng chỗ                                                                      |
| **P37** (gom 4 nhóm menu)              | ❌ **KHÔNG làm.** Đổi nhóm là đổi `nav.ts`, tức chạm cây điều hướng — ngoài phạm vi "vỏ" của Wave 1D. Chuyển sang wave điều hướng nội dung |
| Thanh tab có lọc quyền không?          | ✅ **CÓ.** `MobileTab` nay mang `permission`; trước đó thanh tab không lọc trong khi sidebar thì có                                        |
| Nút `+` FAB giữa thanh tab (`14:1650`) | ❌ **không dựng** — Figma không gắn hành động nào cho nó. Không tạo điều hướng chết                                                        |
| Ô tìm kiếm `⌘K` (`14:1504`)            | ❌ **không dựng** — chưa có API tìm kiếm                                                                                                   |

---

## D19 — Override AntD bằng một class đơn là VÔ HIỆU (07/08/2026) 🔴

**Lỗi đã ra tới giao diện chạy thật**, phát hiện khi chủ dự án gửi ảnh chụp `/manage/vehicles`:
chữ mục menu tàng hình trên sidebar tối, nút thu gọn không thấy, hamburger hiện cả trên desktop.

### Nguyên nhân — đo được, không phải phỏng đoán

AntD 6 sinh CSS dạng:

```css
:where(.css-dev-only-do-not-override-<hash >).ant-menu-light .ant-menu-item {
  color: var(--ant-menu-item-color);
}
```

`:where()` khiến phần hash có **độ đặc hiệu bằng 0**. Nên luật của AntD chỉ là **(0,2,0)** —
và với `.ant-btn` / `.ant-avatar` thì chỉ **(0,1,0)**.

Ghi đè bằng **một class CSS Module** (`.dark :global(.ant-menu-item)` = (0,2,0), `.toggle` =
(0,1,0)) là **HOÀ độ đặc hiệu**. Hoà thì **thứ tự trong tài liệu** quyết định — mà AntD chèn
`<style>` vào `<head>` **lúc chạy**, tức luôn đứng sau file CSS Module tĩnh của Next.

⇒ **AntD thắng, override của ta thành vô hiệu, và không có lỗi nào báo ra.** Test cũng không
bắt được: jsdom không áp CSS Module thật, nên mọi test hành vi vẫn xanh.

Hệ quả cụ thể: chữ mục menu rơi về `--ant-menu-item-color` ≈ `#1a1a1a` trên nền `#1e1b16`.

### Đã sửa

| Nơi                                 | Trước                                   | Sau                                                                                              |
| ----------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ManageMenu` mọi luật menu          | `.wrap`/`.dark :global(.ant-menu-item)` | `+ .ant-menu-root.ant-menu-light` → (0,4,0)                                                      |
| `Sidebar` nút thu gọn               | `.toggle`                               | `.sider .toggle`                                                                                 |
| `Topbar` hamburger + avatar         | `.hamburger`, `.avatar`                 | `.header .hamburger`, `.header .avatar`                                                          |
| `ManageUserCard` avatar + đăng xuất | `.avatar`, `.logout*`                   | `.card .avatar`, `.card .logout*`                                                                |
| `MobileNav` bề rộng Drawer          | CSS thường                              | `!important` — AntD ghi `style="width: 378px"` **nội tuyến**, style nội tuyến thắng mọi selector |
| `ManageBreadcrumb`                  | `.crumb { font-size }`                  | bỏ hẳn khai báo tranh chấp (giá trị vốn đã đúng)                                                 |

`:hover` vẫn cần `!important` ở hai chỗ: luật hover của AntD là
`.ant-btn-text:not(:disabled):not(.ant-btn-disabled):hover` = **(0,4,0)**.

### Luật rút ra — áp cho MỌI wave sau

> **Override một class của AntD phải có ít nhất HAI class trong selector.** Một class là hoà,
> và hoà thì thua.

Có test chặn: `layout-breakpoints.test.ts` → _"vỏ portal — override AntD phải thắng được về độ
đặc hiệu"_ quét mọi selector nhắm `.ant-*` trong CSS vỏ và bắt buộc ≥ 2 class.

### Hai lối đã cân nhắc và loại

- **`!important` cho từng khai báo màu**: thắng, nhưng rải rác và che mất nguyên nhân thật.
  Chỉ dùng ở đúng hai chỗ không còn cách khác (hover (0,4,0), và style nội tuyến của Drawer).
- **`ConfigProvider` + `components.Menu`**: bám tên token nội bộ của AntD — đúng thứ
  CLAUDE.md mục 3 cấm ("vỡ qua mỗi lần nâng cấp").

### Khoảng trống còn lại

Test mới chặn được **selector sai độ đặc hiệu**, nhưng **không** chứng minh được màu cuối cùng
render ra đúng — jsdom không áp CSS Module. Chỉ **QA thị giác trên trình duyệt thật** mới đóng
được khoảng trống đó. Đây là bằng chứng cụ thể nhất từ đầu dự án cho việc QA thị giác đang nợ
là rủi ro thật, không phải thủ tục.
