# 11 — Figma Master Prompt

> Ngày: 04/08/2026 · Chủ sở hữu: Creative Director
> Cách dùng: **§1 là prompt gốc — dán nguyên văn ở đầu mỗi phiên** (Figma AI, Magic Patterns, v0, Lovable, hoặc giao cho designer). Sau đó dán thêm **một** khối màn hình ở §5. Không bao giờ dán một khối màn hình mà thiếu prompt gốc — kết quả sẽ lệch token và lệch nghiệp vụ.

---

## 1. PROMPT GỐC (dán trước mọi yêu cầu)

```
Bạn đang thiết kế XePrime — nền tảng cho thuê xe Việt Nam, gồm hai bề mặt trong
CÙNG một hệ thiết kế:
  (A) MARKETPLACE công khai cho khách thuê xe — ấm, tin cậy, mobile-first
  (B) PORTAL /manage cho chủ gian hàng và quản trị nền tảng — điềm tĩnh, dày dữ
      liệu, hiệu quả

Định vị: "Bảng điều khiển của một tài sản đang chạy." Sang trọng có kiềm chế,
KHÔNG hào nhoáng. Gold dùng để CHỈ CHỖ CẦN NHÌN, không dùng để trang trí.

════════ NGÔN NGỮ ════════
Toàn bộ nội dung bằng TIẾNG VIỆT CÓ DẤU. Tiền VND (1.520.000 đ). Ngày dd/mm.
Giờ 24h. Biển số Việt Nam (43B-336.92). Tên người Việt thật (Nguyễn Văn An,
Trần Thị Bình, Lê Minh Cường). SĐT dạng 0908 157 925.

════════ MÀU (chỉ dùng đúng các giá trị này) ════════
Gold/primary   #d6a02c    Gold đậm (hover) #a9761a
Gold nhạt      #f1dba4    Kem #f7f1de      Cát #f5ead2
Nền trang      #f6f5f1    Bề mặt #ffffff
Chữ            #2a2318    Chữ phụ #6f6450   Chữ mờ #9a8d74
Viền           #ebddbf    Viền nhạt #f4ecd9
Success #16a34a · Warning #e07b26 (CAM, không phải vàng) · Error #dc2626 ·
Info #2563eb
QUY TẮC: gold KHÔNG BAO GIỜ mang nghĩa trạng thái. Chữ trên nền gold là #2a2318
(đen ấm), KHÔNG phải trắng. Tối đa MỘT điểm nhấn gold trên một màn hình.

════════ CHỮ ════════
Font: Be Vietnam Pro (300/400/500/600/700).
Display 44/1.15 w600 (mobile 32) — CHỈ hero marketplace
H1 28/1.25 w600 · H2 20/1.3 w600 · H3 16/1.4 w600
Body 14/1.57 w400 · Small 12/1.5 w400
Số/tiền: 14 w500, tabular-nums, canh phải
Playfair Display Italic: CHỈ dùng cho 1–2 từ nhấn trong hero marketplace.
Không ALL-CAPS tiếng Việt quá 2 từ.

════════ HÌNH KHỐI ════════
Bo góc: 10px (mặc định) · 6px (tag, ô nhỏ) · 999px (chip, avatar). Không có giá
trị thứ tư.
Khoảng cách: CHỈ 4 / 8 / 16 / 24 / 32.
Bóng: ám nâu ấm, không phải xám. Card tĩnh dùng viền, không dùng bóng. Bóng chỉ
cho vật thể nổi (dropdown, drawer, modal).
Khung app: topbar 56px · sidebar 232px (thu gọn 64px).

════════ COMPONENT ════════
Dựa trên Ant Design 6. Giữ đúng hình dạng của AntD (Button, Input, Select,
DatePicker, Table, Drawer, Modal, Tag, Tabs, Pagination). Icon CHỈ lấy từ bộ
Ant Design Icons, kiểu outlined.

════════ LUẬT BẮT BUỘC ════════
1. Mỗi màn có ĐÚNG MỘT nút hành động chính (gold đặc). Hành động phụ dùng nút
   viền. Trong hàng danh sách: 1 nút chính + menu "⋯".
2. Đầu mỗi màn là CÂU TRẢ LỜI, không phải bộ lọc. VD: "41 đơn · 1 đang thuê ·
   còn thu 44.105.018 đ".
3. Luôn vẽ ĐỦ 5 TRẠNG THÁI: đang tải (skeleton đúng hình dạng) · có dữ liệu ·
   rỗng (một câu + một hành động) · lỗi (nói bước tiếp theo) · thiếu quyền.
   Cấm dòng chữ "Không có dữ liệu".
4. Luôn vẽ CẢ desktop 1440px VÀ mobile 375px. Mobile: bảng → thẻ; vùng chạm
   ≥44px; nút chính dính đáy có safe-area.
5. Cột số/tiền canh phải, tabular. Trạng thái là chip (nền nhạt + viền + chữ),
   không dùng chấm màu đơn lẻ.
6. PII (SĐT, email) ở màn quản trị nền tảng hiển thị dạng che: 090****925, kèm
   nút "Xem đầy đủ".
7. Ảnh xe tỉ lệ 4:3 ở thẻ, 16:9 ở ảnh bìa. Luôn là ảnh chiếc xe thật, góc 3/4
   trước. TUYỆT ĐỐI không dùng ảnh phong cảnh, ảnh chụp màn hình làm ảnh xe.
8. Tương phản WCAG AA ở mọi trạng thái kể cả disabled.

════════ TỪ VỰNG CHỐT (dùng đúng, không thay) ════════
gian hàng (không dùng "cửa hàng"/"shop") · yêu cầu thuê (booking request) ·
đơn thuê (booking) · xe · khách thuê · phiếu thu/chi · công nợ ·
quản trị nền tảng.

════════ TRẠNG THÁI NGHIỆP VỤ (chỉ dùng đúng bộ này) ════════
Đơn thuê: Đặt trước · Đang thuê · Hoàn tất · Huỷ · Khách không đến
Yêu cầu thuê: Chờ shop duyệt · Đã duyệt · Từ chối · Hết hạn
Xe (public): Nháp · Chờ duyệt · Đã duyệt public · Bị ẩn · Từ chối
Xe (vận hành): Sẵn sàng · Đang thuê · Bảo dưỡng · Ngừng khai thác
Gian hàng: Nháp · Chờ duyệt · Đang hoạt động · Tạm khoá
Màu: chờ→cam · đang diễn ra→xanh dương · hoàn tất→xanh lá · huỷ/từ chối→đỏ ·
không hoạt động→xám

Xuất ra: khung hình Figma đặt tên `[Bề mặt]/[Màn]/[Thiết bị]/[Trạng thái]`,
auto-layout đầy đủ, dùng biến màu/chữ đã khai báo, không hardcode giá trị.
```

---

## 2. Khai báo biến trước khi vẽ

Tạo **Variable Collections** trước, để mọi khung hình tham chiếu biến chứ không phải giá trị. Tên biến khớp 1-1 với `apps/web/src/styles/tokens.css` — đây là thứ khiến bản thiết kế và code không trôi khỏi nhau.

```
Collection "color"          → primary, primary-deep, gold-soft, gold-wash,
                              bg-sand, bg-layout, bg-container, text,
                              text-secondary, text-tertiary, border,
                              border-secondary, success, warning, error, info
   (Mode: Light | Dark — Dark chỉ áp cho portal)
Collection "space"          → xs=4, sm=8, md=16, lg=24, xl=32
Collection "radius"         → sm=6, base=10, pill=999
Collection "type"           → display, h1, h2, h3, body, small, num
Collection "shell"          → topbar=56, sidebar=232, sidebar-collapsed=64
Collection "calendar"       → resource-col=220, day-col=56, row=44, header=56
```

---

## 3. Kiểm kê component (Wave 0 — vẽ trước mọi màn hình)

| Nhóm | Component | Biến thể bắt buộc |
| --- | --- | --- |
| Nút | Primary · Secondary · Ghost · Danger · Icon-only | default / hover / active / **loading** / disabled |
| Nhập | Text · Textarea · Select · MultiSelect · Date · DateRange · Time · **Money** · **Phone** · Search · OTP | default / focus / **error** / disabled / readonly |
| Chọn | Checkbox · Radio · Switch · Chip lọc | on / off / indeterminate / disabled |
| Hiển thị | Chip trạng thái (5 nhóm màu) · Badge · Avatar · Tag · **MaskedContact** · Ô tiền · Tooltip | — |
| Dữ liệu | **Bảng** (header, hàng, hàng chọn, hàng hover, hàng trống) · **Thẻ danh sách mobile** · Phân trang · Thanh hành động hàng loạt | — |
| Vùng chứa | Card · Drawer phải · Modal · **Bottom sheet** · Popover · Tabs · Accordion | — |
| Phản hồi | Toast (4 loại) · Alert nội tuyến (4 loại) · Skeleton (text/thẻ/hàng bảng) · Progress | — |
| Trạng thái trang | Rỗng · Rỗng-do-lọc · Lỗi · 403 · 404 · Đang tải | — |
| Khung | Topbar · Sidebar (đủ/thu gọn) · Bottom tab bar (marketplace & portal) · Header/Footer marketplace | — |
| Đặc thù | Thẻ xe (marketplace) · Thanh sự kiện trên lịch (4 loại) · Ô KPI · Dòng thời gian trạng thái | — |

---

## 4. Dữ liệu mẫu dùng chung (dùng đúng bộ này ở mọi màn để so sánh được)

```
GIAN HÀNG: "Gian hàng Demo XePrime" · DEMO-001 · TP. Hồ Chí Minh · 17 xe ·
            Đang hoạt động · Gói Pro (hết hạn 03/09/2026)
XE:  Toyota Vios 2022 · 51H-123.45 · 5 chỗ · Xăng · Tự lái · 600.000 đ/ngày
     Mazda CX-5 2023 · 51H-345.67 · 5 chỗ · Xăng · 1.100.000 đ/ngày · ★5.0 (2)
     VinFast VF e34 2023 · 51K-468.02 · 5 chỗ · Điện · 900.000 đ/ngày
     Honda SH 150i 2023 · 59X1-333.44 · Xe máy · 300.000 đ/ngày · giảm 5%
KHÁCH: Nguyễn Văn An 0901 234 567 · Trần Thị Bình 0912 345 678 ·
       Lê Minh Cường 0923 456 789
ĐƠN: DH0003 · Lê Minh Cường · Mazda3 2023 51H-987.65 · 07/08 10:00 →
     14/08 12:00 · 7 ngày · Tổng 5.600.000 đ · Đã trả 0 đ · Còn nợ 5.600.000 đ
     · Đã xác nhận
TỔNG QUAN SHOP: 41 đơn · 1 đang thuê · còn phải thu 44.105.018 đ ·
                doanh thu 46.005.018 đ
```

---

## 5. Khối prompt theo màn hình

> Dán **sau** prompt gốc §1. Mỗi khối vẽ desktop + mobile + đủ 5 trạng thái.

### 5.1 Marketplace — Trang chủ `/`

```
Thiết kế TRANG CHỦ marketplace XePrime.
Cấu trúc từ trên xuống:
1. Header: logo lockup ngang · Khám phá / Về XePrime / Trở thành chủ xe /
   Chuyến của tôi · icon chat + chuông · nút "Đăng nhập" (viền gold).
2. Hero: nền tối ấm hoặc ảnh xe có lớp phủ. Tiêu đề Display 2 dòng, có 1–2 từ
   nhấn bằng Playfair Italic. Dưới là KHỐI TÌM KIẾM nổi trên card trắng:
   tab [Ô tô | Xe máy] → chip [Tự lái | Có tài xế | Thuê dài hạn] →
   [Nơi nhận xe ▾] [Ngày nhận → Ngày trả] [Tìm xe khả dụng] (nút gold).
   Mobile: khối tìm kiếm rút thành 1 ô "Bạn muốn thuê xe ở đâu?" mở bottom
   sheet từng bước.
3. "Xe cho thuê gợi ý" — đếm số thật ("15 xe khả dụng"), hàng chip lọc nhanh,
   lưới thẻ xe 4 cột (desktop) / cuộn ngang 1.2 thẻ (mobile).
4. "Điểm đến nổi bật" — ảnh tỉnh/thành + số xe.
5. "Gian hàng nổi bật" — thẻ gian hàng: logo, tên, số xe, đánh giá.
6. "Thuê xe chỉ với 4 bước" — 4 bước có số thứ tự.
7. Dải CTA "Bạn có xe cho thuê?" → Trở thành chủ xe.
8. Footer 4 cột + bottom tab bar (mobile).
Vẽ thêm: trạng thái đang tải (skeleton hero + 8 thẻ xe).
```

### 5.2 Marketplace — Chi tiết xe `/listings/[id]`

```
Thiết kế TRANG CHI TIẾT XE — màn quan trọng nhất của phễu chuyển đổi.
Bố cục desktop 2 cột (8/4):
CỘT TRÁI:
 · Gallery 16:9 + dải ảnh nhỏ (5 ảnh) + nút "Xem tất cả ảnh"
 · Tên xe, biển số, tỉnh, đánh giá, huy hiệu (Giao tận nơi / Miễn thế chấp)
 · Thông số: số chỗ, nhiên liệu, truyền động, năm
 · LỊCH CÒN TRỐNG: lịch tháng, ngày đã có đơn bị gạch chéo mờ, ngày trống nền
   trắng, ngày đang chọn nền gold nhạt. Có điều hướng tháng.
 · Tiện nghi (lưới icon + nhãn)
 · CHÍNH SÁCH: huỷ đặt xe · thế chấp · giấy tờ cần có — dạng danh sách rõ ràng
 · Hồ sơ gian hàng: avatar, tên, số xe, tỉ lệ phản hồi, nút "Nhắn tin"
 · Đánh giá: điểm trung bình + phân bố sao + 3 đánh giá gần nhất
CỘT PHẢI (dính khi cuộn): CARD ĐẶT XE
 · Giá/ngày lớn (có giá gạch nếu giảm)
 · [Ngày nhận] [Ngày trả] [Điểm nhận xe ▾]
 · BẢNG GIÁ TỪNG DÒNG:
      600.000 đ × 3 ngày        1.800.000 đ
      Phí giao xe                 100.000 đ
      Giảm giá                   −100.000 đ
      ─────────────────────────────────────
      Tổng cộng                 1.800.000 đ
      Cọc giữ chỗ (dự kiến)       500.000 đ
 · Nút gold "Yêu cầu thuê xe" + dòng chữ nhỏ "Chưa trừ tiền ngay"
MOBILE: một cột; card đặt xe thu thành THANH DÍNH ĐÁY hiện "1.800.000 đ · 3
ngày" + nút "Yêu cầu thuê xe", chạm mở bottom sheet chứa card đầy đủ.
Vẽ thêm: trạng thái xe đã hết chỗ trong khoảng đã chọn (thông báo + gợi ý xe
tương tự).
```

### 5.3 Marketplace — Auth modal

```
Thiết kế MODAL ĐĂNG NHẬP/ĐĂNG KÝ của khách, mở ĐÈ LÊN trang đang xem (nền mờ,
trang phía sau vẫn thấy được — khách KHÔNG bị chuyển sang trang khác).
Desktop: Modal giữa 420px. Mobile: bottom sheet kéo được.
Nội dung: logo nhỏ · tiêu đề "Đăng nhập" / "Tạo tài khoản" · chuyển đổi giữa
hai chế độ bằng link cuối modal · ô "Email hoặc số điện thoại" · ô mật khẩu
(có nút hiện/ẩn) · link "Quên mật khẩu" · nút gold hết chiều rộng · dải ngăn
"hoặc" · nút Google, Facebook (viền) · tab "Đăng nhập bằng OTP".
Vẽ 4 trạng thái: mặc định · đang gửi (nút loading, các ô khoá) · lỗi sai mật
khẩu (alert đỏ trên form) · MÀN THÀNH CÔNG SAU ĐĂNG KÝ:
   icon check gold · "Tạo tài khoản thành công" ·
   "Bạn có thể tiếp tục tìm và đặt xe, cập nhật hồ sơ hoặc đăng ký trở thành
    chủ xe." · 3 nút: [Trở thành chủ xe] [Cập nhật tài khoản] [Đóng]
TUYỆT ĐỐI KHÔNG có bất kỳ nội dung nào về tạo gian hàng trong luồng này.
```

### 5.4 Portal — Tổng quan gian hàng `/manage`

```
Thiết kế TỔNG QUAN GIAN HÀNG. Nguyên tắc: trả lời "hôm nay tôi phải làm gì",
KHÔNG phải bảng KPI.
Hàng 1 — VIỆC HÔM NAY (quan trọng nhất, chiếm nhiều diện tích nhất):
   3 nhóm thẻ: "Giao xe hôm nay (3)" · "Nhận xe hôm nay (2)" ·
   "Cần xử lý (6)" — mỗi thẻ liệt kê 3 dòng gọn (giờ · khách · xe · biển số)
   + link "Xem tất cả".
Hàng 2 — SỐ LIỆU THÁNG: 4 ô KPI (Doanh thu · Đã thu · Còn phải thu · Đơn mới),
   mỗi ô có số lớn, so với tháng trước (mũi tên + %), BẤM ĐƯỢC dẫn tới danh
   sách đã lọc.
Hàng 3 — Biểu đồ doanh thu 30 ngày (đường) + Top 5 xe theo doanh thu (cột
   ngang). Dùng dải màu data-viz, KHÔNG dùng màu trạng thái.
Hàng 4 — Hoạt động gần đây (10 dòng nhật ký).
Sidebar trái: nhóm Tổng quan · Điều hành (Lịch thuê xe, Yêu cầu thuê, Đơn thuê)
· Tài sản & khách (Xe, Khách hàng) · Tiền (Tài chính, Thu chi, Công nợ) ·
Cài đặt (Gian hàng, Người dùng). Mục đang chọn: nền kem #f7f1de + chữ gold đậm
+ thanh gold 3px bên trái.
Topbar: tên gian hàng · ô tìm kiếm ⌘K · icon chat (badge) · chuông (badge) ·
avatar.
MOBILE: bỏ sidebar, dùng bottom tab bar 5 tab (Tổng quan · Lịch · Yêu cầu ·
Đơn · Thêm). "Việc hôm nay" thành danh sách dọc.
```

### 5.5 Portal — Lịch thuê xe `/manage/calendar`

```
Thiết kế LỊCH THUÊ XE — màn được dùng nhiều nhất của portal.
DESKTOP — resource timeline:
 · Thanh công cụ: ô tìm xe/biển số · [Tất cả xe | Ô tô | Xe máy] ·
   [7 ngày | 14 ngày | 30 ngày] · [Hôm nay] · nút gold [Tạo đơn]
 · Cột trái DÍNH (220px): tên xe + biển số + chip trạng thái vận hành
 · Header ngày (56px): thứ + ngày; hôm nay được đánh dấu bằng nền gold nhạt và
   đường dọc gold; cuối tuần nền hơi khác
 · Ô ngày rộng 56px, hàng cao 44px
 · Thanh sự kiện bo 6px, có nhãn "mã đơn · tên khách", màu theo loại:
   đơn thuê = xanh dương · yêu cầu thuê = gold · khoá xe = xám ·
   bảo dưỡng = tím
 · Hover thanh → popover: khách, SĐT, khung giờ, tổng tiền, [Xem đơn] [Sửa]
 · Chạm ô trống → popover nhỏ [Đặt xe] [Khoá xe]
 · Trạng thái kéo-thả: thanh mờ đi, ô đích viền gold nét đứt; nếu trùng lịch
   → viền đỏ + tooltip "Xe đã có lịch trong khung này"
MOBILE — vẽ CẢ BA chế độ:
 (a) Agenda ngày (mặc định): danh sách theo mốc giờ, mỗi mục là thẻ có nhãn
     GIAO / NHẬN + khách + xe + giờ
 (b) Theo xe: chọn 1 xe → dòng thời gian 14 ngày của riêng xe đó
 (c) Lưới nén: cột ngày 32px, cột xe dính trái, cuộn 2 chiều
 KHÔNG kéo-thả ở mobile: chạm giữ → bảng hành động [Dời lịch] [Đổi xe] [Huỷ].
Vẽ thêm: đang tải (skeleton lưới) · gian hàng chưa có xe nào (rỗng + [Thêm xe]).
```

### 5.6 Portal — Đơn thuê (danh sách + chi tiết)

```
Thiết kế DANH SÁCH ĐƠN THUÊ và DRAWER CHI TIẾT.
DANH SÁCH:
 · Tiêu đề "Đơn thuê xe" + nút gold [Tạo đơn]
 · Dòng tóm tắt: "41 đơn · 1 đang thuê · còn phải thu 44.105.018 đ"
 · Thanh lọc: ô tìm (khách/xe/mã) · [Khoảng ngày] · [Trạng thái ▾] ·
   chip nhanh [Hôm nay | Tuần này | Tháng này]. Bộ lọc đang áp hiện thành chip
   gỡ được + [Xoá bộ lọc].
 · Bảng, cột: KHÁCH/SĐT (neo, 2 dòng) · XE (tên + biển số) · NHẬN→TRẢ (2 dòng
   + số ngày) · TỔNG · ĐÃ TRẢ · CÒN LẠI (đậm, đỏ nếu >0) · TRẠNG THÁI (chip) ·
   ⋯. Số canh phải tabular. Kẻ ngang, KHÔNG kẻ dọc.
 · Chân bảng: phân trang + chọn số dòng/trang.
DRAWER CHI TIẾT (560px, phải):
 · Đầu: mã đơn + chip trạng thái + nút đóng
 · Khối danh tính: khách (avatar, tên, SĐT có nút gọi/nhắn), xe (ảnh nhỏ, tên,
   biển số)
 · Hàng hành động: [Nhận xe] (chính) · [Sửa] · ⋯ ([Huỷ đơn] đỏ, [Khách không
   đến])
 · Bảng thông tin: thời gian, điểm nhận, dịch vụ, tiền thuê, phí giao, giảm
   giá, tổng, cọc, đã thanh toán, CÒN NỢ (nổi bật)
 · Khối thanh toán: nút [Thu tiền (còn nợ 5.600.000 đ)] + lịch sử thu
 · Khối hợp đồng: [Tạo / Xem hợp đồng]
 · Nhật ký (thu gọn)
MOBILE: bảng → thẻ theo mẫu; drawer → trang toàn màn hình.
Vẽ thêm: rỗng thật · rỗng do lọc · lỗi tải · vai trò shop_viewer (không có nút
Thu tiền, có ghi chú "Bạn chỉ có quyền xem").
```

### 5.7 Portal — Tạo đơn thuê (wizard, thay modal 5 tab)

```
Thiết kế LUỒNG TẠO ĐƠN THUÊ dạng 4 bước, thay cho modal nhiều tab hiện tại.
Mục tiêu: nhân viên hoàn tất trong ≤60 giây.
Bước 1 "Khách & xe": ô tìm khách (gõ tên/SĐT, gợi ý khách cũ, có "Khách mới") ·
   chọn xe (danh sách có ảnh nhỏ, biển số, giá; xe bận trong khoảng đã chọn bị
   mờ và ghi lý do)
Bước 2 "Thời gian & giá": ngày+giờ nhận, ngày+giờ trả, điểm nhận · hiển thị số
   ngày tự tính · bảng giá tự tính (đơn giá × ngày, phí giao, giảm giá, tổng) ·
   CẢNH BÁO TRÙNG LỊCH ngay tại đây nếu có
Bước 3 "Thanh toán": cọc/trả trước, hình thức (tiền mặt/chuyển khoản), phần còn
   lại khi nhận xe, loại tài sản thế chấp
Bước 4 "Xác nhận": tóm tắt toàn bộ + nút gold [Tạo đơn]
Thanh tiến độ 4 bước ở đầu, bấm quay lại bước trước không mất dữ liệu.
Desktop: trang riêng, nội dung giới hạn 720px, canh giữa.
Mobile: toàn màn hình, nút [Tiếp tục] dính đáy có safe-area.
Vẽ thêm: trạng thái đang tạo (nút loading, chặn bấm lại) và lỗi trùng lịch trả
về từ máy chủ ở bước 4 (alert đỏ + nút [Xem lịch xe]).
```

### 5.8 Portal — Tài chính & Công nợ

```
Thiết kế hai màn tiền.
TỔNG QUAN TÀI CHÍNH:
 · Bộ lọc tháng/năm
 · 6 ô KPI: Tổng doanh thu · Tổng chiết khấu · Đã thu · Còn phải thu · Cọc đang
   giữ · Lợi nhuận. MỖI Ô BẤM ĐƯỢC dẫn tới danh sách sinh ra con số đó.
 · Biểu đồ thu-chi theo ngày (cột đôi, dùng màu data-viz)
 · Bảng "Chi tiết từng đơn": khách · xe · sau CK · trả trước · còn lại · trạng
   thái
CÔNG NỢ:
 · 3 ô: Tổng công nợ (37.025.000 đ / 16 đơn) · Quá hạn (14 đơn, ĐỎ) · Sắp đến
   hạn (0 đơn)
 · Bảng sắp theo mức khẩn: mã · khách · SĐT · xe · HẠN TRẢ (đỏ nếu quá hạn,
   kèm "quá 5 ngày") · tổng · đã trả · CÒN NỢ · trạng thái · [Thu tiền]
 · Bộ lọc: [Tất cả | Quá hạn | Sắp đến hạn]
 · Modal thu tiền: số tiền (mặc định = còn nợ), hình thức, ngày, ghi chú,
   [Xác nhận thu]
MOBILE: KPI cuộn ngang; bảng → thẻ, mỗi thẻ nổi bật số CÒN NỢ và nút [Thu tiền].
Định dạng tiền tuyệt đối nhất quán: 1.520.000 đ, canh phải, tabular.
```

### 5.9 Portal nền tảng — Duyệt hồ sơ

```
Thiết kế màn DUYỆT HỒ SƠ của quản trị nền tảng — đòn bẩy chất lượng của sàn.
 · Tab: [Gian hàng chờ duyệt (3)] [Xe chờ duyệt public (12)]
 · Danh sách bên trái (400px) + chi tiết bên phải
CHI TIẾT MỘT HỒ SƠ XE:
 · Gallery ảnh xe (xem lớn được)
 · Thông tin xe + gian hàng gửi
 · ⚠️ Khối "Lịch sử kiểm duyệt": nếu xe từng bị ẩn, HIỆN RÕ lý do ẩn và ngày
   (đây là thông tin reviewer bắt buộc phải thấy)
 · CHECKLIST CHẤT LƯỢNG (mỗi mục đạt/không đạt):
     ☐ Ảnh đủ số lượng, đúng tỉ lệ, thấy rõ toàn xe
     ☐ Không có ảnh sai (phong cảnh/chụp màn hình/watermark)
     ☐ Giá hợp lý so với mặt bằng
     ☐ Mô tả đầy đủ
     ☐ Giấy tờ xe hợp lệ
 · Hành động: [Duyệt public] (gold) · [Yêu cầu bổ sung] · [Từ chối] (đỏ, BẮT
   BUỘC chọn lý do từ danh sách + ghi chú)
 · Thao tác hàng loạt ở danh sách: chọn nhiều → [Duyệt đã chọn].
Vẽ thêm: kết quả hàng loạt "Đã duyệt 8/10. 2 hồ sơ lỗi:" + lý do từng hồ sơ.
```

### 5.10 Portal nền tảng — Khách thuê (masking PII)

```
Thiết kế màn KHÁCH THUÊ TOÀN HỆ THỐNG.
 · Bộ lọc: ô tìm (tên/SĐT/email) · [Trạng thái ▾] · [Khoảng ngày tạo]
 · Bảng: KHÁCH (avatar + tên) · SĐT (090****925 + nút mắt "Xem đầy đủ") ·
   EMAIL (n***@gmail.com + nút mắt) · SỐ ĐƠN · TỔNG CHI · NGÀY THAM GIA ·
   TRẠNG THÁI
 · Khi bấm "Xem đầy đủ": popover xác nhận "Xem số điện thoại đầy đủ của khách
   này? Thao tác sẽ được ghi vào nhật ký hệ thống." [Huỷ] [Xem]
 · Sau khi xem: hiện số đầy đủ + dòng nhỏ "Đã ghi nhật ký lúc 14:32"
 · Vai trò KHÔNG có quyền xem PII: nút mắt bị ẩn hoàn toàn, có tooltip trên ô
   che: "Cần quyền xem thông tin liên hệ"
Vẽ thêm: trạng thái 403 khi người dùng không có quyền vào khu nền tảng — trang
riêng, có tiêu đề "Bạn không có quyền truy cập khu vực này", nói rõ cần quyền
gì và ai cấp được, KHÔNG có bất kỳ nội dung nào về tạo gian hàng.
```

### 5.11 Trạng thái "chưa có gian hàng"

```
Thiết kế màn hình khi người dùng ĐÃ đăng nhập nhưng KHÔNG có gian hàng và vào
/manage.
Đây là TRẠNG THÁI HỢP LỆ, không phải lỗi — thiết kế phải truyền đạt điều đó.
 · Minh hoạ nhẹ nhàng (không dùng icon lỗi/cảnh báo)
 · Tiêu đề: "Bạn chưa có gian hàng"
 · Mô tả: "Tài khoản hiện tại vẫn có thể dùng để tìm và đặt xe. Bạn chỉ cần
   đăng ký gian hàng nếu muốn cho thuê xe."
 · Hai nút ngang hàng: [Đăng ký trở thành chủ xe] (gold) ·
   [Quay lại tìm xe] (viền)
 · KHÔNG hiện form tạo gian hàng, KHÔNG hiện sidebar quản lý, KHÔNG hiện
   dashboard rỗng.
```

---

## 6. Sau khi có kết quả — checklist nghiệm thu

- [ ] Mọi màu đều tham chiếu biến, không có HEX rời
- [ ] Đúng một điểm gold trên mỗi màn
- [ ] Chữ trên nền gold là `#2a2318`
- [ ] Đủ 5 trạng thái cho mỗi màn
- [ ] Có bản mobile 375px cho mỗi màn
- [ ] Không có dòng "Không có dữ liệu"
- [ ] Tiền đúng định dạng `1.520.000 đ`, canh phải
- [ ] Trạng thái nghiệp vụ chỉ nằm trong bộ đã liệt kê ở §1
- [ ] Không có ảnh xe sai loại
- [ ] Từ vựng dùng "gian hàng", không dùng "cửa hàng"/"shop"
- [ ] Icon đều có trong bộ Ant Design Icons

Liên quan: `01_BRAND_GUIDE.md` · `08_UX_GUIDELINES.md` · `09_PAGE_DESIGN_ORDER.md` · `10_IMPLEMENTATION_CONSTRAINTS.md`.
