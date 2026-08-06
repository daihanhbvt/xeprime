# 02 — DESIGN TOKEN MAP

> Ngày lập: 06/08/2026 · Wave 0B.
> **Nguồn Figma**: section 01 Foundations (`14:2`), đọc trực tiếp từng swatch/frame trong phiên này. File Figma **không dùng Figma Variables** (`get_variable_defs` trên `14:2` trả `{}`) — giá trị nằm trong fill và text của swatch frame.
> **Nguồn code**: [apps/web/src/styles/tokens.css](../../apps/web/src/styles/tokens.css) + [apps/web/src/styles/theme.ts](../../apps/web/src/styles/theme.ts), giữ đồng bộ bởi [theme.test.ts](../../apps/web/src/styles/theme.test.ts).

## 0. Quy tắc

1. **Foundations (`14:*`) là nguồn giá trị duy nhất từ Figma.** Frame `122:2305` ("12.15 Token Consistency Audit") sai 5/7 màu và sai cả radius/type — chỉ đọc để lấy *danh sách*, không lấy *giá trị*. Bằng chứng ở [00_IMPLEMENTATION_OVERVIEW.md §9.1](00_IMPLEMENTATION_OVERVIEW.md).
2. **Mỗi thay đổi token phải sửa cả `tokens.css` và `theme.ts` trong cùng commit.** `theme.test.ts` so hai file; lệch một token là test đỏ.
3. **Token dẫn xuất không feed vào `antdTheme`.** `theme.ts` chỉ set seed token; chuỗi `gold-*`, `shadow-*`, `color-bg-sand` có trong `XP_TOKENS` để giữ parity nhưng không đưa vào `ConfigProvider`.
4. **Không sửa giá trị nào ngoài Wave 1A.** Đổi token giữa chừng làm mọi màn đã migrate phải QA lại.

**Cột "Migration action"**
`GIỮ` — Figma và code khớp, không làm gì · `ĐỔI` — sửa giá trị code theo Figma · `THÊM` — token mới, code chưa có · `TÊN` — cùng giá trị, khác tên → chuẩn hoá tên · `QUYẾT ĐỊNH` — chờ người chốt, chưa được đụng · `GIỮ-CODE` — code đúng, Figma sai/thiếu.

---

## 1. Màu — thương hiệu

| Figma token (node) | Ý nghĩa | Figma | Code token | Giá trị code | AntD token | Action | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--xp-color-primary` (`14:9`) | Gold thương hiệu | `#d6a02c` | `--xp-color-primary` | `#d6a02c` | `colorPrimary` | **GIỮ** ✅ | — |
| `--xp-color-primary-hover` (`14:13`) | Gold đậm khi hover | `#c4920f` | *(không có)* — gần nhất `--xp-gold-deep` `#a9761a` | `#a9761a` | AntD tự dẫn xuất | **THÊM** | **TB** — hiện AntD tự tính hover từ seed; thêm token này sẽ khiến hover nút AntD và hover CSS Module lệch nhau nếu chỉ thêm một nửa |
| `--xp-color-primary-light` (`14:17`) | Nền gold rất nhạt | `#fdf6e3` | `--xp-gold-wash` | `#f7f1de` | — | **ĐỔI + TÊN** | Thấp |
| `--xp-color-primary-text` (`14:21`) | Chữ trên nền gold | `#2a2318` | `--xp-color-text` | `#2a2318` | — | **GIỮ + TÊN** ✅ | Thấp — cùng giá trị, Figma tách vai trò riêng |

> Ghi chú: `--xp-gold-soft` `#f1dba4` và `--xp-color-bg-sand` `#f5ead2` (code) **không có** đối ứng Figma. `gold-soft` dùng cho scrollbar ([globals.css:74](../../apps/web/src/styles/globals.css#L74)) → **GIỮ-CODE**. `color-bg-sand` cần kiểm nơi dùng trước khi quyết định.

## 2. Màu — nền / chữ / viền

| Figma token (node) | Ý nghĩa | Figma | Code token | Giá trị code | AntD token | Action | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `--xp-color-bg` (`14:26`) | Nền trang | `#faf9f7` | `--xp-color-bg-layout` | `#f6f5f1` | `colorBgLayout` | **ĐỔI + TÊN** | **TB** — nền toàn app sáng lên; ảnh hưởng tương phản của mọi card trắng |
| `--xp-color-bg-elevated` (`14:30`) | Nền card/modal | `#ffffff` | `--xp-color-bg-elevated` (+ `-container`) | `#ffffff` | `colorBgElevated`, `colorBgContainer` | **GIỮ** ✅ | — |
| `--xp-color-bg-muted` (`14:34`) | Nền chìm (header bảng, ô disabled) | `#f5f3ef` | *(không có)* | — | — | **THÊM** | Thấp |
| `--xp-color-border` (`14:38`) | Viền mặc định | `#e8e4dd` | `--xp-color-border` | `#ebddbf` | `colorBorder` | **ĐỔI** | **CAO** — code dùng viền ám vàng, Figma dùng xám ấm trung tính. Đổi làm **mọi** đường kẻ bảng/input/card đổi tông. Thay đổi thị giác lan rộng thứ hai sau sidebar |
| `--xp-color-border-strong` (`14:42`) | Viền nhấn | `#d4cfc6` | *(không có)* — code có `--xp-color-border-secondary` `#f4ecd9` (nhạt HƠN, không phải đậm hơn) | — | `colorBorderSecondary` | **THÊM** | **TB** — code thiếu bậc "đậm hơn"; `border-secondary` là bậc nhạt, **không** thay thế được |
| `--xp-color-text` (`14:46`) | Chữ chính | `#1a1a1a` | `--xp-color-text` | `#2a2318` | `colorText` | **ĐỔI** | **TB** — Figma dùng đen trung tính, code dùng đen ám nâu. Ảnh hưởng mọi chữ |
| `--xp-color-text-secondary` (`14:50`) | Chữ phụ | `#6b6560` | `--xp-color-text-secondary` | `#6f6450` | `colorTextSecondary` | **ĐỔI** | Thấp |
| `--xp-color-text-tertiary` (`14:54`) | Chữ mờ | `#9e9890` | `--xp-color-text-tertiary` | `#9a8d74` | — | **ĐỔI** | Thấp — ⚠️ kiểm tương phản trên nền `#faf9f7`, xem §12 |
| *(không có)* | Nền hover | — | `--xp-color-bg-hover` | `rgba(120,90,20,.05)` | — | **GIỮ-CODE** | Thấp |

## 3. Màu — trạng thái nghiệp vụ

| Figma token (node) | Figma | Code token | Giá trị code | AntD token | Action |
| --- | --- | --- | --- | --- | --- |
| `--xp-color-success` (`14:59`) | `#16a34a` | `--xp-color-success` | `#16a34a` | `colorSuccess` | **GIỮ** ✅ |
| `--xp-color-warning` (`14:67`) | `#e07b26` | `--xp-color-warning` | `#e07b26` | `colorWarning` | **GIỮ** ✅ |
| `--xp-color-error` (`14:75`) | `#dc2626` | `--xp-color-error` | `#dc2626` | `colorError` | **GIỮ** ✅ |
| `--xp-color-info` (`14:83`) | `#2563eb` | `--xp-color-info` | `#2563eb` | `colorInfo` | **GIỮ** ✅ |
| `--xp-color-success-bg` (`14:63`) | *chưa đọc* | *(không có)* | — | — | **THÊM** — đọc giá trị ở Wave 1A |
| `--xp-color-warning-bg` (`14:71`) | *chưa đọc* | *(không có)* | — | — | **THÊM** |
| `--xp-color-error-bg` (`14:79`) | *chưa đọc* | *(không có)* | — | — | **THÊM** |
| `--xp-color-info-bg` (`14:87`) | *chưa đọc* | *(không có)* | — | — | **THÊM** |

**Risk cho nhóm `*-bg`: TB.** Hôm nay `StatusTag` dùng **AntD preset color** (`'green'`, `'gold'`, `'red'`…) qua `StatusMeta.color` ([status/meta.ts](../../packages/types/src/status/meta.ts)), tức nền tag do AntD sinh, không phải token XePrime. Thêm 4 token `*-bg` chỉ có nghĩa nếu đồng thời quyết định `StatusTag` có bỏ preset AntD hay không → **P5** trong [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md).

Bốn màu event lịch của code (`--xp-color-event-booking|request|blocked|maintenance`) **không có** đối ứng Figma → **GIỮ-CODE**.

## 4. Màu — vỏ portal (dark sidebar) ⚠️ THAY ĐỔI LỚN NHẤT

| Figma token (node) | Figma | Code | Action | Risk |
| --- | --- | --- | --- | --- |
| `--xp-shell-sidebar-bg` (`14:92`) | **`#1e1b16`** (gần đen ấm) | *(không có)* — [Sidebar.module.css:9](../../apps/web/src/components/layout/Sidebar.module.css#L9) dùng `--xp-color-bg-container` = **`#ffffff`** | **QUYẾT ĐỊNH** | **RẤT CAO** |
| `--xp-shell-sidebar-text` (`14:96`) | `#e8e4dd` | *(không có)* | **QUYẾT ĐỊNH** | ↑ |
| `--xp-shell-sidebar-active` (`14:100`) | `#d6a02c` | *(không có)* — hiện dùng `--xp-gold-wash` làm nền mục active | **QUYẾT ĐỊNH** | ↑ |
| `--xp-shell-topbar-bg` (`14:104`) | `#ffffff` | Topbar dùng `--xp-color-bg-container` `#ffffff` | **THÊM + GIỮ giá trị** ✅ | Thấp |
| `--xp-shell-topbar-border` (`14:108`) | *chưa đọc* | dùng `--xp-color-border` | **THÊM** | Thấp |

**Code hiện tại có sidebar SÁNG; Figma đặc tả sidebar TỐI.** Foundations còn có 3 frame vỏ (`14:1423` full · `14:1531` collapsed · `14:1619` mobile) và section 05 có `59:871` `Shell/Sidebar` khai báo 11 biến thể "active page".

Đây **không phải** thay đổi token đơn thuần — nó lật ngược tông màu của mọi trang `/manage` (25/39 route), kéo theo: contrast của logo, màu icon menu, màu badge trên nền tối, `MobileNav` drawer, và `ManageUserCard`. → **P1**, quyết định gating của cả Wave 1D.

## 5. Typography

**Họ chữ** (`14:112`): *Be Vietnam Pro (system) · Playfair Display Italic (hero only)*.

| | Figma | Code | Action |
| --- | --- | --- | --- |
| Font hệ thống | Be Vietnam Pro | `--xp-font-family` = `var(--font-be-vietnam), 'Segoe UI', system-ui, …` ([layout.tsx](../../apps/web/src/app/layout.tsx)) | **GIỮ** ✅ |
| Font hero | Playfair Display *Italic* | `--font-playfair` **có** khai báo qua `next/font/google`, nhưng **chỉ dùng trực tiếp trong 3 CSS Module** (`HeroSearch`, `ShopHeader`, `ShopVehicleGrid`) — **không có token `--xp-*`** | **THÊM** `--xp-font-family-display` |

**Thang chữ** — code **không có token thang chữ nào**. Chỉ có `--xp-font-size` (14px) và `--xp-font-size-sm` (12px).

| Figma (node) | Size/Line | Weight | Dùng cho | Code tương ứng | Action |
| --- | --- | --- | --- | --- | --- |
| `type/Display` (`14:113`) | 48 / 56 | Bold | Hero headline | — | **THÊM** |
| `type/H1` (`14:116`) | 32 / 40 | Bold | Tiêu đề trang | — (AntD `Typography.Title level={3}` trong `ManagePageHeader`) | **THÊM** + xem §5.1 |
| `type/H2` (`14:119`) | 24 / 32 | SemiBold | Tiêu đề section | — | **THÊM** |
| `type/H3` (`14:122`) | 20 / 28 | SemiBold | Tiêu đề card, heading modal | — | **THÊM** |
| `type/H4` (`14:125`) | *chưa đọc* | — | — | — | **THÊM** |
| `type/Body L` (`14:128`) | *chưa đọc* | — | — | — | **THÊM** |
| `type/Body M` (`14:131`) | **14 / 20** | Regular | Ô bảng, label form | `--xp-font-size` 14px + `--xp-line-height` 1.5714 (= 22px) | **ĐỔI line-height** |
| `type/Body S` (`14:134`) | *chưa đọc* | — | — | — | **THÊM** |
| `type/Label` (`14:137`) | **12 / 16** | Medium | Badge, chip, tag | `--xp-font-size-sm` 12px (không có weight/line-height) | **THÊM weight+lh** |
| `type/Overline` (`14:140`) | *chưa đọc* | — | — | — | **THÊM** |

**⚠️ Lệch line-height Body M**: Figma 14/20 = 1.4286; code `--xp-line-height` 1.5714 → 22px. **Risk CAO** — đổi line-height làm mọi hàng bảng và mọi form cao/thấp khác đi, tức mọi ảnh chụp QA cũ mất giá trị. Phải đổi ở Wave 1A hoặc không đổi bao giờ.

### 5.1 Xung đột `ManagePageHeader` ↔ H1

[ManagePageHeader.tsx:27](../../apps/web/src/components/layout/ManagePageHeader.tsx#L27) dùng `<Typography.Title level={3}>`, tức AntD `h3` (mặc định 24px) — trong khi vai trò ngữ nghĩa là **tiêu đề trang = H1 (32/40)**. Wave 1A phải chốt: đổi sang `level={1}` + token, hay giữ 24px và ghi nhận Figma khác. → **P6**.

## 6. Spacing

| Figma (node) | Giá trị | Code token | Giá trị code | Action |
| --- | --- | --- | --- | --- |
| `spacing/4` (`14:144`) | 4px | `--xp-space-xs` | 4px | **GIỮ** ✅ |
| `spacing/8` (`14:147`) | 8px | `--xp-space-sm` | 8px | **GIỮ** ✅ |
| `spacing/16` (`14:150`) | 16px | `--xp-space-md` | 16px | **GIỮ** ✅ |
| `spacing/24` (`14:153`) | 24px | `--xp-space-lg` | 24px | **GIỮ** ✅ |
| `spacing/32` (`14:156`) | 32px | `--xp-space-xl` | 32px | **GIỮ** ✅ |

Nhãn `14:143` ghi rõ: **"4 · 8 · 16 · 24 · 32 px only"**. Thang spacing là phần **khớp hoàn hảo** duy nhất giữa Figma và code. **Risk: không.**

Việc cần làm không phải đổi token mà là **ép dùng**: các `.module.css` hiện còn rải `padding: 6px 8px 10px` ([Sidebar.module.css:27](../../apps/web/src/components/layout/Sidebar.module.css#L27)), `0 14px`, `height: 56px` bằng số trần. → Wave 1A quét và thay bằng `var(--xp-space-*)`.

## 7. Bo góc

| Figma (node) | Giá trị | Dùng cho | Code token | Action |
| --- | --- | --- | --- | --- |
| `radius/Small` (`14:160`) | **6px** | Chip, badge, phần tử trong | `--xp-border-radius-sm` 6px | **GIỮ** ✅ |
| `radius/Default` (`14:164`) | **10px** | Card, input, modal | `--xp-border-radius` 10px → AntD `borderRadius` | **GIỮ** ✅ |
| `radius/Pill` (`14:168`) | **999px** | Pill, avatar | *(không có)* — code viết `border-radius: 999px` trực tiếp ([globals.css:87](../../apps/web/src/styles/globals.css#L87)) | **THÊM** `--xp-border-radius-pill` |

> Nhắc lại: `122:2305` nói "radius-md 8px" — **sai**, Foundations nói 10px và code cũng 10px.

## 8. Đổ bóng

| Figma (node) | Ý nghĩa | Code token | Giá trị code | Action |
| --- | --- | --- | --- | --- |
| `shadow/Elevation 1` (`14:173`) | Card nghỉ | `--xp-shadow-sm` | `0 1px 2px rgba(120,88,20,.06), 0 1px 3px rgba(120,88,20,.08)` | **XÁC MINH** |
| `shadow/Elevation 2` (`14:176`) | Dropdown, popover | `--xp-shadow-md` | `0 6px 16px -6px rgba(120,88,20,.18), 0 2px 6px rgba(120,88,20,.1)` | **XÁC MINH** |
| `shadow/Elevation 3` (`14:179`) | Modal, drawer | `--xp-shadow-lg` | `0 24px 50px -16px rgba(120,88,20,.28)` | **XÁC MINH** |

Nhãn `14:172`: *"Warm brown tones (not pure black)"* — **khớp ý đồ** với code (`rgba(120,88,20,…)`). Số tầng khớp (3↔3). Giá trị chính xác chưa đọc (swatch shadow không hiện text) → Wave 1A dùng `get_design_context` trên 3 node này.

**Risk: Thấp.** Ba tầng bóng của code hiện **chỉ dùng trong CSS Module**, không feed vào AntD — mà modal/drawer/dropdown của AntD dùng bóng riêng của nó. Tức hôm nay **có hai hệ đổ bóng song song**. → **P7**.

## 9. Breakpoint ⚠️

| Figma (node) | Dải | Cột | Gutter | Code |
| --- | --- | --- | --- | --- |
| `breakpoint/Mobile` (`14:183`) | **≤ 640px** | 4 | 16px | `useIsMobile()` = `(max-width: 640px)` ✅ |
| `breakpoint/Tablet` (`14:186`) | **641–1024px** | 8 | 24px | *(không có)* |
| `breakpoint/Desktop` (`14:189`) | **1025–1440px** | 12 | 24px | *(không có)* |
| `breakpoint/Wide` (`14:192`) | **> 1440px** | 12 | 32px | *(không có)* |

**Code không có một token breakpoint nào.** Thay vào đó là **21 giá trị rời rạc hard-code** trong `.module.css`:

```
1120px(8) · 560px(8) · 760px(6+5) · 640px(5+2) · 480px(5+1) · 992px(4) · 420px(4)
900px(4) · 768px(3) · 800px(2) · 576px(2) · 960px(1+1) · 1080px · 1040px · 1000px
860px · 840px · 720px · 440px · … (+ 200/220/180/160/150/130px cho grid nội bộ component)
```

Điểm gãy quan trọng nhất bị lệch: **`Sidebar` ẩn ở `max-width: 992px`** ([Sidebar.module.css:31](../../apps/web/src/components/layout/Sidebar.module.css#L31)), trong khi Figma đặt ranh Tablet/Desktop ở **1024px**. Tức ở 993–1024px code hiện desktop-sidebar còn Figma coi là tablet.

| Action | Chi tiết |
| --- | --- |
| **THÊM** | `--xp-bp-mobile: 640px` · `--xp-bp-tablet: 1024px` · `--xp-bp-desktop: 1440px` |
| **QUYẾT ĐỊNH** | CSS custom property **không dùng được trong `@media`** — phải chọn cơ chế: (a) chỉ dùng biến TS + tài liệu, `@media` vẫn viết số nhưng chỉ được dùng 3 số đó; (b) thêm bước build (PostCSS custom-media). → **P8** |
| **Risk** | **CAO** — gom 21 điểm gãy về 3 sẽ đổi bố cục ở nhiều màn cùng lúc. Phải làm sớm (Wave 1A), từng file, có ảnh trước/sau |

Xem thêm: chỉ 10/39 route có frame tablet → **P3**.

## 10. Focus & Disabled

| Figma (node) | Đặc tả | Code | Action | Risk |
| --- | --- | --- | --- | --- |
| `state/focus-ring` (`14:196` + chú thích `14:197`) | **2px viền gold + 3px ring gold (25% α)** | [globals.css:66-69](../../apps/web/src/styles/globals.css#L66-L69): `:focus-visible { outline: 2px solid var(--xp-color-primary); outline-offset: 2px }` | **ĐỔI** | **TB** — `outline` 2px + offset ≠ viền 2px + ring 3px 25%. Đổi sang `box-shadow: 0 0 0 3px rgba(214,160,44,.25)` + `border-color` sẽ hợp Figma hơn nhưng **mất** hành vi `outline` (không bị `overflow:hidden` cắt). Cần thử trên phần tử trong bảng có scroll |
| `state/disabled` (`14:198` + chú thích `14:199`) | **60% opacity + nền muted + no pointer-events** | *(không có quy tắc chung)* — dựa hoàn toàn vào AntD | **THÊM** | Thấp |

**THÊM** token: `--xp-focus-ring-width: 3px` · `--xp-focus-ring-color: rgba(214,160,44,.25)` · `--xp-disabled-opacity: .6`.

## 11. Kích thước component & lớp overlay

### 11.1 Kích thước khung app — chỉ có ở code

| Code token | Giá trị | Figma | Action |
| --- | --- | --- | --- |
| `--xp-shell-topbar-height` | 56px | `14:1423`/`14:1531` (chưa đo) | **XÁC MINH** |
| `--xp-shell-sidebar-width` | 232px | `47:5` sidebar-expanded = **240px** | **XÁC MINH → có thể ĐỔI** |
| `--xp-shell-sidebar-collapsed-width` | 64px | `47:77` sidebar-collapsed = **64px** ✅ | **GIỮ** ✅ |

⚠️ `47:5` rộng **240px**, code **232px**. Lệch 8px — đúng một bậc spacing. Wave 1D xác minh bằng `get_design_context`.

### 11.2 Kích thước lịch — chỉ có ở code

`--xp-calendar-resource-col-width` 220px · `--xp-calendar-day-col-width` 56px · `--xp-calendar-row-height` 44px · `--xp-calendar-header-height` 56px.

Figma section 06 có `72:5809`/`72:6073` nhưng chưa đo. **Đặc biệt lưu ý**: 4 token này được `XP_METRICS` chuyển sang number cho `@tanstack/react-virtual` và hàm tính vị trí event bar ([theme.ts:101-106](../../apps/web/src/styles/theme.ts#L101-L106)). **Đổi bất kỳ giá trị nào phải chạy lại [calendar-position.test.ts](../../apps/web/src/features/calendar/utils/calendar-position.test.ts).** → Action: **XÁC MINH**, và nếu lệch thì đẩy sang wave calendar riêng, **không** gộp vào Wave 1A.

### 11.3 Lớp overlay / z-index

| Code token | Giá trị | Dùng ở | Figma |
| --- | --- | --- | --- |
| `--xp-z-sidebar` | 110 | `Sidebar` | — |
| `--xp-z-topbar` | 100 | `Topbar`, `MarketHeader`, `MobileNav`, `MobileTabBar` | — |
| `--xp-z-calendar-header` | 30 | lịch | — |
| `--xp-z-calendar-sticky-col` | 20 | lịch | — |

**Chưa token hoá**: z-index của modal/drawer/popover/tooltip — hoàn toàn do AntD quản (`zIndexPopupBase` mặc định 1000). Ngoài ra còn z-index trần rải rác: `CalendarScheduler.module.css` (2,3,4,5), `VehicleCard.module.css` (1,2), `ImageGalleryField.module.css` (10), `HeroSearch.module.css` (1).

Figma section 12 có `122:3705` `shared-overlay` và `130:1563` `overlay-responsive-mapping` — **phải đọc ở Wave 1B** trước khi làm overlay.

| Action | Chi tiết |
| --- | --- |
| **THÊM** | `--xp-z-overlay-backdrop` / `--xp-z-overlay-panel` **chỉ khi** `122:3705` cho thấy có overlay tự dựng nằm ngoài AntD |
| **GIỮ-CODE** | 4 token z hiện tại đủ dùng cho vỏ app |
| **Risk** | **TB** — sidebar (110) < AntD popup base (1000). Đúng thứ tự. Nhưng nếu Wave 1D chuyển sidebar sang overlay ở tablet thì phải xét lại |

---

## 12. Kiểm tra tương phản bắt buộc (Wave 1A)

Đổi đồng thời `color-text`, `color-bg`, `color-text-tertiary` thì các cặp sau **phải** đo lại WCAG AA (4.5:1 chữ thường, 3:1 chữ lớn/UI):

| Nền | Chữ | Ghi chú |
| --- | --- | --- |
| `#faf9f7` (bg mới) | `#9e9890` (tertiary mới) | **Nghi ngờ trượt AA** — xám nhạt trên nền gần trắng |
| `#faf9f7` | `#6b6560` (secondary mới) | |
| `#d6a02c` (primary) | `#2a2318` (primary-text) | Nút primary — Figma `125:1571` cho thấy chữ **tối** trên nền gold, không phải trắng |
| `#1e1b16` (sidebar mới) | `#e8e4dd` (sidebar-text) | Nếu P1 chốt sidebar tối |
| `#1e1b16` | `#d6a02c` (sidebar-active) | |

Figma có sẵn 4 frame audit a11y (`103:1989`, `113:2044`, `134:2736`, `65:5835`) — đọc trước khi tự đo.

---

## 13. Tổng kết

| Nhóm | GIỮ ✅ | ĐỔI | THÊM | QUYẾT ĐỊNH | XÁC MINH |
| --- | --- | --- | --- | --- | --- |
| Màu thương hiệu | 2 | 1 | 1 | — | — |
| Màu nền/chữ/viền | 2 | 5 | 2 | — | — |
| Màu trạng thái | 4 | — | 4 | — | — |
| Vỏ portal | — | — | 2 | **3** | — |
| Typography | 1 | 2 | ~10 | — | — |
| Spacing | 5 | — | — | — | — |
| Radius | 2 | — | 1 | — | — |
| Shadow | — | — | — | — | 3 |
| Breakpoint | — | — | 3 | **1** (cơ chế) | — |
| Focus/Disabled | — | 1 | 3 | — | — |
| Kích thước | 1 | — | — | — | 6 |
| Overlay | 4 | — | 0–2 | — | — |
| **Tổng** | **21** | **9** | **~29** | **4** | **9** |

**Ba việc rủi ro cao nhất, làm trước và tách commit riêng:**
1. `--xp-color-border` `#ebddbf` → `#e8e4dd` (chạm mọi đường kẻ)
2. Gom 21 breakpoint về 3
3. Sidebar tối — **chờ P1**, không tự quyết
