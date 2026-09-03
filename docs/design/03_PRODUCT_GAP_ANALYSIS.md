# 03 — Product Gap Analysis

> Cập nhật: 03/09/2026
> Trạng thái: **Canonical — backlog sản phẩm theo hiện trạng source**
> Không phải cam kết ngày phát hành; thứ tự thực thi nằm ở [`../completion-roadmap.md`](../completion-roadmap.md).

## 1. Kết luận hiện trạng

XePrime đã ở mức **functional alpha / web pilot-ready có kiểm soát**. Chuỗi vận hành web từ onboarding gian hàng đến booking, bàn giao, trả xe và ghi nhận tài chính đã có hình hài hoàn chỉnh. Phần còn thiếu lớn nhất không phải thêm màn quản lý xe, mà là:

- Đóng vòng tiền của marketplace.
- Vận hành tài chính và hỗ trợ cho platform admin.
- Tạo trải nghiệm quản lý rút gọn đúng nghĩa cho chủ xe cơ bản.
- Hoàn thiện tính minh bạch/pháp lý trước khi giữ tiền thật.
- Chứng minh hệ thống chịu được pilot thật bằng E2E, monitoring và UAT.

## 2. Bản đồ đã có và còn thiếu

| Khu vực | Đã có trong source | Khoảng trống quan trọng |
| --- | --- | --- |
| Marketplace | Tìm kiếm/lọc, chi tiết xe/shop, lịch bận, báo giá, booking request, review, chat | Giữ chỗ có tiền, breakdown phí/thuế/bảo hiểm, thanh toán, hoàn tiền, support/dispute |
| Customer | Auth mật khẩu/OTP/social, profile, trips, trip detail, cancel | Phương thức thanh toán, địa chỉ/tài liệu, thông báo, hỗ trợ, xóa tài khoản/dữ liệu |
| Manage | Xe, lịch, yêu cầu, booking, bàn giao/trả, khách, thu chi, công nợ, tài chính, hợp đồng, bảo trì, thành viên, chi nhánh, tài xế, gói | Dashboard tiền thật, trải nghiệm basic owner, số dư/rút tiền, payment/reconciliation, invitation thật |
| Platform admin | Dashboard, approval, tenant, vehicle, booking, customer, staff, plan, banner, catalog, location, audit | Finance operations, KYC/tax/bank, withdrawal, reconciliation, refunds, disputes, fee policy versioning, ranking operations |
| Billing | Gói theo slot, invoice, feature guard, trang subscription | SePay end-to-end, QR/thông tin nhận tiền hoàn chỉnh, kích hoạt tự động, grace/downgrade production |
| Mobile | Auth và marketplace discovery/listing detail | Booking, payment, trips thật, chat, push, release pipeline; chưa cần portal gian hàng native |
| Production | CI, Docker/CD/backup docs, health endpoint, structured log | Deploy proof, browser E2E, error tracking, uptime monitor, product analytics, compliance/UAT |

## 3. Platform Admin — nên làm tiếp

### P0 — trước khi nhận tiền khách thật

#### A. Seller compliance

- Hồ sơ xác minh chủ xe/gian hàng: danh tính, mã số thuế/số định danh, loại chủ thể, tài khoản ngân hàng và người thụ hưởng.
- Trạng thái kiểm tra riêng cho chủ thể, xe và tài khoản nhận tiền.
- Lưu phiên bản tài liệu/đồng ý điều khoản; lịch sử ai duyệt, duyệt lúc nào, dựa trên hồ sơ nào.
- Hàng đợi hồ sơ hết hạn hoặc cần bổ sung.

#### B. Money Operations

- Danh sách giao dịch ngân hàng vào, trạng thái tự khớp/chưa khớp/khớp tay/hoàn.
- Trang chi tiết một giao dịch với raw payload, đích dự kiến, lịch sử xử lý và audit.
- Hàng đợi invoice gói chưa thanh toán, thanh toán thiếu/thừa và giao dịch không rõ nội dung.
- Hàng đợi khoản giữ chỗ, hoàn tiền và booking cần quyết toán.
- Sổ **Số dư chủ xe** và yêu cầu rút; hiển thị tuổi yêu cầu và SLA.
- Maker–checker cho khoản tiền lớn hoặc thao tác sửa/đảo bút toán: người tạo không phải người duyệt cuối.
- Đối chiếu hàng ngày:

```text
Số dư ngân hàng
= tiền thuộc XePrime
+ tiền đang giữ/phải trả chủ xe hoặc khách
+ chênh lệch chưa xử lý
```

- Không cho xóa bút toán; chỉ cho reversal có lý do và tham chiếu.

#### C. Policy and pricing

- Cấu hình phiên bản phí dịch vụ, giá gói theo loại xe, thuế, hai lớp bảo hiểm, khoản giữ chỗ, trần cọc, tối thiểu rút và SLA.
- `effectiveFrom/effectiveTo`; không sửa hồi tố booking cũ.
- Preview tác động trước khi publish chính sách.
- Audit đầy đủ mọi thay đổi giá/phí và yêu cầu xác nhận lần hai với thay đổi có ảnh hưởng tiền.
- Phân biệt rõ giá trị “giả thuyết” với chính sách production đã duyệt.

#### D. Support and disputes

- Ticket/case có mã, loại vấn đề, booking liên quan, người phụ trách, SLA và timeline.
- Luồng tranh chấp: nhận bằng chứng → phân loại → tạm giữ quyết toán → kết luận → hoàn/chuyển tiền.
- Mọi lần reveal PII phải gắn với case hoặc lý do nghiệp vụ cụ thể.
- Mẫu thông báo cho khách/chủ xe khi tiền bị giữ, hoàn hoặc yêu cầu bổ sung hồ sơ.

### P1 — trước controlled pilot mở rộng

- Dashboard funnel: chủ xe đăng ký → duyệt → đăng xe → listing active → booking đầu tiên.
- Dashboard tiền: GMV, doanh thu phí dịch vụ, doanh thu subscription, thuế giữ hộ/nộp thay, bảo hiểm thu hộ, nợ phải trả và chênh lệch.
- Risk flags: cùng tài khoản ngân hàng/định danh dùng cho nhiều hồ sơ, tỷ lệ hủy/no-show cao, thay đổi thông tin nhận tiền sát yêu cầu rút.
- Chất lượng listing: checklist, lý do ẩn, lịch sử sửa và quy trình gửi duyệt lại có hiển thị lý do cũ.
- Quản trị ưu tiên hiển thị: hệ số, thời gian hiệu lực, nhãn tài trợ và báo cáo tác động.
- Export phục vụ kế toán/đối soát; dữ liệu export cũng phải áp dụng masking và audit.

### P2 — khi có volume

- Chi trả tự động qua đối tác được phép.
- Fraud scoring và cảnh báo theo cụm tài khoản/thiết bị.
- Promotion/referral.
- SLA workforce dashboard và phân ca support/finance.
- Data warehouse/BI nếu báo cáo giao dịch bắt đầu làm chậm database vận hành.

## 4. Manage — gian hàng thuê bao

### Phần đang đủ cho pilot

- Quản lý xe và Vehicle 360.
- Lịch, khóa lịch, giá theo ngày và ngày lễ.
- Booking request, booking lifecycle, bàn giao/trả xe và phụ phí.
- Khách hàng, ghi chú/rủi ro, thu chi, công nợ, báo cáo, hợp đồng.
- Bảo trì, chi nhánh, tài xế, thành viên và phân quyền cố định.
- Trang gói và feature gating.

### Phần cần hoàn thiện

1. Dashboard phải có doanh thu, tiền cọc/giữ chỗ, việc cần làm và cảnh báo thật; không để KPI `—`.
2. Màn gói cần so sánh rõ basic với gian hàng, chi phí theo số xe/kỳ hạn, ngày hiệu lực và quyền lợi khi hết hạn.
3. Luồng mua gói phải có VietQR/thông tin nhận tiền, trạng thái đối soát và hóa đơn rõ ràng.
4. Nếu gian hàng nhận cọc trực tiếp, booking cần lưu `paymentMethod`, người xác nhận, thời điểm và chứng từ; không chỉ là ghi chú tự do.
5. Nếu gian hàng dùng luồng qua XePrime, phải dùng chung hold/refund/ledger với chủ xe cơ bản, không xây hệ tài chính thứ hai.
6. “Mời thành viên” hiện chỉ thêm người đã có tài khoản. Hoặc đổi đúng tên, hoặc làm invitation token + hết hạn + accept/decline.
7. Tài khoản có cả platform role và tenant membership cần scope switch rõ; trước mắt có thể quy định dùng tài khoản tách biệt.

## 5. Owner Lite — chủ xe cơ bản

Không clone source của portal. Tạo một capability profile `owner_basic` và dựng vỏ điều hướng nhẹ trên cùng feature/API.

### Menu đề xuất

| Nhóm | Màn |
| --- | --- |
| Tổng quan | Việc cần làm, lịch hôm nay, số tiền dự kiến nhận |
| Xe của tôi | Danh sách xe, hồ sơ tối thiểu, ảnh/giấy tờ, giá và lịch trống |
| Yêu cầu & chuyến | Yêu cầu thuê, booking, bàn giao, nhận lại |
| Tiền của tôi | Breakdown từng chuyến, số dư phải trả, lịch sử và yêu cầu rút |
| Tin nhắn | Chat với người thuê |
| Tài khoản chủ xe | Danh tính, thuế, tài khoản ngân hàng, điều khoản |
| Nâng cấp gian hàng | So sánh chi phí và công cụ được mở thêm |
| Hỗ trợ | Ticket/tranh chấp |

### Không hiện cho basic owner

- Sổ thu chi tổng hợp và công nợ nhiều khách.
- Báo cáo quản trị theo kỳ/xe/nhân viên.
- Thành viên và phân quyền.
- Chi nhánh và tài xế.
- Trung tâm bảo trì nâng cao.
- Hợp đồng mẫu và các cấu hình dành cho đội xe.

Không được khóa các thao tác tối thiểu để hoàn thành một booking hoặc rút số tiền thuộc về chủ xe.

## 6. Customer — khoảng trống để khép giao dịch

### P0

- Báo giá cuối có breakdown: giá thuê, giao xe/phụ phí, khoản giữ chỗ, phí dịch vụ, thuế, bảo hiểm và số còn lại.
- Giải thích ai thu từng khoản và hoàn trong trường hợp nào.
- Bảo vệ xe được thể hiện là bắt buộc khi policy áp dụng và phí nằm trong net earning của chủ xe; bảo hiểm chuyến đi chỉ cộng vào tổng của người thuê khi giữ lựa chọn, có thể bỏ chọn rõ ràng, không cản trở checkout và phải lưu consent/opt-out.
- Thanh toán giữ chỗ, trạng thái chờ/thiếu/thừa/hết hạn.
- Chính sách hủy và số tiền hoàn được tính từ snapshot server.
- Trang chi tiết bảo hiểm: nhà cung cấp, phạm vi, loại trừ và cách yêu cầu bồi thường.
- Support/dispute gắn booking.
- Biên nhận và lịch sử thanh toán/hoàn tiền.

### P1

- Favorites, địa chỉ nhận xe và tài liệu người thuê.
- Notification center và tùy chọn nhận thông báo.
- Luồng đổi/xác minh lại email, SĐT và tài khoản.
- Xóa tài khoản/yêu cầu dữ liệu.

Các mục P1 chưa làm không nên xuất hiện như menu hoạt động trong pilot.

## 7. Những gì đang thừa hoặc nên hoãn

- Mục nav placeholder `pickup-areas`, `trash` và các mục account `comingSoon`: ẩn khỏi menu cho tới khi có luồng thật.
- Custom role builder: bốn role tenant cố định đủ cho pilot.
- Native manage portal: ưu tiên web responsive; app native tập trung khách thuê.
- OCR nâng cao, e-signature, PDF server, dark mode và command palette: chỉ làm khi có nhu cầu đo được.
- Ví có nạp/chuyển/thanh toán nội bộ: ngoài phạm vi.
- Chi trả tự động: hoãn đến khi luồng thủ công có volume và đã chọn đối tác phù hợp.
- Hai chuyến đầu miễn phí trong ADR 0026: không còn là chính sách mặc định; chỉ quay lại dưới dạng campaign có ngày hiệu lực nếu dữ liệu acquisition chứng minh cần.

## 8. Release gate còn thiếu

| Gate | Điều kiện tối thiểu |
| --- | --- |
| Gói thuê bao | SePay/invoice đối soát được, activation idempotent, có xử lý thiếu/thừa/sai mã |
| Tiền khách | Legal/payment review xong; price allocation, refund, ledger và reconciliation được test end-to-end |
| Bảo hiểm | Có hợp đồng với PVI hoặc đối tác hợp pháp khác; hai policy, biểu phí, consent/opt-out, certificate và claims flow thật |
| Thuế | Xác định loại chủ thể/dịch vụ, dữ liệu định danh thuế và báo cáo/nộp thay |
| Pilot | Production OTP/email/storage/chat, monitoring, support contact, Terms/Privacy và UAT |
| Public launch | Browser E2E, restore drill, incident runbook, product analytics và không còn dead link quan trọng |

## 9. Quy tắc chấp nhận xuyên suốt

- Mọi số tiền có đơn vị, chủ sở hữu, nguồn và trạng thái.
- Booking lưu snapshot giá/phí/chính sách; thay đổi cấu hình không sửa lịch sử.
- Webhook/job chạy lại không cộng tiền hai lần.
- Tiền thuộc XePrime và tiền phải trả người khác được đối chiếu tách biệt.
- Chức năng bị giới hạn phải chặn ở server; ẩn menu chỉ là UX.
- Off-platform phải được đánh dấu và không được quảng bá với mức bảo vệ giống giao dịch on-platform.
