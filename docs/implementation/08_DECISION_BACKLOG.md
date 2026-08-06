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

## Việc tiếp theo

**Trước khi Wave 1A bắt đầu, cần:**

| Ai | Việc |
| --- | --- |
| **Chủ dự án** | Trả lời **P1** (sidebar) và **P3** (tablet). Hai câu này định hình phạm vi lớn nhất |
| **Kỹ thuật** | Tự chốt **P8** (cơ chế breakpoint), **P7** (đổ bóng), **P6** (heading) — có khuyến nghị sẵn ở trên |
| **Kỹ thuật** | Đọc `14:63/71/79/87` để **P5** tự đóng nếu giá trị gần preset AntD |
| **Kỹ thuật** | Inspect A2 để **P2** tự đóng nếu bộ 2 chỉ là nhãn nhóm |

**Có thể hoãn tới đúng wave dùng đến**: P4 (→3I) · P9/P10 (→3L) · P11 (→3I/3J) · P12 (→4) · F1–F8, F10–F12 (→wave module tương ứng).
