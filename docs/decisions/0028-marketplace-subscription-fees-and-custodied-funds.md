# ADR 0028 — Marketplace hai mô hình, phí minh bạch và tiền thu hộ có điều kiện

Ngày: 03/09/2026 · Trạng thái: **Accepted về định hướng sản phẩm; tiền thật bị chặn bởi release gate pháp lý/thanh toán**

## Bối cảnh

XePrime cần phục vụ đồng thời:

1. Người có một hoặc vài xe muốn đăng cho thuê nhưng chưa cần hệ thống quản lý đầy đủ.
2. Chủ xe/gian hàng chuyên nghiệp muốn trả thuê bao cố định để vận hành đội xe và không chịu hoa hồng theo chuyến.
3. Người thuê muốn giữ chỗ, có thể thanh toán thuận tiện và biết rõ quyền lợi khi hủy/sự cố.

ADR 0020–0027 đã đặt nền móng hai tuyến doanh thu, nhưng có ba giả định không còn phù hợp:

- Cấm mọi ưu tiên hiển thị theo gói.
- Đồng nhất khoản giữ chỗ với hoa hồng.
- Xem số dư chủ xe là một “ví” mà chưa mô tả đủ tiền thuê được nền tảng thu hộ.

Ngoài ra, yêu cầu dùng tên “thuế/bảo hiểm” để giảm cảm giác nền tảng thu phí tạo rủi ro pháp lý và niềm tin nếu khoản tiền không đúng bản chất.

## Quyết định

### 1. Một marketplace, hai mô hình chủ xe

| | Basic owner | Gian hàng thuê bao |
| --- | --- | --- |
| Thuê bao | Không | Theo số chỗ xe và kỳ hạn |
| Phí dịch vụ XePrime/chuyến | Giả thuyết 10%, admin cấu hình chung | 0% khi gói hiệu lực |
| Bộ quản lý | Owner Lite | Full Manage |
| Giữ chỗ | Bắt buộc với booking đủ điều kiện | Trực tiếp với gian hàng hoặc qua XePrime nếu bật |
| Giao dịch trực tiếp | Phần tiền còn lại có thể trả chủ xe | Được phép liên hệ/cọc/thuê trực tiếp |
| Ưu tiên marketplace | Theo chất lượng/độ phù hợp | Có hệ số ưu tiên trong nhóm tương đương |

`shop_owner` vẫn là một role. Gói/capability quyết định trải nghiệm Basic hay Full; không tạo role mới và không clone source.

### 2. Giá pilot, không phải hằng số nghiệp vụ

- Ô tô: **100.000đ/xe/tháng**, tối thiểu 3 tháng.
- Xe máy: **40.000đ/xe/tháng**, tối thiểu 3 tháng.
- Basic owner: **10% phí dịch vụ XePrime** trên doanh thu chuyến.
- Thuế và phí bảo hiểm: lấy theo nghĩa vụ/sản phẩm thực tế, không ấn định 5–10% chỉ để đạt một tổng phí mong muốn.

Tất cả giá trị phải là policy có phiên bản, ngày hiệu lực và audit. Booking lưu snapshot; thay đổi sau đó không hồi tố.

### 3. Tên phí theo đúng người hưởng

| Dòng tiền | Tên hiển thị | Điều kiện |
| --- | --- | --- |
| XePrime hưởng | Phí dịch vụ chuyến đi | Nêu tỷ lệ/số tiền và dịch vụ được cung cấp |
| Nộp ngân sách | Thuế khấu trừ/nộp thay | Đúng loại thuế, căn cứ và chứng từ/báo cáo |
| Trả doanh nghiệp bảo hiểm | Phí bảo hiểm chuyến đi | Có partner, sản phẩm, biểu phí, phạm vi và chứng nhận |
| Trả chủ xe | Tiền thuê phải trả chủ xe | Tách khỏi doanh thu XePrime |
| Có thể hoàn/khấu trừ theo policy | Khoản giữ chỗ | Nêu rõ điều kiện hoàn/không hoàn |

Không gọi phí dịch vụ XePrime là thuế hoặc bảo hiểm. UI được phép gom các dòng dưới một tiêu đề dễ hiểu, nhưng breakdown trước xác nhận phải đầy đủ.

### 4. Thuế không biến mất khi mua gói

Gói thuê bao loại bỏ **hoa hồng XePrime**, không tự loại bỏ nghĩa vụ thuế của chủ xe. Nếu XePrime muốn “đóng thay để chủ xe nhận đủ”, đó là một khoản hỗ trợ/gross-up thương mại:

- Thuế vẫn được tính, kê khai và nộp đúng.
- Chi phí tài trợ được ghi nhận riêng trong sổ XePrime.
- UI nói “XePrime hỗ trợ khoản thuế này trong kỳ”, không nói “không có thuế”.

Theo Nghị định 117/2025/NĐ-CP, tổ chức quản lý nền tảng có chức năng thanh toán có trách nhiệm khấu trừ/nộp thay trong các trường hợp thuộc phạm vi điều chỉnh. Tỷ lệ tham khảo của Chính phủ cho dịch vụ của cá nhân cư trú là 5% VAT và 2% PIT, nhưng phân loại cho thuê xe và từng loại người bán phải được tư vấn thuế xác nhận trước production.

Nguồn tham khảo chính thức:

- [Nghị định 117/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=213883&orggroupid=2&pageid=27160).
- [Hướng dẫn quản lý thuế trên nền tảng thương mại điện tử](https://xaydungchinhsach.chinhphu.vn/quy-dinh-moi-quan-ly-thue-doi-voi-ho-ca-nhan-kinh-doanh-tren-nen-tang-thuong-mai-dien-tu-119250612171755463.htm).

### 5. Bảo hiểm phải là sản phẩm thật

Định hướng hiện tại là làm việc với **PVI** cho hai lớp sản phẩm:

- Bảo vệ xe cho chủ xe là bắt buộc đối với xe/booking thuộc phạm vi policy; phí do chủ xe chịu hoặc được khấu trừ minh bạch vào khoản phải trả chủ xe.
- Bảo hiểm chuyến đi cho người thuê là tùy chọn và chỉ do người thuê trả khi giữ lựa chọn. Giao diện mặc định chọn nhưng phải hiển thị tách biệt giá và quyền lợi, cho phép bỏ chọn dễ dàng trước khi thanh toán, đồng thời lưu bằng chứng lựa chọn của khách.

PVI mới là đối tác dự kiến. Không được dùng tên/logo PVI hoặc thu phí với danh nghĩa sản phẩm PVI trước khi có thỏa thuận cho phép, quy tắc và quy trình cấp chứng nhận tương ứng. Cơ chế mặc định chọn cũng phải qua legal/UX review trước production.

Không bật dòng bảo hiểm theo tỷ lệ 5–8% nếu chưa có:

- Nhà bảo hiểm/đối tác hợp pháp.
- Quy tắc, biểu phí và phạm vi bảo vệ.
- Chứng nhận/hợp đồng cho chuyến hoặc xe.
- Quy trình claim và điều kiện loại trừ.

Nếu XePrime chỉ dùng tiền để tự bù rủi ro mà chưa có cấu trúc pháp lý phù hợp, không được gọi là bảo hiểm.

Nguồn tham khảo chính thức:

- [Luật Kinh doanh bảo hiểm 08/2022/QH15](https://vanban.chinhphu.vn/?classid=1&docid=206242&orggroupid=1&pageid=27160).
- [Bộ Tài chính: quy tắc, điều khoản và biểu phí sản phẩm bảo hiểm phải được công khai](https://mof.gov.vn/quan-ly-giam-sat-bao-hiem/pho-bien-kien-thuc-ve-bao-hiem/mofucm282399).

### 6. Khoản giữ chỗ không còn đồng nhất với hoa hồng

Khoản giữ chỗ là số tiền khách trả để xác nhận cam kết booking. Ledger phân bổ nó theo snapshot, có thể gồm:

- Phí dịch vụ XePrime.
- Thuế khấu trừ/nộp thay.
- Phí bảo hiểm thực tế.
- Một phần tiền phải trả chủ xe.

Vì vậy `hold_amount` và `platform_service_fee` là hai khái niệm. Chúng có thể bằng nhau ở một policy cụ thể nhưng code không được coi đó là quy tắc bất biến.

### 7. Hai cách trả phần còn lại

#### A. Trả trực tiếp chủ xe

Đây là cách ưu tiên cho release Basic Owner đầu tiên. XePrime thu khoản giữ chỗ, khách trả phần còn lại khi nhận xe. Booking lưu phương thức, số dự kiến và xác nhận của hai bên.

#### B. XePrime thu hộ

Khách có thể trả toàn bộ trên nền tảng ở release sau. Khi đó XePrime phải có ledger tiền phải trả, hoàn tiền, đối soát quỹ, withdrawal và dispute trước khi bật.

Không mở phương án B cho khách thật chỉ vì giao diện/payment API đã chạy.

### 8. Số dư chủ xe là sổ công nợ, không phải ví điện tử

Tên sản phẩm: **Số dư chủ xe** / **Khoản XePrime phải trả**.

- Không nạp tiền.
- Không chuyển ngang giữa user.
- Không dùng số dư để thanh toán hàng hóa/dịch vụ khác.
- Không trả lãi.
- Ledger append-only; reversal thay cho update/delete.
- Withdrawal về tài khoản ngân hàng đã xác minh.
- Mục tiêu nội bộ: xử lý dưới 10 phút khi có người trực.
- SLA công bố: tối đa 2 ngày làm việc kể từ khi yêu cầu hợp lệ được duyệt.

Nghị định 52/2024/NĐ-CP điều chỉnh thanh toán không dùng tiền mặt và dịch vụ trung gian thanh toán. Trước khi giữ/chi hộ tiền ở quy mô thật, phải có ý kiến pháp lý và mô hình hợp tác ngân hàng/đơn vị thanh toán phù hợp; cách đặt tên “số dư” không tự loại bỏ nghĩa vụ này.

Nguồn: [Nghị định 52/2024/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=210262&pageid=27160).

### 9. Giao dịch ngoài nền tảng

Gian hàng thuê bao được phép công khai kênh liên hệ và chốt trực tiếp. XePrime phải phân biệt:

- Booking/tiền đi qua XePrime: áp dụng policy, audit, đối soát và hỗ trợ của nền tảng.
- Booking còn trên XePrime nhưng tiền trả trực tiếp: XePrime hỗ trợ hồ sơ chuyến; không xác nhận được tiền ngoài hệ thống.
- Giao dịch hoàn toàn ngoài nền tảng: XePrime không cam kết hoàn tiền hay phân xử phần không có dữ liệu.

Không dùng từ “đi đêm” trong tài liệu hoặc UI. Dùng “giao dịch trực tiếp với gian hàng” và cảnh báo giới hạn bảo vệ.

Luật TMĐT 122/2025/QH15 và Nghị định 248/2026/NĐ-CP có hiệu lực từ 01/07/2026, nhấn mạnh xác thực người bán, công khai quy chế, thông tin giá/chính sách và cơ chế phản ánh. Đây là gate trước public launch.

Nguồn: [Bộ Công Thương phổ biến Luật TMĐT và Nghị định 248/2026/NĐ-CP](https://moit.gov.vn/tin-tuc/bo-cong-thuong-pho-bien-luat-thuong-mai-dien-tu-va-nghi-dinh-so-248-2026-nd-cp.html).

### 10. Ưu tiên hiển thị có giới hạn

Gian hàng thuê bao được boost trong tập xe đã phù hợp với tìm kiếm. Không boost xe hết lịch, sai địa điểm, hồ sơ kém hoặc giá/chính sách không khớp. Vị trí được tài trợ/ưu tiên thương mại phải có nhãn rõ.

Admin quản lý hệ số và thời gian hiệu lực; thay đổi có audit và báo cáo tác động.

## Release gate bắt buộc

Trước khi thu tiền khách thật:

1. Xác minh người bán và thông tin thuế/ngân hàng.
2. Tư vấn thuế xác nhận cách phân loại giao dịch.
3. Hoàn tất hợp đồng với PVI hoặc đối tác bảo hiểm hợp pháp khác, gồm hai policy, biểu phí, cấp chứng nhận, consent/opt-out và claims flow.
4. Ý kiến pháp lý/payment partner cho thu hộ/chi hộ.
5. Terms, quy chế sàn, cancellation/refund và dispute policy.
6. Idempotency, ledger, reconciliation và restore drill.
7. Finance Admin + Support có queue, SLA và audit.

## Quan hệ với ADR cũ

| ADR | Trạng thái sau ADR 0028 |
| --- | --- |
| 0013 | Superseded trong phạm vi online payment: thanh toán được đưa vào roadmap có gate |
| 0014 | Superseded một phần: XePrime có thể đứng giữa giao dịch on-platform |
| 0015 | Superseded một phần về kỳ hạn/marketplace khi hết gói; pricing là policy |
| 0020 | Giữ hai tuyến doanh thu; sửa quy tắc “không boost” và yêu cầu rõ breakdown |
| 0021 | Superseded: hold không bắt buộc bằng commission |
| 0022 | Giữ nguyên nguyên tắc một sổ giao dịch ngân hàng và idempotency |
| 0023 | Superseded: số dư bao gồm khoản phải trả chủ xe nhưng không là ví đa dụng |
| 0024 | Giữ nguyên: mode/policy được snapshot vào booking |
| 0025 | Giữ nguyên nguyên tắc tách quỹ; sửa SLA tối đa từ 3 xuống 2 ngày làm việc |
| 0026 | Superseded: hai chuyến miễn phí không còn là mặc định |
| 0027 | Giữ hai bậc năng lực; làm rõ Owner Lite dùng chung source với Manage |

## Hệ quả

- Cần mô hình fee-policy versioned thay vì một `commissionPercent` giải thích mọi khoản.
- `booking_holds` phải tách amount khỏi fee allocation.
- Booking snapshot cần breakdown có chủ sở hữu từng dòng tiền.
- Cần seller tax/bank profile, ledger, withdrawal, reconciliation, refund và dispute modules.
- Admin Plans không đủ để vận hành tiền; phải có Finance Operations.
- UI giá và marketing không được hứa “bảo hiểm/thuế” khi chưa có chứng từ thật.

## Xem lại khi nào

- Sau 100 booking trả tiền đầu tiên.
- Khi có báo giá/hợp đồng thật từ PVI hoặc đối tác bảo hiểm khác.
- Sau pilot giá 100.000đ/ô tô/tháng và 40.000đ/xe máy/tháng để quyết định giá production.
- Khi tư vấn thuế/pháp lý đưa ra kết luận khác giả định thiết kế.
- Khi số yêu cầu rút thủ công vượt năng lực xử lý hoặc có yêu cầu quá SLA.
- Khi ưu tiên hiển thị làm giảm conversion hoặc tăng khiếu nại chất lượng tìm kiếm.
