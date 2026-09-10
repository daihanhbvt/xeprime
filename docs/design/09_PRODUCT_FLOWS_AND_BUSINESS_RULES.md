# 09 — Product Flows & Business Rules

> Cập nhật: 09/09/2026  
> Trạng thái: **Canonical supplement — nguồn nghiệp vụ cho sitemap/user flow trên FigJam**  
> Phạm vi: Marketplace, User Portal, Owner Lite, Manage và Platform Admin

## 0. Cách dùng tài liệu

Tài liệu này ghi lại các quyết định trực tiếp của product owner trong quá trình phân tích lại toàn bộ trải nghiệm XePrime. Đây là nguồn đầu vào mới nhất để:

- Vẽ sitemap tổng thể và sitemap theo vai trò.
- Vẽ user flow xuyên Public → User → Owner → Manage → Admin.
- Kiểm kê màn hình trước khi redesign.
- Phát hiện chỗ tài liệu/code hiện tại đang đi lệch nghiệp vụ mong muốn.

Các quyết định đã chốt trong đợt phân tích này được ghi tại [ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md). Chúng là đầu vào thiết kế, nhưng không tự cho phép bật logic tiền thật hoặc bảo hiểm production trước khi vượt qua release gate pháp lý/thanh toán.

Các trạng thái trong tài liệu là **trạng thái nghiệp vụ để vẽ flow**, chưa mặc định là tên enum/API. Khi triển khai phải ánh xạ với status hiện có hoặc cập nhật contract bằng quy trình chuẩn.

---

## 1. Mô hình sản phẩm

XePrime có một marketplace chung cho ô tô và xe máy, đồng thời phục vụ hai mô hình cung cấp xe:

1. **Chủ xe tuyến hoa hồng:** cá nhân có ít xe, dùng bộ quản lý cơ bản trong User Portal và trả phí nền tảng theo chuyến.
2. **Gian hàng tuyến gói:** đơn vị vận hành chuyên nghiệp, trả phí thuê bao để dùng Manage và không trả hoa hồng theo chuyến.

Người dùng có thể thuê:

- Ô tô hoặc xe máy.
- Tự lái hoặc có tài xế, nếu xe hỗ trợ.
- Ngắn hạn hoặc dài hạn.
- Nhận tại địa chỉ chủ xe/gian hàng hoặc yêu cầu giao tận nơi.

Mọi xe cùng xuất hiện trên một marketplace. Không tách chợ theo tuyến hoa hồng và tuyến gói.

---

## 2. Người dùng, vai trò và quyền truy cập

```text
Khách chưa đăng nhập
└─ Người dùng đã đăng nhập
   ├─ Chỉ thuê xe
   ├─ Chủ xe tuyến hoa hồng
   └─ Chủ gian hàng tuyến gói
      └─ Nhân viên gian hàng theo role/permission hiện có

Platform
└─ Admin/nhân sự vận hành nền tảng
```

### 2.1 Quy tắc tài khoản

- Một tài khoản không đồng thời là chủ xe tuyến hoa hồng và chủ gian hàng.
- Chủ xe/gian hàng vẫn có đầy đủ khả năng thuê xe như người dùng thông thường.
- Chủ xe tuyến hoa hồng được có tối đa **3 xe**.
- Khi muốn đăng xe thứ 4, hệ thống gợi ý nâng cấp thành gian hàng.
- Chủ xe tuyến hoa hồng không trả phí đăng ký, phí thuê bao hay phí gói.
- Chủ gian hàng và nhân viên được cấp quyền mới được vào `/manage`.
- Tài xế không phải user, không có tài khoản và không cần app riêng.

### 2.2 Nâng cấp chủ xe thành gian hàng

Chủ xe tuyến hoa hồng có thể nâng cấp thành gian hàng mà không tạo lại tài khoản và xe.

- Booking tạo trước thời điểm nâng cấp giữ nguyên mô hình hoa hồng, mức phí và chính sách đã snapshot.
- Booking tạo sau thời điểm nâng cấp áp dụng mô hình gian hàng và hoa hồng 0%.
- Sau nâng cấp, các công cụ quản lý nâng cao được mở trong Manage.
- Luồng hạ cấp từ gian hàng về chủ xe cơ bản chưa được chốt trong tài liệu này.

---

## 3. Hai tuyến kinh doanh

| Quy tắc | Chủ xe tuyến hoa hồng | Gian hàng tuyến gói |
| --- | --- | --- |
| Phí cố định/thuê bao | 0đ | Theo gói gian hàng |
| Giới hạn xe | Tối đa 3 | Theo chính sách/gói gian hàng |
| Phí nền tảng theo chuyến | 10% tổng giá trị chuyến, cộng vào số tiền khách trả | 0% |
| Thuế theo chuyến | Khấu trừ từ tiền chủ xe nhận | Khấu trừ từ tiền gian hàng nhận |
| Bảo hiểm điện tử cho xe/chuyến | Bắt buộc, khách trả thêm | Bắt buộc, khách trả thêm |
| Bảo hiểm tai nạn con người | Tùy chọn, khách trả thêm | Tùy chọn, khách trả thêm |
| Liên hệ trước khi booking được xác nhận | Không công khai | Có thể công khai |
| Quản lý cơ bản | User Portal/Owner Lite | User Portal |
| Quản lý nâng cao | Không | Manage |

Tỷ lệ 10%, tỷ lệ cọc, tỷ lệ thuế và biểu phí bảo hiểm phải là policy có phiên bản và ngày hiệu lực; booking lưu snapshot, không tính lại theo cấu hình mới. Phí nền tảng và bảo hiểm do khách chịu; thuế không cộng vào giá khách mà khấu trừ từ khoản XePrime phải trả cho chủ xe/gian hàng. Working rate cho ví dụ sản phẩm hiện tại là **7% trên giá thuê gốc**, nhưng không được hard-code trước khi chính sách thuế production được xác nhận.

---

## 4. Phân vùng trải nghiệm

### 4.1 Public Marketplace

- Trang chủ/khám phá.
- Tìm kiếm, lọc và sắp xếp xe.
- Kết quả trên danh sách/bản đồ.
- Chi tiết xe, giá, lịch trống và chính sách.
- Hồ sơ chủ xe hoặc gian hàng theo mức được phép công khai.
- Bắt đầu đặt xe.
- Đăng nhập/đăng ký.
- Nội dung trợ giúp và chính sách pháp lý.

### 4.2 User Portal

Vùng User được mở rộng để phục vụ cả người thuê và quản lý xe cơ bản.

**Người dùng chưa kinh doanh:**

- Tài khoản của tôi.
- Chuyến của tôi.
- Trở thành chủ xe.
- Đổi mật khẩu.
- Yêu cầu xóa tài khoản.
- Đăng xuất.

**Chủ xe tuyến hoa hồng và chủ gian hàng:**

- Danh sách xe.
- Lịch xe.
- Cẩm nang cho thuê xe.
- Chuyến của tôi.
- Thông tin khai thuế.
- Hợp đồng & chứng từ.
- Chính sách bảo vệ dữ liệu.
- Tài khoản của tôi.
- Đổi mật khẩu.
- Yêu cầu xóa tài khoản.
- Đăng xuất.
- Lối vào Manage chỉ xuất hiện khi tài khoản là chủ gian hàng hoặc có membership phù hợp.

**Quản lý cơ bản cho từng xe:**

- Thông tin xe, địa chỉ, tiện nghi.
- Hình ảnh.
- Giấy tờ xe.
- Lịch sử chuyến của riêng xe.
- Bật/tắt cho thuê tự lái.
- Giá cho thuê.
- Tối ưu nhận chuyến/tự động chấp nhận.
- Giao xe tận nơi.
- Thời gian giao nhận và thời gian chết giữa hai chuyến.
- Thủ tục cho thuê.
- Cấu hình có tài xế nếu xe hỗ trợ; bỏ phần tiện ích bổ sung.

### 4.3 Manage — chỉ cho gian hàng

Manage giữ vai trò hệ thống vận hành nâng cao, gồm tối thiểu:

- Dashboard và việc cần làm.
- Đội xe, lịch, trạng thái xe, giấy tờ và bảo trì.
- Yêu cầu đặt xe, booking và chuyến.
- Bàn giao/nhận lại xe và bằng chứng, nếu gian hàng sử dụng.
- Khách hàng.
- Danh sách tài xế và phân công tài xế.
- Nhân viên, membership và phân quyền.
- Chi nhánh và địa điểm giao nhận.
- Giá, phụ phí, giảm giá và khuyến mãi.
- Hợp đồng, biên bản và chứng từ.
- Thu chi, công nợ, doanh thu và báo cáo.
- Thuế, bảo hiểm, số dư và yêu cầu rút tiền.
- Sự cố, bồi thường, hỗ trợ và khiếu nại.
- Gói gian hàng và cấu hình gian hàng.

Các tính năng nâng cao có thể là công cụ ghi nhận tùy chọn. Ví dụ gian hàng có thể tracking phí trả muộn, vượt km, nhiên liệu/pin hoặc hư hỏng để quản trị doanh thu; XePrime không bắt buộc đứng ra thu các khoản đó.

### 4.4 Platform Admin

- Quản lý người dùng, chủ xe, gian hàng và nhân sự nền tảng.
- Duyệt/xác minh chủ thể, xe, giấy tờ và listing.
- Quản lý booking/chuyến trên toàn hệ thống.
- Giao dịch QR Pay, đối soát, hoàn tiền, ledger và yêu cầu rút.
- Chính sách hoa hồng, thuế, bảo hiểm, cọc và hủy chuyến.
- Gói thuê bao và hóa đơn.
- Hỗ trợ, khiếu nại, sự cố và audit log.
- Danh mục hãng/model/loại xe/tiện nghi và nội dung marketplace.

Admin được phép vào ngữ cảnh Manage của bất kỳ gian hàng nào với toàn quyền như chủ gian hàng. Manage không cần một thiết kế riêng cho admin, chỉ cần dòng nhắc nhỏ nhưng rõ:

> Bạn đang quản lý gian hàng: {Tên gian hàng}

Mọi hành động thay đổi dữ liệu/tiền trong ngữ cảnh này vẫn phải có audit log.

---

## 5. Trở thành chủ xe

Nút **Trở thành chủ xe** không được đưa thẳng người dùng vào form tạo gian hàng. Luồng đúng:

```text
Người dùng chọn “Trở thành chủ xe”
└─ Chọn mô hình kinh doanh
   ├─ Tuyến hoa hồng
   │  ├─ Không phí cố định
   │  ├─ Phí nền tảng 10% mỗi chuyến được cộng vào giá khách trả
   │  ├─ Tối đa 3 xe
   │  └─ Đăng chiếc xe đầu tiên
   └─ Gian hàng tuyến gói
      ├─ Trả phí thuê bao
      ├─ 0% phí nền tảng theo chuyến
      ├─ Có công cụ Manage
      └─ Đăng ký/kích hoạt gian hàng
```

Hai lựa chọn phải giải thích rõ chi phí, giới hạn, quyền lợi và phạm vi công cụ trước khi người dùng quyết định.

---

## 6. Luồng đặt xe và mở liên hệ

### 6.1 Trạng thái nghiệp vụ mục tiêu

```text
Khách gửi yêu cầu đặt xe
→ Chủ xe chấp nhận hoặc hệ thống tự động chấp nhận
→ Chờ thanh toán cọc bằng QR Pay
→ QR Pay tự động xác nhận
→ Booking được xác nhận
→ Chuẩn bị giao/nhận xe
→ Chuyến bắt đầu
→ Chuyến kết thúc theo lịch hoặc chủ xe điều chỉnh
→ Hoàn thành
```

Trong ngôn ngữ sản phẩm, **“đặt xe thành công”** là mốc chủ xe chấp nhận hoặc hệ thống tự động chấp nhận (`acceptedAt`). Mốc này bắt đầu đồng thời cửa sổ thanh toán tối đa 2 giờ và cửa sổ hủy miễn phí 4 giờ. QR Pay thành công chuyển booking sang trạng thái đã thanh toán/xác nhận; không được dùng thời điểm QR Pay để khởi động lại 4 giờ miễn phí.

### 6.2 Tự động nhận chuyến

- Nếu xe bật **Tối ưu nhận chuyến**, hệ thống có thể tự động chấp nhận yêu cầu phù hợp.
- Tự động chấp nhận chỉ bỏ qua thao tác duyệt của chủ xe; không bỏ qua thanh toán cọc, thuế hay bảo hiểm.

### 6.3 Cửa sổ thanh toán và giữ lịch

- Sau khi yêu cầu được chấp nhận, xe được tạm giữ lịch tối đa **2 giờ**.
- Giờ thứ nhất hiển thị countdown 60 phút để thúc đẩy thanh toán.
- Nếu chưa thanh toán, hệ thống chuyển sang countdown gia hạn thêm 60 phút.
- Hết tổng cộng 2 giờ vẫn chưa thanh toán: tự động hủy, mở lại lịch và thông báo cho khách lẫn chủ xe.
- Auto-cancel do chưa trả tiền không phát sinh phí hủy.

### 6.4 Mở thông tin liên hệ

- Tuyến hoa hồng không công khai liên hệ trực tiếp trước khi booking hợp lệ.
- Quy tắc làm việc cho flow: chỉ mở liên hệ sau khi QR Pay xác nhận tiền cọc để tránh giao dịch vòng ngoài làm mất thuế, bảo hiểm và phí nền tảng.
- Gian hàng có thể công khai thông tin để trao đổi trước, nhưng booking chính thức trong giai đoạn đầu vẫn phải đi qua cọc QR Pay.

Điểm mở liên hệ của tuyến hoa hồng cần được product owner xác nhận lần cuối trước khi tạo ADR.

---

## 7. Tiền cọc, thanh toán và số dư

### 7.1 XePrime chỉ thu phần thanh toán online lúc đặt xe

```text
Giá thuê cơ bản
├─ Tiền cọc đặt chuyến → QR Pay → tài khoản nhận tiền của XePrime
└─ Tiền thuê còn lại → khách trả trực tiếp chủ xe/gian hàng

Phần khách trả thêm khi đặt
├─ Phí nền tảng 10% × giá trị chuyến, chỉ có ở tuyến hoa hồng
├─ Bảo hiểm điện tử bắt buộc cho xe/chuyến
└─ Bảo hiểm tai nạn con người, nếu khách chọn
```

- QR Pay tự động khớp và xác nhận thanh toán.
- XePrime không thu hộ, xác nhận hoặc đối soát phần tiền thuê còn lại.
- Tổng giá trị chuyến vẫn được snapshot để tính phí nền tảng, thuế và báo cáo.
- Giai đoạn đầu, cọc qua XePrime là bắt buộc cho booking của cả hai tuyến vì liên quan đến thuế và việc chuẩn bị phát hành bảo hiểm.
- Phí nền tảng 10% là một dòng riêng cộng vào checkout của khách, không được khấu trừ lần nữa từ số tiền của chủ xe.
- Phí bảo hiểm bắt buộc và bảo hiểm tai nạn tùy chọn đều là dòng phía khách, không khấu trừ từ giá thuê chủ xe đã đặt.
- Phí bảo hiểm được thu/giữ cùng QR Pay nhưng chưa chuyển thành hợp đồng bảo hiểm tại thời điểm đặt xe. XePrime chỉ chính thức mua/phát hành bảo hiểm khi xe được bàn giao hoặc chuyến bắt đầu.
- Thuế là nghĩa vụ phía chủ xe/gian hàng và được trừ từ khoản XePrime phải trả cho họ khi chuyến bắt đầu.

### 7.2 Phân bổ chuyến bình thường

Gọi:

- `B`: giá thuê gốc do chủ xe đặt.
- `D`: phần cọc thuộc giá thuê gốc.
- `S`: phí nền tảng phía khách; tuyến hoa hồng mặc định `S = 10% × B`, tuyến gian hàng `S = 0`.
- `IV`: phí bảo hiểm xe/chuyến bắt buộc phía khách.
- `IP`: phí bảo hiểm tai nạn con người tùy chọn phía khách.
- `T`: thuế khấu trừ phía chủ xe/gian hàng; ví dụ hiện tại `T = 7% × B`.

**Tuyến hoa hồng:**

```text
Khách thanh toán QR Pay khi đặt = D + S + IV + IP
Khách trả trực tiếp khi nhận xe = B − D

Khoản XePrime phải trả chủ xe = D − T
Tổng tiền thuê ròng chủ xe nhận = (B − D) + (D − T) = B − T
Doanh thu phí nền tảng XePrime = S
```

**Tuyến gian hàng:**

```text
Khách thanh toán QR Pay khi đặt = D + IV + IP
Khách trả trực tiếp khi nhận xe = B − D

Khoản XePrime phải trả gian hàng = D − T
Tổng tiền thuê ròng gian hàng nhận = B − T
```

Tiền cọc tối thiểu phải đủ bao phủ thuế cần khấu trừ. Phí nền tảng và bảo hiểm do khách thanh toán là các dòng riêng nên không dùng để giảm phần cọc này. Nếu tỷ lệ cọc mặc định không đủ, server phải tăng mức cọc yêu cầu hoặc chặn báo giá không hợp lệ.

**Công thức giá khách thấy ở tuyến hoa hồng:**

```text
Giá khách phải trả cho chuyến
= giá thuê cơ bản
+ phí nền tảng 10% × tổng giá trị chuyến
+ bảo hiểm điện tử bắt buộc cho xe/chuyến
+ bảo hiểm tai nạn con người nếu khách chọn
```

Phần giá thuê còn lại sau cọc vẫn do khách trả trực tiếp cho chủ xe. Thuế không được cộng thêm vào tổng giá khách vì nó được khấu trừ từ phía chủ xe/gian hàng.

**Ví dụ VF5 một ngày:**

```text
B — giá chủ xe đặt:                         700.000đ
S — phí nền tảng 10% phía khách:             70.000đ
IV — bảo hiểm bắt buộc phía khách:           130.000đ
IP — bảo hiểm tai nạn tùy chọn:                    0đ
Giá cuối khách thấy và phải trả:             900.000đ

T — thuế 7% × 700.000đ:                      49.000đ
Tổng tiền thuê ròng chủ xe nhận:             651.000đ
```

Con số bảo hiểm 130.000đ trong ví dụ chỉ dùng để minh họa phép tính ra tổng 900.000đ, không phải biểu phí hoặc tỷ lệ bảo hiểm production.

Nếu cọc đặt chuyến bằng 20% giá thuê gốc thì breakdown thanh toán là:

```text
D — cọc 20% × 700.000đ:                      140.000đ
S — phí nền tảng:                             70.000đ
IV — bảo hiểm bắt buộc:                      130.000đ
Khách thanh toán QR Pay ngay:                340.000đ

Khách trả trực tiếp khi nhận xe:             560.000đ
XePrime trả chủ xe từ phần cọc sau thuế:       91.000đ
Tổng chủ xe nhận:                            651.000đ
```

Checkout phải đồng thời hiển thị rõ ba con số: **Tổng giá chuyến 900.000đ**, **Thanh toán ngay 340.000đ** và **Trả chủ xe khi nhận xe 560.000đ**.

### 7.3 Sổ số dư nội bộ

Không gọi số tiền có thể rút là “điểm”. Tên UX đề xuất:

- **Số dư XePrime**, hoặc
- **Khoản XePrime phải trả**.

Đây là sổ công nợ/ledger nội bộ, không phải ví điện tử dùng để chuyển tiền giữa người dùng. Cần thể hiện tối thiểu:

- Chờ xử lý.
- Khả dụng để rút.
- Đang yêu cầu rút.
- Đã chuyển khoản.
- Bị từ chối/đã điều chỉnh.

Người dùng/chủ xe/gian hàng gửi yêu cầu rút; admin kiểm tra và chuyển khoản ngân hàng thủ công rồi xác nhận kết quả trên hệ thống.

### 7.4 Hai loại “cọc” phải tách tên

1. **Cọc đặt chuyến:** đi qua XePrime, xác nhận booking và chịu chính sách hủy.
2. **Tài sản bảo đảm khi nhận xe:** chủ xe tự thỏa thuận và làm việc trực tiếp với khách; XePrime không giữ hay quản lý.

Không gộp hai khái niệm thành một nhãn “tiền cọc” trên checkout.

---

## 8. Thuế và bảo hiểm

### 8.1 Thuế

- Thuế được tính trên **tổng giá trị thuê chịu thuế của chuyến**.
- Cơ sở tính thuế không bao gồm bảo hiểm và các dòng phí/phụ phí không chịu thuế theo policy đã chốt.
- Thuế chưa được trừ khi khách chỉ mới đặt/cọc.
- Thuế được ghi nhận và khấu trừ khi chuyến thực sự bắt đầu.
- Booking bị hủy trước khi đi không bị trừ thuế.
- Tỷ lệ và cách phân loại chủ thể phải cấu hình được, có hiệu lực theo phiên bản và cần xác nhận pháp lý trước production.

### 8.2 Bảo hiểm điện tử theo chuyến

Đây là sản phẩm bảo hiểm online do XePrime liên kết với đối tác và phát hành cho từng chuyến, **không phải** giấy bảo hiểm trách nhiệm dân sự bắt buộc sẵn có của xe.

- Bảo hiểm cho xe/chuyến: bắt buộc với mọi booking ở cả hai tuyến.
- Bảo hiểm tai nạn con người: tùy chọn, được khuyến khích chọn.
- Người thuê thanh toán cả phí bảo hiểm bắt buộc và phí bảo hiểm tai nạn nếu họ chọn; các khoản này được cộng ngoài giá thuê gốc.
- QR Pay thu/giữ khoản phí dự kiến, nhưng hợp đồng/chứng nhận chỉ được mua và phát hành tại mốc bàn giao hoặc bắt đầu chuyến.
- Nếu booking bị hủy trước mốc bàn giao/bắt đầu chuyến, cả `IV` và `IP` đều được hoàn 100%; chưa có hợp đồng bảo hiểm nào được mua.
- Với tuyến hoa hồng, hệ thống có thể dùng mốc bắt đầu theo lịch làm trigger nếu chủ xe không cập nhật khác. Với gian hàng, mốc bàn giao đã xác nhận hoặc mốc bắt đầu theo lịch là trigger tùy cấu hình vận hành.
- Phí và consent phải hiển thị riêng, không nhập nhằng với thuế hay phí nền tảng.
- Chứng nhận điện tử phải xem được trong chi tiết chuyến sau khi phát hành.
- Cần thiết kế trạng thái đang phát hành, thành công, thất bại, đã hủy và yêu cầu bồi thường.

---

## 9. Chính sách hủy

### 9.1 Khách chưa thanh toán

- Hết tối đa 2 giờ thì booking tự hủy.
- Không có tiền để phân bổ và không tính phí hủy.
- Lịch xe được mở lại; hai bên nhận thông báo.

### 9.2 Khách hủy trong cửa sổ miễn phí

- Cửa sổ chuẩn: trong vòng 4 giờ kể từ `acceptedAt`, tức lúc chủ xe duyệt hoặc hệ thống tự động nhận chuyến.
- Khách không mất phần cọc phạt hủy.
- Phí nền tảng 10% được hoàn lại toàn bộ.
- Toàn bộ phí bảo hiểm bắt buộc và tùy chọn được hoàn lại vì bảo hiểm chỉ được mua/phát hành khi bàn giao hoặc bắt đầu chuyến.
- Số tiền hoàn trước bàn giao là `D + S + IV + IP`; UI được phép gọi là “hoàn 100% số tiền đã thanh toán online”.

### 9.3 Khách hủy sau cửa sổ miễn phí

```text
Phí bảo hiểm IV + IP → hoàn 100% cho khách

Phần chịu chính sách hủy = tiền cọc D + phí nền tảng S
50% × (D + S) → chủ xe/gian hàng
50% × (D + S) → XePrime
```

- Không tính thuế vì chuyến chưa diễn ra.
- Không mua/phát hành bảo hiểm; toàn bộ `IV + IP` được hoàn cho khách trước khi chia phần chịu chính sách hủy.
- Phí nền tảng 10% đã trả được đưa vào quỹ chia 50/50 cùng tiền cọc, không giữ riêng toàn bộ cho XePrime.
- Không khấu trừ thêm phí nền tảng lần thứ hai; phần 50% của XePrime là khoản theo chính sách hủy.

### 9.4 Booking sát giờ nhận xe

- Nếu thời điểm nhận xe cách `acceptedAt` ít hơn cửa sổ miễn phí 4 giờ, phải cảnh báo rõ trước khi khách thanh toán.
- Copy cần nói thẳng rằng đây là booking sát giờ và việc hủy sau thanh toán có thể làm mất cọc theo policy.

### 9.5 Chủ xe/gian hàng hủy

- Khách được hoàn 100% tiền cọc, phí nền tảng và toàn bộ phí bảo hiểm đã thanh toán nếu chuyến chưa bắt đầu.
- Không có khoản bồi thường thêm.
- Chủ xe/gian hàng chưa bị phạt tiền.
- Tần suất hủy được tracking để admin cảnh báo/xử lý trong giai đoạn sau.
- Vì bảo hiểm chưa được mua/phát hành trước bàn giao, không có chi phí bảo hiểm cần phân bổ trong trường hợp hủy trước chuyến.

### 9.6 Khách không đến nhận xe

Working rule: xử lý tương đương hủy muộn của khách. Quy tắc này cần xác nhận cuối trước khi đưa vào chính sách công khai.

---

## 10. Giao nhận và vận hành chuyến

### 10.1 Tuyến hoa hồng

- Không bắt buộc biên bản bàn giao/nhận lại.
- Không bắt buộc chụp tình trạng xe, nhiên liệu/pin hoặc số km.
- Không yêu cầu khách cùng xác nhận bàn giao/trả xe.
- Chủ xe là bên chủ động cập nhật nếu lịch thực tế thay đổi.
- Nếu không có cập nhật, hệ thống có thể tự chuyển mốc nghiệp vụ theo thời gian dự kiến: đến giờ nhận xe xem như đã bàn giao; hết giờ xem như đã trả.
- Tài sản bảo đảm, tiền còn lại, trả muộn, vượt km, nhiên liệu/pin và hư hỏng do chủ xe tự làm việc với khách.
- Nếu khách không trả phần tiền còn lại, XePrime chỉ hỗ trợ tiếp nhận/giải quyết khiếu nại; nền tảng không bảo lãnh hoặc thu hồi nợ thay chủ xe.

### 10.2 Tuyến gian hàng

Gian hàng có công cụ nâng cao để tùy chọn sử dụng:

- Biên bản bàn giao/nhận lại.
- Ảnh và bằng chứng tình trạng xe.
- Odometer, nhiên liệu hoặc mức pin.
- Ghi nhận trả muộn, vượt km, thiếu nhiên liệu/pin và hư hỏng.
- Phụ phí, thu chi, công nợ và tracking doanh thu.

Các công cụ này phục vụ vận hành và báo cáo; XePrime không mặc định thu hộ các khoản phát sinh.

---

## 11. Dịch vụ có tài xế

### 11.1 Chủ xe tuyến hoa hồng

- Không tạo tài khoản tài xế.
- Khi bật dịch vụ có tài xế, mặc định chủ xe là tài xế.

### 11.2 Gian hàng

- Gian hàng duy trì danh sách tài xế nội bộ.
- Tài xế là bản ghi để quản lý và gán vào chuyến, không phải user/membership.
- Có thể lưu tên, liên hệ, giấy phép lái xe, hạng bằng, hạn bằng, trạng thái và ghi chú.
- Manage cho phép chọn/đổi tài xế và kiểm tra trùng lịch phân công.
- Tài xế không đăng nhập và không có app riêng.

---

## 12. Thuê dài hạn

Thuê dài hạn vẫn là flow đặt xe trực tiếp, không mặc định chuyển thành yêu cầu báo giá:

```text
Chọn xe
→ Chọn gói/thời lượng dài hạn
→ Xem giá và điều kiện
→ Chọn giao nhận và bảo hiểm
→ Gửi yêu cầu
→ Chủ xe chấp nhận/tự động chấp nhận
→ Thanh toán cọc QR Pay
→ Booking được xác nhận
```

Cần tách rõ giá tuần/tháng, giảm giá theo thời lượng, cọc đặt chuyến, giới hạn km, lịch thanh toán trực tiếp, gia hạn và trả xe sớm.

---

## 13. Những điểm ADR 0032 đã hợp nhất

Các nội dung sau đã được hợp nhất bằng ADR 0032; khi đọc tài liệu/ADR cũ, ADR 0032 thắng trong đúng phạm vi được ghi đè:

1. [ADR 0029](../decisions/0029-per-vehicle-flat-pricing-and-customer-side-fees.md) và quyết định mới đã thống nhất: phí nền tảng 10% nằm phía khách và được cộng vào checkout; thuế nằm phía chủ xe/gian hàng và được khấu trừ từ khoản phải trả.
2. [ADR 0028](../decisions/0028-marketplace-subscription-fees-and-custodied-funds.md) và phiên bản cũ của `02_PRODUCT_VISION.md` cho phép gian hàng nhận cọc trực tiếp hoặc tùy chọn đi qua XePrime; ADR 0032 yêu cầu mọi booking ở cả hai tuyến cọc qua QR Pay trong giai đoạn đầu.
3. `02_PRODUCT_VISION.md`, `03_PRODUCT_GAP_ANALYSIS.md`, `04_CREATIVE_BRIEF.md` và `07_INFORMATION_ARCHITECTURE.md` đang đưa bàn giao/nhận lại có bằng chứng vào Owner Lite; quyết định mới giới hạn công cụ này cho gian hàng và không bắt buộc sử dụng.
4. `02_PRODUCT_VISION.md` còn mô tả khả năng XePrime thu hộ phần tiền còn lại; quyết định mới loại bỏ luồng này khỏi phạm vi hiện tại.
5. Tài liệu cũ chưa chốt cửa sổ QR Pay hai lần 60 phút, hủy miễn phí 4 giờ, công thức chia cọc 50/50 và việc chỉ tính thuế khi chuyến bắt đầu.
6. Tài liệu cũ chưa mô tả đủ việc tài xế chỉ là bản ghi nội bộ, không có tài khoản/app.

Các release gate pháp lý/thanh toán vẫn còn hiệu lực; “Accepted” ở đây là quyết định sản phẩm/thiết kế, không phải tuyên bố đã được phép vận hành tiền hoặc bảo hiểm thật.

---

## 14. Các quyết định còn mở

1. Khoảnh khắc mở liên hệ của tuyến hoa hồng: sau chủ xe chấp nhận hay chỉ sau khi QR Pay thành công. Khuyến nghị hiện tại là sau QR Pay.
2. Gia hạn giờ thanh toán thứ hai là tự động hay cần khách bấm “Gia hạn”. Working flow đang giả định tự động.
3. Danh sách chính xác các dòng phí/phụ phí không nằm trong cơ sở tính thuế.
4. Tỷ lệ thuế theo cá nhân/hộ kinh doanh/doanh nghiệp và thời điểm nộp thay thực tế; 7% hiện là working rate.
5. Cách xử lý nếu việc mua/phát hành bảo hiểm thất bại đúng tại mốc bàn giao/bắt đầu chuyến: chặn bàn giao, cho retry hay cho đổi xe.
6. Chính sách no-show, kết thúc sớm, kéo dài chuyến và tranh chấp sau khi chuyến đã bắt đầu.
7. Quy tắc hạ cấp từ gian hàng về chủ xe cơ bản.
8. Giá gói gian hàng, giới hạn xe/nhân viên/chi nhánh và grace period khi hết gói.

---

## 15. Deliverable FigJam

Prompt cuối phải yêu cầu FigJam tạo ít nhất các board/frame sau:

1. Legend, vai trò và màu quy ước.
2. Product ecosystem và global sitemap.
3. Sitemap Public Marketplace.
4. Sitemap User Portal theo người thuê/chủ xe/chủ gian hàng.
5. Sitemap Manage theo nhóm permission.
6. Sitemap Platform Admin.
7. Flow trở thành chủ xe: hoa hồng hoặc gian hàng.
8. Flow đăng xe và duyệt xe.
9. Flow tìm kiếm → đặt xe → QR Pay → mở liên hệ.
10. Flow giữ lịch 2 giờ và tự động hủy.
11. Flow chuyến tự lái/có tài xế/dài hạn/giao tận nơi.
12. Flow hủy, hoàn tiền và phân bổ cọc.
13. Flow thuế, bảo hiểm, số dư và rút tiền.
14. Flow nâng cấp chủ xe thành gian hàng, giữ snapshot booking cũ.
15. Flow vận hành đơn giản của tuyến hoa hồng so với flow nâng cao của gian hàng.
16. Edge cases, lỗi và các quyết định còn mở.

---

## 16. Bộ bàn giao cho designer

Đợt phân tích này bàn giao đủ ba đầu ra sau:

### 16.1 Prompt FigJam

- Một prompt hoàn chỉnh, tự chứa đủ ngữ cảnh.
- Chỉ dẫn layout board, frame, swimlane, màu, legend, connector và decision node.
- Bao phủ sitemap, role map, flow chính, edge case và các điểm giao giữa User/Owner/Manage/Admin.
- Có thể dán trực tiếp vào Figma AI/FigJam AI mà không cần đọc source code.

### 16.2 Bộ tài liệu dự án đã hợp nhất

- Cập nhật Product Vision, Information Architecture và Product Gap Analysis.
- Tạo ADR mới để ghi đè các quyết định cũ bị thay thế.
- Không để hai tài liệu canonical đưa ra hai cách tính tiền hoặc hai phạm vi tính năng khác nhau.
- Liên kết ngược từ `docs/design/README.md` để designer biết thứ tự đọc.

### 16.3 Workbook Excel dành cho designer

Tạo một file `.xlsx` có tối thiểu các sheet:

| Sheet | Nội dung |
| --- | --- |
| `00_Readme` | Mục tiêu, cách đọc, legend và nguồn tài liệu |
| `01_Roles` | Vai trò, business mode, quyền vào từng surface |
| `02_Sitemap` | Cây màn hình Public/User/Owner/Manage/Admin |
| `03_Screen_Inventory` | Mã màn, tên, route, actor, mục tiêu, hành động chính, trạng thái |
| `04_User_Flows` | Mã flow, điểm bắt đầu/kết thúc, bước, decision và nhánh lỗi |
| `05_Permissions` | Role × module × view/create/update/delete/approve/export |
| `06_Booking_States` | Trạng thái booking/chuyến, trigger, actor, trạng thái kế tiếp |
| `07_Money_Rules` | Cọc, phí 10%, thuế, bảo hiểm, hoàn tiền, số dư và rút tiền |
| `08_Vehicle_Matrix` | Ô tô/xe máy × tự lái/có tài xế/dài hạn/giao tận nơi |
| `09_UI_States` | Loading, empty, error, disabled, success, permission denied và edge cases |
| `10_Traceability` | Màn hình/flow ↔ tài liệu ↔ API/module hiện có ↔ gap cần xây |
| `11_Open_Decisions` | Vấn đề chưa chốt, owner, mức ưu tiên và ảnh hưởng thiết kế |
| `12_Implementation_Gaps` | Điểm lệch đã đối chiếu giữa rule sản phẩm và source hiện tại, kèm mức ưu tiên |

Workbook ưu tiên ngôn ngữ sản phẩm dễ hiểu; chi tiết API chỉ đặt ở cột traceability để không làm designer bị nhiễu.
