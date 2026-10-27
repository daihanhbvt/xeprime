# Design Token Map — hợp đồng token của XePrime

> Cập nhật: 15/10/2026 (design v2 — [ADR 0062](decisions/0062-design-system-v2.md)) · Trạng thái: **hợp đồng token đang hiệu lực**, được
> [`theme.test.ts`](../apps/web/src/styles/theme.test.ts) cưỡng chế (lệch một token giữa
> `tokens.css` và `tokens/index.ts` là test đỏ). §21 dưới cùng giữ ba quyết định mà mã nguồn còn
> dẫn chiếu (`packages/ui/src/tokens/index.ts`, `packages/ui/src/styles/tokens.css`, `theme.test.ts`).
>
> **Nguồn code** (từ 24/08/2026 token sống ở package dùng chung cho web + app native):
> [tokens/index.ts](../packages/ui/src/tokens/index.ts) ↔ [tokens.css](../packages/ui/src/styles/tokens.css)
> (`@xeprime/ui`), giữ đồng bộ bởi [theme.test.ts](../apps/web/src/styles/theme.test.ts).
> Web ánh xạ sang AntD ở [theme.ts](../apps/web/src/styles/theme.ts) (`antdTheme` + re-export API cũ).
>
> **Nguồn Figma (v2, từ 15/10/2026)**: file **"Xe Prime"**, đọc bằng Figma Variables
> (`get_variable_defs`) trên chính các MÀN và bảng component. Trang "Primary colors" của file là thư
> viện Untitled UI CHƯA chỉnh (thang Brand màu tím) — **không đọc giá trị từ trang đó**. Ba frame đã
> đọc: trang chủ desktop `19695:40693` · bảng màu `1525:271581` · bảng nút `8636:8263`. Bộ
> "XePrime Foundations" `14:*` của file cũ (không dùng Variables) đã nghỉ hưu. Cột "Figma" ở các
> bảng dưới ghi tên biến v2; mã `14:*` còn lại là token CHƯA chuyển (ADR 0062 điều 5).
>
> **Cách đọc Figma v2 (vận hành)**:
> * Figma MCP đòi quyền **edit** trên file. Tài khoản dự án chỉ có quyền xem file gốc, nên đọc trên
>   **bản sao trong drafts**: fileKey `IcfZAFg9vO2Jt2cn77Bhv7`. Bản sao không tự cập nhật — designer
>   sửa file gốc thì phải sao lại.
> * Seat View gói Starter: **20 lượt đọc/tháng**. Chỉ gọi `get_variable_defs` theo FRAME (rẻ, trả tên
>   + giá trị). `get_design_context` cả trang rất tốn — đọc theo section khi ráp màn.
> * Link phải trỏ một **frame** (chuột phải → *Copy link to selection*). Link copy lúc không chọn gì
>   mang id của PAGE và tool báo "nothing selected". Đừng dò bằng `get_metadata` trên page: nó dump
>   cả cây.
> * Gradient chỉ trả TÊN (`Gradient/Brand/600 -> 500 (90deg)`), không trả điểm màu.
>
> **Lịch sử (chỉ để đọc ngữ cảnh).** File này ra đời là `docs/implementation/02_DESIGN_TOKEN_MAP.md`
> của bộ kế hoạch migration Figma→code; bộ `docs/implementation/` đã nghỉ hưu ngày 21/08/2026 và
> không còn trong repo. Các nhãn "Wave 0A/0B/1A/1B/1C/1D", "brief 00 §…", "07 §7.3",
> `08_DECISION_BACKLOG.md` rải trong file là tham chiếu LỊCH SỬ tới bộ tài liệu đó — không có file
> nào để mở. Bản chốt hiện trạng đầu tiên là Wave 1A (06/08/2026).

## 0. Hợp đồng

1. **Biến Figma trên MÀN HÌNH của file "Xe Prime" là nguồn GIÁ TRỊ token** (ADR 0062 điều 1). Trang bảng màu thư viện không phải nguồn; màn mâu thuẫn với trang thư viện thì màn thắng.
2. **Mọi thay đổi token sửa cả `packages/ui/src/styles/tokens.css` và `XP_TOKENS` ở `packages/ui/src/tokens/index.ts` trong cùng commit (AntD ở `theme.ts` đọc từ `XP_TOKENS`).** `theme.test.ts` so key-set và value; lệch một token là test đỏ. Sau khi sửa, build lại `@xeprime/ui` (app đọc `dist`) và chạy `tokens.test.ts` + `sidebar.test.ts` của app native — native đọc cùng token.
3. **Không nhân đôi nguồn.** Bí danh deprecated trỏ `var()` về token canonical — có test chặn việc gán giá trị thật cho bí danh.
4. **Token nào Figma không định nghĩa thì để AntD dẫn xuất**, không tự chế (vì thế `colorLink`, `colorPrimaryActive` và `colorTextDisabled` vắng mặt trong `antdTheme`).
5. **Giữ TÊN token ngữ nghĩa, đổi GIÁ TRỊ; không dựng tầng thang thô** (`--xp-gray-25…`). Token mới chỉ thêm khi v2 có vai trò chưa có tên (ADR 0062 điều 3).
6. **Không đổi NGHĨA của một token đang có.** Cùng một token có chỗ làm chữ, có chỗ làm nền dưới chữ tối, ở cả web lẫn native. v2 không có vai trò tương ứng thì giữ giá trị cũ và ghi vào ADR 0062 điều 5, không ghép nó vào một màu v2 "gần giống".

---

## 1. Màu — thương hiệu ✅

| Token canonical | Giá trị | Figma v2 | AntD | Ghi chú |
| --- | --- | --- | --- | --- |
| `--xp-color-primary` | `#e9ac29` | `BG/primary` · `Text/Brand/primary` · `Stroke/primary` | `colorPrimary` | Bộ cũ `#d6a02c` |
| `--xp-color-primary-hover` | `#cb9115` | `Text/Brand/primary 2` | `colorPrimaryHover` | Hover **đậm hơn**, như trước |
| `--xp-color-primary-active` | `#a9761a` | *chưa có trong v2* — giữ bộ cũ | *(không set — AntD dẫn xuất)* | Bậc NHẤN. Đang làm nền dưới chữ tối ở web + native nên không đổi nghĩa (ADR 0062 điều 5–6). Bí danh `gold-deep` trỏ về đây |
| `--xp-color-primary-strong` | `#6e5117` | `BG/primary-high` · `Text/Brand/high` | — | **Mới** — gold đọc được làm CHỮ/giá/icon (7.4:1 trên trắng); `color-price` trỏ về đây. Không làm nền dưới chữ tối (2.4:1) |
| `--xp-color-primary-light` | `#fff5e5` | `BG/primary-low` | — | Nền gold nhạt: mục đang chọn, nút phụ |
| `--xp-color-primary-subtle` | `#fff9f0` | `BG/primary-25` | — | **Mới** — nền gold nhạt nhất: ô icon, mảng nền |
| `--xp-color-primary-muted` | `#f6ebd5` | `BG/primary-100` · `Stroke/primary-100` | `colorPrimaryBgHover` | **Mới** — hover trên nền gold nhạt, viền gold nhạt |
| `--xp-color-primary-contrast` | `#101828` | `Text/Gray/high` | `Button.primaryColor` | **Chữ tối trên nền gold**, không phải trắng (8.8:1) |

Gradient của nút chính (`Gradient/Brand/600 -> 500 (90deg)`) chưa thành token: Variables chỉ trả tên
— chốt khi ráp nút (ADR 0062 Q1).

## 2. Màu — bề mặt ✅

| Token canonical | Giá trị | Figma v2 | AntD |
| --- | --- | --- | --- |
| `--xp-color-bg` | `#fafafa` | `BG/gray-50` | `colorBgLayout` |
| `--xp-color-bg-container` | `#ffffff` | `BG/white` | `colorBgContainer` |
| `--xp-color-bg-elevated` | `#ffffff` | `BG/white` | `colorBgElevated` + seed `colorBgBase` |
| `--xp-color-bg-muted` | `#f5f5f5` | `BG/gray-100` | — |
| `--xp-color-bg-selected` | `#fff5e5` | = `primary-light` (`BG/primary-low`) | `colorPrimaryBg` — AntD và CSS Module chung một nền "đang chọn" |
| `--xp-color-bg-overlay` | `rgba(26,26,26,.45)` | *chưa có trong v2* | `colorBgMask` |

> `colorBgBase` ánh xạ về **`#ffffff`** (bề mặt container), không phải nền trang. Đặt nền trang làm base sẽ nhuộm mọi bề mặt trắng — nền trang thuộc `colorBgLayout`.

## 3. Màu — chữ ✅

| Token canonical | Giá trị | Figma v2 | AntD |
| --- | --- | --- | --- |
| `--xp-color-text` | `#101828` | `Text/Gray/high` | `colorText` + seed `colorTextBase` |
| `--xp-color-text-secondary` | `#414651` | `Text/Gray/medium` | `colorTextSecondary` |
| `--xp-color-text-tertiary` | `#717680` | `Text/Gray/low` | `colorTextTertiary` |
| `--xp-color-text-placeholder` | `#a4a7ae` | `Text/Gray/very-low` | `colorTextPlaceholder` — **mới** |
| `--xp-color-text-disabled` | `rgba(16,24,40,.25)` | *công thức* — v2 `Text/Gray/disable` `#d5d7da` chờ chốt phạm vi (ADR 0062 Q8) | *(không set — AntD dẫn xuất 25% từ `colorTextBase`, ra đúng giá trị này)*. AntD dùng nó cả cho giá trị ô nhập bị khoá và ngày ngoài tháng — `#d5d7da` (1.46:1) quá mờ cho các chỗ đó |
| `--xp-color-text-inverse` | `#e8e4dd` | *chưa có trong v2* (`14:96`) | — |
| `--xp-color-link` | `#2563eb` | — | *(không set — xem P19)* |
| `--xp-color-link-hover` | `#7aadff` | — | *(không set)* |

## 4. Màu — viền ✅

| Token canonical | Giá trị | Figma v2 | AntD |
| --- | --- | --- | --- |
| `--xp-color-border` | `#e9eaeb` | `Stroke/gray-low200` | `colorBorder` |
| `--xp-color-border-strong` | `#d5d7da` | `Stroke/gray-low300` | — |
| `--xp-color-border-subtle` | `#f5f5f5` | *dẫn xuất* (= `bg-muted`, Gray/100) | `colorBorderSecondary` |
| `--xp-color-border-focus` | `#e9ac29` | `Stroke/primary` | — |
| `--xp-color-border-disabled` | `#e9eaeb` | = `border` | — |

> **`border-subtle` là giá trị dẫn xuất, không phải token Figma.** v2 không có bậc viền mảnh hơn `gray-low200` mà còn thấy được trên nền trắng (`Stroke/gray-50` = `#fafafa` gần như vô hình). Token này tiếp tục tái dùng tông `color-bg-muted`. Ghi nhận ở **P17**.

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
| `--xp-color-success` / `-bg` | `#039855` / `#ecfdf3` | v2 `Status/success-high` / `-low` | `colorSuccess` / `colorSuccessBg` |
| `--xp-color-success-subtle` | `#f6fef9` | v2 `Status/success-25` | — (vành ngoài icon thành công) |
| `--xp-color-warning` / `-bg` | `#e07b26` / `#fff7ed` | *chưa chuyển* (`14:67` / `14:71`) — v2 đã đọc chỉ có `warning-300/500` | `colorWarning` / `colorWarningBg` |
| `--xp-color-error` / `-bg` | `#d92d20` / `#fef3f2` | v2 `Status/error-high` / `BG/destructive-low` | `colorError` / `colorErrorBg` |
| `--xp-color-info` / `-bg` | `#2563eb` / `#eff6ff` | *chưa có trong v2* (`14:83` / `14:87`) | `colorInfo` / `colorInfoBg` |
| `--xp-color-neutral` / `-bg` | `#414651` / `#f5f5f5` | tái dùng `text-secondary` / `bg-muted` | — |

v2 còn có `BG/destructive-hover` `#b42318`, `BG/destructive-low100` `#fee4e2`, `-low200` `#fecdca`
cho nút huỷ/xoá — thêm token khi ráp nút destructive.

> `StatusTag` **vẫn dùng AntD preset color** qua `StatusMeta.color` ([status/meta.ts](../packages/types/src/status/meta.ts)) — Wave 1A không đổi hợp đồng đó. Bốn token `*-bg` nay đã có consumer trong CSS Module (~69 lượt `var(--xp-color-{success,warning,error,info}-bg)`, đếm 06/10/2026). Xem **P5** (lịch sử).

## 7. Màu — vỏ portal ✅ đã áp dụng (sidebar tối)

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-shell-sidebar-bg` | `#1e1b16` | `14:92` |
| `--xp-shell-sidebar-text` | `#e8e4dd` | `14:96` |
| `--xp-shell-sidebar-active` | `#d6a02c` | `14:100` |
| `--xp-shell-sidebar-hover` · `-selected-bg` · `-muted` · `-border` | `color-mix` từ ba token trên | *dẫn xuất* |
| `--xp-shell-topbar-bg` | `#ffffff` | v2 `BG/white` |
| `--xp-shell-topbar-border` | `#e9eaeb` | = `border` (v2 `Stroke/gray-low200`) |

⚠️ Ba màu sidebar **chưa chuyển sang v2**: chưa đọc màn partner/admin nào, và
`apps/mobile/shared/src/theme/sidebar.test.ts` chốt cứng ba giá trị gốc. Đổi cùng dev mobile
(ADR 0062 điều 5).

**P1 đã chốt "tối"** và áp dụng ở đợt 1D-B (ghi chú trong `tokens.css`). Vỏ portal đọc các token
này trực tiếp: [Sidebar.module.css](../apps/web/src/components/layout/Sidebar.module.css) (nền, chữ,
viền, chiều rộng), [ManageMenu.module.css](../apps/web/src/components/layout/ManageMenu.module.css)
(mục menu, trạng thái hover/chọn/active, vòng focus), `ManageUserCard.module.css`,
`MobileNav.module.css`, `SidebarSectionTitle.module.css`, và
[Topbar.module.css](../apps/web/src/components/layout/Topbar.module.css) (`topbar-bg`/`-border`/`-height`).
`layout-breakpoints.test.ts` khoá việc `Sidebar.module.css` dùng `--xp-shell-sidebar-bg`.

Bốn bậc trạng thái (`hover`, `selected-bg`, `muted`, `border`) KHÔNG phải màu Figma: Foundations
chỉ định nghĩa 3 màu sidebar, nền tối cần thêm bậc, nên chúng trộn bằng `color-mix` từ ba màu gốc —
đổi một màu gốc là cả bộ đi theo.

## 8. Typography ✅

Font: `--xp-font-family` = **Google Sans Flex** (v2 `font-googlesan`), tự host qua `next/font`
(`--font-google-sans`, bản variable trục `wght`, subset `latin` + `vietnamese`). Một họ chữ cho
mọi chỗ — Playfair đã bỏ; `--xp-font-family-display` là bí danh deprecated (§16).

Thang v2 có 8 bậc, tên style Figma dạng `<size>px/<weight>`: 12/18 · 14/20 · 16/24 · 18/28 · 24/32 ·
30/38 · 36/44 · 48/60. Mỗi bậc có nhiều weight; weight do component chọn, token chỉ giữ size/cao dòng.

| Bậc | size / line-height | Figma v2 | Dùng cho |
| --- | --- | --- | --- |
| `display` | 48 / 60, `letter-spacing-display` −0.02em | `48px/Semibold` (−2%) | Hero |
| `display-sm` | 36 / 44 | `36px/Medium` (−2%) · `36px/Bold` (−1%) | **Mới** — tiêu đề lớn của section marketing |
| `h1` | 30 / 38 | `30px/Semibold` · `30px/Bold` | Tiêu đề trang (bộ cũ 32/40) |
| `h2` | 24 / 32 | `24px/Semibold` · `24px/Medium` | Tiêu đề section |
| `lead` | 20 / 30 | `20px/Medium` · `20px/Semibold` | **Mới** — chữ trên nền ảnh: cột trái hộp đăng nhập (dòng giới thiệu, tên cửa hàng ứng dụng). Không phải bậc tiêu đề, không vào `fontSizeHeading*` của AntD |
| `h3` | 18 / 28 | `18px/Semibold` | Tiêu đề card / modal (bộ cũ 20/28) |
| `h4` | 16 / 24 | `16px/Semibold` | Subsection, header bảng |
| `body-lg` | 16 / 24 | `16px/Regular` | Body lớn |
| `body` | 14 / 20 | `14px/Regular` | Ô bảng, label form |
| `body-sm` | 12 / 18 | `12px/Regular` | Caption, help text (bộ cũ cao dòng 16) |
| `label` | 12 / 18 | `12px/Medium` | Badge, chip, tag |
| `overline` | 11 / 16 | *chưa chuyển* — v2 không có 11px | App native đọc bậc này cho dòng meta dày đặc (43 chỗ), 12px bị cắt trên máy 360dp → đổi cùng dev mobile. Kicker web v2 (`12px/Medium`) dùng bậc `label` khi ráp màn |

Weight: `--xp-font-weight-{regular,medium,semibold,bold}` = 400/500/600/700 (v2 dùng đúng bốn mức này).

AntD: `fontSizeHeading1..5` ← 30/24/18/16/14 · `fontSizeLG` ← 16 · `fontSizeSM` ← 12 · `fontSize` ← 14.
Ảnh hưởng thực tế nhỏ: lúc Wave 1A chỉ **2 chỗ** dùng `Typography.Title`. Hiện trạng 06/10/2026: [ManagePageHeader](../apps/web/src/components/layout/ManagePageHeader.tsx) `level={1}` và [ShopPoliciesPage](../apps/web/src/features/rental-policies/components/ShopPoliciesPage.tsx) `level={2}`, cả hai kèm `className` CSS Module riêng.

### ⚠️ Nợ: `--xp-line-height` toàn cục
`--xp-line-height` = **1.5714** (→22px) là giá trị AntD đang chạy; Figma `body` là **14/20** (1.4286). Chưa đổi vì nó làm lệch chiều cao **mọi** hàng bảng và **mọi** form — cần QA thị giác mà Wave 1A không có. Token `--xp-line-height-body` (20px) đã có sẵn cho component dùng. **Đích: wave có QA thị giác (sớm nhất là 1C khi làm `DataTable`).**

`--xp-line-height-body-relaxed` (22px, 26/10/2026) — thân 14px của design v2 (Figma `14px/Regular` · `14px/Medium` ghi line-height 22). Dùng cho các màn đã dựng theo design v2 (chi tiết chuyến của khách); không thay `--xp-line-height-body`.

## 9. Spacing ✅ — không đổi

`--xp-space-{xs,sm,md,lg,xl}` = 4/8/16/24/32. Khớp Figma `14:144`–`14:156` (“4 · 8 · 16 · 24 · 32 px only”) từ trước Wave 1A. **Việc còn lại không phải đổi token mà là ép dùng** — vẫn còn số trần trong `.module.css` (`padding: 6px 8px 10px`, `0 14px`…). Dời dần khi chạm file.

**v2** dùng thang mịn hơn (`Num/*`: 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 36 · 40 · 48 · 56 · 64 ·
80). Bậc mới thêm khi màn đầu tiên cần tới (ADR 0062 điều 4). ⚠️ **Tên khoảng cách của Figma KHÁC
nghĩa**: `spacing-xxs` = 2, `spacing-md` = **8** ở Figma, trong khi `--xp-space-md` = **16**. Đọc Figma
theo con số px, không theo tên.

## 10. Radius ✅

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-border-radius-sm` | 6px | `14:160` — chip, badge |
| `--xp-border-radius` | 10px | `14:164` — card, input, modal |
| `--xp-border-radius-lg` | 10px | ↑ cùng bậc |
| `--xp-border-radius-pill` | 999px | `14:168` — **mới**, trước viết `999px` trần |

⚠️ **Thay đổi nhìn thấy được**: AntD `borderRadiusLG` trước đây tự dẫn xuất ra **12px**; giờ là **10px** vì Figma nói card/modal = 10. Card và modal bo tròn ít hơn một chút.

**v2**: bo góc gắn theo từng component (nút, ô nhập, thẻ) — chốt khi ráp component đó (ADR 0062 Q6).

## 11. Shadow ✅ — giá trị mới từ Figma

| Token | Giá trị | Figma | Dùng cho | AntD |
| --- | --- | --- | --- | --- |
| `--xp-shadow-card` | `0 2px 4px 0 rgba(41,31,15,.06)` | `14:173` | Card nghỉ | `boxShadow`, `boxShadowTertiary` |
| `--xp-shadow-raised` | `0 4px 12px 0 rgba(41,31,15,.08)` | `14:176` | Hover, dropdown | `boxShadowSecondary` |
| `--xp-shadow-overlay` | `0 8px 24px 0 rgba(41,31,15,.12)` | `14:179` | Modal, drawer | — |

**Giải quyết P7 (hai hệ đổ bóng song song).** Trước Wave 1A: CSS Module dùng bóng nâu ấm, AntD dùng bóng xám ba lớp — hai hệ khác nhau cạnh nhau. Giờ cả hai lấy từ Elevation 1/2/3 của Figma.

⚠️ **Chưa chuyển sang v2** (ADR 0062 điều 5). Bóng v2 tông đen lạnh `#0A0D12`:
`Shadow/xs` `0 1 2 #0A0D120D` · `Shadow/sm` `0 1 2 #0A0D120F` + `0 1 3 #0A0D121A` · `Shadow/lg`
`0 4 6 -2 #0A0D1208` + `0 12 16 -4 #0A0D1214` · `Header Blur Effect` (hai bóng + blur nền 24).
Bậc sm/lg có HAI lớp, trong khi `apps/mobile/shared/src/theme/elevation.ts` chỉ parse một lớp và
`tokens.test.ts` của native chốt cứng `shadow-card` — đổi cùng dev mobile.

## 12. Focus ✅

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-focus-outline-width` | 2px | `14:197` |
| `--xp-focus-ring-width` | 2px | `14:197` vẽ 3px; hạ 2px theo review UI 12/08/2026 |
| `--xp-color-focus-ring` | `rgba(233,172,41,.25)` | gold v2 ở 25% — cùng công thức với bộ cũ |

- **Phần tử thường**: [globals.css](../apps/web/src/styles/globals.css) `:focus-visible` = `outline` 2px gold + `box-shadow` ring 25%. Giữ `outline` làm lớp chính để không bị `overflow:hidden` của bảng cắt mất.
- **Control AntD**: `controlOutline` = ring 25%, `controlOutlineWidth` = 2 (trước Wave 1A là `rgba(255,222,5,.06)` — vòng focus cũ gần như vô hình).

## 13. Breakpoint ✅ — token + JS, KHÔNG viết lại CSS hàng loạt

| Token | Giá trị | Figma |
| --- | --- | --- |
| `--xp-bp-mobile` | 640px | `14:183` — ≤640 · 4 cột · gutter 16 |
| `--xp-bp-tablet` | 1024px | `14:186` — 641–1024 · 8 cột · gutter 24 |
| `--xp-bp-desktop` | 1440px | `14:189` — 1025–1440 · 12 cột; >1440 = wide (`14:192`) |

`XP_BREAKPOINTS` (số) trong `theme.ts` là nguồn cho JS. [use-media-query.ts](../apps/web/src/hooks/use-media-query.ts) giờ có `useIsMobile()` (suy ra từ token, không gõ số), `useIsTablet()`, `useIsDesktop()`.

**Quyết định P8 đã chốt: KHÔNG gom 21 breakpoint CSS trong Wave 1A.** Design-brief 00 §9.4 (tài liệu lịch sử, đã nghỉ hưu) chỉ định rõ: *“One breakpoint scale expressed as tokens and consumed by both CSS and `useMediaQuery`, **with existing values migrated as files are touched rather than in a bulk change**.”* Brief thắng kế hoạch Wave 0B. Việc còn lại: mỗi khi chạm một `.module.css`, thay điểm gãy của nó về 640/1024/1440.

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

| Bí danh (deprecated) | → Canonical | Consumer còn lại (đếm `var(...)` 06/10/2026) | Wave gỡ |
| --- | --- | --- | --- |
| `--xp-color-bg-layout` | `--xp-color-bg` | 44 | 3x (khi chạm file) |
| `--xp-color-border-secondary` | `--xp-color-border-subtle` | 70 | 3x |
| `--xp-gold-deep` | `--xp-color-primary-active` | 75 | 3x |
| `--xp-gold-wash` | `--xp-color-primary-light` | 32 | 3x |
| `--xp-color-bg-sand` | `--xp-color-primary-light` | 13 | 3x |
| `--xp-shadow-sm` | `--xp-shadow-card` | 8 | 3x |
| `--xp-shadow-md` | `--xp-shadow-raised` | 8 | 3x |
| `--xp-shadow-lg` | `--xp-shadow-overlay` | 0 | 3x |
| `--xp-font-family-display` | `--xp-font-family` | 5 lượt / 4 file (đếm 15/10/2026) | khi ráp màn của chúng (ADR 0062 điều 7) |
| `--xp-gold-soft` | *(chưa có canonical)* | 16 | — |

`--xp-gold-soft` `#f1dba4` (thanh cuộn, [globals.css](../apps/web/src/styles/globals.css)) **không có** đối ứng Figma → giữ nguyên, chưa deprecate.

**Quy tắc: không thêm consumer mới cho nhóm bí danh.** ⚠️ Quy tắc này đang bị vi phạm: so với lần đếm
Wave 1A, số consumer của 5/8 bí danh đã TĂNG (vd `--xp-color-bg-layout` 13 → 44, `--xp-gold-deep` 45 → 75).
Khi chạm file, thay bằng token canonical ở cột giữa.

## 17. Tương phản — đã đo

Brief 00 §16 ghi *“contrast ratios unverified”* và mức tuân thủ WCAG là `Unknown` (Q7). Wave 1A đã đo và **chốt bằng test** ([theme.test.ts](../apps/web/src/styles/theme.test.ts) › `tương phản`).

Đo lại với giá trị v2 ngày 15/10/2026 (cột "Bộ cũ" là Wave 1A):

| Cặp | Tỉ lệ v2 | Bộ cũ | AA (4.5) |
| --- | --- | --- | --- |
| `text` trên `bg` | **17.00** | 16.54 | ✅ |
| `text` trên container | **17.75** | 17.40 | ✅ |
| `text-secondary` trên `bg` | **9.06** | 5.46 | ✅ |
| `text-secondary` trên container | **9.46** | 5.74 | ✅ |
| `primary-contrast` trên `primary` | **8.79** | 6.60 | ✅ |
| `primary-strong` (chữ gold, mới) trên trắng | **7.36** | — | ✅ |
| `price` trên trắng | **7.36** | 3.97 (trỏ `primary-active`) | ✅ |
| `primary-active` (bậc nhấn) trên trắng | **3.97** | = | ❌ chữ — ✅ vạch/icon (3:1) |
| `sidebar-text` trên `sidebar-bg` | **13.54** | = | ✅ |
| `sidebar-active` trên `sidebar-bg` | **7.29** | = | ✅ |
| **`text-tertiary` trên `bg`** | **4.37** (trắng: 4.56 ✅) | 2.72 | ❌ |
| **`warning` trên `warning-bg`** | **2.81** | = | ❌ |
| **`success` trên `success-bg`** | **3.54** | 3.15 | ❌ |
| **`error` trên `error-bg`** | **4.44** | 4.41 | ❌ |
| **`primary` (gold chính) làm chữ trên trắng** | **2.02** | 2.4 | ❌ — chỉ làm NỀN; xem ADR 0062 điều 6 |

**Không tự sửa** giá trị Figma để đạt AA: brief 00 §16 nói mức tuân thủ là câu hỏi mở (Q7), nên ép AA là quyết định thay thiết kế. Bốn cặp trượt được **pin bằng test** để không tệ thêm. Ghi ở **P18**.

## 18. Nợ token còn lại (kiểm lại 06/10/2026)

| # | Nợ | Mức | Đích |
| --- | --- | --- | --- |
| T2 | `--xp-line-height` toàn cục 1.5714 ≠ Figma 1.4286 — vẫn còn | 🟠 | đợt có QA thị giác |
| T3 | Điểm gãy `@media` trong `.module.css`: 31 giá trị px khác nhau, ~96 lần dùng nằm ngoài họ 640/1024 (900, 760, 560, 480…) | 🟠 | dời dần khi chạm file (P8) |
| T4 | Số trần spacing trong `.module.css` | 🟡 | dời dần |
| T5 | `controlHeight` 32 vs Figma 40 — vẫn 32 | 🟡 | P16 |
| T8 | `--xp-gold-soft` không có canonical (16 consumer) | 🟢 | — |
| T9 | **Tham chiếu `var(--xp-*)` chưa khai báo, không fallback** — xem §19 | 🔴 | sửa khi chạm file |

Đã đóng so với bản Wave 1A: **T1** (9 tham chiếu chết trong `CalendarScheduler` — không còn tham
chiếu nào trong `CalendarScheduler.module.css`/`.tsx`), **T6** (token `*-bg` trạng thái nay có
~69 lượt dùng trong CSS Module), **T7** (token sizing modal/drawer/container nay có ~22 lượt dùng).

## 19. 🔴 T9 — Tham chiếu CSS chưa khai báo (quét 06/10/2026)

Quét `apps/web/src` + `packages/ui/src`: những `var(--xp-…)` **không có giá trị dự phòng** mà tên
không được khai ở bất kỳ đâu (`tokens.css`, `globals.css`, CSS Module, hay chuỗi set lúc chạy trong
TSX). AntD v6 phát biến CSS với tiền tố `--ant-`, nên không có gì "tự có" dưới tiền tố `--xp-`.
Thuộc tính dùng chúng là không hợp lệ lúc tính giá trị (viền `currentColor`, nền trong suốt, bo
góc 0, cỡ chữ kế thừa).

| Tham chiếu chưa khai báo | Token đúng (gợi ý) | File dùng (`*.module.css`) |
| --- | --- | --- |
| `--xp-border-radius-md`, `--xp-radius-md` | `--xp-border-radius` | `FileListField`, `Handover`, `VehicleDocumentsWorkspace`, `MaintenanceBoard`, `VehicleMaintenanceWorkspace`, `CreateVehiclePricingStep`, `VehicleCreateSuccess`, `VehicleForm`, `VehicleSourceWorkspace`, `SupportCaseDetailPanel` |
| `--xp-radius-lg` | `--xp-border-radius-lg` | `ListingDetailView` |
| `--xp-border-radius-circle` | `--xp-border-radius-pill` | `QuickVehicleSuccess` |
| `--xp-font-size-caption` | bậc `body-sm` (12px) | `Countdown`, `AccountDeletionImpact`, `MarketHeader`, `InsuranceQueue`, `RefundAccountDialog` |
| `--xp-font-size-base`, `--xp-font-size-md` | bậc `body` (14px) | `OwnerRegistrationView`, `SupportCaseDetailPanel` |
| `--xp-font-size-heading-lg` · `-md` | bậc `h3` · `h4` | `VehicleMaintenanceWorkspace` |
| `--xp-font-weight-strong` | `--xp-font-weight-semibold` | `MissingReturnKmQueue`, `MaintenanceBoard`, `VehicleMaintenanceWorkspace` |
| `--xp-space-2xl`, `--xp-space-xxs` | thang `--xp-space-{xs..xl}` | `QuickVehicleSuccess`, `InsuranceQueue` |
| `--xp-color-danger` | `--xp-color-error` | `InsuranceQueue` |
| `--xp-color-fill-quaternary`, `--xp-color-fill-secondary` | `--xp-color-bg-muted` | `ListingDetailView`, `MaintenanceBoard` |
| `--xp-color-primary-bg` | `--xp-color-primary-light` | `MaintenanceBoard` |
| `--xp-color-text-light-solid` | `--xp-color-primary-contrast` hoặc trắng theo nền | `MaintenanceBoard` |

Cột "Token đúng" là GỢI Ý ánh xạ — đối chiếu tên chính xác trong `tokens.css` trước khi sửa, và QA
thị giác vì sửa là ĐỔI hình ảnh (thuộc tính đang rơi về giá trị mặc định). Vài file khác dùng các
tên chưa khai báo này KÈM fallback (`var(--xp-color-fill-quaternary, …)`) — chúng không vỡ, nhưng
cũng nên đổi sang token thật để chỉ còn một nguồn.

*(Biến `--xp-day-width`, `--xp-resource-col-width`, `--xp-bar-left`, `--xp-bar-width`… là CSS
custom property **set lúc chạy** — ngoại lệ hợp lệ theo ADR 0003, không phải lỗi.)*

## 20. Ánh xạ AntD — bảng đầy đủ

| AntD token | ← XePrime | Ghi chú |
| --- | --- | --- |
| `colorTextBase` (seed) | `color-text` | Gốc dẫn xuất bậc chữ |
| `colorBgBase` (seed) | `color-bg-elevated` | `#ffffff` |
| `colorPrimary` / `Hover` | `color-primary` / `-hover` | |
| ~~`colorPrimaryActive`~~ | *(không set)* | AntD dẫn xuất từ gold v2 (~5.7:1 với chữ trên nút); bậc nhấn cũ chỉ 4.47:1 (ADR 0062 điều 6) |
| `colorPrimaryBg` / `BgHover` | `color-bg-selected` / `color-primary-muted` | **Mới** — nền mục đang chọn (option, hàng bảng, menu, khoảng ngày) và lúc rê chuột |
| `colorSuccess` / `Bg` | `color-success` / `-bg` | |
| `colorWarning` / `Bg` | `color-warning` / `-bg` | |
| `colorError` / `Bg` | `color-error` / `-bg` | |
| `colorInfo` / `Bg` | `color-info` / `-bg` | |
| `colorText` / `Secondary` / `Tertiary` | `color-text` / `-secondary` / `-tertiary` | |
| `colorTextPlaceholder` | `color-text-placeholder` | **Mới** — v2 `Text/Gray/very-low` |
| ~~`colorTextDisabled`~~ | *(không set)* | AntD dẫn xuất từ `colorTextBase` — ADR 0062 Q8 |
| `colorBgLayout` / `Container` / `Elevated` | `color-bg` / `-container` / `-elevated` | |
| `colorBgMask` | `color-bg-overlay` | |
| `colorBorder` / `Secondary` | `color-border` / `color-border-subtle` | |
| `borderRadius` / `SM` / `LG` | `border-radius` / `-sm` / `-lg` | LG: 12 → **10** |
| `fontFamily`, `fontSize`, `fontSizeSM`, `fontSizeLG` | tương ứng | |
| `fontSizeHeading1..5` | `font-size-h1..h4` + `font-size` | 38/30/24/20/16 → 32/24/20/16/14 → **30/24/18/16/14** (v2) |
| `boxShadow`, `boxShadowTertiary` | `shadow-card` | |
| `boxShadowSecondary` | `shadow-raised` | |
| `controlOutline` / `Width` | `color-focus-ring` / `focus-ring-width` | |
| `controlHeight` / `SM` / `LG` | `control-height` / `-sm` / `-lg` | 32/24/40, **không đổi hành vi** |
| `zIndexPopupBase` | `z-popup-base` | 1000 |
| ~~`colorLink`~~ / ~~`colorLinkHover`~~ | *(không set)* | Figma chưa định nghĩa — P19 |

**`components: {...}` chỉ có một ngoại lệ** (`Button.primaryColor` = `color-primary-contrast`, có test
khoá). Còn lại chỉ seed/alias token, để không bám tên token nội bộ của từng component AntD qua mỗi lần
nâng cấp. Khi ráp nút/ô nhập v2 (gradient, 4 cỡ nút) mà seed token không diễn đạt được, mở rộng
ngoại lệ có chủ đích cùng test — không bám tên token nội bộ tuỳ tiện.

---

## 21. Ba quyết định giữ lại từ backlog quyết định của bộ `docs/implementation/` (lịch sử)

Bộ `docs/implementation/` (gồm `08_DECISION_BACKLOG.md`) đã nghỉ hưu 21/08/2026 và không còn trong
repo. Ba mục dưới đây được chuyển nguyên văn sang đây vì **mã nguồn còn dẫn chiếu tới chúng**; các
trích dẫn "brief 00 §…", "00 §9", "Q7" bên trong là tham chiếu LỊCH SỬ tới bộ đó: [`theme.ts`](../apps/web/src/styles/theme.ts) (P15 — bộ giá
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

### P15 — Hai bộ giá trị token trong cùng file Figma ✅ ĐÓNG (15/10/2026)

> **Đóng bởi [ADR 0062](decisions/0062-design-system-v2.md):** cả Hệ A lẫn Hệ B của file Figma cũ
> đều bị thay bằng biến Figma trên màn hình của file "Xe Prime" (design v2). Phần dưới giữ để đọc
> lịch sử.

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

> **Hiện trạng 06/10/2026:** không tìm thấy ADR hay ghi chép nào chốt P15. Nhánh mặc định "giữ Hệ A"
> đang được áp — `tokens.css`/`tokens/index.ts` mang giá trị Hệ A (`#d6a02c`, `#dc2626`, bo 10px) và
> ghi rõ "Foundations thắng về GIÁ TRỊ token". Không việc nào đang bị chặn vì nó; mục còn mở chỉ ở
> chỗ chưa có người có thẩm quyền thiết kế xác nhận Hệ A.

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

## 22. Bề mặt chợ v2 — trang chủ, header, footer ✅ (15/10/2026)

Nhóm CHỈ WEB đọc (ADR 0062 điều 8) — app native không resolve gradient/bóng nhiều lớp, nên các
giá trị này không bao giờ đi vào khoá mà `apps/mobile/shared/src/theme/tokens.ts` đọc. Nguồn:
code của màn trang chủ Figma `19695:40693`.

| Nhóm | Token | Giá trị | Dùng ở |
| --- | --- | --- | --- |
| Nền tối | `--xp-color-bg-inverse` | `#101828` | header, chấm carousel đang chọn, kẻ footer |
| | `--xp-market-footer-bg` | `#060403` | footer, nền thẻ địa điểm |
| Chữ trên nền tối | `--xp-color-text-on-dark` / `-muted` | `#fff` / `#d5d7da` | header, dải đối tác, footer |
| Gold phụ | `--xp-color-primary-bright` | `#edbb4f` | tiêu đề cột footer |
| | `--xp-color-primary-pale` | `#f0ddb7` | chữ "XePrime" ở bản quyền |
| | `--xp-color-primary-accent` | `#d3a94d` | viền thẻ khi hover, gạch tab |
| | `--xp-color-primary-glow` | `#e9c336` | viền avatar gian hàng đã xác thực |
| | `--xp-color-destination-border` | `#e9bb68` | viền thẻ địa điểm |
| Luồng đặt xe v2 | `--xp-color-primary-border` | `#e8ca8d` (`Stroke/primary-300`; tối `#946e1f`) | viền thẻ tiền, thẻ giữ chỗ, phương thức thanh toán đang mở |
| | `--xp-color-success-accent` | `#12b76a` (`Status/success-500`) | viền nét đứt thẻ "chuyến đã xác nhận" |
| | `--xp-color-success-border` | `#6ce9a6` (`Status/success-300`) | viền nhãn trạng thái xanh |
| | `--xp-color-warning-subtle` | `#fffaeb` (`Status/warning-low`) | nền hộp lưu ý của trang thanh toán |
| Gradient | `--xp-gradient-primary` | `#e9c336 → #e8c664 → #e3b012` (90°) | nút chính, pill "Khám phá" |
| | `--xp-gradient-text-hero` / `-text-gold` / `-text-destination` | — | chữ nhấn hero / dải đối tác / tên thành phố |
| | `--xp-gradient-gold-soft` | `#edd3a4 → #d6a439` | huy hiệu giảm giá |
| | `--xp-gradient-card-hover` | vàng 20% trên trắng | nền thẻ danh sách khi hover (Trung tâm Tài xế, Chuyến của tôi) |
| | `--xp-gradient-instant-badge` | `#a4dded → #dfe7f1` | huy hiệu "Không cần xác nhận" |
| | `--xp-gradient-card-highlight` | gold 20% | nền thẻ khi hover |
| | `--xp-gradient-promo-{dark,light}`, `--xp-gradient-destination-shade`, `--xp-hero-fog` | — | lớp phủ ảnh |
| Bóng | `--xp-elevation-{xs,sm,lg}` | bóng v2 tông `#0A0D12` | ô nhập, thẻ xe |
| | `--xp-elevation-{soft,panel}` | xám `#7d7d7d` 15% | thẻ gian hàng/đánh giá, bảng tìm kiếm |
| | `--xp-elevation-{glow,ambient,header}` | — | nút gradient, header |
| | `--xp-elevation-xl` | v2 `Shadow/xl` | popup nổi trên hộp thoại khác (xác minh OTP, đặt lại mật khẩu xong) |
| Kính mờ | `--xp-color-glass` / `-strong` / `-faint` / `-gold`, `--xp-color-scrim-light` | trắng 10/32/5%, kem 20% | chip hero, huy hiệu store, dấu tích |
| Bo góc | `--xp-border-radius-chip` / `-control` / `-card` | 8 / 12 / 16 | huy hiệu · ô nhập, nút · thẻ |
| Khoảng cách | `--xp-space-{2,6,12,20,40,48,64,80}` | px | bậc mịn của v2 (§9) |
| Khung chợ | `--xp-market-container-max-width` / `--xp-market-gutter` / `--xp-market-header-height` | 1200 / 120 / 68 | mọi khối trang chủ |
| Chữ | `--xp-letter-spacing-snug` | `-0.01em` | tiêu đề khối |

Banner admin (không phải token nhưng cùng hợp đồng kích thước): giữ khổ dải cũ — PC **1440×300** ·
tablet 1024×320 · mobile 780×390 (`apps/web/src/features/banners/banner-media.ts`, ADR 0062 điều 8).

## 23. Chuyển động — chợ v2 ✅ (26/10/2026)

Nhóm CHỈ WEB đọc, cùng phạm vi §22. Thông số đo từ trang mẫu GoRental `index-three`
(`assets/css/style.css` + `assets/js/main.js`). Bộ dùng ở `apps/web/src/components/motion/`
(`motion.module.css` · `Reveal` · `useReveal` · `SplitText` · `enterClass` / `kenBurnsClass`) —
CSS thuần + MỘT `IntersectionObserver` dùng chung, không thư viện hoạt cảnh.

| Token | Giá trị | Trang mẫu | Dùng ở |
| --- | --- | --- | --- |
| `--xp-motion-duration-fast` | `0.3s` | `--transition: all .3s` | rê chuột: nhấc thẻ, phóng ảnh, đổi viền/bóng |
| `--xp-motion-duration-reveal` | `1s` | animate.css `.animated` | khối/chữ hiện ra |
| `--xp-motion-duration-ambient` | `40s` | `zoomEffect 40s` | một nhịp "thở" của nền hero |
| `--xp-motion-ease-standard` | `ease` | mặc định của `transition`/animate.css | mọi chuyển động thường |
| `--xp-motion-ease-overshoot` | `cubic-bezier(.175,.885,.32,1.275)` | GSAP `Back.easeOut` | ký tự tiêu đề (`SplitText`) |
| `--xp-motion-distance-reveal` | `40px` | `translate3d(0, 30%, 0)` | khối trượt lên |
| `--xp-motion-distance-char` | `50px` | SplitText `x: 50` | ký tự trượt vào từ phải |
| `--xp-motion-lift-hover` | `-4px` | — (bổ sung) | thẻ nhấc lên; khung `HomeCarousel` chừa đúng 4px phía trên |
| `--xp-motion-scale-media-hover` | `1.05` | `.car-image img { scale(1.05) }` | ảnh trong thẻ khi rê chuột |
| `--xp-motion-scale-ambient` | `1.08` | `zoomEffect` đỉnh `1.2` | đỉnh nhịp thở hero |

Hai chỗ lệch có chủ ý so với trang mẫu: khối trượt **40px cố định** thay vì 30% chiều cao (30% của
một lưới xe cao 600px là 180px — quá xa); đỉnh nhịp thở **1.08** thay vì 1.2, neo **mép trái** ở
dải banner admin vì thông điệp banner nằm mép trái (1.2 cắt mất chữ). `prefers-reduced-motion`
tắt hẳn mọi hoạt cảnh (không chỉ rút ngắn như `globals.css`).
