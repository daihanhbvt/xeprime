# ADR 0062 — Design system v2: token đọc từ màn hình của file Figma "Xe Prime"

Ngày: 15/10/2026 · Trạng thái: **Accepted** (chủ sản phẩm chốt 15/10/2026)

Ghi đè:

- [`docs/design-token-map.md`](../design-token-map.md) §0 điều 1 ("Foundations `14:*` là nguồn
  GIÁ TRỊ token duy nhất") và đóng §21 P15 — cả Hệ A lẫn Hệ B của file Figma cũ đều bị thay.
- [`docs/design/01_BRAND_GUIDE.md`](../design/01_BRAND_GUIDE.md) §3–§4 ở phần giá trị màu, font
  và thang chữ (cập nhật cùng thay đổi này).

Liên quan: [ADR 0003](0003-styling-css-modules.md) (cơ chế AntD token + CSS Modules — giữ nguyên),
[ADR 0051](0051-product-surfaces-web-zones-and-mobile-variants.md) (token dùng chung web + app
native).

## Bối cảnh

Ngày 15/10/2026 có bộ design mới cho toàn dự án: phần dùng chung (màu, nút, ô nhập…) và từng
trang. Thư viện nền của bộ design là **Untitled UI**. Trang "Primary colors" của file vẫn là bảng
màu của thư viện CHƯA chỉnh theo dự án (thang Brand ở đó màu tím), trong khi mọi màn đã thiết kế
dùng gold. Chủ sản phẩm chốt: màu chủ đạo vẫn là gold, **gold của design mới**, và khi ráp ra
phải khớp đúng màn hình.

Bộ token đang chạy lấy từ section "XePrime Foundations" (`14:*`) của file Figma cũ. File đó không
dùng Figma Variables, nên giá trị phải đọc từng swatch. File mới có Variables: một lần đọc trả cả
tên lẫn giá trị của mọi biến mà một frame đang dùng.

Ba frame đã đọc (bản sao `IcfZAFg9vO2Jt2cn77Bhv7` của file "Xe Prime"): trang chủ desktop
`19695:40693`, bảng màu `1525:271581`, bảng nút `8636:8263`.

`@xeprime/ui` là nguồn token chung cho web và app native: app native đọc thẳng giá trị
`XP_TOKENS`. Một token đổi giá trị là cả hai client đổi theo. App native thuộc dev khác, và thay
đổi này không sửa mã native.

## Quyết định

### 1. Nguồn giá trị là biến Figma trên MÀN HÌNH, không phải trang bảng màu thư viện

Giá trị token đọc từ Figma Variables mà các màn và bảng component của file "Xe Prime" đang áp.
Trang bảng màu thư viện không phải nguồn. Khi trang thư viện và một màn mâu thuẫn, **màn thắng**.
Mỗi token ghi tên biến Figma bên cạnh (`// v2 BG/primary`) để lần sau đối chiếu theo tên, không
theo mắt.

### 2. Giá trị v2

| Nhóm                  | Giá trị                                                             | Biến Figma                                             |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Gold chính            | `#e9ac29`                                                           | `BG/primary` · `Text/Brand/primary` · `Stroke/primary` |
| Gold hover            | `#cb9115`                                                           | `Text/Brand/primary 2`                                 |
| Gold đọc được làm chữ | `#6e5117`                                                           | `BG/primary-high` · `Text/Brand/high`                  |
| Gold nhạt (3 bậc)     | `#fff9f0` · `#fff5e5` · `#f6ebd5`                                   | `BG/primary-25` · `BG/primary-low` · `BG/primary-100`  |
| Chữ (4 bậc)           | `#101828` · `#414651` · `#717680` · `#a4a7ae`                       | `Text/Gray/high` · `medium` · `low` · `very-low`       |
| Nền                   | `#ffffff` · `#fafafa` · `#f5f5f5`                                   | `BG/white` · `BG/gray-50` · `BG/gray-100`              |
| Viền                  | `#e9eaeb` · `#d5d7da`                                               | `Stroke/gray-low200` · `Stroke/gray-low300`            |
| Success               | `#039855` / `#ecfdf3`                                               | `Status/success-high` / `-low`                         |
| Error                 | `#d92d20` / `#fef3f2`                                               | `Status/error-high` / `BG/destructive-low`             |
| Font                  | Google Sans Flex                                                    | `font-googlesan`                                       |
| Thang chữ             | 12/18 · 14/20 · 16/24 · 18/28 · 24/32 · 30/38 · 36/44 · 48/60 (−2%) | `<size>px/<weight>`                                    |

Bảng ánh xạ đầy đủ sang `--xp-*` và AntD: [`design-token-map.md`](../design-token-map.md).

### 3. Giữ TÊN token ngữ nghĩa, đổi GIÁ TRỊ — không thêm tầng primitive

441 CSS Module đã dùng tên ngữ nghĩa (`--xp-color-text`, `--xp-color-primary-light`…). Đổi giá
trị dưới cùng một tên là cả app đổi theo mà không sửa file nào.

Không dựng tầng thang thô (`--xp-gray-25…900`, `--xp-gold-…`) bên dưới, vì ba lý do:

- Màn hình v2 áp biến NGỮ NGHĨA (`Text/Gray/high`, `BG/primary-low`), không gọi thẳng bậc thang.
  Ánh xạ một-một với tên ngữ nghĩa là đúng cái Figma đang nói.
- App native đọc thẳng giá trị `XP_TOKENS`. Một tầng `var()` cho mọi màu là thêm một lượt gỡ bí
  danh ở mỗi lần nạp, mà không mang lại gì cho người dùng.
- Thang của thư viện là thứ chưa được chỉnh theo dự án (điều 1).

**Không đổi NGHĨA của một token đang có.** Token nào v2 không có vai trò tương ứng thì giữ giá trị
cũ (điều 5), không ghép nó vào một màu v2 "gần giống". Lý do: consumer của một tên token không
đồng nhất — cùng một token có chỗ dùng làm chữ, có chỗ làm nền dưới chữ tối, ở cả hai client.

Token mới chỉ thêm khi v2 có một VAI TRÒ chưa có tên: `color-primary-strong`,
`color-primary-subtle`, `color-primary-muted`, `color-text-placeholder`, `font-size-display-sm` /
`line-height-display-sm`, `letter-spacing-display`.

### 4. Chuyển theo hai tầng

- **Token nền đổi MỘT lần** (gold, xám, chữ, trạng thái đã đọc được, font, thang chữ), trước khi
  ráp màn nào. Đổi dần theo màn thì app sống nhiều tuần với hai bộ gold và hai font cạnh nhau.
- **Component sửa khi ráp màn ĐẦU TIÊN dùng nó**: sửa trọn mọi biến thể v2 của component đó, ở
  chỗ dùng chung (`components/`, `antdTheme`), không vá riêng cho từng màn. Bo góc, chiều cao
  control, bậc khoảng cách mới và gradient đi cùng component cần chúng.

### 5. Giữ nguyên có chủ đích tới khi đọc được hoặc phối hợp được

| Nhóm                                                          | Vì sao chưa đổi                                                                                                                                                                                                            | Đổi khi                                                        |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Bóng đổ `shadow-*`                                            | Bóng v2 tông đen lạnh `#0A0D12`, nhiều bậc HAI lớp. Bộ parse bóng của app native chỉ nhận một lớp, và test native chốt cứng `shadow-card`                                                                                  | Cùng dev mobile: parser hai lớp + cập nhật test                |
| Sidebar tối `shell-sidebar-*`                                 | Chưa đọc màn partner/admin nào. `sidebar.test.ts` của native chốt cứng ba màu gốc                                                                                                                                          | Ráp vỏ partner/admin, cùng dev mobile                          |
| Bậc nhấn `color-primary-active` `#a9761a`                     | v2 chưa vẽ trạng thái nhấn. Token đang làm NỀN dưới chữ/icon tối: 3 nút CTA lúc rê chuột trên web; chấm thông báo chưa đọc và nút gửi đang nhấn trên native (69 file web + ~130 file native đọc token này, đếm 15/10/2026) | v2 vẽ trạng thái nhấn                                          |
| Cỡ chữ `overline` 11/16                                       | v2 không có 11px. Native đọc bậc này cho dòng meta dày đặc (43 chỗ); 12px là bị cắt "…" trên máy 360dp                                                                                                                     | Cùng dev mobile; kicker web dùng `font-size-label` khi ráp màn |
| `color-text-disabled` (25% chữ chính)                         | v2 có `Text/Gray/disable` `#d5d7da` (1.46:1), nhưng AntD dùng màu này cả cho giá trị ô nhập bị khoá và ngày ngoài tháng của DatePicker                                                                                     | Designer nói rõ phạm vi (Q8)                                   |
| Warning, info                                                 | Ba frame chỉ có `warning-300/500` (chấm/icon). `#f79009` làm chữ trên nền nhạt chỉ ~2.2:1                                                                                                                                  | Đọc được màn có trạng thái đó                                  |
| Link, overlay, nền hover, dải màu biểu đồ                     | v2 chưa định nghĩa                                                                                                                                                                                                         | Màn đầu tiên có chúng                                          |
| Khoảng cách, bo góc, `controlHeight` 32, `line-height` 1.5714 | Gắn theo component                                                                                                                                                                                                         | Điều 4                                                         |

`color-text-disabled` vẫn đi theo chữ v2 (`rgba(16, 24, 40, .25)`) vì nó là công thức, không phải
một màu. Lưới và trục biểu đồ, viền topbar, màu "yêu cầu" trên lịch cũng đổi: chúng là màu
xám/gold của hệ, không phải lựa chọn riêng.

### 6. Chữ gold phải đọc được — thêm `color-primary-strong`

Design dùng gold chính `#e9ac29` làm chữ nhỏ ở vài chỗ (dòng kicker, nhãn tab), chỉ đạt 2.0:1
trên trắng. Chỗ nào design vẽ như thế thì ráp đúng như thế (Còn mở Q3).

Token MỚI `color-primary-strong` = Brand/high `#6e5117` (7.4:1) là màu mặc định cho chữ, giá, icon
gold khi design không chỉ định khác. `color-price` trỏ về nó (trước đây trỏ `color-primary-active`,
3.9:1). Nó KHÔNG làm nền dưới chữ tối (2.4:1) — đó là lý do không ghép nó vào
`color-primary-active` (điều 3, điều 5).

`antdTheme` không ánh xạ `colorPrimaryActive` nữa. Bậc nhấn cũ `#a9761a` chỉ đạt 4.47:1 với chữ v2
trên nút, còn bậc AntD tự dẫn xuất từ gold mới đậm hơn hover và đạt khoảng 5.7:1. Có test khoá.

### 7. Một họ chữ: Google Sans Flex

Google Sans Flex có trên Google Fonts, tự host qua `next/font` (`--font-google-sans`), dùng bản
variable chỉ trục `wght` (một file phủ 400–700), subset `latin` + `vietnamese`. Playfair Display
bỏ khỏi layout web. `--xp-font-family-display` thành bí danh deprecated trỏ `--xp-font-family`;
các consumer còn lại đổi khi ráp màn của chúng.

### 8. Bề mặt chợ (trang chủ, header, footer) có nhóm token riêng — chỉ web đọc

Trang chủ v2 (Figma `19695:40693`, ráp 15/10/2026) dùng gradient, bóng hai lớp, kính mờ và thang
khoảng cách mịn mà app native không parse được (`elevation.ts` một lớp, bộ resolve ném lỗi với
`linear-gradient`). Các giá trị đó vào một nhóm RIÊNG trong `tokens.css`/`XP_TOKENS` mà native
không đọc: màu trên nền tối (`color-bg-inverse`, `color-text-on-dark*`, `color-primary-{bright,
pale,accent,glow}`), `gradient-*`, `elevation-*`, `color-glass*`, bo góc `chip`/`control`/`card`
(8/12/16), bậc khoảng cách `2/6/12/20/40/48/64/80` và khung chợ (`market-container-max-width`
1200, `market-gutter` 120, `market-header-height` 68). Bảng đủ: `design-token-map.md` §22. Không
token nào ở nhóm này thay NGHĨA một token cũ (điều 3).

Hai hệ quả ngoài token, cùng đợt:

- **Dải banner đầu trang GIỮ khổ cũ** (quyết định 16/10/2026): banner admin vẫn là một dải tự mang
  thông điệp — PC 1440×450 · tablet 1024×450 · mobile 780×450 (`BANNER_SLOTS`; đổi 30/10/2026 từ 1440×300 ·
  1024×320 · 780×390), không chữ nào đè
  lên ảnh; tiêu đề và ba điểm nổi bật của hero trong bản vẽ KHÔNG dùng. Thẻ tìm kiếm desktop đè lên
  102px dưới cùng của dải. Chưa có banner nào (hoặc mọi ảnh đều hỏng) thì dải mặc định cùng khổ dùng
  ảnh nền + tiêu đề của bản vẽ (`/home/hero-fallback.webp`). Phương án "banner làm nền hero 1440×587"
  thử ngày 15/10 đã gỡ trước khi commit.
- **Banner khuyến mãi giữa trang do admin quản lý** (16/10/2026, trước đó gán cứng trong mã): cùng
  bảng `marketplace_banners` và cùng đường ghi `BannersService` với dải banner đầu trang, phân biệt
  bằng cột `placement` (`hero` | `promo`, CHECK ở DB, đặt lúc tạo, không đổi được). Trần 10 banner
  hiển thị cùng lúc, thứ tự và lịch tính RIÊNG từng vị trí. Khổ `PROMO_BANNER_SLOTS`: PC 1168×360
  (ô 584×180 của bản vẽ, @2x), mobile tuỳ chọn 680×400; chữ nằm sẵn trong ảnh. Không có banner
  khuyến mãi nào đang hiển thị thì khối ẩn hẳn — trang không tự bịa một ưu đãi. `GET /public/banners`
  không kèm `placement` vẫn trả banner đầu trang (app native không đổi gì). Seed demo có hai banner
  khuyến mãi mẫu dựng lại từ bản vẽ; seed system thì không.
- **Khối "Loại xe" trang chủ đọc DANH MỤC kiểu dáng** (16/10/2026, trước đó gán cứng danh sách, ảnh
  và dòng ví dụ trong mã): `catalog_items` thêm `show_on_home`, `showcase_image_url`,
  `showcase_examples` — chỉ cho `body_type` (CHECK), và bật hiện thì bắt buộc có ảnh (CHECK). Tên và
  thứ tự trên trang chủ là `label`/`sort_order` của danh mục: một kiểu dáng không mang hai cái tên.
  Ảnh danh mục (icon bộ lọc, logo hãng, ảnh trang chủ) tải lên R2 qua `POST /platform/catalog/presign`
  thay cho ô gõ đường dẫn tới file tĩnh trong repo; mục cũ trỏ `/body-types/*.png` vẫn hiển thị. Không
  có kiểu dáng nào bật thì khối ẩn.
- **Băng chuyền dùng Embla Carousel** (`embla-carousel-react`, ~7 KB, không phụ thuộc thêm) qua MỘT
  component `HomeCarousel`: kéo được bằng chuột trên desktop, mobile là slider thẻ-ở-giữa có vòng
  lặp + chấm phân trang (bản vẽ mobile v2). Khối dạng lưới ở desktop (xe tiêu biểu, địa điểm) dùng
  `layout="grid"`: Embla tắt từ 641px, chỉ CSS. Cuộn ngang CSS (scroll-snap) trước đó không kéo
  được bằng chuột và không có chế độ thẻ-ở-giữa.
- **Mobile (≤ 640px)**: mọi tiêu đề khối canh giữa, có gạch vàng; nút "Xem tất cả" chuyển xuống
  dưới slider.
- **Icon của bản vẽ v2 trên bề mặt chợ** (16/10/2026): trang chủ và hộp tài khoản dùng đúng VECTOR
  GỐC của Figma — tệp `public/home/*.svg`, hoặc component SVG nội tuyến tô `currentColor` khi icon cần
  đổi màu theo trạng thái (`features/auth/components/AuthIcons.tsx`: ô nhập, nút đóng, dấu tích).
  Đây là tài sản của bản vẽ, không phải thư viện icon thứ hai: không cài gói icon nào mới, và khu
  quản lý/quản trị vẫn chỉ dùng `@ant-design/icons` (CLAUDE.md §4).
- **Trần banner hiển thị cùng lúc có mã lỗi riêng** `BANNER_VISIBLE_LIMIT_EXCEEDED` (`details.max`)
  thay vì `VALIDATION_FAILED` — màn quản trị nói đúng lý do thay vì đoán.
- **API thêm trường cho thẻ** (chỉ THÊM, không đổi trường cũ): `PublicListingDto` có
  `imageCount`, `transmission` (bộ mã `TRANSMISSION_TYPE_EXT` của hồ sơ xe; thẻ gom về nhóm bằng
  `transmissionFamily`), `instantBookServiceTypes`, `wardName` (cột mới của `public_listings`,
  `ListingsService` vẫn là writer duy nhất — ADR 0008); `PublicShopSummaryDto`
  có `bio`, `completedTripCount`, `featuredVehicleImageUrl`; `PublicDestinationDto` có
  `minDailyPrice` — gộp `_min` trên cột snapshot `self_drive_daily_price` (giá tự lái/ngày đã trừ
  khuyến mãi trực tiếp, cùng phép làm tròn với thẻ xe) ngay trong `publicListingScope()`, không SQL
  chép tay phạm vi; endpoint mới `GET /public/reviews/featured` (từ 4 sao, nhận xét đủ dài, gian
  hàng đang hoạt động, tối đa 2 lời mỗi gian hàng).

## Hệ quả

- Cả web đổi ngay mà chưa sửa component nào: gold sáng hơn, nền và viền chuyển từ xám ấm sang xám
  lạnh, chữ `#101828`, font Google Sans Flex, số tiền gold đậm hơn. `h1` 32→30, `h3` 20→18,
  caption/label cao dòng 16→18.
- **App native đổi theo** những token nó đọc, vì cùng nguồn: gold chính/hover/nhạt, xám, chữ, nền,
  viền, success/error, màu giá (`colors.price` → `#6e5117`), `h1`/`h3`. KHÔNG đổi: bóng, sidebar,
  bậc nhấn, cỡ meta (điều 5). `tokens.test.ts` và `sidebar.test.ts` của native vẫn xanh, nhưng
  chúng chỉ kiểm định dạng giá trị chứ không kiểm hình ảnh. **Dev mobile phải duyệt trước khi
  merge.** Các việc native còn lại ghi ở Q7.
- Tương phản tốt lên ở các cặp từng trượt: `text-tertiary` trên nền trang 2.72 → 4.37, success
  3.15 → 3.54, error 4.41 → 4.44, màu giá 3.9 → 7.4. `theme.test.ts` chốt mức mới.
- Còn chép tay bảng màu cũ, không qua token, nên chưa đổi:
  - ảnh minh hoạ `apps/web/public/app/*.svg`: vẽ lại khi làm trang tải app;
  - bảng màu của email hướng dẫn gói, `apps/api/src/modules/email/plan-guide-email.ts`: chuyển khi
    chạm tới email;
  - thanh cuộn (`gold-soft` và màu hover gõ tay trong `globals.css`).
- Bốn màn từng dùng Playfair (chân trang chợ, đầu và phần giới thiệu gian hàng, hero trang nội
  dung) nay hiện Google Sans; ghi chú "serif" trong các file đó sửa khi ráp màn.
- Vài ghi chú tương phản trong file không chạm tới (`ManageMenu.module.css`, `MobileNav.module.css`,
  `AccountTrackBadge.tsx`, `Sidebar.test.tsx`) còn ghi số đo của chữ phụ bộ cũ. Kết luận của chúng
  (chữ nền sáng không dùng được trên sidebar tối) vẫn đúng, và còn đúng hơn: v2 đạt 1.81:1.
- Đọc Figma có giới hạn vận hành (quyền edit, hạn mức lượt gọi). Cách đọc ghi ở đầu
  `design-token-map.md`.

## Còn mở

- ~~**Q1**~~ — ĐÓNG 15/10/2026: điểm màu đọc từ code của màn trang chủ —
  `gradient-primary` (`#e9c336 → #e8c664 → #e3b012`) và `gradient-text-hero`
  (`#eeb924 → #ba8b26`), điều 8.
- **Q2** — Biến `Border/Primary/Normal` = `#ce2029` (màu đỏ) mà đặt tên "Primary", đang có trên
  trang chủ. Hỏi designer có gán nhầm không.
- **Q3** — Gold chính làm chữ nhỏ (2.0:1): designer xác nhận có chủ đích, hay đổi sang Brand/high.
- **Q4** — Bậc chữ/nền của warning và info.
- **Q5** — Bóng v2 và sidebar tối: làm cùng dev mobile.
- **Q6** — Thang khoảng cách, bo góc, chiều cao control của v2: theo từng component. Đã có
  cho bề mặt chợ (điều 8); khu partner/admin chốt khi ráp màn của chúng.
- **Q7** — Việc của dev mobile để native khớp v2:
  - font: native còn nạp Be Vietnam Pro + Playfair (`apps/mobile/shared/src/theme/fonts.ts`), trong
    khi `tamagui.config.test.ts` ghi luật "cùng họ chữ với web";
  - `colors.placeholder` đang đọc `color-text-tertiary`; v2 có `color-text-placeholder` riêng;
  - cỡ meta (`overline`), bóng hai lớp, sidebar (điều 5);
  - duyệt hình ảnh: màu giá đậm hơn, `h1`/`h3` nhỏ hơn, xám lạnh.
- **Q8** — `Text/Gray/disable` `#d5d7da` dành cho nhãn nút bị khoá, hay cả giá trị ô nhập bị khoá?

## Điều kiện xem lại

Designer đổi thư viện nền hoặc thang gold; app native cần một bộ giá trị riêng; hoặc v2 thêm chế
độ tối.
