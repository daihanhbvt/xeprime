# 01 — Brand Guide

> Ngày: 04/08/2026 · Chủ sở hữu: Creative Director
> Nguồn sự thật kỹ thuật của token: `apps/web/src/styles/theme.ts` ↔ `tokens.css` (ADR 0003).
> **Tài liệu này định nghĩa thương hiệu. Khi nó mâu thuẫn với một màu ai đó gõ tay trong CSS, tài liệu này thắng và CSS phải sửa.**

---

## 1. Thương hiệu XePrime là gì

XePrime không bán "phần mềm quản lý xe" và cũng không bán "chỗ đăng tin". XePrime bán **sự yên tâm về một tài sản đang chạy ngoài đường**: với khách thuê là yên tâm chiếc xe có thật, giá đúng, người giao đúng hẹn; với chủ xe là yên tâm không trùng lịch, không mất xe, không thất thoát tiền.

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
**Không** dùng làm tiêu đề trang trong portal vận hành — ở đó tiêu đề là công việc ("Lịch thuê xe"), không phải khẩu hiệu.

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

Chỉ có **một** thương hiệu. Portal và marketplace là hai *cánh cửa* của cùng sản phẩm. Được phép thêm eyebrow chữ nhỏ dưới lockup trong portal: `QUẢN LÝ & CHO THUÊ XE` — đúng như UI hiện tại. Không tạo logo riêng cho portal.

---

## 3. Màu

### 3.1 Bảng màu thương hiệu

| Vai trò | HEX | Token | Dùng cho |
| --- | --- | --- | --- |
| Gold — màu chính | `#d6a02c` | `--xp-color-primary` | CTA chính, mục đang chọn, nhấn số liệu |
| Gold đậm | `#a9761a` | `--xp-gold-deep` | Hover/pressed, chữ gold trên nền kem |
| Gold nhạt | `#f1dba4` | `--xp-gold-soft` | Viền nhấn, scrollbar, chip nhẹ |
| Kem | `#f7f1de` | `--xp-gold-wash` | Nền menu đang chọn, ô icon |
| Cát | `#f5ead2` | `--xp-color-bg-sand` | Mảng nền lớn trang marketing |
| Nền trang | `#f6f5f1` | `--xp-color-bg-layout` | Nền app — trắng **ấm**, không phải xám trung tính |
| Bề mặt | `#ffffff` | `--xp-color-bg-container` | Card, bảng, drawer |
| Chữ | `#2a2318` | `--xp-color-text` | Đen ấm — **không dùng `#000`** |
| Chữ phụ | `#6f6450` | `--xp-color-text-secondary` | Nhãn, mô tả |
| Chữ mờ | `#9a8d74` | `--xp-color-text-tertiary` | Placeholder, meta |
| Viền | `#ebddbf` | `--xp-color-border` | Kẻ bảng, viền card |

### 3.2 Màu ngữ nghĩa — không bao giờ là gold

Gold là màu thương hiệu, nên nó **không được mang nghĩa trạng thái**. Người dùng phải phân biệt "nút chính" với "cảnh báo" mà không cần đọc chữ.

| Nghĩa | HEX | Token |
| --- | --- | --- |
| Thành công / đã thu đủ | `#16a34a` | `--xp-color-success` |
| Cảnh báo / sắp đến hạn | `#e07b26` (cam, **tách khỏi gold**) | `--xp-color-warning` |
| Lỗi / quá hạn / huỷ | `#dc2626` | `--xp-color-error` |
| Thông tin / đang thuê | `#2563eb` | `--xp-color-info` |

> Đây chính là lý do warning là **cam**: một cảnh báo màu vàng trên nền thương hiệu vàng thì không còn là cảnh báo.

### 3.3 Ba khoảng trống phải lấp (nợ thiết kế)

1. **Thang màu thay vì màu đơn.** Mỗi màu ngữ nghĩa cần ≥ 3 bậc: `-bg` (nền chip/alert), `-border`, `-text`. Hiện code tự pha `rgba()` tại chỗ — đó là cách bảng màu trôi.
2. **Dark theme cho portal.** Chủ shop làm việc buổi tối; UI Firebase cũ vốn là dark. `tokens.css` đã ghi "dark thêm ở increment sau" — kiến trúc sẵn sàng, thiếu bộ giá trị. Marketplace giữ light-only.
3. **Màu dữ liệu (data-viz).** Dashboard tài chính cần dải 6 màu phân biệt được, **không** lấy từ màu ngữ nghĩa — nếu không, cột "chi phí" màu đỏ sẽ bị đọc thành "lỗi".

### 3.4 Tương phản

Chuẩn tối thiểu **WCAG AA**: chữ thường ≥ 4.5:1; chữ ≥ 18px hoặc bold ≥ 3:1; viền/icon mang nghĩa ≥ 3:1.
Cụ thể: **gold `#d6a02c` không đạt 4.5:1 với chữ trắng** → chữ trên nút gold phải là `--xp-color-text`, không phải trắng. Chữ gold trên nền kem phải dùng `--xp-gold-deep`.

---

## 4. Chữ

| Vai trò | Font | Vì sao |
| --- | --- | --- |
| Toàn hệ thống | **Be Vietnam Pro** (300–700, self-host qua `next/font`) | Font hình học thiết kế cho tiếng Việt — dấu không đè, không lệch baseline |
| Nhấn cảm xúc | **Playfair Display Italic** | **CHỈ** hero marketplace + trang thương hiệu. Không vào portal, không vào bảng, không vào nút |
| Số liệu / tiền | Be Vietnam Pro + `font-variant-numeric: tabular-nums` | Cột tiền phải thẳng hàng — đây là lỗi hiện có ở các bảng tài chính |

### Thang chữ

| Bậc | Size / Line | Weight | Dùng |
| --- | --- | --- | --- |
| Display | 44 / 1.15 (mobile 32) | 600 | Hero marketplace |
| H1 | 28 / 1.25 | 600 | Tiêu đề trang |
| H2 | 20 / 1.3 | 600 | Tiêu đề section, drawer |
| H3 | 16 / 1.4 | 600 | Tiêu đề card |
| Body | 14 / 1.5714 | 400 | Mặc định (`--xp-font-size`) |
| Small | 12 / 1.5 | 400 | Meta, nhãn phụ |
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

**Cơ chế thực thi** (thuộc sản phẩm, không phải lời nhắc — xem `03_PRODUCT_GAP_ANALYSIS.md` G-04): chặn ngay lúc upload theo tỉ lệ/kích thước · thêm mục "chất lượng ảnh" vào phiếu duyệt xe public · có placeholder có thương hiệu cho xe chưa ảnh — placeholder đẹp còn hơn ảnh sai.

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
| `booking_request` | **yêu cầu thuê** | đơn đặt xe, booking request |
| `booking` | **đơn thuê** | booking, hợp đồng thuê |
| `vehicle` | **xe** | phương tiện |
| `customer` | **khách thuê** | user, khách hàng (ở ngữ cảnh nền tảng) |
| `platform_admin` | **quản trị nền tảng** | admin, super admin |
| `receipt` | **phiếu thu/chi** | biên lai |
| `debt` | **công nợ** | nợ, phải thu |

> UI hiện tại dùng lẫn "Cửa hàng" (menu), "gian hàng" (nội dung), "shop" (code) cho **cùng một thứ**. Chốt: nhãn hiển thị là **gian hàng**; menu `Cửa hàng` → `Gian hàng`.

---

## 10. Ứng dụng thương hiệu

| Bề mặt | Quy tắc |
| --- | --- |
| App icon / favicon | Mark trắng trên gold đặc, bo góc theo nền tảng |
| Marketplace | Nền kem/trắng ấm, gold ở CTA, Playfair chỉ ở hero |
| Portal quản lý | Trung tính hơn: nền `--xp-color-bg-layout`, gold **chỉ** ở mục menu đang chọn + nút hành động chính. Portal là chỗ làm việc, không phải trang bán hàng |
| Hợp đồng in | Đen trắng + lockup ngang; print CSS đã có ở `[data-print-root]`. Không in nền màu |
| Email / thông báo | Lockup ngang trên nền trắng, một CTA gold duy nhất |
| Ảnh OG | Lockup dọc + tagline trên nền cát, hoặc ảnh xe với lớp phủ tối |

---

## 11. Kiểm tra trước khi phát hành

- [ ] Không có HEX viết tay trong `.module.css` — tất cả qua `var(--xp-*)`
- [ ] Chữ trên nền gold là đen ấm, không phải trắng
- [ ] Không có Playfair ngoài hero
- [ ] Mọi ảnh xe đúng tỉ lệ, có xe trong khung
- [ ] Từ vựng khớp bảng §9 trên mọi nhãn mới
- [ ] Tương phản AA ở mặc định, hover và disabled
- [ ] `prefers-reduced-motion` được tôn trọng

Liên quan: `06_DESIGN_PRINCIPLES.md` (vì sao) · `10_IMPLEMENTATION_CONSTRAINTS.md` (giới hạn kỹ thuật) · ADR 0003.
