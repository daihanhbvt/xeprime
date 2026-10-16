# 01 — Brand Guide

> Ngày: 04/08/2026 · Cập nhật: 15/10/2026 (design v2 — ADR 0062) · Chủ sở hữu: Creative Director
> Nguồn sự thật kỹ thuật của token: `packages/ui/src/tokens/index.ts` (`XP_TOKENS`) ↔
> `packages/ui/src/styles/tokens.css` (`@xeprime/ui`, dùng chung web + app native — ADR 0003).
> `apps/web/src/styles/theme.ts` chỉ ánh xạ token sang AntD; `theme.test.ts` giữ ba nơi khớp nhau.
> Bảng token đầy đủ: [`docs/design-token-map.md`](../design-token-map.md).
> **Tài liệu này định nghĩa thương hiệu. Khi nó mâu thuẫn với một màu ai đó gõ tay trong CSS, tài liệu này thắng và CSS phải sửa.**

---

## 1. Thương hiệu XePrime là gì

XePrime kết hợp **chợ đăng/thuê xe** với **phần mềm quản lý cho thuê xe**, nhưng lợi ích cuối cùng không phải số màn hình hay số tin đăng. XePrime bán **sự yên tâm về một tài sản đang chạy ngoài đường**: với khách thuê là yên tâm chiếc xe có thật, giá đúng, người giao đúng hẹn; với chủ xe là yên tâm không trùng lịch, không mất xe, không thất thoát tiền.

Mọi quyết định thị giác phải phục vụ cảm giác đó. Đây là lý do brand đi theo hướng **"sang trọng có kiểm soát"**, không phải "rẻ, vui, nhiều màu".

| Trục | XePrime đứng ở đâu | Không phải là |
| --- | --- | --- |
| Cảm xúc | Tin cậy, chỉn chu, có gu | Rẻ, hối hả, giật gân |
| Ngôn ngữ | Rõ ràng, người thật nói với người thật | Marketing rỗng, "siêu ưu đãi" |
| Thị giác | Gold làm điểm nhấn trên nền kem/trắng ấm | Gold tràn nền, gradient khắp nơi |
| Vai trò | Người vận hành đứng sau | App "vui vẻ" đòi được chú ý |

### Tagline

> **Nâng tầm giá trị mỗi hành trình**

Dùng ở: splash, trang giới thiệu, chân email, ảnh chia sẻ (OG image).
**Không** dùng làm tiêu đề trang trong khu vận hành (site partner, site quản trị) — ở đó tiêu đề là công việc ("Lịch thuê xe"), không phải khẩu hiệu.

### Insight

> Trong ngành này, **niềm tin không được tuyên bố — nó được chứng minh bằng độ chính xác của thông tin nhỏ**.

Khách tin vì đúng chiếc xe trong ảnh, đúng giá cuối, đúng khung giờ còn trống — không vì thấy chữ
"uy tín". Chủ xe tin phần mềm vì tháng này con số khớp với tiền thật, không vì màn hình đẹp. ⇒ Ngân
sách thiết kế đổ vào chỗ thông tin được trình bày, không vào trang trí.

### Ý tưởng lớn: "Bảng điều khiển của một tài sản đang chạy"

XePrime có cảm giác của **buồng lái**, không phải tờ rơi. Gold không dùng để làm sang — nó **chỉ chỗ
cần nhìn**.

1. **Câu trả lời trước, chi tiết sau** — đầu mỗi màn là câu trả lời ("Hôm nay: giao 3, nhận 2, 4 đơn quá hạn thu"), không phải bộ lọc.
2. **Màu là thông tin** — một màn chỉ một điểm gold; ba điểm thì không cái nào còn nghĩa.
3. **Yên tĩnh khi mọi thứ ổn** — giao diện chỉ lên tiếng khi có việc cần người xử lý.

### Tông

| Là | Không phải |
| --- | --- |
| Điềm tĩnh, chắc chắn | Buồn tẻ, vô hồn |
| Sang trọng có kiềm chế | Phô trương, gradient vàng khắp nơi |
| Dày dữ liệu nhưng có thứ bậc | Chật chội, mọi thứ cùng cỡ |
| Thân thiện đúng chỗ (site khách) | Cợt nhả, emoji trong màn tiền |
| Nghiêm túc đúng chỗ (khu vận hành) | Lạnh lùng, thuật ngữ kỹ thuật |

**Hai nhịp, một thương hiệu**: site khách ấm và mời gọi (ảnh lớn, khoảng thở, tiêu đề hero cỡ display); site
partner và quản trị điềm tĩnh, hiệu quả (mật độ cao, gold tiết chế, không font trang trí). Cùng token,
cùng giọng, khác nhịp.

Tham chiếu: **mượn nguyên lý, không mượn hình ảnh** — tốc độ và danh sách dày của Linear, cách trình
bày tiền và lỗi của Stripe, trạng thái rỗng dạy việc của Notion, mẫu quyền hạn nhiều vai của
Atlassian, niềm tin qua ảnh/giá từng dòng/lịch trống của Airbnb. Không màn nào được trông như bản sao
đổi màu của sản phẩm khác.

---

## 2. Logo

### Cấu tạo

| Thành phần | Mô tả | Dùng khi |
| --- | --- | --- |
| **Mark** | Khối hình học: thân xe nhìn nghiêng + chìa khoá tạo thành chữ Y | Favicon, app icon, avatar, chỗ hẹp < 120px |
| **Wordmark** | `xe prime` — 2 dòng, chữ thường, geometric sans | Riêng lẻ chỉ khi mark đã xuất hiện gần đó |
| **Lockup ngang** | Mark trái + wordmark 2 dòng bên phải | Header web, tài liệu, hợp đồng in |
| **Lockup dọc** | Mark trên + wordmark + tagline | Splash, ảnh thương hiệu, biển hiệu |

### Quy tắc bắt buộc

- **Clearspace** = chiều cao mark ÷ 2, đủ 4 phía. Header chật thì thu nhỏ logo, không ăn vào clearspace.
- **Kích thước tối thiểu**: lockup ngang 96px rộng; mark đơn 20px. Dưới ngưỡng đó dùng mark.
- **Nền cho phép**: trắng, kem (`--xp-gold-wash`, `--xp-color-bg-sand`), gold đặc (logo đảo trắng), nâu/đen rất đậm (logo trắng hoặc gold nhạt).
- **Ảnh nền**: chỉ khi có lớp phủ tối ≥ 45% và dùng logo bản trắng.

### Cấm

Kéo méo tỉ lệ · xoay · đổ bóng/viền lên mark · đổi màu ngoài bảng · gold trên kem nhạt (không đủ tương phản) · ghép thành "XePrime Pro"/"XePrime Shop" · vẽ lại mark bằng icon xe của Ant Design.

### Sub-brand

Chỉ có **một** thương hiệu. Ba site (`xeprime.vn` · `partner.xeprime.vn` · `admin.xeprime.vn`) và hai app là các *cánh cửa* của cùng sản phẩm.

**"XePrime Partner"** là TÊN GỌI của site partner và app dành cho chủ xe/gian hàng (ADR 0051 · 0053) —
không phải thương hiệu thứ hai: cùng mark, cùng lockup, chữ "Partner" chỉ là nhãn chữ đi kèm (tiêu đề
trang đăng nhập, tên app trên store, eyebrow chữ nhỏ dưới lockup). Không vẽ logo/mark riêng cho
Partner hay cho site quản trị, không đổi màu thương hiệu theo site.

---

## 3. Màu

### 3.1 Bảng màu thương hiệu

Design v2 từ 15/10/2026 ([ADR 0062](../decisions/0062-design-system-v2.md)): giá trị đọc từ biến
Figma trên màn hình của file "Xe Prime", không từ trang bảng màu thư viện. Bảng đầy đủ:
[`design-token-map.md`](../design-token-map.md).

| Vai trò | HEX | Token | Dùng cho |
| --- | --- | --- | --- |
| Gold — màu chính | `#e9ac29` | `--xp-color-primary` | CTA chính, mục đang chọn, nền nhấn |
| Gold hover | `#cb9115` | `--xp-color-primary-hover` | Hover của phần tử gold |
| Gold nhấn | `#a9761a` | `--xp-color-primary-active` | Trạng thái nhấn, vạch chỉ báo (chưa có trong v2 — giữ bộ cũ) |
| Gold đậm | `#6e5117` | `--xp-color-primary-strong` | **Chữ, giá, icon gold** trên nền sáng — không làm nền dưới chữ tối |
| Gold nhạt | `#fff5e5` | `--xp-color-primary-light` | Nền mục đang chọn, nút phụ |
| Gold nhạt nhất | `#fff9f0` | `--xp-color-primary-subtle` | Ô icon, mảng nền lớn |
| Gold nhạt đậm hơn | `#f6ebd5` | `--xp-color-primary-muted` | Hover trên nền gold nhạt, viền gold nhạt |
| Nền trang | `#fafafa` | `--xp-color-bg` | Nền app — xám rất nhạt |
| Bề mặt | `#ffffff` | `--xp-color-bg-container` | Card, bảng, drawer |
| Chữ | `#101828` | `--xp-color-text` | **Không dùng `#000`** |
| Chữ phụ | `#414651` | `--xp-color-text-secondary` | Nhãn, mô tả |
| Chữ mờ | `#717680` | `--xp-color-text-tertiary` | Meta |
| Placeholder | `#a4a7ae` | `--xp-color-text-placeholder` | Chữ gợi ý trong ô nhập |
| Viền | `#e9eaeb` | `--xp-color-border` | Kẻ bảng, viền card |

### 3.2 Màu ngữ nghĩa — không bao giờ là gold

Gold là màu thương hiệu, nên nó **không được mang nghĩa trạng thái**. Người dùng phải phân biệt "nút chính" với "cảnh báo" mà không cần đọc chữ.

| Nghĩa | HEX | Token |
| --- | --- | --- |
| Thành công / đã thu đủ | `#039855` | `--xp-color-success` |
| Cảnh báo / sắp đến hạn | `#e07b26` (cam, **tách khỏi gold**; chưa chuyển sang v2) | `--xp-color-warning` |
| Lỗi / quá hạn / huỷ | `#d92d20` | `--xp-color-error` |
| Thông tin / đang thuê | `#2563eb` | `--xp-color-info` |

> Đây chính là lý do warning là **cam**: một cảnh báo màu vàng trên nền thương hiệu vàng thì không còn là cảnh báo.

### 3.3 Ba khoảng trống phải lấp (nợ thiết kế)

1. **Thang màu thay vì màu đơn.** Mỗi màu ngữ nghĩa cần ≥ 3 bậc: `-bg` (nền chip/alert), `-border`, `-text`. Hiện code tự pha `rgba()` tại chỗ — đó là cách bảng màu trôi.
2. **Dark theme cho khu vận hành (site partner, site quản trị).** Chủ xe làm việc buổi tối; UI Firebase cũ vốn là dark. `tokens.css` đã ghi "dark thêm ở increment sau" — kiến trúc sẵn sàng, thiếu bộ giá trị. Site khách giữ light-only.
3. **Màu dữ liệu (data-viz).** Dashboard tài chính cần dải 6 màu phân biệt được, **không** lấy từ màu ngữ nghĩa — nếu không, cột "chi phí" màu đỏ sẽ bị đọc thành "lỗi".

### 3.4 Tương phản

Chuẩn tối thiểu **WCAG AA**: chữ thường ≥ 4.5:1; chữ ≥ 18px hoặc bold ≥ 3:1; viền/icon mang nghĩa ≥ 3:1.
Cụ thể: **gold `#e9ac29` chỉ đạt 2.0:1 với chữ trắng** → chữ trên nút gold là `--xp-color-primary-contrast` (`#101828`, 8.8:1), không phải trắng. Gold chính làm CHỮ trên nền sáng cũng chỉ 2.0:1 → chữ gold dùng `--xp-color-primary-strong` (7.4:1), trừ chỗ design vẽ rõ gold chính (ADR 0062 điều 6).

---

## 4. Chữ

| Vai trò | Font | Vì sao |
| --- | --- | --- |
| Toàn hệ thống | **Google Sans Flex** (variable 400–700, self-host qua `next/font`, subset tiếng Việt) | Họ chữ DUY NHẤT của design v2 — kể cả hero (ADR 0062 điều 7) |
| Số liệu / tiền | Google Sans Flex + `font-variant-numeric: tabular-nums` | Cột tiền phải thẳng hàng — đây là lỗi hiện có ở các bảng tài chính |

### Thang chữ

Thang v2 (token `--xp-font-size-*` / `--xp-line-height-*`, chi tiết ở `design-token-map.md` §8):

| Bậc | Size / Line | Weight | Dùng |
| --- | --- | --- | --- |
| Display | 48 / 60, −2% (mobile 32) | 600 | Hero marketplace |
| Display nhỏ | 36 / 44 | 500–700 | Tiêu đề lớn của section marketing |
| H1 | 30 / 38 | 600 | Tiêu đề trang |
| H2 | 24 / 32 | 500–600 | Tiêu đề section, drawer |
| H3 | 18 / 28 | 600 | Tiêu đề card |
| Body | 14 / 20 | 400 | Mặc định (`--xp-font-size`; AntD còn chạy cao dòng 1.5714) |
| Small | 12 / 18 | 400–500 | Meta, nhãn phụ, kicker |
| Số | 14 | 500 + tabular | Tiền, mã đơn, biển số |

**Quy tắc**: tối đa 2 weight trên một màn vận hành. Không ALL-CAPS cho tiếng Việt dài hơn 3 từ (dấu viết hoa toàn phần khó đọc); nhãn cột dạng caps chỉ ≤ 2 từ.

---

## 5. Hình khối, khoảng cách, độ nổi

- **Bo góc**: `10px` mặc định, `6px` cho phần tử nhỏ (tag, input trong bảng), `999px` cho chip lọc và avatar. **Không có bán kính thứ tư.**
- **Khoảng cách**: thang 4/8/16/24/32 (`--xp-space-*`). Mọi khoảng cách phải là một trong năm giá trị này. Không `13px`, không `18px`.
- **Đổ bóng**: 3 bậc, tất cả **ám nâu ấm** — bóng xám trung tính trên nền kem trông bẩn. Card tĩnh dùng viền; bóng dành cho vật thể *nổi lên* (dropdown, drawer, modal, popover).
- **Đường kẻ**: `--xp-color-border-secondary` cho kẻ trong bảng, `--xp-color-border` cho ranh giới vùng. Bảng dày dữ liệu: chỉ kẻ ngang, bỏ kẻ dọc.

---

## 6. Ảnh

Đây là điểm yếu lớn nhất của UI hiện tại và là rủi ro thương hiệu trực tiếp: trên marketplace đang có **thẻ xe dùng ảnh phong cảnh, ảnh chụp màn hình, ảnh quảng cáo sim** làm ảnh xe. Một sàn cho thuê xe mà thẻ xe là ảnh núi thì mọi nỗ lực thị giác khác đều vô nghĩa.

### Chuẩn ảnh xe

| Tiêu chí | Yêu cầu |
| --- | --- |
| Tỉ lệ | 4:3 cho thẻ, 16:9 cho ảnh bìa chi tiết |
| Kích thước tối thiểu | 1200 × 900 |
| Nội dung | Toàn bộ chiếc xe trong khung, góc 3/4 trước cho ảnh đại diện |
| Ánh sáng | Đủ sáng; cấm ảnh tối/nhoè/ngược sáng |
| Cấm | Ảnh chụp màn hình, watermark bên khác, ảnh không có xe, ảnh người, ảnh giấy tờ |

**Cơ chế thực thi** (thuộc sản phẩm, không phải lời nhắc): màn "Kiểm duyệt xe" có mục kiểm tra thủ công "ảnh là ảnh thật của chính chiếc xe" và phê duyệt bị backend chặn khi mục đó chưa đạt (ADR 0049) · nên chặn ngay lúc upload theo tỉ lệ/kích thước · có placeholder có thương hiệu cho xe chưa ảnh — placeholder đẹp còn hơn ảnh sai.

### Ảnh thương hiệu

Xe trên đường Việt Nam, giờ vàng, tông ấm. Không stock siêu xe châu Âu, không render 3D bóng loáng — khách nhận ra ngay đó không phải chiếc xe họ sẽ nhận.

---

## 7. Icon

**Chỉ `@ant-design/icons`** (CLAUDE.md §4 — hai bộ icon là nợ kỹ thuật). Outlined mặc định; Filled chỉ để chỉ trạng thái đang bật. Cỡ 16 / 20 / 24. Icon luôn kèm nhãn ở hành động chính; icon-only chỉ dùng cho hành động lặp trong hàng bảng và **bắt buộc `aria-label` + tooltip**.

Mark của logo là tài sản thương hiệu, không phải icon — không đưa vào bộ icon giao diện.

---

## 8. Chuyển động

Chuyển động ở đây để **giải thích cái vừa xảy ra**, không để gây ấn tượng.

| Loại | Thời lượng | Easing |
| --- | --- | --- |
| Hover, đổi màu | 120ms | ease-out |
| Drawer, bottom sheet | 240ms | cubic-bezier(.2,.8,.2,1) |
| Modal | 180ms | ease-out |
| Skeleton | 1200ms lặp | linear |

Cấm: parallax · hiệu ứng cuộn tiết lộ nội dung · spinner toàn trang khi chỉ một vùng đang tải · animation trong bảng dữ liệu.
Bắt buộc tôn trọng `prefers-reduced-motion`.

---

## 9. Giọng nói

**Người vận hành có nghề nói với người vận hành khác.** Bình tĩnh, cụ thể, không hạ cố.

| Nguyên tắc | Thay vì | Viết là |
| --- | --- | --- |
| Nói cái đã xảy ra + bước tiếp theo | "Có lỗi xảy ra" | "Xe này đã có đơn trùng khung 08:00–20:00 ngày 12/07. Chọn khung khác hoặc xe khác." |
| Không đổ lỗi người dùng | "Bạn nhập sai định dạng" | "Số điện thoại cần 10 chữ số, bắt đầu bằng 0." |
| Trạng thái rỗng phải dạy việc | "Không có dữ liệu" | "Chưa có đơn thuê nào. Tạo đơn đầu tiên hoặc chờ yêu cầu từ marketplace." |
| Không hứa cái không làm | "Đang xử lý…" | "Đang giữ lịch cho xe này…" |
| Tiếng Việt có dấu, luôn luôn | "Dat xe" | "Đặt xe" |

**Từ vựng chốt** — một khái niệm, một từ, trên toàn sản phẩm:

| Khái niệm | Từ dùng | Không dùng |
| --- | --- | --- |
| `tenant` | **gian hàng** | shop, cửa hàng, chi nhánh, tenant |
| `booking_request` | **yêu cầu đặt xe** (menu, ADR 0047) · "yêu cầu thuê" trong câu văn | đơn đặt xe, booking request |
| `booking` | **đơn thuê** — chỉ ra đời khi tiền giữ chỗ đã đối soát đủ (ADR 0044) | booking, hợp đồng thuê |
| `booking.status = reserved` | **Chờ giao xe** (nhãn `Domain.bookingStatus.reserved`, ADR 0047) | Đã giữ xe, Đặt trước, Đã xác nhận |
| khoản khách chuyển qua QR (`booking_holds`) | **tiền giữ chỗ** (gồm cọc, phí dịch vụ phía khách, bảo hiểm) | cọc, đặt cọc (ADR 0044 điều 9) |
| khoản thế chấp giao lúc nhận xe (`rental-policies`) | **cọc thế chấp khi nhận xe** | tiền giữ chỗ — hai khoản khác hẳn nhau |
| `wallets` | **Ví điểm** (khái niệm, 1 điểm = 1đ, ADR 0033); nhãn màn: "Số dư của tôi" (khách) · "Số dư & rút tiền" (đối tác) | ví điện tử, nạp tiền, chuyển tiền, điểm thưởng |
| site `partner.xeprime.vn` (realm `partner`) | **XePrime Partner** · "site đối tác" | portal, cổng quản lý, /manage |
| `vehicle` | **xe** | phương tiện |
| `customer` | **khách thuê** | user, khách hàng (ở ngữ cảnh nền tảng) |
| `platform_admin` | **quản trị nền tảng** | admin, super admin |
| `receipt` | **phiếu thu/chi** | biên lai |
| `debt` | **công nợ** | nợ, phải thu |

> UI dùng lẫn "Cửa hàng" (menu site partner, kiểm lại 06/10/2026), "gian hàng" (nội dung), "shop" (code) cho **cùng một thứ**. Chốt: nhãn hiển thị là **gian hàng**; menu `Cửa hàng` → `Gian hàng`.

---

## 10. Ứng dụng thương hiệu

| Bề mặt | Quy tắc |
| --- | --- |
| App icon / favicon | Mark trắng trên gold đặc, bo góc theo nền tảng |
| Site khách (chợ xe) | Nền trắng/xám rất nhạt, gold ở CTA và điểm nhấn, chữ nhấn gradient gold chỉ ở hero |
| Site partner · site quản trị | Trung tính hơn: nền `--xp-color-bg`, gold **chỉ** ở mục menu đang chọn + nút hành động chính. Đây là chỗ làm việc, không phải trang bán hàng |
| Hợp đồng in | Đen trắng + lockup ngang; print CSS đã có ở `[data-print-root]`. Không in nền màu |
| Email / thông báo | Lockup ngang trên nền trắng, một CTA gold duy nhất |
| Ảnh OG | Lockup dọc + tagline trên nền cát, hoặc ảnh xe với lớp phủ tối |

---

## 11. Kiểm tra trước khi phát hành

- [ ] Không có HEX viết tay trong `.module.css` — tất cả qua `var(--xp-*)`
- [ ] Chữ trên nền gold là `--xp-color-primary-contrast`, không phải trắng
- [ ] Một họ chữ duy nhất (Google Sans Flex) — không thêm font trang trí
- [ ] Mọi ảnh xe đúng tỉ lệ, có xe trong khung
- [ ] Từ vựng khớp bảng §9 trên mọi nhãn mới
- [ ] Tương phản AA ở mặc định, hover và disabled
- [ ] `prefers-reduced-motion` được tôn trọng

Liên quan: [`08_UX_GUIDELINES.md`](08_UX_GUIDELINES.md) (nguyên tắc, mẫu tương tác, ràng buộc kỹ thuật) · [`docs/design-token-map.md`](../design-token-map.md) · ADR 0003.
