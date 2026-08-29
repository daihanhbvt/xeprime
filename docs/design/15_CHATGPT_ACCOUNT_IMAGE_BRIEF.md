# XePrime — brief tạo ảnh thiết kế khu tài khoản

> Mục đích: gửi nguyên file này cùng ảnh tham khảo hiện tại cho ChatGPT để tạo ảnh thiết kế UI chất lượng cao.  
> Phạm vi: **trang Thông tin tài khoản** của XePrime, ưu tiên phiên bản desktop. Đây là tài liệu thiết kế; không tự tạo ra nghiệp vụ hay trường dữ liệu chưa tồn tại.

---

## 1. Bối cảnh sản phẩm

**XePrime** là nền tảng cho thuê xe tại Việt Nam, đồng thời là phần mềm giúp chủ xe/gian hàng vận hành xe, lịch, đơn thuê và khách hàng. Sản phẩm cần tạo cảm giác **sang trọng có kiểm soát, đáng tin cậy, gần với vận hành tài sản thật** — không phải một app đặt xe giá rẻ, app fintech, hay dashboard SaaS nhiều màu.

Người dùng có thể vừa là người thuê xe, vừa là chủ xe. Chủ xe và chủ gian hàng không phải hai tài khoản hay hai hồ sơ cá nhân khác nhau:

- **Người thuê** dùng phần cá nhân để tìm xe, theo dõi chuyến đi và xác minh danh tính.
- **Chủ xe** có thêm năng lực vận hành cơ bản: xe, lịch xe, yêu cầu đặt xe, đơn thuê, giao/nhận xe, khách hàng, chat.
- **Chủ gian hàng** là chủ xe có thêm năng lực theo gói: thu chi, công nợ, báo cáo, bảo dưỡng, nhân viên, chi nhánh, tài xế, hợp đồng.

Vì vậy, ảnh phải diễn tả một **tài khoản cá nhân thống nhất** với đường đi rõ ràng sang khu quản lý cho thuê, thay vì tạo ba trang hồ sơ hoặc ba kiểu đăng nhập riêng.

### Ràng buộc nghiệp vụ cần phản ánh

- Đây là thị trường giữa khách thuê và gian hàng. XePrime không che giá niêm yết của chủ xe bằng các phí ẩn.
- Một tính năng nâng cao có ba trạng thái: `enabled` (dùng bình thường), `read_only` (hết gói nhưng còn dữ liệu, vẫn xem được) hoặc `hidden` (chưa có dữ liệu/năng lực). Không dùng menu bị khoá hàng loạt.
- Đừng vẽ ví nạp tiền, điểm thưởng, tỷ lệ phản hồi của gian hàng, ngày sinh/giới tính/GPLX giả, hoặc số liệu doanh thu giả vào trang hồ sơ nếu không có luồng thật đi kèm.
- Email và số điện thoại là thông tin đăng nhập/nhận diện: hiển thị rõ trạng thái xác thực; không biến chúng thành ô sửa trực tiếp.
- Dùng từ **“gian hàng”**, không dùng “shop” hoặc “cửa hàng”.

---

## 2. Hướng thương hiệu bắt buộc

### Cá tính

`ấm áp · chỉnh chu · đáng tin · vận hành chuyên nghiệp · tối giản có chủ đích`

XePrime dùng gold như điểm nhấn để điều hướng hành động, không phủ gold lên toàn màn hình. Không sao chép phong cách xanh lá của Mioto; ảnh tham khảo Mioto chỉ dùng để hiểu nhịp bố cục hồ sơ thoáng và dễ quét.

### Màu sắc

| Vai trò | Màu | Cách dùng |
| --- | --- | --- |
| Gold thương hiệu | `#D6A02C` | CTA chính, biểu tượng nhấn, trạng thái menu đang chọn |
| Gold đậm | `#A9761A` | Chữ/icon gold trên nền kem, hover/pressed |
| Gold nhạt | `#FDF6E3` | Nền mục đang chọn, chip/ô nhấn nhẹ |
| Nền trang ấm | `#FAF9F7` | Nền tổng thể, không dùng xám lạnh |
| Card trắng | `#FFFFFF` | Các lớp nội dung chính |
| Nền phụ | `#F5F3EF` | Hàng thông tin, vùng phân tách nhẹ |
| Chữ chính | `#1A1A1A` | Tiêu đề và dữ liệu quan trọng |
| Chữ phụ | `#6B6560` | Mô tả, nhãn, meta |
| Viền | `#E8E4DD` | Viền card/khu vực, rất mảnh |
| Thành công | `#16A34A` + nền `#F0FDF4` | “Đã xác thực”, thao tác hoàn tất |
| Cảnh báo | `#E07B26` + nền `#FFF7ED` | “Chưa xác thực”, sắp đến hạn |
| Lỗi | `#DC2626` + nền `#FEF2F2` | Lỗi, huỷ, thao tác nguy hiểm |
| Thông tin | `#2563EB` + nền `#EFF6FF` | Ghi chú bảo mật/xác minh |

**Quy tắc:** chữ trên nút gold phải là nâu đen `#2A2318`, không dùng chữ trắng. Gold là màu thương hiệu, không dùng để biểu thị lỗi hoặc cảnh báo.

### Chữ, hình khối và khoảng cách

- Font chính: **Be Vietnam Pro**. Chỉ dùng Playfair Display Italic rất tiết chế cho hero marketing, **không dùng trong trang tài khoản/vận hành**.
- Tiêu đề trang 32px, tiêu đề card 24px, tiêu đề nhỏ 20px, nội dung 14px, meta 12px.
- Trọng số chính: 400, 600, 700; tránh quá nhiều kiểu chữ trên cùng một màn.
- Thang khoảng cách: 4 / 8 / 16 / 24 / 32px.
- Bo góc 10px cho card, 6px cho chip/ô nhỏ, pill cho badge. Bóng rất nhẹ, tông nâu ấm; ưu tiên viền mảnh hơn bóng.
- Icon nét mảnh 20px, nhất quán, đi cùng nhãn khi là hành động quan trọng.

---

## 3. Cấu trúc thông tin mong muốn

### Menu theo năng lực

| Nhóm menu | Người thuê | Chủ xe | Chủ gian hàng |
| --- | --- | --- | --- |
| Cá nhân | Tài khoản của tôi | Giống người thuê | Giống người thuê |
| Thuê xe | Chuyến của tôi, Xe yêu thích | Giống người thuê | Giống người thuê |
| Xác minh & thiết lập | Địa chỉ, Giấy tờ & xác minh, Thông báo, Cài đặt, Hỗ trợ | Giống người thuê | Giống người thuê |
| Quản lý cho thuê | Không hiện; thay bằng CTA “Đăng xe cho thuê” | Tổng quan, Xe của tôi, Lịch xe, Yêu cầu đặt xe, Đơn thuê, Khách hàng, Chat | Toàn bộ của chủ xe |
| Quản lý gian hàng | Không hiện | Chỉ Hồ sơ gian hàng | Thu chi, Công nợ, Báo cáo, Bảo dưỡng, Nhân viên, Chi nhánh, Tài xế, Hợp đồng, Chính sách, Gói dịch vụ |

Trong ảnh trang đầu tiên, dùng ví dụ **chủ gian hàng** để thấy rõ điểm nối giữa hồ sơ cá nhân và vận hành. Tuy nhiên, menu nâng cao chỉ cần là một nhóm gọn với 2–3 mục đại diện hoặc một CTA “Mở khu quản lý”; không nhồi toàn bộ menu quản trị vào màn hồ sơ.

### Bố cục desktop cần vẽ

Khung 1440px, vùng nội dung tối đa khoảng 1220px, khoảng thở rộng rãi. Header marketplace nằm trên cùng; phần nội dung chia lưới 232px / phần còn lại.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Header: logo XePrime · Khám phá · Về Prime · Chuyến của tôi             VN · chat · chuông · avatar/tên     │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Tài khoản của tôi                                                                                             │
│ Quản lý thông tin cá nhân, xác minh và hoạt động thuê xe                                                      │
│                                                                                                              │
│  SIDEBAR 232px                          NỘI DUNG CHÍNH                                                     │
│  CÁ NHÂN                                ┌───────────────────────────────────────────────────────────────┐ │
│  ┃ Tài khoản của tôi                    │ HỒ SƠ CÁ NHÂN                         [Chỉnh sửa hồ sơ]        │ │
│                                                                 │                                               │ │
│  THUÊ XE                               │  [avatar 104px]  Trần Quốc Bảo   │ Email: owner.saigon@...   │ │
│  ○ Chuyến của tôi                      │                  Tài khoản XePrime │ SĐT: 0902... [Đã xác thực]│ │
│  ○ Xe yêu thích                        │                                               │ │
│                                        │  Ghi chú bảo mật nhẹ màu xanh: Email và SĐT cần xác thực riêng  │ │
│  THIẾT LẬP                             └───────────────────────────────────────────────────────────────┘ │
│  ○ Địa chỉ của tôi                                                                                             │
│  ○ Giấy tờ & xác minh                  ┌───────────────────────────────────────────────────────────────┐ │
│  ○ Thông báo                            │ XePrime Sài Gòn                                  [Quản lý xe] │ │
│  ○ Cài đặt                              │ 6 xe đang quản lý · Lịch thuê, đơn thuê và khách hàng          │ │
│                                        └───────────────────────────────────────────────────────────────┘ │
│  [Đăng xuất — đỏ nhẹ]                                                                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Card “Hồ sơ cá nhân”

- Head card: eyebrow nhỏ có icon khiên “Hồ sơ cá nhân”, tiêu đề “Thông tin tài khoản”, mô tả một dòng; nút viền có icon bút “Chỉnh sửa hồ sơ” ở góc phải.
- Cột trái: avatar tròn 104px, tên **Trần Quốc Bảo**, dòng meta “Tài khoản XePrime”. Không dùng điểm thưởng hay bảng thành tích.
- Cột phải: hai hàng thông tin nền phụ, có icon và nhãn bên trái; giá trị căn phải. Hàng số điện thoại có badge xanh “Đã xác thực”.
- Cuối card: ghi chú nền xanh nhạt có icon khoá; giải thích ngắn rằng email và số điện thoại đổi bằng luồng xác thực riêng.
- Khi vẽ trạng thái chỉnh sửa (nếu cần ảnh thứ hai), chỉ mở form tên hiển thị và URL ảnh đại diện; nút “Huỷ” viền và “Lưu thay đổi” gold.

### Card “Gian hàng của tôi”

- Card thứ hai thấp hơn, phân cấp thấp hơn hồ sơ: icon cửa hàng trong ô nền kem, tên **XePrime Sài Gòn**, mô tả “Quản lý đội xe, lịch thuê và đơn hàng ở một nơi.”
- Nút rõ ràng “Mở khu quản lý” hoặc “Quản lý xe”; dùng gold khi là CTA chính.
- Card này là cầu nối cho chủ xe/chủ gian hàng. Với người thuê chưa có gian hàng, thay nội dung bằng “Đăng xe cho thuê” và mô tả bình tĩnh, không dùng cảm giác lỗi.

### Mobile cần suy ra đúng

- Rộng 375px: header thu gọn; sidebar thành các chip cuộn ngang ở dưới tiêu đề, không dùng sidebar dọc hoặc bảng tràn màn.
- Card hồ sơ thành một cột; nút chỉnh sửa rộng toàn hàng; email/số điện thoại xếp nhãn trước, giá trị sau.
- Hành động chính dễ chạm, tối thiểu 44px; không cố nén menu quản lý phức tạp vào trang đầu.

---

## 4. Prompt dán trực tiếp vào ChatGPT

> Gửi kèm: ảnh chụp giao diện XePrime hiện tại và ảnh tham khảo Mioto. Ảnh Mioto chỉ là tham khảo về nhịp bố cục, **không sao chép logo, màu xanh, icon, nội dung hay hệ thống UI của Mioto**.

```text
Hãy tạo một ảnh thiết kế UI desktop high-fidelity cho trang “Tài khoản của tôi” của XePrime, nền tảng cho thuê xe tại Việt Nam. Kích thước khung 1440px, trang web thật có thể triển khai, nhìn như một sản phẩm hoàn chỉnh chứ không phải wireframe.

Bối cảnh: XePrime giúp khách thuê tìm/đặt xe và giúp chủ xe vận hành xe, lịch, đơn thuê. Một người có thể vừa là khách thuê vừa là chủ xe; chủ xe và chủ gian hàng dùng chung hồ sơ cá nhân, chỉ khác năng lực quản lý mở theo gói. Đây là màn hồ sơ của một chủ gian hàng tên “Trần Quốc Bảo”, gian hàng “XePrime Sài Gòn”. Mục tiêu thị giác: sang trọng có kiểm soát, ấm áp, đáng tin, gọn gàng và chuyên nghiệp; không phải app đặt xe giá rẻ, fintech hay dashboard SaaS nhiều màu.

NHẬN DIỆN BẮT BUỘC
- Dùng màu gold #D6A02C làm điểm nhấn hiếm: CTA chính, menu đang chọn, icon nhấn. Gold đậm #A9761A cho chữ/icon trên nền kem #FDF6E3.
- Nền trang ấm #FAF9F7; card trắng #FFFFFF; nền hàng thông tin #F5F3EF; chữ #1A1A1A và #6B6560; viền #E8E4DD.
- Thành công xanh #16A34A, cảnh báo cam #E07B26, thông tin xanh dương #2563EB. Gold không mang nghĩa cảnh báo. Chữ trên nút gold là nâu đen #2A2318, không phải trắng.
- Font Be Vietnam Pro. Bo góc card 10px; khoảng cách 4/8/16/24/32px; bóng cực nhẹ tông nâu ấm. Icon nét mảnh, nhất quán.
- Tuyệt đối không dùng xanh lá Mioto, neon, gradient rực, glassmorphism, nhiều badge màu, dữ liệu biểu đồ, điểm thưởng hay ví nạp tiền.

BỐ CỤC
1) Header trắng tối giản: logo XePrime bên trái; menu Khám phá, Về Prime, Chuyến của tôi; bên phải chuyển ngôn ngữ VN, chat, chuông có badge nhỏ, avatar và tên người dùng.
2) Vùng nội dung tối đa 1220px: tiêu đề “Tài khoản của tôi” 32px, mô tả “Quản lý thông tin cá nhân, xác minh và hoạt động thuê xe”.
3) Cột menu trái 232px, không bọc trong card nặng; nhóm chữ nhỏ: CÁ NHÂN, THUÊ XE, THIẾT LẬP. Mục “Tài khoản của tôi” đang chọn: nền kem nhạt, chữ gold đậm, một thanh nhấn gold mảnh. Các mục khác: Chuyến của tôi, Xe yêu thích, Địa chỉ của tôi, Giấy tờ & xác minh, Thông báo, Cài đặt. Cuối menu là Đăng xuất đỏ nhẹ.
4) Cột nội dung phải có card hồ sơ lớn:
   - eyebrow có icon khiên “Hồ sơ cá nhân”; tiêu đề “Thông tin tài khoản”; mô tả một dòng; nút viền có icon bút “Chỉnh sửa hồ sơ”.
   - bên trái: avatar tròn 104px, “Trần Quốc Bảo”, “Tài khoản XePrime”.
   - bên phải: 2 hàng nền phụ sạch sẽ: Email / owner.saigon@xeprime.test; Số điện thoại / 0902000001 với badge xanh “Đã xác thực”.
   - dưới cùng: dải thông tin xanh nhạt có icon khoá, tiêu đề “Thông tin đăng nhập”, mô tả rằng email và số điện thoại cần luồng xác thực riêng để thay đổi.
5) Bên dưới là card cầu nối nhẹ hơn: icon cửa hàng trong ô nền kem, “XePrime Sài Gòn”, mô tả “Quản lý đội xe, lịch thuê và đơn hàng ở một nơi.”, CTA gold “Mở khu quản lý”.

YÊU CẦU UX/NGHIỆP VỤ
- Màn này là hồ sơ cá nhân thống nhất, không biến thành dashboard doanh thu.
- Không vẽ ngày sinh, giới tính, giấy phép lái xe, tỷ lệ phản hồi, ví tiền, điểm thưởng hoặc số liệu không có luồng thật.
- Email và số điện thoại là read-only; chỉ tên hiển thị/ảnh đại diện có thể chỉnh sửa khi mở chế độ edit.
- Dành khoảng trắng hào phóng, hierarchy rõ: tiêu đề → thông tin nhận diện → chi tiết xác thực → lối vào quản lý gian hàng.
- Thiết kế phải dễ chuyển sang mobile: sidebar thành chip cuộn ngang; card hồ sơ một cột; nút tối thiểu 44px.

Xuất một ảnh UI sắc nét, đầy đủ nội dung tiếng Việt có dấu, đúng căn chỉnh, không watermark và không thêm lời giải thích ngoài ảnh.
```

---

## 5. Tiêu chí duyệt ảnh nhận về

- [ ] Nhìn là XePrime: nền ấm, gold tiết chế, không lẫn phong cách xanh Mioto.
- [ ] Hồ sơ cá nhân là trung tâm; card gian hàng chỉ là bước đi tiếp theo.
- [ ] Tất cả chữ tiếng Việt có dấu, không bị méo hoặc đổi thành lorem ipsum.
- [ ] Phân biệt rõ hành động chính, trạng thái xác thực và thông tin trung tính.
- [ ] Không có nghiệp vụ giả: ví, điểm, số KPI/doanh thu, GPLX/ngày sinh/giới tính.
- [ ] Có thể triển khai bằng card, sidebar và responsive layout thông thường; không phụ thuộc hiệu ứng đồ hoạ khó làm.
- [ ] Có khoảng thở, căn lề và phân cấp tương tự sản phẩm vận hành cao cấp, không phải landing page.

## Tham chiếu nội bộ

- `docs/design/01_BRAND_GUIDE.md` — nhận diện, màu, chữ, ảnh và giọng nói.
- `docs/design/04_CREATIVE_BRIEF.md` — tiêu chí sáng tạo tổng thể.
- `docs/decisions/0014-owner-and-shop-single-role.md` — một hồ sơ cho khách/chủ xe/chủ gian hàng.
- `docs/decisions/0027-feature-tiers-basic-owner-vs-shop.md` — năng lực cơ bản/nâng cao và ba trạng thái feature.
