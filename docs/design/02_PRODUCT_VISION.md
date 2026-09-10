# 02 — Product Vision

> Cập nhật: 09/09/2026
> Trạng thái: **Canonical — định hướng sản phẩm hiện hành**
> Quyết định chi tiết mới nhất về hai tuyến, cọc, thuế, bảo hiểm và hủy: [ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md).

## 1. XePrime là gì

XePrime là **chợ đăng và thuê xe** đồng thời là **giải pháp quản lý hoạt động cho thuê xe**.

- Người thuê tìm xe phù hợp, xem giá/lịch/chính sách, đặt xe, thanh toán khoản giữ chỗ và theo dõi chuyến đi.
- Chủ có một hoặc vài xe có thể bắt đầu bằng bộ công cụ đơn giản, không trả thuê bao và chia sẻ doanh thu theo chuyến.
- Chủ xe chuyên nghiệp hoặc đơn vị cho thuê có thể nâng cấp thành gian hàng, trả thuê bao cố định để dùng toàn bộ công cụ quản lý và không chịu hoa hồng nền tảng theo chuyến.
- Xe của mọi nhóm cùng xuất hiện trên một marketplace; không tách thành hai chợ.

Giá trị cốt lõi là một vòng kín: **nguồn xe thật → lịch thật → đặt xe thật → giao nhận phù hợp từng mô hình → tiền và trách nhiệm giải thích được**.

## 2. Những người XePrime phục vụ

### 2.1 Người thuê xe

Mục tiêu của họ là tìm được xe đúng nhu cầu, biết tổng tiền và điều kiện trước khi đặt, giữ được lịch, nhận đúng xe và có đường xử lý khi phát sinh sự cố.

### 2.2 Chủ xe cơ bản

Thường có 1–3 xe, chưa cần một hệ thống vận hành dày. Họ cần:

- Đăng và quản lý xe.
- Mở/khóa lịch.
- Nhận và xử lý yêu cầu/đơn thuê.
- Theo dõi chuyến; trạng thái có thể tự chuyển theo lịch và chủ xe chỉ điều chỉnh khi thực tế thay đổi.
- Biết từng khoản khấu trừ, số tiền thực nhận và trạng thái chuyển tiền.
- Chat và xử lý hỗ trợ/tranh chấp.

Đây là **một trải nghiệm quản lý rút gọn**, không phải một bản source được clone. Cùng module, API và dữ liệu với portal gian hàng; UI chỉ hiện đúng năng lực của gói cơ bản.

### 2.3 Gian hàng thuê bao

Có thể là một cá nhân muốn vận hành chuyên nghiệp hoặc doanh nghiệp có nhiều xe/nhân viên/chi nhánh. Họ trả thuê bao để nhận:

- Toàn bộ bộ cơ bản.
- Thu chi, công nợ và báo cáo.
- Bảo dưỡng và chi phí vòng đời xe.
- Nhân viên/phân quyền, chi nhánh và tài xế.
- Hợp đồng và công cụ vận hành nâng cao.
- Quyền lợi hiển thị/nhận diện gian hàng theo chính sách xếp hạng minh bạch.
- Không chịu hoa hồng nền tảng theo từng chuyến trong thời gian gói còn hiệu lực.

Một chủ xe có thể nâng cấp mà không đổi tài khoản, role hay tạo lại dữ liệu. Booking đã tạo giữ nguyên snapshot thương mại cũ; quy tắc hạ cấp chưa được chốt.

### 2.4 Nhân sự nền tảng

- `platform_admin`: cấu hình và kiểm soát toàn hệ thống.
- `reviewer`: xác minh chủ xe/gian hàng và kiểm duyệt xe/listing.
- `support`: xử lý ticket, sự cố chuyến và tranh chấp.
- `finance_admin`: đối soát tiền vào, số dư phải trả, hoàn tiền và rút tiền.
- `platform_staff`: phạm vi vận hành được cấp cụ thể.

## 3. Hai lựa chọn cho chủ xe

| Nội dung | Chủ xe cơ bản — theo chuyến | Gian hàng — thuê bao |
| --- | --- | --- |
| Phí cố định | 0đ; tối đa 3 xe | Theo gói gian hàng; giới hạn cụ thể theo policy |
| Giá pilot | Không áp dụng | 100.000đ/ô tô/tháng; 40.000đ/xe máy/tháng; tối thiểu 3 tháng; **chưa phải giá production** |
| Phí nền tảng/chuyến | 10% giá thuê gốc, cộng thêm vào tổng tiền khách trả | 0% trong thời gian gói hiệu lực |
| Thuế | Khấu trừ từ tiền chủ xe nhận khi chuyến bắt đầu; working example 7% giá thuê gốc | Khấu trừ từ tiền gian hàng nhận khi chuyến bắt đầu; không được gộp vào phí gói |
| Bảo hiểm theo chuyến | Bảo hiểm xe/chuyến bắt buộc và bảo hiểm thân thể tùy chọn đều do khách trả thêm | Tương tự; gói thuê bao không làm bảo hiểm biến mất |
| Cọc đặt chuyến | Bắt buộc qua QR Pay XePrime | Bắt buộc qua QR Pay XePrime trong giai đoạn đầu |
| Tiền thuê còn lại | Khách trả trực tiếp chủ xe khi nhận xe | Khách trả trực tiếp gian hàng; XePrime không thu hộ phần còn lại |
| Công cụ quản lý | Rút gọn | Đầy đủ |
| Hiển thị | Theo chất lượng, giá, lịch trống và độ phù hợp | Có quyền lợi ưu tiên hợp lý; mọi vị trí trả phí/tài trợ phải có nhãn rõ |

Tỷ lệ phí nền tảng 10%, working tax rate 7% và giá gói theo loại xe là **policy pilot**, không được hard-code thành sự thật pháp lý hoặc mức giá vĩnh viễn. Admin phải cấu hình chính sách theo loại xe/loại chủ thể, ngày hiệu lực và booking phải lưu snapshot chính sách lúc tạo.

## 4. Nguyên tắc giá, thuế và bảo hiểm

### 4.1 Không che nguồn thu của nền tảng

Không đổi tên hoa hồng của XePrime thành “thuế” hoặc “bảo hiểm” nếu tiền không được nộp cho cơ quan thuế hoặc doanh nghiệp bảo hiểm. Cách trình bày đề xuất:

- **Phí dịch vụ chuyến đi**: khoản XePrime hưởng để vận hành marketplace, thanh toán, hỗ trợ và chống gian lận.
- **Thuế khấu trừ/nộp thay**: đúng số thực tế theo loại người bán và loại dịch vụ.
- **Phí bảo hiểm chuyến đi**: đúng phí của sản phẩm bảo hiểm thật, kèm nhà bảo hiểm, quyền lợi và điều kiện loại trừ.

UI có thể gom thành “Các khoản đảm bảo và nghĩa vụ chuyến đi” ở phần tóm tắt, nhưng trước khi xác nhận phải cho người dùng mở breakdown và biết tiền đi đâu.

### 4.2 Cách hiểu thuế ở giai đoạn thiết kế

Theo Nghị định 117/2025/NĐ-CP, nền tảng có chức năng thanh toán thuộc diện có thể phải khấu trừ/nộp thay thuế cho hộ/cá nhân theo từng giao dịch. Tài liệu hướng dẫn của Chính phủ nêu tỷ lệ tham khảo cho **dịch vụ** của cá nhân cư trú là 5% VAT và 2% PIT; việc cho thuê xe của XePrime được phân loại thế nào phải do tư vấn thuế xác nhận trước khi cấu hình production.

Không dùng một tỷ lệ chung cho mọi chủ thể. Doanh nghiệp, hộ kinh doanh, cá nhân cư trú và không cư trú có thể có cách xử lý khác nhau.

### 4.3 Điều kiện để được gọi là bảo hiểm

Định hướng đối tác đầu tiên là **PVI**, nhưng đây chưa phải tuyên bố rằng XePrime và PVI đã ký hợp đồng hay phát hành sản phẩm. Mô hình sản phẩm mong muốn gồm:

- **Bảo hiểm xe/chuyến:** bắt buộc với mọi booking ở cả hai tuyến và do người thuê trả thêm ngoài giá thuê gốc.
- **Bảo hiểm tai nạn con người:** tùy chọn, do người thuê trả nếu chọn; phải hiển thị riêng giá/quyền lợi và cho khách bỏ chọn dễ dàng trước khi thanh toán.
- QR Pay thu/giữ khoản phí dự kiến lúc đặt xe nhưng chỉ chính thức mua/phát hành bảo hiểm khi bàn giao hoặc bắt đầu chuyến. Mọi booking hủy trước mốc đó được hoàn 100% phí bảo hiểm bắt buộc và tùy chọn.

Chỉ bật dòng “bảo hiểm” sau khi có tối thiểu:

- Hợp đồng với PVI hoặc một doanh nghiệp/đối tác bảo hiểm hợp pháp khác.
- Quy tắc, biểu phí và phạm vi bảo vệ.
- Cách cấp chứng nhận/hợp đồng cho từng chuyến hoặc từng xe.
- Quy trình yêu cầu bồi thường và xử lý từ chối.
- Chứng từ xác nhận khoản phí thực tế.

Nếu chưa có các điều kiện trên, khoản 5–8% không được gọi là bảo hiểm. Có thể thử nghiệm một **phí dịch vụ chuyến đi** minh bạch, nhưng phải tách khỏi thuế và bảo hiểm.

## 5. Luồng tiền mục tiêu

### 5.1 Chủ xe cơ bản

```text
Khách xác nhận booking
→ thanh toán QR Pay: cọc đặt chuyến + phí nền tảng + khoản bảo hiểm dự kiến
→ booking được xác nhận; phần còn lại khách sẽ trả trực tiếp chủ xe
→ đến mốc bàn giao/bắt đầu chuyến: mua/phát hành bảo hiểm và ghi nhận thuế
→ chuyến hoàn thành hoặc bị hủy
→ quyết toán, hoàn tiền hoặc ghi số dư phải trả
→ chủ xe yêu cầu rút về tài khoản ngân hàng
```

### 5.2 Gian hàng thuê bao

```text
Gian hàng trả phí thuê bao theo số chỗ xe
→ được mở toàn bộ công cụ và 0% hoa hồng nền tảng/chuyến
→ khách có thể trao đổi trước với gian hàng
→ booking chính thức vẫn thanh toán cọc và khoản bảo hiểm dự kiến qua QR Pay XePrime
→ tiền thuê còn lại trả trực tiếp gian hàng; thuế và bảo hiểm xử lý theo cùng chuẩn booking
```

Thông tin liên hệ gian hàng có thể công khai để tăng cơ hội chốt xe, nhưng giao dịch không tạo booking trên XePrime không được nhận bảo hiểm/chính sách hủy của nền tảng.

### 5.3 Giữ lịch, hủy và hoàn tiền trước chuyến

- Sau khi chủ xe chấp nhận hoặc hệ thống tự động nhận chuyến (`acceptedAt`), booking được coi là “đặt xe thành công”; khách có tối đa 2 giờ để thanh toán QR Pay, hiển thị bằng hai countdown 60 phút. Hết thời gian, booking tự hủy và mở lại lịch.
- Cửa sổ hủy miễn phí 4 giờ cũng bắt đầu từ `acceptedAt`, không khởi động lại khi QR Pay thành công. Nếu đã thanh toán rồi hủy trong cửa sổ này, khách được hoàn toàn bộ tiền online: cọc, phí nền tảng và các khoản bảo hiểm dự kiến.
- Khách hủy sau cửa sổ miễn phí nhưng trước bàn giao: hoàn 100% bảo hiểm; phần `cọc đặt chuyến + phí nền tảng` được chia 50% cho chủ xe/gian hàng và 50% cho XePrime.
- Chủ xe/gian hàng hủy trước chuyến: khách được hoàn toàn bộ tiền đã thanh toán online; chưa phạt tiền, nhưng hệ thống cần tracking tần suất hủy.
- Không tính thuế và không mua/phát hành bảo hiểm cho booking hủy trước khi chuyến bắt đầu.

### 5.4 “Số dư chủ xe”, không phải ví điện tử

Tên hiển thị là **Số dư chủ xe** hoặc **Khoản XePrime phải trả**. Đây là sổ cái nội bộ:

- Không cho nạp tiền.
- Không chuyển giữa người dùng.
- Không dùng để mua hàng/dịch vụ khác.
- Không quảng bá như tài khoản tiền gửi hay ví điện tử.
- Mỗi bút toán chỉ thêm mới; sửa sai bằng bút toán đảo.
- Yêu cầu rút được admin xử lý thủ công, mục tiêu nội bộ dưới 10 phút khi có người trực và cam kết khách hàng tối đa 2 ngày làm việc.

Việc nền tảng giữ/thu hộ tiền thật chỉ được mở sau khi đã có ý kiến pháp lý và mô hình với ngân hàng/đơn vị thanh toán phù hợp.

## 6. Xếp hạng marketplace

Gói thuê bao có thể nhận ưu tiên hiển thị, nhưng không được làm mất chất lượng tìm kiếm.

Thứ tự đề xuất:

1. Xe khớp địa điểm, thời gian, loại xe và điều kiện khách tìm.
2. Xe còn lịch, giá cạnh tranh, hồ sơ/ảnh đầy đủ, phản hồi tốt và tỷ lệ hủy thấp.
3. Trong nhóm tương đương, gian hàng thuê bao được hệ số ưu tiên.
4. Vị trí quảng bá/đề xuất trả phí phải có nhãn để người thuê không hiểu nhầm là kết quả hoàn toàn tự nhiên.

Không bảo đảm “lên đầu” cho một xe không phù hợp hoặc chất lượng thấp.

## 7. Nguyên tắc sản phẩm

1. Một marketplace, một hồ sơ xe, một lịch và một booking engine.
2. Gói quyết định năng lực; role quyết định người nào được thao tác trong năng lực đó.
3. Bản cơ bản phải đủ hoàn thành một chuyến, không phải bản demo bị khóa ngẫu nhiên.
4. Không clone source giữa Owner và Manage; tái sử dụng theo capability.
5. Mọi số tiền đã thỏa thuận phải đóng băng vào booking, không tính lại theo cấu hình mới.
6. Phí, thuế, bảo hiểm, cọc và tiền phải trả chủ xe là các loại tiền khác nhau.
7. Mọi thao tác admin làm thay đổi tiền hoặc quyền truy cập phải có audit.
8. Web responsive là bề mặt vận hành chính; mobile native ưu tiên người thuê trước.

## 8. Chỉ số thành công

**North Star:** số ngày-xe được hoàn thành trọn vẹn qua XePrime mỗi tháng.

| Nhóm | Chỉ số |
| --- | --- |
| Marketplace | Tìm kiếm → xem xe → bắt đầu đặt → đặt thành công |
| Chủ xe mới | Thời gian từ đăng ký đến xe đầu tiên được duyệt; chuyến đầu tiên |
| Chủ xe cơ bản | Tỷ lệ booking hoàn thành; thu nhập ròng; thời gian nhận tiền |
| Gian hàng | Tỷ lệ nâng cấp/gia hạn; số xe active; thời gian xử lý booking |
| Chất lượng | Tỷ lệ hủy, tranh chấp, hoàn tiền và listing bị ẩn |
| Vận hành tiền | Tỷ lệ đối soát tự động; yêu cầu rút quá SLA; chênh lệch quỹ |

## 9. Những gì chưa cam kết

- Tỷ lệ thuế chính xác cho hoạt động cho thuê xe và từng loại chủ xe.
- Hợp đồng/sản phẩm chính thức với PVI, mức phí và phạm vi bảo hiểm của hai lớp bảo vệ.
- Giá production của gói và chính sách giảm giá theo kỳ hạn sau pilot.
- Tự động chi tiền về ngân hàng.
- XePrime tự làm ví điện tử, bảo hiểm hoặc dịch vụ trung gian thanh toán.
- Cam kết XePrime bảo vệ giao dịch được hai bên thực hiện hoàn toàn ngoài nền tảng.

Các mục này là release gate hoặc giả thuyết cần thử nghiệm, không phải phần đã hoàn thành.
