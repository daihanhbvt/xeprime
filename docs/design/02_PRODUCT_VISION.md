# 02 — Product Vision

> Cập nhật: 03/09/2026
> Trạng thái: **Canonical — định hướng sản phẩm hiện hành**
> Quyết định chi tiết về gói, tiền và cách gọi phí: [ADR 0028](../decisions/0028-marketplace-subscription-fees-and-custodied-funds.md).

## 1. XePrime là gì

XePrime là **chợ đăng và thuê xe** đồng thời là **giải pháp quản lý hoạt động cho thuê xe**.

- Người thuê tìm xe phù hợp, xem giá/lịch/chính sách, đặt xe, thanh toán khoản giữ chỗ và theo dõi chuyến đi.
- Chủ có một hoặc vài xe có thể bắt đầu bằng bộ công cụ đơn giản, không trả thuê bao và chia sẻ doanh thu theo chuyến.
- Chủ xe chuyên nghiệp hoặc đơn vị cho thuê có thể nâng cấp thành gian hàng, trả thuê bao cố định để dùng toàn bộ công cụ quản lý và không chịu hoa hồng nền tảng theo chuyến.
- Xe của mọi nhóm cùng xuất hiện trên một marketplace; không tách thành hai chợ.

Giá trị cốt lõi là một vòng kín: **nguồn xe thật → lịch thật → đặt xe thật → giao nhận có bằng chứng → tiền và trách nhiệm giải thích được**.

## 2. Những người XePrime phục vụ

### 2.1 Người thuê xe

Mục tiêu của họ là tìm được xe đúng nhu cầu, biết tổng tiền và điều kiện trước khi đặt, giữ được lịch, nhận đúng xe và có đường xử lý khi phát sinh sự cố.

### 2.2 Chủ xe cơ bản

Thường có 1–3 xe, chưa cần một hệ thống vận hành dày. Họ cần:

- Đăng và quản lý xe.
- Mở/khóa lịch.
- Nhận và xử lý yêu cầu/đơn thuê.
- Bàn giao, nhận lại xe và lưu bằng chứng.
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

Một chủ xe có thể nâng cấp hoặc hạ cấp mà không đổi tài khoản, role hay tạo lại dữ liệu.

### 2.4 Nhân sự nền tảng

- `platform_admin`: cấu hình và kiểm soát toàn hệ thống.
- `reviewer`: xác minh chủ xe/gian hàng và kiểm duyệt xe/listing.
- `support`: xử lý ticket, sự cố chuyến và tranh chấp.
- `finance_admin`: đối soát tiền vào, số dư phải trả, hoàn tiền và rút tiền.
- `platform_staff`: phạm vi vận hành được cấp cụ thể.

## 3. Hai lựa chọn cho chủ xe

| Nội dung | Chủ xe cơ bản — theo chuyến | Gian hàng — thuê bao |
| --- | --- | --- |
| Phí cố định | 0đ | Theo số chỗ xe và kỳ hạn |
| Giá pilot | Không áp dụng | 100.000đ/ô tô/tháng; 40.000đ/xe máy/tháng; tối thiểu 3 tháng; **chưa phải giá production** |
| Hoa hồng XePrime | Giả thuyết 10% doanh thu chuyến, admin cấu hình chung và có hiệu lực theo phiên bản | 0% trong thời gian gói hiệu lực |
| Thuế | Khấu trừ/nộp thay đúng nghĩa vụ thực tế khi pháp luật yêu cầu | Nghĩa vụ thuế vẫn tồn tại; XePrime có thể tài trợ chi phí như ưu đãi thương mại nhưng không được gọi sai hoặc xóa dấu vết kế toán |
| Bảo hiểm/bảo vệ | Bảo vệ xe bắt buộc do chủ xe chịu/khấu trừ; bảo hiểm chuyến đi chỉ do người thuê trả khi giữ lựa chọn | Tương tự; gói thuê bao không tự làm nghĩa vụ hoặc phí bảo hiểm thực tế biến mất |
| Giữ chỗ | Bắt buộc với booking đủ điều kiện | Khách có thể cọc trực tiếp với gian hàng hoặc dùng luồng nền tảng nếu gian hàng bật |
| Tiền còn lại | Trả trực tiếp chủ xe hoặc thanh toán qua nền tảng khi luồng thu hộ đã đủ điều kiện mở | Có thể giao dịch trực tiếp; nếu qua nền tảng thì áp dụng cùng chuẩn đối soát/hoàn tiền |
| Công cụ quản lý | Rút gọn | Đầy đủ |
| Hiển thị | Theo chất lượng, giá, lịch trống và độ phù hợp | Có quyền lợi ưu tiên hợp lý; mọi vị trí trả phí/tài trợ phải có nhãn rõ |

Tỷ lệ phí dịch vụ khoảng 10% và giá gói theo loại xe là **policy pilot**, không được hard-code thành sự thật pháp lý hoặc mức giá vĩnh viễn. Admin phải cấu hình chính sách theo loại xe, ngày hiệu lực và booking phải lưu snapshot chính sách lúc tạo.

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

- **Bảo vệ xe cho chủ xe:** bắt buộc đối với xe tham gia booking thuộc phạm vi áp dụng; phí do chủ xe chịu hoặc được khấu trừ minh bạch vào khoản phải trả. Chủ xe phải thấy rõ quyền lợi, phí, thời hạn và loại trừ.
- **Bảo hiểm chuyến đi cho người thuê:** tùy chọn và chỉ cộng vào tổng tiền người thuê khi họ giữ lựa chọn; UI có thể chọn sẵn theo định hướng kinh doanh nhưng phải hiển thị riêng giá/quyền lợi và cho khách bỏ chọn dễ dàng trước khi thanh toán. Cách lấy sự đồng ý phải được rà soát pháp lý và UX trước production.

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
→ thanh toán khoản giữ chỗ
→ hệ thống phân bổ theo snapshot:
   phí dịch vụ XePrime + thuế nộp thay + bảo hiểm thực tế + phải trả chủ xe
→ phần còn lại:
   (A) khách trả trực tiếp chủ xe, hoặc
   (B) nền tảng thu hộ khi luồng này đã được phép mở
→ chuyến hoàn thành/hủy
→ quyết toán, hoàn tiền hoặc ghi số dư phải trả
→ chủ xe yêu cầu rút về tài khoản ngân hàng
```

### 5.2 Gian hàng thuê bao

```text
Gian hàng trả phí thuê bao theo số chỗ xe
→ được mở toàn bộ công cụ và 0% hoa hồng nền tảng/chuyến
→ khách có thể gửi yêu cầu, liên hệ và cọc trực tiếp
→ nếu chọn cọc/thanh toán qua XePrime thì tiền vẫn phải đi qua quy trình đối soát, thuế, bảo hiểm và hoàn tiền tương ứng
```

Giao dịch trực tiếp ngoài nền tảng được phép để tăng cơ hội chốt xe, nhưng phải cảnh báo rõ: XePrime không thể bảo đảm đối soát, hoàn tiền hoặc giải quyết phần giao dịch không được ghi nhận trên hệ thống.

### 5.3 “Số dư chủ xe”, không phải ví điện tử

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
