# ADR 0032 — Cọc booking bắt buộc, bảo hiểm tại bàn giao và ranh giới Owner Lite

Ngày: 09/09/2026 · Trạng thái: Accepted · Ghi đè một phần: 0014, 0025, 0027, 0028, 0029 · Liên quan: 0006, 0016, 0018, 0022, 0024

## Bối cảnh

Các tài liệu trước mô tả nhiều biến thể chưa còn phù hợp: gian hàng có thể nhận cọc trực tiếp, XePrime có thể thu hộ toàn bộ tiền thuê, phí bảo hiểm có thể trừ từ chủ xe và Owner Lite có quy trình bàn giao bằng chứng tương tự đội xe. Điều này làm sitemap, checkout, hoàn tiền và phạm vi User/Manage không thống nhất.

Product owner đã chốt lại hai tuyến kinh doanh, thời điểm phát hành bảo hiểm, quy tắc hủy và ranh giới công cụ quản lý để làm nguồn cho đợt redesign toàn bộ dự án.

## Quyết định

### 1. Hai tuyến loại trừ lẫn nhau

- Một tài khoản chỉ là **chủ xe tuyến hoa hồng** hoặc **chủ gian hàng tuyến gói**, không đồng thời là cả hai.
- Chủ xe tuyến hoa hồng không trả phí/gói cố định, có tối đa 3 xe và chịu phí nền tảng 10% trên giá trị chuyến. Phí này được cộng vào tổng tiền khách trả, không trừ lần nữa từ chủ xe.
- Gian hàng trả thuê bao, có 0% phí nền tảng theo chuyến nhưng vẫn chịu thuế theo chuyến; khách vẫn trả bảo hiểm.
- Khi chủ xe muốn đăng xe thứ 4, sản phẩm đề nghị nâng cấp thành gian hàng.
- Nâng cấp giữ nguyên tài khoản, xe và booking cũ. Booking cũ giữ snapshot tuyến/phí/chính sách; booking mới dùng tuyến gian hàng.

### 2. Booking chính thức của cả hai tuyến phải cọc qua XePrime

- Sau khi chủ xe duyệt hoặc chế độ tối ưu tự nhận, hệ thống ghi `acceptedAt`; đây là mốc “đặt xe thành công”. Cửa sổ thanh toán 2 giờ và cửa sổ hủy miễn phí 4 giờ cùng bắt đầu tại mốc này.
- Khoản thanh toán online gồm `D + S + IV + IP`:
  - `D`: cọc đặt chuyến, là một phần của giá thuê gốc `B`.
  - `S`: phí nền tảng phía khách; tuyến hoa hồng `10% × B`, tuyến gian hàng bằng 0.
  - `IV`: khoản phí dự kiến cho bảo hiểm xe/chuyến bắt buộc.
  - `IP`: khoản phí dự kiến cho bảo hiểm tai nạn con người tùy chọn.
- Phần tiền thuê còn lại `B − D` do khách trả trực tiếp cho chủ xe/gian hàng khi nhận xe. XePrime không thu hộ, xác nhận hoặc đối soát phần này.
- QR Pay được tự động khớp. Lịch giữ tối đa 2 giờ, thể hiện bằng hai countdown 60 phút; hết thời gian chưa trả thì auto-cancel và mở lịch.

### 3. Thuế nằm phía chủ xe và chỉ phát sinh khi chuyến bắt đầu

- Thuế tính trên giá trị thuê chịu thuế của chuyến, không tính trên bảo hiểm và các dòng phí không chịu thuế.
- Thuế được khấu trừ từ khoản XePrime phải trả cho chủ xe/gian hàng, không cộng vào tổng khách.
- Working example là `T = 7% × B`; tỷ lệ production phải cấu hình theo loại chủ thể, phiên bản và tư vấn pháp lý.
- Booking hủy trước chuyến không phát sinh thuế.

### 4. Chỉ mua/phát hành bảo hiểm tại bàn giao hoặc bắt đầu chuyến

- Bảo hiểm xe/chuyến là bắt buộc; bảo hiểm tai nạn con người là tùy chọn. Cả hai do khách trả thêm ngoài giá thuê.
- QR Pay thu/giữ khoản phí bảo hiểm dự kiến, nhưng **chưa mua hoặc phát hành hợp đồng** lúc đặt xe.
- XePrime chỉ chính thức mua/phát hành bảo hiểm khi xe được bàn giao hoặc chuyến bắt đầu.
- Mọi booking hủy trước mốc bàn giao/bắt đầu chuyến phải hoàn 100% `IV + IP`.
- Chứng nhận điện tử chỉ xuất hiện sau khi phát hành thành công. Trạng thái tối thiểu: `reserved/not_issued`, `issuing`, `issued`, `failed`, `cancelled/voided` và `claim` nếu đối tác hỗ trợ.

### 5. Hủy trước chuyến

- Chưa thanh toán sau tối đa 2 giờ: auto-cancel, không có khoản phân bổ.
- Khách hủy trong 4 giờ kể từ `acceptedAt`: hoàn `D + S + IV + IP`, tức 100% tiền đã thanh toán online. QR Pay thành công không khởi động lại cửa sổ 4 giờ.
- Khách hủy sau cửa sổ miễn phí nhưng trước bàn giao:
  - hoàn 100% `IV + IP`;
  - phần `D + S` chia 50% cho chủ xe/gian hàng và 50% cho XePrime;
  - không tính thuế.
- Booking có giờ nhận xe cách thời điểm đặt dưới 4 giờ phải cảnh báo chính sách hủy sát giờ trước khi trả tiền.
- Chủ xe/gian hàng hủy trước chuyến: khách được hoàn `D + S + IV + IP`; chưa có phạt/bồi thường, nhưng hệ thống phải tracking tần suất hủy để admin xử lý sau.

### 6. Owner Lite ở User Portal; Manage chỉ dành cho gian hàng

- Owner Lite nằm trong `/account`, dùng cho chủ xe tuyến hoa hồng: xe, lịch, chuyến, giá/cấu hình cho thuê cơ bản, thuế/chứng từ, số dư/rút tiền, tài khoản và hỗ trợ.
- Không bắt buộc biên bản bàn giao, ảnh tình trạng, odometer hoặc nhiên liệu/pin. Hệ thống có thể tự chuyển sang bắt đầu/kết thúc theo lịch; chủ xe cập nhật khi thực tế thay đổi.
- Manage là bộ công cụ nâng cao của gian hàng: tài chính, công nợ, bảo trì, biên bản/bằng chứng tùy chọn, khách hàng, chi nhánh, thành viên, tài xế dạng bản ghi, hợp đồng và báo cáo.
- Tài xế không có tài khoản/app. Tuyến hoa hồng mặc định chủ xe là tài xế; gian hàng chỉ lưu và phân công bản ghi tài xế.
- Admin được vào Manage của bất kỳ gian hàng nào với quyền như chủ gian hàng. Shell phải hiện banner ngữ cảnh và mọi thay đổi phải có audit.

## Ví dụ tiền — VF5 một ngày

```text
B  giá thuê gốc:                         700.000đ
S  phí nền tảng 10% phía khách:           70.000đ
IV bảo hiểm bắt buộc minh họa:           130.000đ
Tổng giá khách thấy:                     900.000đ

T  thuế working 7% × B:                   49.000đ
Tổng chủ xe nhận sau thuế:               651.000đ

Nếu D = 20% × B = 140.000đ:
QR Pay ngay = D + S + IV =               340.000đ
Trả trực tiếp khi nhận = B − D =         560.000đ
XePrime phải trả chủ xe = D − T =         91.000đ
```

`130.000đ` chỉ là số minh họa để ra tổng `900.000đ`, không phải biểu phí production.

## Hệ quả

- Checkout, refund, ledger và reporting phải lưu từng money line riêng và snapshot policy/version.
- Cần state riêng cho khoản phí bảo hiểm đã thu/giữ và hợp đồng bảo hiểm đã phát hành; không dùng một boolean.
- Job mua bảo hiểm ở mốc bắt đầu phải idempotent, retry được và có hàng đợi xử lý khi đối tác lỗi.
- Refund trước chuyến không phụ thuộc khả năng hoàn hợp đồng bảo hiểm vì hợp đồng chưa được mua.
- Existing code/config khác 2 giờ, 4 giờ hoặc cách tính hold phải được xem là implementation gap, không tự đổi yêu cầu sản phẩm.
- UI không gọi sổ nội bộ là ví điện tử; dùng “Số dư XePrime” hoặc “Khoản XePrime phải trả”. Rút tiền do admin chuyển khoản thủ công và xác nhận trên hệ thống.

## Release gate và điểm chưa chốt

- Tỷ lệ thuế, phân loại dịch vụ/chủ thể và nghĩa vụ nộp thay phải được tư vấn pháp lý xác nhận.
- Chỉ dùng nhãn bảo hiểm khi có đối tác hợp pháp, biểu phí, consent, certificate và claims flow thật.
- Cần chốt hành vi khi phát hành bảo hiểm thất bại đúng lúc bàn giao: chặn chuyến, retry hay đổi xe.
- Cần chốt no-show, kết thúc sớm, kéo dài chuyến, hủy sau khi đã bắt đầu và hạ cấp gian hàng.
- Điểm mở liên hệ tuyến hoa hồng đang dùng working rule “sau QR Pay thành công”; cần xác nhận cuối trước triển khai.

## Quan hệ với ADR cũ

- Ghi đè phần ADR 0028 cho phép gian hàng cọc trực tiếp hoặc XePrime thu hộ phần còn lại.
- Làm rõ ADR 0029: phí nền tảng 10% nằm phía khách; thuế nằm phía chủ xe; bảo hiểm bắt buộc cũng nằm phía khách.
- Ghi đè phần ADR 0025 về phạm vi hold/payout nếu mâu thuẫn với công thức `D + S + IV + IP` và thời điểm bảo hiểm.
- Ghi đè cách hiểu Owner Lite trong ADR 0027/0014 nếu buộc basic owner dùng giao nhận bằng chứng hoặc tenant role/gói như gian hàng.
- Giữ nguyên nguyên tắc snapshot thương mại của ADR 0024, concurrency của ADR 0006 và ledger/audit của ADR 0022/0028.
