# Design Token Map — hợp đồng token của XePrime

> Trước 21/08/2026 file này là `docs/implementation/02_DESIGN_TOKEN_MAP.md`. Bộ `docs/implementation/`
> (kế hoạch migration Figma→code, Wave 0A/0B) đã **nghỉ hưu** khi migration thi công xong; đây là file
> DUY NHẤT còn hiệu lực và được giữ lại, vì nó là hợp đồng token đang được
> [`theme.test.ts`](../apps/web/src/styles/theme.test.ts) cưỡng chế (lệch một token giữa
> `tokens.css` và `theme.ts` là test đỏ). §21 dưới cùng giữ ba quyết định mà mã nguồn còn dẫn chiếu.

> **Trạng thái: Wave 1A ĐÃ TRIỂN KHAI** · Cập nhật 06/08/2026 (bản Wave 0B là kế hoạch; bản này là hiện trạng đã code).
> **Nguồn Figma**: section 01 “XePrime Foundations” (`14:2`), đọc ở cấp node. File **không dùng Figma Variables** (`get_variable_defs` trên `14:2` trả `{}`) — giá trị nằm trong fill/text của swatch.
> **Nguồn code** (từ 24/08/2026 token sống ở package dùng chung cho web + app native):
> [tokens/index.ts](../packages/ui/src/tokens/index.ts) ↔ [tokens.css](../packages/ui/src/styles/tokens.css)
> (`@xeprime/ui`), giữ đồng bộ bởi [theme.test.ts](../apps/web/src/styles/theme.test.ts) (19 test).
> Web ánh xạ sang AntD ở [theme.ts](../apps/web/src/styles/theme.ts) (`antdTheme` + re-export API cũ).

## 0. Hợp đồng

1. **Foundations `14:*` là nguồn GIÁ TRỊ token duy nhất.** Xem §13 (P15) về bộ giá trị thứ hai trong cùng file Figma.
2. **Mọi thay đổi token sửa cả `tokens.css` và `theme.ts` trong cùng commit.** `theme.test.ts` so key-set và value; lệch một token là test đỏ.
3. **Không nhân đôi nguồn.** Bí danh deprecated trỏ `var()` về token canonical — có test chặn việc gán giá trị thật cho bí danh.
4. **Token nào Figma không định nghĩa thì để AntD dẫn xuất**, không tự chế (vì thế `colorTextDisabled` và `colorLink` vắng mặt trong `antdTheme`).

---

## 1. Màu — thương hiệu ✅

| Token canonical | Giá trị | Figma | AntD | Ghi chú |
| --- | --- | --- | --- | --- |
| `--xp-color-primary` | `#d6a02c` | `14:9` | `colorPrimary` | Không đổi so với trước Wave 1A |
| `--xp-color-primary-hover` | `#c4920f` | `14:13` | `colorPrimaryHover` | **Mới** — trước đây AntD tự tính ra `#e3ba54` (sáng hơn); giờ hover **đậm hơn** theo Figma |
| `--xp-color-primary-active` | `#a9761a` | — | `colorPrimaryActive` | Tái dùng `gold-deep` đã có, không chế màu mới |
| `--xp-color-primary-light` | `#fdf6e3` | `14:17` | — | Nền gold rất nhạt |
| `--xp-color-primary-contrast` | `#2a2318` | `14:21` | — | **Chữ tối trên nền gold** (Figma `125:1571` xác nhận), không phải trắng |

## 2. Màu — bề mặt ✅

| Token canonical | Giá trị | Figma | AntD |
| --- | --- | --- | --- |
| `--xp-color-bg` | `#faf9f7` | `14:26` | `colorBgLayout` |
| `--xp-color-bg-container` | `#ffffff` | — | `colorBgContainer` |
| `--xp-color-bg-elevated` | `#ffffff` | `14:30` | `colorBgElevated` + seed `colorBgBase` |
| `--xp-color-bg-muted` | `#f5f3ef` | `14:34` | — |
| `--xp-color-bg-selected` | `#fdf6e3` | = `primary-light` | — |
| `--xp-color-bg-overlay` | `rgba(26,26,26,.45)` | — | `colorBgMask` |

> `colorBgBase` ánh xạ về **`#ffffff`** (bề mặt container), không phải nền trang. Đặt nền trang làm base sẽ nhuộm ấm mọi bề mặt trắng — nền trang thuộc `colorBgLayout`.

## 3. Màu — chữ ✅

| Token canonical | Giá trị | Figma | AntD |
| --- | --- | --- | --- |
| `--xp-color-text` | `#1a1a1a` | `14:46` | `colorText` + seed `colorTextBase` |
| `--xp-color-text-secondary` | `#6b6560` | `14:50` | `colorTextSecondary` |
| `--xp-color-text-tertiary` | `#9e9890` | `14:54` | `colorTextTertiary` |
| `--xp-color-text-disabled` | `rgba(26,26,26,.25)` | — | *(không set — AntD dẫn xuất từ `colorTextBase`, ra đúng giá trị này)* |
| `--xp-color-text-inverse` | `#e8e4dd` | `14:96` | — |
| `--xp-color-link` | `#2563eb` | — | *(không set — xem P19)* |
| `--xp-color-link-hover` | `#7aadff` | — | *(không set)* |

## 4. Màu — viền ✅

| Token canonical | Giá trị | Figma | AntD |
| --- | --- | --- | --- |
| `--xp-color-border` | `#e8e4dd` | `14:38` | `colorBorder` |
| `--xp-color-border-strong` | `#d4cfc6` | `14:42` | — |
| `--xp-color-border-subtle` | `#f5f3ef` | *dẫn xuất* | `colorBorderSecondary` |
| `--xp-color-border-focus` | `#d6a02c` | `14:196` | — |
| `--xp-color-border-disabled` | `#e8e4dd` | — | — |

> **`border-subtle` là giá trị dẫn xuất, không phải token Figma.** Foundations chỉ có 2 bậc viền (default + strong), không có bậc mảnh hơn. Thay vì chế màu mới, token này tái dùng tông `color-bg-muted` (`14:34`). Ghi nhận ở **P17**.

## 5. Màu — tương tác ✅

| Token canonical | Giá trị | Nguồn |
| --- | --- | --- |
| `--xp-color-bg-hover` | `rgba(120,90,20,.05)` | giữ nguyên bản đang chạy |
| `--xp-color-bg-active` | `rgba(120,90,20,.10)` | dẫn xuất từ hover |
| `--xp-disabled-opacity` | `0.6` | `14:199` |

## 6. Màu — trạng thái nghiệp vụ ✅

**Không token nào trong nhóm này dùng sắc gold thương hiệu** — trạng thái phải đọc được mà không dựa vào màu thương hiệu. Có test chặn (`theme.test.ts` › “gold thương hiệu không mang nghĩa success/warning/error”).

| Token | Giá trị | Figma | AntD |
| --- | --- | --- | --- |
| `--xp-color-success` / `-bg` | `#16a34a` / `#f0fdf4` | `14:59` / `14:63` | `colorSuccess` / `colorSuccessBg` |
| `--xp-color-warning` / `-bg` | `#e07b26` / `#fff7ed` | `14:67` / `14:71` | `colorWarning` / `colorWarningBg` |
| `--xp-color-error` / `-bg` | `#dc2626` / `#fef2f2` | `14:75` / `14:79` | `colorError` / `colorErrorBg` |
| `--xp-color-info` / `-bg` | `#2563eb` / `#eff6ff` | `14:83` / `14:87` | `colorInfo` / `colorInfoBg` |
| `--xp-color-neutral` / `-bg` | `#6b6560` / `#f5f3ef` | tái dùng | — |

> `StatusTag` **vẫn dùng AntD preset color** qua `StatusMeta.color` ([status/meta.ts](../packages/types/src/status/meta.ts)) — Wave 1A không đổi hợp đồng đó. Bốn token `*-bg` hiện chưa có consumer nào; chúng tồn tại để `Alert`/banner và `EmptyState` dùng ở wave sau. Xem **P5**.

## 7. Màu — vỏ portal ⚠️ khai báo, CHƯA áp dụng

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-shell-sidebar-bg` | `#1e1b16` | `14:92` |
| `--xp-shell-sidebar-text` | `#e8e4dd` | `14:96` |
| `--xp-shell-sidebar-active` | `#d6a02c` | `14:100` |
| `--xp-shell-topbar-bg` | `#ffffff` | `14:104` |
| `--xp-shell-topbar-border` | `#e8e4dd` | `14:108` |

**[Sidebar.module.css](../apps/web/src/components/layout/Sidebar.module.css) vẫn dùng `--xp-color-bg-container` (sáng).** Bật sidebar tối là quyết định **P1**, thuộc Wave 1D. Token đã sẵn nên khi P1 chốt chỉ phải đổi CSS Module, không phải đổi token.

## 8. Typography ✅

Font: `--xp-font-family` (Be Vietnam Pro) · `--xp-font-family-display` (Playfair Display, `14:112` “hero only”). **Mới**: trước Wave 1A `--font-playfair` được 3 CSS Module dùng trực tiếp mà không có token.

| Bậc | size / line-height | Weight | Figma | Dùng cho |
| --- | --- | --- | --- | --- |
| `display` | 48 / 56 | Bold | `14:113` | Hero |
| `h1` | 32 / 40 | Bold | `14:116` | Tiêu đề trang |
| `h2` | 24 / 32 | SemiBold | `14:119` | Tiêu đề section |
| `h3` | 20 / 28 | SemiBold | `14:122` | Tiêu đề card / modal |
| `h4` | 16 / 24 | SemiBold | `14:125` | Subsection, header bảng |
| `body-lg` | 16 / 24 | Regular | `14:128` | Body mặc định |
| `body` | 14 / 20 | Regular | `14:131` | Ô bảng, label form |
| `body-sm` | 12 / 16 | Regular | `14:134` | Caption, help text |
| `label` | 12 / 16 | Medium | `14:137` | Badge, chip, tag |
| `overline` | 11 / 16 | Medium | `14:140` | Section kicker |

Weight: `--xp-font-weight-{regular,medium,semibold,bold}` = 400/500/600/700.

AntD: `fontSizeHeading1..5` ← 32/24/20/16/14 · `fontSizeLG` ← 16 · `fontSizeSM` ← 12 · `fontSize` ← 14.
Ảnh hưởng thực tế nhỏ: chỉ **2 chỗ** dùng `Typography.Title` ([ManagePageHeader](../apps/web/src/components/layout/ManagePageHeader.tsx) `level={3}` → 24px thành **20px**, [ShopRegistration](../apps/web/src/features/shop/components/ShopRegistration.tsx) `level={4}` → 20px thành **16px**).

### ⚠️ Nợ: `--xp-line-height` toàn cục
`--xp-line-height` = **1.5714** (→22px) là giá trị AntD đang chạy; Figma `body` là **14/20** (1.4286). Chưa đổi vì nó làm lệch chiều cao **mọi** hàng bảng và **mọi** form — cần QA thị giác mà Wave 1A không có. Token `--xp-line-height-body` (20px) đã có sẵn cho component dùng. **Đích: wave có QA thị giác (sớm nhất là 1C khi làm `DataTable`).**

## 9. Spacing ✅ — không đổi

`--xp-space-{xs,sm,md,lg,xl}` = 4/8/16/24/32. Khớp Figma `14:144`–`14:156` (“4 · 8 · 16 · 24 · 32 px only”) từ trước Wave 1A. **Việc còn lại không phải đổi token mà là ép dùng** — vẫn còn số trần trong `.module.css` (`padding: 6px 8px 10px`, `0 14px`…). Dời dần khi chạm file.

## 10. Radius ✅

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-border-radius-sm` | 6px | `14:160` — chip, badge |
| `--xp-border-radius` | 10px | `14:164` — card, input, modal |
| `--xp-border-radius-lg` | 10px | ↑ cùng bậc |
| `--xp-border-radius-pill` | 999px | `14:168` — **mới**, trước viết `999px` trần |

⚠️ **Thay đổi nhìn thấy được**: AntD `borderRadiusLG` trước đây tự dẫn xuất ra **12px**; giờ là **10px** vì Figma nói card/modal = 10. Card và modal bo tròn ít hơn một chút.

## 11. Shadow ✅ — giá trị mới từ Figma

| Token | Giá trị | Figma | Dùng cho | AntD |
| --- | --- | --- | --- | --- |
| `--xp-shadow-card` | `0 2px 4px 0 rgba(41,31,15,.06)` | `14:173` | Card nghỉ | `boxShadow`, `boxShadowTertiary` |
| `--xp-shadow-raised` | `0 4px 12px 0 rgba(41,31,15,.08)` | `14:176` | Hover, dropdown | `boxShadowSecondary` |
| `--xp-shadow-overlay` | `0 8px 24px 0 rgba(41,31,15,.12)` | `14:179` | Modal, drawer | — |

**Giải quyết P7 (hai hệ đổ bóng song song).** Trước Wave 1A: CSS Module dùng bóng nâu ấm, AntD dùng bóng xám ba lớp — hai hệ khác nhau cạnh nhau. Giờ cả hai lấy từ Elevation 1/2/3 của Figma.

## 12. Focus ✅

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-focus-outline-width` | 2px | `14:197` |
| `--xp-focus-ring-width` | 3px | `14:197` |
| `--xp-color-focus-ring` | `rgba(214,160,44,.25)` | `14:197` |

- **Phần tử thường**: [globals.css](../apps/web/src/styles/globals.css) `:focus-visible` = `outline` 2px gold + `box-shadow` ring 3px 25%. Giữ `outline` làm lớp chính để không bị `overflow:hidden` của bảng cắt mất.
- **Control AntD**: `controlOutline` = ring 25%, `controlOutlineWidth` = 3 (trước là `rgba(255,222,5,.06)` / 2px — vòng focus cũ gần như vô hình).

## 13. Breakpoint ✅ — token + JS, KHÔNG viết lại CSS hàng loạt

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-bp-mobile` | 640px | `14:183` — ≤640 · 4 cột · gutter 16 |
| `--xp-bp-tablet` | 1024px | `14:186` — 641–1024 · 8 cột · gutter 24 |
| `--xp-bp-desktop` | 1440px | `14:189` — 1025–1440 · 12 cột; >1440 = wide (`14:192`) |

`XP_BREAKPOINTS` (số) trong `theme.ts` là nguồn cho JS. [use-media-query.ts](../apps/web/src/hooks/use-media-query.ts) giờ có `useIsMobile()` (suy ra từ token, không gõ số), `useIsTablet()`, `useIsDesktop()`.

**Quyết định P8 đã chốt: KHÔNG gom 21 breakpoint CSS trong Wave 1A.** Design-brief 00 §9.4 chỉ định rõ: *“One breakpoint scale expressed as tokens and consumed by both CSS and `useMediaQuery`, **with existing values migrated as files are touched rather than in a bulk change**.”* Brief thắng kế hoạch Wave 0B. Việc còn lại: mỗi khi chạm một `.module.css`, thay điểm gãy của nó về 640/1024/1440.

## 14. Tầng z / overlay ✅

| Token | Giá trị | Sở hữu |
| --- | --- | --- |
| `--xp-z-sidebar` · `--xp-z-topbar` | 110 · 100 | XePrime (vỏ app) |
| `--xp-z-calendar-header` · `--xp-z-calendar-sticky-col` | 30 · 20 | XePrime (lịch) |
| `--xp-z-popup-base` | 1000 | **AntD** — soi lại `zIndexPopupBase` |

**AntD sở hữu tầng overlay** (modal/drawer/dropdown/popover/toast) qua `zIndexPopupBase`, giờ set tường minh = 1000. `--xp-z-popup-base` chỉ để CSS Module định vị tương đối mà không phải đoán — có test khẳng định hai bên bằng nhau. Không tạo tầng overlay riêng của XePrime.

## 15. Kích thước component ✅ — khai báo, chưa áp

| Token | Giá trị | Nguồn |
| --- | --- | --- |
| `--xp-control-height-sm` / `` / `-lg` | 24 / **32** / 40 px | 32 = chiều cao đang chạy |
| `--xp-touch-target-min` | 44px | WCAG 2.5.5 |
| `--xp-modal-width-sm` / `` / `-lg` | 400 / 560 / 720 px | `125:1611` SM/MD/LG |
| `--xp-drawer-width` / `-lg` | 560 / 720 px | căn theo modal |
| `--xp-container-max-width` | **1280px** | `117:1203`, `127:2060` vẽ 1200 — nới lên 1280 (14/08/2026) cho mọi trang; marketplace bỏ số 1120 gõ tay, dùng chung token này |
| `--xp-shell-form-max-width` | **1216px** | `60:69` FormColumn thụt 64px so với workspace → đi theo 1280 |

⚠️ **`controlHeight` giữ 32px, KHÔNG đổi thành 40.** Figma `125:1571` (button `padding: 10px 20px`, chữ 15px) và `125:2691` (input `padding: 10px 12px`) đều ra ~40px = AntD `size="large"`. Đổi mặc định sang 40 làm cao lên **mọi** input/button/select ở 37 trang — thuộc wave component, không phải wave token. Ghi ở **P16**.

## 16. Bí danh deprecated

Mỗi bí danh trỏ `var()` về token canonical → **không có giá trị nào bị nhân đôi**. `theme.test.ts` có test chặn việc gán giá trị thật cho bí danh.

| Bí danh (deprecated) | → Canonical | Consumer còn lại | Wave gỡ |
| --- | --- | --- | --- |
| `--xp-color-bg-layout` | `--xp-color-bg` | 13 | 3x (khi chạm file) |
| `--xp-color-border-secondary` | `--xp-color-border-subtle` | 31 | 3x |
| `--xp-gold-deep` | `--xp-color-primary-active` | 45 | 3x |
| `--xp-gold-wash` | `--xp-color-primary-light` | 19 | 3x |
| `--xp-color-bg-sand` | `--xp-color-primary-light` | 10 | 3x |
| `--xp-shadow-sm` | `--xp-shadow-card` | 13 | 3x |
| `--xp-shadow-md` | `--xp-shadow-raised` | 8 | 3x |
| `--xp-shadow-lg` | `--xp-shadow-overlay` | 2 | 3x |
| `--xp-gold-soft` | *(chưa có canonical)* | 16 | — |

`--xp-gold-soft` `#f1dba4` (thanh cuộn, [globals.css](../apps/web/src/styles/globals.css)) **không có** đối ứng Figma → giữ nguyên, chưa deprecate.

**Quy tắc: không thêm consumer mới cho nhóm bí danh.**

## 17. Tương phản — đã đo

Brief 00 §16 ghi *“contrast ratios unverified”* và mức tuân thủ WCAG là `Unknown` (Q7). Wave 1A đã đo và **chốt bằng test** ([theme.test.ts](../apps/web/src/styles/theme.test.ts) › `tương phản`).

| Cặp | Tỉ lệ | AA (4.5) |
| --- | --- | --- |
| `text` trên `bg` | **16.54** | ✅ |
| `text` trên container | **17.40** | ✅ |
| `text-secondary` trên `bg` | **5.46** | ✅ |
| `text-secondary` trên container | **5.74** | ✅ |
| `primary-contrast` trên `primary` | **6.60** | ✅ |
| `sidebar-text` trên `sidebar-bg` | **13.54** | ✅ |
| `sidebar-active` trên `sidebar-bg` | **7.29** | ✅ |
| **`text-tertiary` trên `bg`** | **2.72** | ❌ *(bản cũ 2.99 — cũng trượt)* |
| **`warning` trên `warning-bg`** | **2.81** | ❌ |
| **`success` trên `success-bg`** | **3.15** | ❌ |
| **`error` trên `error-bg`** | **4.41** | ❌ |

**Không tự sửa** giá trị Figma để đạt AA: brief 00 §16 nói mức tuân thủ là câu hỏi mở (Q7), nên ép AA là quyết định thay thiết kế. Bốn cặp trượt được **pin bằng test** để không tệ thêm. Ghi ở **P18**.

## 18. Nợ token còn lại

| # | Nợ | Mức | Đích |
| --- | --- | --- | --- |
| **T1** | **9 tham chiếu `var(--xp-*)` chết trong `CalendarScheduler`** — xem §19 | 🔴 Cao | Wave lịch |
| T2 | `--xp-line-height` toàn cục 1.5714 ≠ Figma 1.4286 | 🟠 | 1C |
| T3 | ~21 điểm gãy breakpoint trong `.module.css` | 🟠 | dời dần (brief 00 §9.4) |
| T4 | Số trần spacing trong `.module.css` | 🟡 | dời dần |
| T5 | `controlHeight` 32 vs Figma 40 | 🟡 | P16 |
| T6 | 4 token `*-bg` trạng thái chưa có consumer | 🟢 | 1C (`EmptyState`, `Alert`) |
| T7 | Token sizing (modal/drawer/container) chưa có consumer | 🟢 | 1B/1C |
| T8 | `--xp-gold-soft` không có canonical | 🟢 | — |

## 19. 🔴 T1 — Tham chiếu CSS chết trong CalendarScheduler (phát hiện Wave 1A)

**Không phải nợ, mà là lỗi đang chạy.** [CalendarScheduler.module.css](../apps/web/src/features/calendar/components/CalendarScheduler.module.css) và [.tsx](../apps/web/src/features/calendar/components/CalendarScheduler.tsx) tham chiếu 9 biến **chưa từng được khai báo ở đâu**, không có fallback → thuộc tính không hợp lệ lúc tính giá trị (viền lấy `currentColor`, nền trong suốt, bo góc 0).

| Tham chiếu chết | Dòng | Ý đồ | Token đúng |
| --- | --- | --- | --- |
| `--xp-radius-md` | css:9 | Bo góc khung lịch | `--xp-border-radius` |
| `--xp-radius-sm` | css:156 | Bo góc thanh event | `--xp-border-radius-sm` |
| `--xp-color-split` | css:72,103,120,140,141 | Vạch lưới ngày/hàng | `--xp-color-border-subtle` |
| `--xp-color-fill-quaternary` | css:78 | Nền ô cuối tuần | `--xp-color-bg-muted` |
| `--xp-color-primary-bg` | css:82 | Nền cột hôm nay | `--xp-color-primary-light` |
| `--xp-color-fill-secondary` | tsx:383 | Nền event `blocked_range` | `--xp-color-bg-muted` |
| `--xp-color-purple` / `-bg` / `-border` | tsx:380 | Event `maintenance` | `--xp-color-event-maintenance` (+ cần một bậc nền) |

**Vì sao Wave 1A không sửa**: (a) là feature component có wave riêng và cổng QA riêng (07 §7.3); (b) sửa làm **đổi hình ảnh lịch** mà wave này không QA thị giác được; (c) nhánh `maintenance` cần một bậc nền tím chưa có nguồn Figma → là quyết định thiết kế, không phải ánh xạ token.

*(Biến `--xp-day-width`, `--xp-resource-col-width`, `--xp-bar-left`, `--xp-bar-width` là CSS custom property **set lúc chạy** — ngoại lệ hợp lệ theo ADR 0003, không phải lỗi.)*

## 20. Ánh xạ AntD — bảng đầy đủ

| AntD token | ← XePrime | Ghi chú |
| --- | --- | --- |
| `colorTextBase` (seed) | `color-text` | Gốc dẫn xuất bậc chữ |
| `colorBgBase` (seed) | `color-bg-elevated` | `#ffffff` |
| `colorPrimary` / `Hover` / `Active` | `color-primary` / `-hover` / `-active` | |
| `colorSuccess` / `Bg` | `color-success` / `-bg` | |
| `colorWarning` / `Bg` | `color-warning` / `-bg` | |
| `colorError` / `Bg` | `color-error` / `-bg` | |
| `colorInfo` / `Bg` | `color-info` / `-bg` | |
| `colorText` / `Secondary` / `Tertiary` | `color-text` / `-secondary` / `-tertiary` | |
| `colorBgLayout` / `Container` / `Elevated` | `color-bg` / `-container` / `-elevated` | |
| `colorBgMask` | `color-bg-overlay` | |
| `colorBorder` / `Secondary` | `color-border` / `color-border-subtle` | |
| `borderRadius` / `SM` / `LG` | `border-radius` / `-sm` / `-lg` | LG: 12 → **10** |
| `fontFamily`, `fontSize`, `fontSizeSM`, `fontSizeLG` | tương ứng | |
| `fontSizeHeading1..5` | `font-size-h1..h4` + `font-size` | 38/30/24/20/16 → **32/24/20/16/14** |
| `boxShadow`, `boxShadowTertiary` | `shadow-card` | |
| `boxShadowSecondary` | `shadow-raised` | |
| `controlOutline` / `Width` | `color-focus-ring` / `focus-ring-width` | |
| `controlHeight` / `SM` / `LG` | `control-height` / `-sm` / `-lg` | 32/24/40, **không đổi hành vi** |
| `zIndexPopupBase` | `z-popup-base` | 1000 |
| ~~`colorTextDisabled`~~ | *(không set)* | AntD dẫn xuất từ `colorTextBase` |
| ~~`colorLink`~~ / ~~`colorLinkHover`~~ | *(không set)* | Figma chưa định nghĩa — P19 |

**Không set `components: {...}`.** Chỉ seed/alias token, để không bám tên token nội bộ của từng component AntD qua mỗi lần nâng cấp.

---

## 21. Ba quyết định giữ lại từ `08_DECISION_BACKLOG.md`

Bộ `docs/implementation/` đã nghỉ hưu 21/08/2026. Ba mục dưới đây được chuyển nguyên văn sang đây
vì **mã nguồn còn dẫn chiếu tới chúng**: [`theme.ts`](../apps/web/src/styles/theme.ts) (P15 — bộ giá
trị token nào thắng; P8 — cơ chế breakpoint) và
[`theme.test.ts`](../apps/web/src/styles/theme.test.ts) (P18 — các cặp màu chưa đạt WCAG AA).

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

1. Hợp đồng nguồn sự thật (00 §9): Foundations sở hữu **giá trị token**, component definition sở hữu **hợp đồng biến thể**.
2. Swatch Foundations được đặt tên đúng bằng tên CSS variable (`--xp-color-primary`) — chúng **là** bề mặt khai báo token.
3. Hệ A khớp **chính xác** code đang chạy ở 6 token (primary, success, warning, error, info, radius) → chọn A = **không có hồi quy thương hiệu**; chọn B đổi màu gold toàn app.
4. Giá trị Hệ B là default phổ biến của web (`#d4af37` gold kim loại, `#dc3545` danger của Bootstrap) — giống default lúc dựng component hơn là quyết định thương hiệu.

**Cần chốt**: xác nhận Hệ A là đúng, hoặc chỉ định Hệ B. Nếu chọn B thì đây là **một dòng đổi token** — nhưng kéo theo đổi màu thương hiệu, đỏ lỗi, bo góc trên toàn sản phẩm và phải QA lại từ đầu.

**Nếu không trả lời**: giữ Hệ A (đang chạy, không hồi quy).

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
