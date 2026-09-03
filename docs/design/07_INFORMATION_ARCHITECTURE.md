# 07 — Information Architecture

> Cập nhật: 03/09/2026
> Trạng thái: **Canonical — cấu trúc trải nghiệm mục tiêu**

## 1. Bốn bề mặt, một hệ thống

```text
Marketplace công khai
└─ Customer account

Owner workspace
├─ Owner Lite — gói cơ bản
└─ Manage — gian hàng thuê bao

Platform Admin
```

Các bề mặt dùng chung tài khoản, API, vehicle, calendar và booking. Không tách database và không clone feature/source chỉ vì menu khác nhau.

## 2. Marketplace và Customer

### Công khai

| Nhóm | Màn chính |
| --- | --- |
| Khám phá | Trang chủ, tìm kiếm/lọc, kết quả, chi tiết xe |
| Niềm tin | Trang gian hàng/chủ xe, review, chính sách, lịch trống, breakdown giá |
| Chuyển đổi | Đặt xe, xác thực điện thoại, khoản giữ chỗ/thanh toán |
| Pháp lý | Quy chế sàn, Terms, Privacy, chính sách hủy/hoàn, bảo hiểm |

### Sau đăng nhập

| Nhóm | Màn chính |
| --- | --- |
| Chuyến | Danh sách, chi tiết, timeline, hủy, nhận/trả và review |
| Thanh toán | Khoản giữ chỗ, lịch sử, biên nhận, hoàn tiền |
| Tin nhắn | Chat theo chủ xe/booking |
| Tài khoản | Hồ sơ, xác minh, địa chỉ/tài liệu khi thực sự triển khai |
| Hỗ trợ | Ticket/tranh chấp gắn booking |

Mục chưa có luồng thật phải ẩn khỏi navigation; không dùng menu như backlog.

## 3. Owner Lite — chủ xe cơ bản

Owner Lite là một vỏ đơn giản của `/manage`, lọc theo capability của gói. Không dựng một bộ route/API song sinh.

| Thứ tự | Nhóm | Nội dung |
| --- | --- | --- |
| 1 | Tổng quan | Việc cần làm, chuyến sắp tới, thu nhập ròng dự kiến |
| 2 | Xe của tôi | Hồ sơ xe, ảnh/giấy tờ, giá, lịch và trạng thái listing |
| 3 | Yêu cầu & chuyến | Request, booking, bàn giao, nhận lại, hủy |
| 4 | Tiền của tôi | Breakdown, số dư, lịch sử, yêu cầu rút |
| 5 | Tin nhắn | Chat với khách |
| 6 | Tài khoản chủ xe | Danh tính, thuế, ngân hàng, điều khoản |
| 7 | Nâng cấp | So sánh và mua gói gian hàng |
| 8 | Hỗ trợ | Ticket/tranh chấp |

Nguyên tắc: chủ xe cơ bản phải hoàn thành được một chuyến từ đầu tới cuối. Feature gating không được chặn nhận tiền, rút tiền, xem lịch sử hoặc cung cấp bằng chứng.

## 4. Manage — gian hàng thuê bao

| Nhóm | Nội dung |
| --- | --- |
| Tổng quan | KPI, việc cần làm, cảnh báo và onboarding |
| Vận hành | Xe + bảo dưỡng, lịch, yêu cầu, booking, khách hàng |
| Giao tiếp | Chat và thông báo |
| Tài chính | Doanh thu, thu chi, công nợ, số dư/đối soát nếu dùng tiền qua XePrime |
| Mặt tiền | Hồ sơ gian hàng, listing, chất lượng và hiệu quả hiển thị |
| Tổ chức | Chi nhánh, tài xế, thành viên/phân quyền |
| Cấu hình | Chính sách thuê, nhận xe, gói dịch vụ, thanh toán |
| Hỗ trợ | FAQ, ticket và trạng thái sự cố |

`pickup-areas` và `trash` không ở nav cho tới khi có hành vi thật. Advanced feature ở trạng thái `read_only` vẫn cho xem dữ liệu đã tạo trước khi hết gói; tenant mới chưa có dữ liệu thì ẩn.

## 5. Platform Admin

Menu hiện tại cần được nhóm lại theo công việc, thay vì một danh sách phẳng.

| Nhóm | Đã có | Cần bổ sung |
| --- | --- | --- |
| Tổng quan | Dashboard cơ bản | Funnel, GMV, doanh thu, nợ phải trả, SLA |
| Kiểm duyệt | Approval, vehicles, tenants | Seller KYC/tax/bank, listing quality, resubmission reason |
| Giao dịch | Bookings, customers | Holds, payments, refunds, disputes |
| Tài chính | Plans | Invoices, bank transactions, reconciliation, owner balances, withdrawals |
| Marketplace | Banners, catalog, locations | Ranking/featured policy, sponsored label, performance |
| Con người | Platform staff | Scope switch, least privilege, case-linked PII reveal |
| Kiểm soát | Audit | Risk flags, incident trail, maker–checker |
| Hỗ trợ | Chưa có | Tickets, queues, SLA, templates |

### Navigation mục tiêu

```text
Tổng quan

Người bán & nội dung
├─ Hồ sơ cần duyệt
├─ Chủ xe / Gian hàng
├─ Xe & listing
└─ Xác minh danh tính · thuế · ngân hàng

Giao dịch
├─ Booking
├─ Thanh toán & khoản giữ chỗ
├─ Hoàn tiền
└─ Tranh chấp

Tài chính
├─ Gói & hóa đơn
├─ Giao dịch ngân hàng
├─ Số dư chủ xe
├─ Yêu cầu rút
└─ Đối chiếu quỹ

Marketplace
├─ Banner
├─ Danh mục
├─ Địa điểm
└─ Ưu tiên hiển thị

Vận hành
├─ Ticket hỗ trợ
├─ Nhân sự
├─ Audit log
└─ Cấu hình chính sách
```

## 6. Role và capability

| Persona | Scope | Nguồn quyết định |
| --- | --- | --- |
| Customer | Dữ liệu cá nhân/chuyến của mình | Quyền sở hữu resource |
| Basic owner | Tenant của mình, bộ năng lực tối thiểu | Membership + permission + plan capability |
| Subscription shop | Tenant của mình, bộ năng lực đầy đủ | Membership + permission + plan capability |
| Platform staff | Toàn sàn trong phạm vi role | Platform role + permission |

Role không biểu diễn gói. `shop_owner` ở basic và subscription vẫn là cùng role; khác biệt đến từ plan capability.

Nếu một user vừa có platform role vừa có tenant membership, shell phải cho chọn scope. Trước khi có scope switch, quy định vận hành là dùng tài khoản platform riêng.

## 7. Giao dịch trong và ngoài nền tảng

| Loại | XePrime ghi nhận | Bảo vệ có thể cam kết |
| --- | --- | --- |
| On-platform | Quote, booking, tiền, bằng chứng, hủy/hoàn | Theo policy và dữ liệu hệ thống |
| Liên hệ trên XePrime, trả tiền trực tiếp | Booking và giao nhận nếu hai bên vẫn cập nhật | Không bảo đảm đối soát khoản thanh toán ngoài hệ thống |
| Hai bên tự giao dịch hoàn toàn bên ngoài | Chỉ có lead/contact event | Không cam kết hoàn tiền hoặc phân xử phần không có chứng cứ |

Trước khi mở thông tin liên hệ, UI phải cho khách hiểu sự khác nhau này. Không được mô tả một giao dịch ngoài nền tảng như giao dịch được XePrime bảo vệ đầy đủ.

## 8. Quy tắc điều hướng

1. Navigation phản ánh việc người dùng làm hôm nay, không phản ánh toàn bộ bảng database.
2. Không có stub trong nav.
3. Feature ít dùng nằm trong Cấu hình hoặc contextual link.
4. Mỗi trang có loading/rỗng/lỗi/forbidden rõ ràng.
5. 403 nói thiếu quyền/capability nào và ai có thể giải quyết.
6. Platform Admin và tenant Manage không tự động thay thế nhau; người có hai scope phải chủ động chuyển.
7. Web responsive là bề mặt Owner/Manage chính. App native trước mắt chỉ cần Customer parity.
