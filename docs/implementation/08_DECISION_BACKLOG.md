# 08 — DECISION BACKLOG

> Ngày lập: 06/08/2026 · Wave 0B.
> **Nguyên tắc §10.10**: mâu thuẫn thì **ghi**, không đoán. Mỗi mục dưới đây ghi rõ: ai quyết được, nó chặn cái gì, và điều gì xảy ra nếu không có câu trả lời.
> Backlog này **bổ sung** cho, không thay thế, register ~110 câu hỏi mở của design-briefs (brief 11 §8) và 15 quyết định gating ở [design-briefs/README §9](../design-briefs/README.md). Mục nào trùng thì ghi tham chiếu chéo.

## Bảng tổng

| ID | Quyết định | Loại | Ai quyết | Chặn | Mức |
| --- | --- | --- | --- | --- | --- |
| **P1** | Sidebar sáng hay tối | Sản phẩm/Thiết kế | Chủ dự án + Thiết kế | **Wave 1D**, 25/39 route | 🔴 **CHẶN** |
| **P2** | Bản canonical của màn staff (A2) | Figma | Chủ dự án + Thiết kế | Wave 3G (R38) | 🔴 **CHẶN** |
| **P3** | Chuẩn tablet: có bắt buộc? 768 hay 1024? | Sản phẩm | Chủ dự án | Mọi QA tablet | 🟠 Cao |
| **P4** | Có tạo route `/search` riêng không (A6) | Sản phẩm | Chủ dự án | Wave 3I (R01/R02) | 🟠 Cao |
| **P5** | `StatusTag` giữ preset AntD hay dùng token `*-bg` | Kỹ thuật/Thiết kế | Kỹ thuật + Thiết kế | Wave 1A (4 token), 1C | 🟠 Cao |
| **P6** | Cấp heading của `ManagePageHeader` | Kỹ thuật | Kỹ thuật | Wave 1D | 🟡 TB |
| **P7** | Hai hệ đổ bóng song song (XePrime vs AntD) | Kỹ thuật | Kỹ thuật | Wave 1A/1B | 🟡 TB |
| **P8** | Cơ chế token breakpoint trong `@media` | Kỹ thuật | Kỹ thuật | **Wave 1A** (phần breakpoint) | 🟠 Cao |
| **P9** | Thiếu thiết kế `/forgot-password`, `/reset-password` | Thiết kế | Thiết kế | Wave 3L | 🟢 Thấp |
| **P10** | Thiếu thiết kế dashboard gian hàng | Thiết kế | Thiết kế | Wave 3L | 🟢 Thấp |
| **P11** | Nút chết (Google/Facebook login, lưu xe) | Sản phẩm | Chủ dự án | Wave 3I, 3J | 🟡 TB |
| **P12** | Bắt buộc lý do khi huỷ phiếu thu (C14) | Sản phẩm | Chủ dự án | Wave 4 | 🟡 TB |
| **P13** | Độ tin cậy frame audit section 12 | Figma | *(đã tự giải)* | — | ✅ Đóng |
| **P14** | 14 mục UNKNOWN cần inspect | Figma | Kỹ thuật *(tự giải)* | wave tương ứng | 🟡 TB |
| **P15** | **Hai bộ giá trị token trong cùng file Figma** | Figma/Thiết kế | Chủ dự án + Thiết kế | Toàn bộ hệ token | 🔴 **CHẶN** |
| **P16** | Chiều cao control mặc định 32 hay 40 | Thiết kế | Thiết kế | Wave component | 🟡 TB |
| **P17** | Bậc viền “mảnh hơn” không có nguồn Figma | Thiết kế | Thiết kế | — *(đã dẫn xuất)* | 🟢 Thấp |
| **P18** | 4 cặp màu trượt WCAG AA | A11y/Thiết kế | Chủ dự án + Thiết kế | — *(đã pin)* | 🟠 Cao |
| **P19** | Figma chưa định nghĩa màu link | Thiết kế | Thiết kế | — *(giữ hành vi cũ)* | 🟢 Thấp |

### Đã đóng trong Wave 1A

| ID | Kết luận |
| --- | --- |
| **P7** ✅ | Hai hệ đổ bóng → gộp về Elevation 1/2/3 của Figma; `boxShadow`/`boxShadowSecondary`/`boxShadowTertiary` là **seed token** của AntD nên ánh xạ chúng không phá quy tắc “chỉ seed token” |
| **P8** ✅ | Cơ chế breakpoint → **phương án (a)**: hằng số `XP_BREAKPOINTS` trong TS + 3 CSS token; **không** thêm PostCSS. Và theo brief 00 §9.4, **không** gom 21 breakpoint hàng loạt — dời khi chạm file |
| **P6** 🟡 | Cấp heading: đã ánh xạ `fontSizeHeading1..5` = 32/24/20/16/14 nên `Typography.Title` khớp thang Figma. Nhưng `ManagePageHeader` vẫn dùng `level={3}` (giờ ra 20px). Đổi sang `level={1}` là việc của **Wave 1D** — vẫn mở |

---

## A. Quyết định sản phẩm

### P1 — Sidebar sáng hay tối 🔴 CHẶN

**Mâu thuẫn**
- **Code**: [Sidebar.module.css:9](../../apps/web/src/components/layout/Sidebar.module.css#L9) → `background: var(--xp-color-bg-container)` = **`#ffffff`** (sáng)
- **Figma Foundations**: `--xp-shell-sidebar-bg` `14:92` = **`#1e1b16`** (gần đen ấm) · `--xp-shell-sidebar-text` `14:96` = `#e8e4dd` · `--xp-shell-sidebar-active` `14:100` = `#d6a02c`
- Foundations còn có 3 frame vỏ (`14:1423` full · `14:1531` collapsed · `14:1619` mobile) và section 05 có `59:871` `Shell/Sidebar` với **11 biến thể active-page**

**Vì sao không tự quyết được**: đây không phải chi tiết token — nó lật tông màu của **25/39 route** (mọi trang `/manage`), kéo theo tương phản logo, màu icon menu, badge trên nền tối, drawer mobile, `ManageUserCard`. Đây là quyết định thương hiệu.

**Chặn**: toàn bộ **Wave 1D**. Không có câu trả lời thì 1D không chạy được (1D *là* wave sidebar).

**Nếu không trả lời**: chạy 1A→1B→1C→**2 (pilot)** trước; pilot Fleet List không phụ thuộc tông sidebar. Nhưng rollout 3x sẽ phải QA lại nếu P1 chốt "tối" sau đó.

**Cần để quyết**: ảnh dựng thử `/manage/vehicles` với hai tông, đặt cạnh nhau ở 1440.

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
3. **Không có luật**: brief 00 Q9 và 01 Q9 ghi thẳng *"no tablet rules"* là `Unknown`

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
- **G7** — nút đăng nhập Google/Facebook trong `AuthModal` (brief 11 §3.7: *"⬜ buttons fail"*)
- **G8** — nút lưu xe yêu thích trên trang chi tiết (brief 01: *"⬜ dead button"*)

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

| Ref | Nội dung | Chặn UI nào |
| --- | --- | --- |
| 09 Q1–Q2 | Cơ sở pháp lý + thời hạn lưu PII/audit | `107:3952` pii-reveal-**design-target** (E14) — không code |
| 09 Q3/Q5 | Governance reveal: lý do, hạn mức, thông báo cho khách | ↑ |
| 09 (D17) | Quyền của chủ thể dữ liệu | Không có UI nào |
| 02 Q1 | Sự kiện nào tới khách, qua kênh nào | `91:2571` notification-channels-**future** (E8) — không code |

**Quy tắc trong lúc chờ**: mọi bề mặt PII giữ nguyên hành vi hiện tại — masking mặc định, reveal do người dùng bấm, ghi `audit_logs` mỗi lần. [07 §7.1](07_VISUAL_QA_MATRIX.md) kiểm điều này ở mọi wave chạm R35/R36.

---

## C. Quyết định thương mại

Không có mục mới. Tham chiếu [design-briefs/README §9](../design-briefs/README.md):

| Ref | Nội dung | Ánh xạ Figma |
| --- | --- | --- |
| 10 Q2 | Hệ quả khi gói hết hạn | `115:4212` derived-expiry-behavior (hiển thị hiện trạng — migrate được) |
| 10 Q9 | Nghĩa vụ hoá đơn / e-invoice | `115:4400` **missing**-invoice-payment (E17) — không code |
| 05 Q1 | Duyệt yêu cầu có mang giá marketplace vào booking không (hôm nay mọi booking chuyển đổi là 0đ) | Ảnh hưởng `68:1076` approval-confirmation — **hiển thị 0đ là đúng hiện trạng**, không "sửa" trong wave UI |
| 06 Q2 | Chính sách thu vượt | `77:5646` guard-**target** (E16) — không code |

⚠️ **05 Q1 đáng chú ý cho migration**: brief 11 §9 xếp "the zero-đồng conversion" là rủi ro #2. Khi migrate `68:1076`, màn sẽ hiển thị `0 ₫` — **đó là hiện trạng đúng**, không được che giấu hay tự điền giá.

---

## D. Chức năng cần backend

**30 mục loại D** ở [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md). Không lặp lại ở đây. Ba mục đáng nêu vì chúng **đã được ADR yêu cầu nhưng chưa làm**:

| Ref | Nội dung | Vì sao đặc biệt |
| --- | --- | --- |
| **D21** | CSRF · thu hồi phiên · gia hạn trượt | **ADR 0002 bắt buộc, code chưa có.** Brief 11 §9 rủi ro #6: *"the one place an accepted ADR and the code disagree"*. Không phải việc của wave UI, nhưng phải có người theo dõi |
| D5 | `blocked_range` / bảo dưỡng gắn vào availability | Enum đã có, **không writer**. ADR 0006 nói `vehicle_occupancies` chỉ `OccupancyService` được ghi |
| D14/D19 | `TenantDocument` / `TenantInvite` | Model có, **không code path** |

---

## E. Mâu thuẫn Figma ↔ code

### P5 — `StatusTag`: preset AntD hay token `*-bg` 🟠

**Hiện trạng**: [StatusMeta.color](../../packages/types/src/status/meta.ts) là **AntD preset color** (`'green'`, `'gold'`, `'red'`, `'blue'`…), không phải hex. Docstring giải thích: *"giữ nhất quán với design token thay vì tự chế màu"*.

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

| | Cách | Ưu | Nhược |
| --- | --- | --- | --- |
| (a) | Chỉ khai hằng số trong TS (`BREAKPOINTS` cạnh `XP_TOKENS`) + kỷ luật: `@media` chỉ được viết đúng 3 số đó, có **grep-test** ép | Không thêm dependency, không đổi build | Vẫn là số trần trong CSS |
| (b) | Thêm PostCSS `postcss-custom-media` | `@media (--xp-bp-mobile)` đọc tốt | Thêm bước build; **CLAUDE.md cấm cài package không cần thiết**; đụng cấu hình Next |
| (c) | Chuyển sang container query | Đúng hướng hiện đại | Viết lại toàn bộ responsive — vượt xa phạm vi migration |

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

| # | Lệch | Xử lý |
| --- | --- | --- |
| E1 | `--xp-shell-sidebar-width` 232px (code) vs `47:5` 240px (Figma) | Wave 1D — xác minh bằng `get_design_context`, đổi nếu đúng |
| E2 | Sidebar ẩn ở 992px (code) vs ranh Tablet/Desktop 1024px (Figma) | Wave 1D bước 1D.3 |
| E3 | `line-height` Body M: 1.5714 (code, →22px) vs 14/20 = 1.4286 (Figma `14:131`) | Wave 1A — commit riêng cuối wave; nếu QA cho thấy lệch quá nhiều thì **giữ code**, ghi nhận |

---

## F. Node Figma mơ hồ

**14 mục loại F** ở [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) (F1–F14). Phần lớn **kỹ thuật tự giải bằng inspect**, không cần hỏi ai. Chỉ hai mục leo thang:

- **F9** → **P2** (hai bộ Batch 1 staff)
- **F13** → **P3** (768 hay 1024)

Ngoài ra, một lỗi phân loại của Wave 0A **đã tự sửa trong wave này**, không cần quyết định:

> ⚠️ **Sửa catalog**: 18 frame `audit-log-*` / `audit-detail-*` / `mobile-audit-*` của section 10 (`109:1260` … `110:3217`) bị [FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md) gán `AUDIT` → eligibility `NO` do heuristic theo tên. Chúng là **màn production của route `/manage/admin/audit`**. Đã sửa ở [01_FIGMA_ROUTE_NODE_MAP.md](01_FIGMA_ROUTE_NODE_MAP.md) R37. Nếu không phát hiện, cả một route đã bị loại khỏi migration.

Ba mục "chưa vẽ" cần thiết kế bổ sung (không chặn, chỉ ghi nhận):

- **P9** — `/forgot-password`, `/reset-password`: section 03 phủ auth modal/OTP/register nhưng bỏ hai màn này. Trong lúc chờ: chỉ áp token, giữ nguyên UI.
- **P10** — dashboard gian hàng (`/manage`): không có frame. **Khớp với brief 11 §6** (*"thin-but-covered"*, chưa có brief riêng) — Figma và tài liệu nhất quán về khoảng trống này. Trong lúc chờ: chỉ áp token + shell mới, **không redesign**.
- Route `/manage/trash` không có frame mobile (R31).

---

## G. Phát sinh từ Wave 1A

### P15 — Hai bộ giá trị token trong cùng file Figma 🔴 CHẶN

**Phát hiện khi inspect cấp node.** File Figma chứa **hai hệ giá trị mạch lạc và mâu thuẫn nhau**, không phải sai lệch ngẫu nhiên:

| | **Hệ A — Foundations `14:*`** | **Hệ B — `XePrime/*` + audit §12** |
| --- | --- | --- |
| Gold thương hiệu | **`#d6a02c`** (`14:9`) | `#d4af37` (`125:1571`, `125:1611`, `122:2305`) |
| Chữ chính | **`#1a1a1a`** (`14:46`) | `#1a1612` |
| Chữ phụ | **`#6b6560`** (`14:50`) | `#615c54` |
| Error / Danger | **`#dc2626`** (`14:75`) | `#dc3545` |
| Nền trang | **`#faf9f7`** (`14:26`) | `#faf8f5` |
| Bo góc control | **10px** (`14:164`) | 8px |
| Bo góc modal | **10px** | 12px |
| Label form | **12px** (`14:137`) | 13px |
| Viền | `#e8e4dd` (`14:38`) | `#e8e4dd` ✓ *(bằng nhau)* |

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

Đã đo trong Wave 1A (brief 00 §16 ghi *“contrast ratios unverified”* — nay đã verified):

| Cặp | Tỉ lệ | Ghi chú |
| --- | --- | --- |
| `text-tertiary` trên nền trang | **2.72** | **Trượt từ trước Wave 1A** (bản cũ 2.99). Dùng cho biển số xe, nhãn thứ, dòng meta — là chữ mang thông tin |
| `warning` trên `warning-bg` | **2.81** | Trượt cả 3:1 |
| `success` trên `success-bg` | **3.15** | Đạt 3:1, trượt 4.5:1 |
| `error` trên `error-bg` | **4.41** | Sát ngưỡng |

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

| Thuộc tính | `122:3705` (12.19 Shared Overlay) | `130:1563` (12.32 Responsive Mapping) | Token Wave 1A (đang dùng) |
| --- | --- | --- | --- |
| Bo góc modal | **12px** | — | `--xp-border-radius` **10px** (Foundations `14:164`) |
| Nền mờ (scrim) | **`#000000` 50%** | **`rgba(26,22,18,0.4)`** | `--xp-color-bg-overlay` **`rgba(26,26,26,0.45)`** |
| Bề rộng drawer | **400px** | — | `--xp-drawer-width` **560px** / `-lg` 720px |
| Bề rộng modal | SM 400 · MD 560 · LG 720 | — | ✅ khớp |

**Batch 1 giữ token Wave 1A** theo chỉ thị “không đổi hệ token, không chuyển sang bộ Figma phụ”. Bo góc 12px và scrim `#000000` thuộc **Hệ B** (xem P15) nên bị loại theo cùng một lý do. `rgba(26,22,18,0.4)` của `130:1563` rất gần token đang dùng — chênh lệch không đáng kể.

Riêng **bề rộng drawer 400px** là mâu thuẫn thật và chưa thuộc P15: code hiện dùng 480/520/640/720, token nói 560/720, Figma nói 400. Batch 2 sẽ ép các panel về `md`/`lg` — **đây là thay đổi nhìn thấy được**, cần chốt trước khi migrate 7 panel.

### P21 — Vị trí toast: Figma bottom-right, AntD top-center 🟢

`122:3705` đặc tả toast **bottom-right, offset 24px, tự tắt sau 5 giây**. `App.useApp().message` của AntD mặc định **top-center, 3 giây**. Chỉ thị Wave 1B cấm bọc toast riêng, nên Batch 1 **không đụng**. Nếu sản phẩm muốn theo Figma thì cấu hình `message` ở `ConfigProvider` (một chỗ), không phải bọc component.

### D14 — Lỗi tiềm ẩn phát hiện khi khảo sát (KHÔNG sửa ở Batch 1)

Rule 12 cấm sửa lỗi không liên quan; ghi lại để Batch 2 xử đúng chỗ:

| # | Lỗi | Ở đâu |
| --- | --- | --- |
| D14.1 | `<Drawer size="88dvh">` — `size` của AntD chỉ nhận `'default' \| 'large'`; chiều cao phải là `height`. Bottom sheet hiện **không** cao 88dvh như ý định. **Có ở HAI file** (batch 1B.0 xác nhận) | [RequestBookingModal.tsx:51](../../apps/web/src/features/booking-requests/components/RequestBookingModal.tsx#L51) · [FilterPanel.tsx:367](../../apps/web/src/features/marketplace/components/FilterPanel.tsx#L367) |
| D14.2 | `title={null}` + `aria-label` → AntD **không** chuyển `aria-label` xuống phần tử `role="dialog"`, nên modal đăng nhập hiện **không có tên khả truy cập** | [AuthModal.tsx:143](../../apps/web/src/features/auth/components/AuthModal.tsx#L143) |
| D14.3 | `destroyOnClose` (tên AntD 5) vẫn còn dùng; AntD 6 là `destroyOnHidden` | [ReceiptFormDrawer.tsx:60](../../apps/web/src/features/finance/components/ReceiptFormDrawer.tsx#L60) + mọi modal chưa migrate |
| **D14.4** | `TextAreaField`, `NumberField`, `SelectField` dùng `Form.Item label` mà **không nối `htmlFor`** — khác `TextField` (brief 00 §16 ghi `TextField` có `useId()`). Hệ quả: ô nhập **không có tên khả truy cập**, và `getByLabelText` không tìm ra trong test | [TextAreaField.tsx](../../apps/web/src/components/form/TextAreaField.tsx) · phát hiện khi viết test batch 1B.2 |
| **D14.5** | Xoá danh mục thu/chi **không có bước xác nhận** — bấm là gọi mutation ngay. Hành động phá huỷ không hoàn tác được mà không hỏi lại | [CategoryManagerModal.tsx](../../apps/web/src/features/finance/components/CategoryManagerModal.tsx) |

### P22 — Bề rộng modal 520 → 560 sau khi migrate 🟢

Năm dialog đã migrate ở batch 1B.2 trước đây dùng bề rộng **mặc định của AntD (520px)**; nay dùng `size="md"` = **560px** (`--xp-modal-width`, Figma `125:1611`). Chênh **+40px** trên desktop.

Đây là hệ quả có chủ đích của quy tắc "không dùng bề rộng tuỳ tiện" — 520px không có trong thang token. Ghi lại để đợt QA thị giác không coi là hồi quy. Nếu sản phẩm muốn giữ 520 thì phải thêm một bậc token, không phải viết số trần trở lại.

Cả ba tự biến mất khi file chuyển sang `ResponsiveDialog`/`DetailDrawer` ở Batch 2 — `ResponsiveDialog` đã xử lý D14.2 bằng tiêu đề ẩn cho trình đọc màn hình thay vì `aria-label`.

---

## Việc tiếp theo

**Trước khi Wave 1A bắt đầu, cần:**

**Sau Wave 1A — cần trước khi bắt đầu Wave 1B:**

| Ai | Việc |
| --- | --- |
| **Chủ dự án + Thiết kế** | **P15** — xác nhận Hệ A (Foundations) là bộ giá trị đúng. Đây là câu hỏi gating lớn nhất hiện tại: nếu là Hệ B thì toàn bộ Wave 1A phải làm lại giá trị |
| **Chủ dự án** | **P18 / brief 00 Q7** — mức tuân thủ WCAG mục tiêu. Quyết định này mở khoá 4 cặp màu và màu link |
| **Bất kỳ ai** | Chạy gói **SMOKE** ở [07 §0](07_VISUAL_QA_MATRIX.md) — Wave 1A chưa QA thị giác được (cần app chạy thật) |
| **Kỹ thuật** | Xếp **T1** (lỗi CSS lịch) vào lịch làm |

**Vẫn còn từ Wave 0B:**

| Ai | Việc |
| --- | --- |
| **Chủ dự án** | Trả lời **P1** (sidebar) và **P3** (tablet). Hai câu này định hình phạm vi lớn nhất |
| ~~Kỹ thuật~~ | ~~**P8** (cơ chế breakpoint), **P7** (đổ bóng)~~ — ✅ đã chốt trong Wave 1A |
| **Kỹ thuật** | **P6** (heading) còn lại phần `ManagePageHeader` → Wave 1D |
| **Kỹ thuật** | **P5** — 4 token `*-bg` đã đọc và khai báo (`#f0fdf4`/`#fff7ed`/`#fef2f2`/`#eff6ff`); còn phải quyết `StatusTag` có bỏ preset AntD không, trước Wave 1C |
| **Kỹ thuật** | Inspect A2 để **P2** tự đóng nếu bộ 2 chỉ là nhãn nhóm |

**Có thể hoãn tới đúng wave dùng đến**: P4 (→3I) · P9/P10 (→3L) · P11 (→3I/3J) · P12 (→4) · F1–F8, F10–F12 (→wave module tương ứng).
