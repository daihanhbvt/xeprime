# 07 — Information Architecture

> Cập nhật: 16/09/2026
> Trạng thái: **Canonical — cấu trúc trải nghiệm mục tiêu**

## 1. Bốn bề mặt, một hệ thống

```text
Marketplace công khai
└─ Customer account

User Portal
├─ Tài khoản và chuyến của người thuê
└─ Owner Lite — chủ xe tuyến hoa hồng, tối đa 3 xe

Manage — chỉ gian hàng tuyến gói

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

Checkout phải tách rõ `tổng giá chuyến`, `thanh toán QR Pay ngay` và `trả trực tiếp khi nhận xe`. QR Pay giữ cọc, phí nền tảng nếu có và khoản bảo hiểm dự kiến; bảo hiểm chỉ được mua/phát hành tại bàn giao/bắt đầu chuyến nên mọi hủy trước mốc đó hoàn 100% bảo hiểm.

## 3. Owner Lite — chủ xe cơ bản

Owner Lite nằm trong `/account`, là vỏ điều hướng thân thiện cho cá nhân có tối đa 3 xe. Nó dùng lại component, domain, API, lịch và booking từ Manage; không clone logic nghiệp vụ.

Sidebar có **chín mục, một nhóm phẳng** (ADR 0038 điều 9) — thứ tự này là nội dung, không phải gợi ý:

| # | Mục | Nội dung |
| --- | --- | --- |
| 1 | Danh sách xe | Danh sách, đăng xe, hồ sơ, ảnh/giấy tờ, giá, trạng thái listing |
| 2 | Lịch xe | Lịch dùng lại từ Manage |
| 3 | Cẩm nang cho thuê xe | Tài liệu hướng dẫn |
| 4 | Chuyến của tôi | `/trips` — hai tab Hiện tại / Lịch sử, cả chuyến đi thuê lẫn cho thuê, nhãn vai trên từng thẻ |
| 5 | Thông tin khai thuế | Hồ sơ thuế/KYC bản compact |
| 6 | Hợp đồng & Chứng từ | Thư viện mẫu |
| 7 | Chính sách bảo vệ dữ liệu | Dẫn tới văn bản pháp lý |
| 8 | Tài khoản của tôi | Hồ sơ con người · **số dư MỘT ví** (khả dụng/đang chuyển/tổng) · tài khoản ngân hàng nhận tiền · yêu cầu xoá tài khoản |
| 9 | Đổi mật khẩu | |

Tiền có **một cửa**. Bấm vào số điểm mở sổ giao dịch, lệnh rút và yêu cầu rút về ngân hàng; rút là
một YÊU CẦU có trạng thái, không phải lời hứa chuyển ngay. Biên lai và lịch sử thanh toán sống trong
chi tiết chuyến (route `/account/payments` vẫn mở được để tra soát).

Không có trong sidebar — và không mất đi: hộp thư (hợp nhất trên biểu tượng chat ở header), hồ sơ
chủ xe (sửa tại ngữ cảnh cần nó), gói dịch vụ (thẻ "Gian hàng của tôi" đầu trang hồ sơ), đăng xuất
(menu avatar trên header). Bảng đối chiếu đầy đủ: ADR 0038 điều 9.

Nguyên tắc: chủ xe cơ bản phải hoàn thành được một chuyến từ đầu tới cuối nhưng không bị ép dùng quy trình đội xe. Biên bản, ảnh tình trạng, odometer và nhiên liệu/pin không bắt buộc; hệ thống có thể tự chuyển trạng thái theo lịch và chủ xe điều chỉnh khi thực tế thay đổi. Feature gating không được chặn nhận tiền, rút tiền hoặc xem lịch sử.

## 4. Manage — gian hàng thuê bao

| Nhóm | Nội dung |
| --- | --- |
| Tổng quan | KPI, việc cần làm, cảnh báo và onboarding |
| Vận hành | Xe + bảo dưỡng, lịch, yêu cầu, booking, khách hàng |
| Giao tiếp | Chat và thông báo |
| Tài chính | Doanh thu, thu chi, công nợ, số dư/đối soát nếu dùng tiền qua XePrime |
| Mặt tiền | Hồ sơ gian hàng, listing, chất lượng và hiệu quả hiển thị |
| Tổ chức | Chi nhánh, tài xế, thành viên/phân quyền |
| Tài khoản | **Tài khoản & bảo mật** của NGƯỜI đăng nhập — tên, email/SĐT, đổi mật khẩu. Tách khỏi *Hồ sơ gian hàng* (pháp nhân) ở Mặt tiền |
| Cấu hình | Chính sách thuê, nhận xe, gói dịch vụ, thanh toán |
| Hỗ trợ | FAQ, ticket và trạng thái sự cố |

`pickup-areas` và `trash` không ở nav cho tới khi có hành vi thật.

Trạng thái `read_only` chỉ áp cho tenant **vẫn ở tuyến gói** mà hạ bậc, hoặc đang trong **ân hạn**. Tenant đã hết gói VÀ hết ân hạn về tuyến hoa hồng: Manage nâng cao `hidden` hoàn toàn, không có chế độ chỉ-xem (ADR 0038 điều 5). Thứ họ vẫn phải làm được — khép chuyến đang chạy, xem chứng từ, xem và rút tiền — không nằm sau cờ tính năng nào.

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
| Hỗ trợ | Đã có route support cơ bản | Tickets, queues, SLA, templates và liên kết case–booking |

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
| Basic owner | Xe/chuyến/số dư của chính mình, bộ năng lực Owner Lite | Ownership + business mode + policy giới hạn 3 xe |
| Subscription shop | Tenant của mình, bộ năng lực đầy đủ | Membership + permission + plan capability |
| Platform staff | Toàn sàn trong phạm vi role | Platform role + permission |

Business mode không phải permission. Tài khoản chỉ thuộc một trong hai mô hình `commission_owner` hoặc `subscription_shop`; role tenant (`shop_owner`, `shop_manager`, `shop_staff`, `shop_viewer`) chỉ áp dụng bên trong gian hàng. Tài xế là bản ghi để phân công, không có account/app.

Nếu một user vừa có platform role vừa có tenant membership, shell phải cho chọn scope. Trước khi có scope switch, quy định vận hành là dùng tài khoản platform riêng.

Khu user của **tài khoản gian hàng** (ADR 0038 điều 7): giữ marketplace, "Quản lý gian hàng" và "Hồ
sơ gian hàng" — đúng hai mục. Ẩn chuyến, chat, thông báo phía khách và toàn bộ công cụ cho thuê; hồ
sơ con người, đổi mật khẩu và yêu cầu xoá tài khoản chuyển sang `/manage/account`.

Chặn ở **URL**, không chỉ ẩn menu: mọi đường dưới `/account` và `/trips` chuyển về màn tương đương
trong Manage, `/trips/<id>` giữ nguyên id. Nghĩa vụ chuyển tiếp (chuyến ĐI THUÊ chưa khép từ trước
khi nâng gói) đi qua `/manage/account/trips` — khoá vai `renter`, và lối vào là một thẻ theo NGỮ
CẢNH trong "Tài khoản & bảo mật", không phải một mục menu bật/tắt theo dữ liệu.

Chủ xe **tuyến hoa hồng** thì ngược lại: họ ở khu user, và có MỘT hộp thư hợp nhất trên biểu tượng
chat ở header (ADR 0038 điều 10) — cả hội thoại họ là khách lẫn hội thoại họ là chủ, mỗi dòng mang
nhãn vai. Chuông của họ cũng dẫn về route trong khu user, không vào `/manage`.

## 7. Giao dịch trong và ngoài nền tảng

| Loại | XePrime ghi nhận | Bảo vệ có thể cam kết |
| --- | --- | --- |
| On-platform | Quote, booking, QR Pay, hủy/hoàn; bằng chứng nếu gian hàng dùng | Theo policy và dữ liệu hệ thống |
| Liên hệ trên XePrime, trả tiền trực tiếp | Booking và giao nhận nếu hai bên vẫn cập nhật | Không bảo đảm đối soát khoản thanh toán ngoài hệ thống |
| Hai bên tự giao dịch hoàn toàn bên ngoài | Chỉ có lead/contact event | Không cam kết hoàn tiền hoặc phân xử phần không có chứng cứ |

Trước khi mở thông tin liên hệ, UI phải cho khách hiểu sự khác nhau này. Không được mô tả một giao dịch ngoài nền tảng như giao dịch được XePrime bảo vệ đầy đủ.

## 8. Quy tắc điều hướng

1. Navigation phản ánh việc người dùng làm hôm nay, không phản ánh toàn bộ bảng database.
2. Không có stub trong nav.
3. Feature ít dùng nằm trong Cấu hình hoặc contextual link.
4. Mỗi trang có loading/rỗng/lỗi/forbidden rõ ràng.
5. 403 nói thiếu quyền/capability nào và ai có thể giải quyết.
6. Platform Admin có thể mở Manage của một gian hàng với toàn quyền tương đương chủ gian hàng. Shell phải hiện banner “Bạn đang quản lý gian hàng: {Tên}” và mọi thay đổi phải có audit.
7. Web responsive là bề mặt Owner/Manage chính. Source mobile hiện có cả nhánh Manage; cần quyết định giữ hay thu gọn trước redesign, không mặc định coi mobile là customer-only.
