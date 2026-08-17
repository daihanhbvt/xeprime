# XePrime - Đặc tả màn hình, role và chức năng trước khi thiết kế DB

Ngày cập nhật: 22/07/2026

## 1. Mục tiêu tài liệu

Tài liệu này tổng hợp lại toàn bộ dự án Firebase-code hiện tại và các phân tích đã thống nhất để chuẩn bị bước thiết kế database cho bản Next.js + NestJS.

Tài liệu trả lời 5 câu hỏi chính:

1. Hệ thống nên có những nhóm trang nào.
2. Mỗi role được vào màn hình nào.
3. Mỗi màn hình có chức năng gì, nút gì, bấm vào làm gì.
4. Màn hình nào trong source Firebase hiện tại đã có, thiếu, hoặc cần sửa lại.
5. Admin nền tảng cần bổ sung gì để quản lý đúng mô hình XePrime.

## 2. Kết luận định hướng

Hướng đúng cần giữ:

| Quyết định | Kết luận |
| --- | --- |
| Trang chính | Giữ 3 trải nghiệm: Marketplace, Public Shop, Management Portal |
| Host và Admin | Nên dùng chung một Management Portal về code/layout, nhưng phân quyền theo scope |
| Chủ xe và chủ gian hàng | MVP nên dùng chung role `shop_owner`; phân biệt cá nhân/doanh nghiệp bằng `tenantType` |
| Admin nền tảng | Không dùng lẫn với `admin` trong gian hàng; đổi sang `platform_admin`, `platform_staff` |
| Chat | Firebase/Firestore cho realtime gần nhất, MySQL lưu metadata/audit/archive |
| Đăng nhập | Google/Facebook trước, xác thực SĐT khi đặt xe hoặc gửi hồ sơ mở gian hàng/public xe |
| DB sắp thiết kế | Nghiệp vụ chính phải đưa về MySQL qua NestJS, không để client ghi rộng như hiện tại |

## 3. Hiện trạng source Firebase-code

| Nhóm | File chính | Hiện trạng |
| --- | --- | --- |
| Marketplace khách thuê | `Vietrent/market/index.html` | Có tìm xe, lọc, xem chi tiết, đặt xe, chat, chuyến của tôi, đánh giá |
| Host Portal | `Vietrent/index.html`, `Vietrent/js/app.js` | Có dashboard, xe, đơn, khách, lịch, tài chính, người dùng, cửa hàng, chat, AI |
| Admin nền tảng | `Vietrent/admin.html` | Có quản lý tenant/gói/hạn dùng/kích hoạt, ghi chú admin |
| Firebase Functions | `xeprime-functions/functions/index.js` | Có đăng ký tenant, OTP, public listing sync, booking notification, chat notification, reviews |
| Firestore rules | `xeprime-functions/firestore.rules` | Có super admin whitelist UID, tenant membership, role tenant cơ bản |

Vấn đề hiện tại:

| Vấn đề | Ảnh hưởng |
| --- | --- |
| Role `admin` trong tenant dễ nhầm với admin nền tảng | Dễ phân quyền sai khi chuyển DB |
| Chủ xe có thể bật `congKhai` để public xe | Thiếu bước admin duyệt xe public |
| Đăng ký cửa hàng tạo tenant trực tiếp | Thiếu trạng thái `pending_review` rõ ràng |
| Admin nền tảng hiện rất mỏng | Chưa đủ chức năng kiểm duyệt, hỗ trợ, giám sát, khóa/mở |
| Rules cho tenant collection còn rộng | Chưa enforce RBAC nghiệp vụ ở backend |
| Marketplace shop chỉ giống view filter theo shop | Chưa có route public shop slug chuẩn `/shops/[slug]` |
| Customer login hiện thiên về OTP | Cần thêm Google/Facebook, SĐT chỉ verify khi đặt xe |

## 4. Role mục tiêu

### 4.1 Role phía khách thuê

| Role | Ý nghĩa | Quyền chính |
| --- | --- | --- |
| `guest` | Khách chưa đăng nhập | Xem xe, lọc xe, xem shop, xem chi tiết |
| `customer` | Người thuê xe đã đăng nhập | Lưu xe, chat, gửi yêu cầu đặt xe, xem chuyến, đánh giá |

### 4.2 Role trong gian hàng

| Role | Tên hiển thị | Quyền chính |
| --- | --- | --- |
| `shop_owner` | Chủ xe / Chủ gian hàng | Toàn quyền trong gian hàng, hồ sơ, xe, đơn, nhân viên, tài chính |
| `shop_manager` | Quản lý gian hàng | Quản lý vận hành, xe, đơn, khách, nhân viên theo quyền |
| `shop_staff` | Nhân viên gian hàng | Xử lý đơn, giao nhận xe, chat, cập nhật trạng thái |
| `shop_viewer` | Chỉ xem | Xem dữ liệu, không sửa |

Ghi chú: cá nhân có 1 xe và doanh nghiệp có nhiều xe đều là một `shop_owner`. Khác nhau bằng `tenantType = individual | business`, không cần tách role ở MVP.

### 4.3 Role nền tảng

| Role | Tên hiển thị | Quyền chính |
| --- | --- | --- |
| `platform_admin` | Super Admin | Toàn quyền toàn hệ thống |
| `platform_staff` | Nhân viên quản lý | Hỗ trợ vận hành, xem dữ liệu theo quyền |
| `reviewer` | Nhân viên kiểm duyệt | Duyệt gian hàng, duyệt xe public, xử lý nội dung |
| `support` | Nhân viên hỗ trợ | Xem đơn/khách/chat để hỗ trợ, reset tài khoản theo quyền |
| `finance_admin` | Nhân viên tài chính | Quản lý gói, gia hạn, hóa đơn, đối soát |

MVP có thể chỉ cần `platform_admin` và `platform_staff`, nhưng DB nên thiết kế mở để tách `reviewer`, `support`, `finance_admin` sau.

## 5. Kiến trúc trang mục tiêu

| Trải nghiệm | URL đề xuất | Ai dùng | Ghi chú |
| --- | --- | --- | --- |
| Marketplace | `/` | guest, customer | Trang tìm và đặt xe |
| Public shop | `/shops/[slug]` | guest, customer | Trang gian hàng public của chủ xe/doanh nghiệp |
| Management Portal | `/manage` | shop roles, platform roles | Dùng chung layout, khác scope |
| Host alias | `/host` | shop roles | Redirect vào `/manage` với tenant scope |
| Admin alias | `/admin` | platform roles | Redirect vào `/manage` với platform scope |

Scope:

| Scope | Ai dùng | Dữ liệu thấy được |
| --- | --- | --- |
| `tenant` | `shop_owner`, `shop_manager`, `shop_staff`, `shop_viewer` | Chỉ dữ liệu gian hàng của mình |
| `platform` | `platform_admin`, `platform_staff`, `reviewer`, `support`, `finance_admin` | Toàn hệ thống hoặc dữ liệu được phân quyền |

## 6. Marketplace - màn hình khách thuê

### 6.1 Trang chủ tìm xe

| Hạng mục | Mô tả |
| --- | --- |
| Hiện có trong code | Có trong `Vietrent/market/index.html` |
| Role dùng | `guest`, `customer` |
| Trạng thái | Giữ, cần chuyển sang Next.js |

Quyết định sản phẩm mục tiêu (10/08/2026):

- Trang chủ chỉ có ba tiêu chí tìm kiếm: **từ khóa**, **địa điểm**, **thời gian thuê**.
- Thời gian nhận và trả được chọn trong **một input khoảng thời gian**; không tách thành hai ô
  ngày nhận/ngày trả.
- Bấm tìm kiếm chuyển sang route kết quả riêng **`/search`**, mang trạng thái tìm kiếm trên URL.
- Trang chủ chỉ hiển thị tối đa **8 xe** làm nội dung gợi ý và nút **“Khám phá xe”**.
- “Khám phá xe” chuyển sang `/search`; trang chủ không phân trang danh sách xe.
- Bộ lọc đầy đủ và phân trang chỉ xuất hiện trên `/search`.
- `/search` không lặp hero/header marketing của trang chủ để dành chiều rộng cho kết quả và bộ
  lọc; thanh điều hướng public toàn cục vẫn được giữ.

Chức năng và nút:

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Từ khóa | guest, customer | Tìm theo tên xe, hãng, model hoặc từ khóa public listing được API hỗ trợ |
| Địa điểm | guest, customer | Chọn tỉnh/thành hoặc địa điểm nhận xe được hệ thống hỗ trợ |
| Thời gian thuê | guest, customer | Một input range chọn đồng thời thời gian nhận và thời gian trả |
| Tìm xe | guest, customer | Chuyển sang `/search` với từ khóa, địa điểm và khoảng thuê trên URL |
| Khám phá xe | guest, customer | Chuyển sang `/search` không bắt buộc có điều kiện tìm kiếm |
| Thành phố nổi bật | guest, customer | Chọn nhanh tỉnh/thành |
| Đăng xe cho thuê | guest, customer | Đi sang `/host` hoặc flow đăng ký gian hàng |

Các bộ lọc loại xe, dịch vụ, giá, hãng, số chỗ, nhiên liệu, tiện ích, tính năng và sắp xếp không
đặt trong hero trang chủ; chúng thuộc trang kết quả `/search`.

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| SSR/SEO | Chuyển sang Next.js để index xe/gian hàng tốt hơn |
| Tìm kiếm | Cần API search từ MySQL, có index theo tỉnh, ngày, loại xe, giá |
| Availability | Không chỉ dựa Firestore `bookedRanges`, cần logic backend chống trùng lịch |
| Login | Thêm Google/Facebook login |

### 6.2 Danh sách xe và card xe

Phân tách bề mặt:

- Trên `/`: tối đa 8 card xe, không phân trang, có nút “Khám phá xe”.
- Trên `/search`: danh sách kết quả đầy đủ, full filter, sort, URL state và phân trang.
- `/search` bỏ hero/marketing header của homepage nhưng vẫn giữ global public navigation.

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Bấm ảnh/tên xe | guest, customer | Mở chi tiết xe |
| Lưu xe | customer | Lưu vào danh sách yêu thích |
| So sánh | guest, customer | Thêm vào thanh so sánh |
| Đặt xe | customer | Mở form đặt xe, nếu chưa login thì login trước |
| Hết xe | guest, customer | Button disabled nếu trùng lịch |
| Bấm tên shop/chủ xe | guest, customer | Mở public shop |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Favorite | Nên lưu DB theo user, không chỉ local/client |
| Compare | Có thể giữ client-side, không nhất thiết cần DB |
| Listing status | Cần trạng thái `approved_public`, `hidden`, `suspended` |

### 6.3 Chi tiết xe

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Xem album ảnh | guest, customer | Xem ảnh xe |
| Xem thông số, tiện ích, giấy tờ thuê | guest, customer | Xem chi tiết listing |
| Xem đánh giá | guest, customer | Load reviews |
| Nhắn chủ xe | customer | Tạo/mở conversation |
| Đặt xe | customer | Mở booking modal |
| Gọi/Zalo nếu có | guest, customer | Liên hệ ngoài nền tảng |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Điều kiện public | Chỉ hiển thị xe đã được admin duyệt |
| Giá | Cần chuẩn hóa giá ngày thường, cuối tuần, theo giờ, theo tháng |
| Bảo mật SĐT | Không nên public hết số điện thoại nếu chưa cần |

### 6.4 Public shop `/shops/[slug]`

| Hạng mục | Mô tả |
| --- | --- |
| Hiện có trong code | Có logic `openShop(id)` dạng filter theo tenant, chưa phải route slug chuẩn |
| Role dùng | `guest`, `customer` |
| Trạng thái | Cần làm rõ khi chuyển Next.js |

Chức năng và nút:

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Tất cả xe | guest, customer | Quay về marketplace |
| Gọi | guest, customer | Gọi số shop nếu được hiển thị |
| Zalo | guest, customer | Mở Zalo nếu có |
| Danh sách xe của shop | guest, customer | Lọc xe theo tenant/shop |
| Đặt xe | customer | Đặt xe thuộc shop đó |
| Nhắn shop | customer | Chat với gian hàng |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| URL slug | Cần route `/shops/[slug]`, không dùng query `?shop=` là chính |
| Hồ sơ shop | Cần mô tả, logo, ảnh cover, địa chỉ, chính sách, số xe, rating |
| Trạng thái shop | Chỉ shop `active` và đã duyệt mới public |

### 6.5 Đăng nhập khách

| Hạng mục | Hiện trạng |
| --- | --- |
| Hiện có | OTP qua `sendOtpApi` và `customerOtpLoginApi` |
| Cần đổi | Thêm Google/Facebook, SĐT chỉ verify khi đặt xe |

Chức năng và nút mục tiêu:

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Đăng nhập Google | guest | Login social provider |
| Đăng nhập Facebook | guest | Login social provider |
| Gửi OTP | customer chưa verify phone | Gửi mã khi chuẩn bị đặt xe |
| Xác nhận OTP | customer chưa verify phone | Xác thực SĐT |
| Hoàn tất hồ sơ | customer | Nhập tên, ngày sinh, thông tin cơ bản nếu thiếu |
| Đăng xuất | customer | Logout |

Rule nghiệp vụ:

| Tình huống | Có cần SĐT không |
| --- | --- |
| Chỉ xem xe | Không |
| Lưu xe | Không bắt buộc, nên yêu cầu login |
| Chat | Có thể login Google/Facebook, chưa cần SĐT ngay |
| Gửi yêu cầu đặt xe | Bắt buộc xác thực SĐT |
| Đánh giá | Cần là khách đã có đơn hoàn thành |

### 6.6 Đặt xe

| Hạng mục | Hiện có trong code |
| --- | --- |
| Booking modal | Có |
| Collection | `booking_requests` |
| Status hiện tại | `cho_duyet`, `da_duyet`, `tu_choi`, `da_huy` |

Chức năng và nút:

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Chọn ngày/giờ nhận trả | customer | Mở lịch, kiểm tra min hours và lịch bận |
| Tự đến lấy xe | customer | Chọn nhận xe tại điểm của chủ |
| Giao tận nơi | customer | Nhập địa chỉ, ghim bản đồ, kiểm tra bán kính giao |
| Dùng vị trí hiện tại | customer | Lấy GPS để ghim vị trí giao |
| Gửi yêu cầu | customer đã verify phone | Tạo `booking_request` |
| Đóng | customer | Hủy thao tác |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Phone verification gate | Trước khi gửi yêu cầu phải kiểm tra `phoneVerified` |
| Transaction | NestJS phải kiểm tra trùng lịch trước khi tạo request |
| Thanh toán/cọc online | Hiện chưa rõ, DB nên chừa module payment |
| Pricing engine | Cần backend tính tiền để tránh client tự tính |

### 6.7 Chat khách với gian hàng

| Hạng mục | Hiện có |
| --- | --- |
| Firestore conversations | Có |
| Messages realtime | Có |
| Notify host | Có Cloud Function `notifyOnChatMessage` |

Chức năng và nút:

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Nhắn chủ xe | customer | Tạo/mở conversation theo tenant/listing |
| Gửi | customer | Ghi message realtime |
| Danh sách tin nhắn | customer | Xem các conversation của mình |
| Thông báo | customer | Xem thông báo booking/chat |

Thiết kế mục tiêu:

| Phần dữ liệu | Lưu ở đâu | Lý do |
| --- | --- | --- |
| Message realtime gần nhất | Firestore | Realtime nhanh, giảm công migrate |
| Conversation metadata | MySQL là nguồn chính, Firestore shadow | Admin/support/query/report dễ hơn |
| Message archive | MySQL hoặc object storage | Giảm read/storage Firestore dài hạn |
| File/ảnh chat | Storage/object storage | Không lưu base64 trong Firestore |
| Notification | FCM + MySQL notification log | Vừa realtime vừa audit được |

Tối ưu chi phí:

| Rule | Cách làm |
| --- | --- |
| Listener | Chỉ listen danh sách conversation và thread đang mở |
| Message limit | Chỉ load 30-100 tin gần nhất |
| Unread | Lưu counter, không đếm query toàn bộ message |
| Archive | Sau 30-90 ngày chuyển tin cũ sang MySQL/object storage |
| Attachment | Lưu file ngoài, Firestore chỉ lưu URL |

### 6.8 Chuyến của tôi và đánh giá

| Nút/chức năng | Ai dùng | Hành động |
| --- | --- | --- |
| Chuyến của tôi | customer | Xem booking requests của mình |
| Chi tiết chuyến | customer | Xem xe, chủ xe, thời gian, trạng thái |
| Hủy yêu cầu | customer | Hủy khi còn chờ duyệt |
| Nhắn chủ xe | customer | Mở chat theo booking/listing |
| Đánh giá chuyến đi | customer | Gửi review khi đơn hoàn thành |
| Đặt lại | customer | Quay lại xe để đặt lại |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Trạng thái chuẩn | Đồng bộ status booking request và booking thật |
| Điều kiện review | Chỉ cho đánh giá sau khi hoàn thành hoặc đã duyệt + kết thúc |
| Hủy yêu cầu | Rules hiện comment là chưa bổ sung đầy đủ, cần backend API |

## 7. Management Portal - dùng chung Host/Admin theo scope

### 7.1 Dashboard

| Hiện có | Role dùng | Trạng thái |
| --- | --- | --- |
| Có trong Host Portal | shop roles | Giữ và tách scope |

Chức năng và nút:

| Nút/chức năng | Tenant scope | Platform scope |
| --- | --- | --- |
| Tổng xe, xe sẵn sàng, xe đang thuê | Xe của gian hàng | Tổng toàn hệ thống hoặc theo shop |
| Doanh thu | Doanh thu gian hàng | Tổng doanh thu nền tảng nếu có quyền finance |
| Đơn gần đây | Đơn của gian hàng | Đơn toàn hệ thống |
| Xe quá hạn/đang thuê | Xe của gian hàng | Giám sát toàn hệ thống |
| Cảnh báo | Bảo hiểm, đăng kiểm, xe sắp trả | Cảnh báo vận hành toàn nền tảng |

Cần bổ sung cho admin:

| Mục | Mô tả |
| --- | --- |
| Hàng chờ duyệt gian hàng | Số shop pending |
| Hàng chờ duyệt xe public | Số xe pending |
| Tenant bị khóa/hết hạn | Theo dõi rủi ro vận hành |
| Booking cần hỗ trợ | Đơn bị khiếu nại, quá hạn phản hồi |

### 7.2 Lịch thuê xe

| Nút/chức năng | shop_owner/manager/staff | shop_viewer | platform roles |
| --- | --- | --- | --- |
| Xem lịch theo xe/ngày | Có | Có | Có toàn hệ thống/theo shop |
| Lọc loại xe | Có | Có | Có |
| Tạo đơn từ ô lịch | Có nếu có quyền create | Không | Support chỉ tạo nếu được quyền |
| Khóa xe/bảo dưỡng | Có nếu có quyền edit | Không | Có thể khóa xe khi vi phạm |
| Xem nhanh đơn | Có | Có | Có |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Conflict checking | Đưa về API transaction |
| Platform view | Admin cần lọc theo shop/tenant/chi nhánh |

### 7.3 Xe

| Hiện có | Role dùng | Trạng thái |
| --- | --- | --- |
| Có CRUD xe, quick add, wizard public | shop roles | Giữ nhưng cần thêm duyệt public |

Chức năng và nút:

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | platform_admin/reviewer |
| --- | --- | --- | --- | --- | --- |
| Tìm | Có | Có | Có | Có | Có |
| Xóa lọc | Có | Có | Có | Có | Có |
| Dạng lưới/gọn/bảng | Có | Có | Có | Có | Có |
| Thêm xe | Có | Có nếu được quyền | Có nếu được quyền | Không | Có trong chế độ hỗ trợ nếu được quyền |
| Sửa xe | Có | Có nếu được quyền | Có giới hạn | Không | Có audit |
| Xóa xe | Có | Có nếu được quyền delete | Không mặc định | Không | Có nếu cần xử lý vi phạm |
| Cài đặt hiển thị trên chợ | Có | Có nếu được quyền | Có giới hạn | Không | Có quyền duyệt/ẩn |
| Bật công khai hiện tại | Có trong code | Có nếu có quyền | Có nếu có quyền | Không | Nên đổi thành duyệt public |

Luồng mục tiêu:

1. Tạo xe ở trạng thái `draft`.
2. Chủ gian hàng bấm `Gửi duyệt public`.
3. Admin/reviewer kiểm tra ảnh, giá, giấy tờ, thông tin chủ xe, khu vực.
4. Nếu đạt thì chuyển `approved_public`.
5. Nếu chưa đạt thì `rejected` kèm lý do.
6. Nếu vi phạm thì `hidden` hoặc khóa tenant.

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Duyệt xe public | Chưa có màn admin duyệt |
| Lý do reject | Chưa có |
| Audit publish | Chưa rõ |
| Public status riêng | Không nên dùng mỗi `congKhai` |

### 7.4 Đơn đặt xe từ Marketplace

| Hiện có | Role dùng | Trạng thái |
| --- | --- | --- |
| Có tab `Đơn đặt xe`, đọc `booking_requests` | shop roles | Cần chuẩn hóa |

Chức năng và nút:

| Nút/chức năng | shop_owner/manager | shop_staff | shop_viewer | platform support/admin |
| --- | --- | --- | --- | --- |
| Tải lại | Có | Có | Có | Có |
| Xem chi tiết request | Có | Có | Có | Có |
| Chat với khách | Có | Có | Có nếu được quyền chat | Có trong chế độ hỗ trợ/audit |
| Kiểm tra trùng lịch | Có | Có | Có | Có |
| Duyệt | Có | Có nếu được quyền | Không | Có nếu hỗ trợ được ủy quyền |
| Từ chối | Có | Có nếu được quyền | Không | Có nếu hỗ trợ được ủy quyền |
| Tạo đơn thuê từ request | Có | Có nếu được quyền | Không | Có nếu được quyền |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| SLA phản hồi | Admin nên thấy request chờ lâu |
| Auto create booking | Cần API chuyển request thành booking thật |
| Status mapping | `cho_duyet` cần mapping sang chuẩn DB |

### 7.5 Đơn thuê

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | platform support |
| --- | --- | --- | --- | --- | --- |
| Tạo đơn | Có | Có | Có nếu được quyền | Không | Có nếu được quyền hỗ trợ |
| Tìm | Có | Có | Có | Có | Có |
| Lọc ngày hôm nay/tuần/tháng/tháng trước | Có | Có | Có | Có | Có |
| Sửa đơn | Có | Có | Có theo quyền | Không | Có audit |
| Hủy đơn | Có | Có theo quyền | Không mặc định | Không | Có audit |
| Xem chi tiết | Có | Có | Có | Có | Có |
| In hợp đồng | Có | Có | Có | Có | Có |
| Lưu ảnh hợp đồng | Có | Có | Có | Có | Có |
| Giao xe/nhận xe, ảnh hiện trạng | Có | Có | Có | Không | Có nếu hỗ trợ |
| Cập nhật thanh toán/cọc | Có | Có | Staff tùy quyền | Không | Finance/support tùy quyền |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| State machine | Cần trạng thái chuẩn: pending, confirmed, active, completed, cancelled |
| Payment | Cần tách payment/receipt/deposit |
| Hợp đồng | Cần entity contract hoặc document snapshot |
| Nhân viên giao/nhận | Cần assignment rõ |

### 7.6 Khách hàng

| Nút/chức năng | shop_owner/manager/staff | shop_viewer | platform support |
| --- | --- | --- | --- |
| Thêm khách | Có | Không | Có nếu hỗ trợ |
| Sửa khách | Có | Không | Có audit |
| Xem lịch sử đơn | Có | Có | Có |
| Xóa khách | Owner/manager | Không | Có theo quyền |
| Ảnh CCCD/GPLX | Có theo quyền | Có thể ẩn bớt | Platform cần masking theo quyền |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Privacy | CCCD/GPLX cần phân quyền và audit khi xem |
| Customer global | Một khách có thể thuê nhiều shop, DB cần tránh trùng |

### 7.7 Tài chính

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | finance_admin |
| --- | --- | --- | --- | --- | --- |
| Xem doanh thu | Có | Có nếu quyền tài chính | Không mặc định | Có nếu được cấp | Có toàn hệ thống |
| Lọc theo năm/tháng/xe | Có | Có | Có nếu quyền | Có | Có |
| Báo cáo xe | Có | Có | Có nếu quyền | Có | Có |
| Cọc đang giữ | Có | Có | Có nếu quyền | Có | Có |
| Xuất báo cáo | Có | Có | Không mặc định | Không | Có |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Platform finance | Admin nền tảng hiện chưa có báo cáo doanh thu/gói/tenant |
| Commission | Nếu sau này thu phí nền tảng, DB cần bảng platform transactions |

### 7.8 Thu Chi

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | finance_admin |
| --- | --- | --- | --- | --- | --- |
| Thêm phiếu | Có | Có | Có nếu quyền | Không | Có nếu hỗ trợ |
| Phiếu Thu / Phiếu Chi | Có | Có | Có | Không | Có |
| Lưu phiếu | Có | Có | Có | Không | Có |
| Duyệt phiếu | Có | Có nếu role admin/manager | Không mặc định | Không | Có |
| Hủy phiếu | Owner, admin tenant | Theo quyền | Không | Không | Có audit |
| Phiếu tổng hợp | Có | Có | Có nếu quyền | Có | Có |
| Ảnh bill/ảnh xe | Có | Có | Có | Có nếu được xem | Có |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Approval workflow | Hiện có yêu cầu duyệt cơ bản, cần state rõ hơn |
| Attachment storage | Chuẩn hóa file storage |
| Accounting categories | Cần bảng danh mục thu chi |

### 7.9 Công nợ

| Nút/chức năng | shop roles | platform finance/support |
| --- | --- | --- |
| Xem đơn còn nợ | Có | Có toàn hệ thống/theo shop |
| Lọc xe/khách/thời gian | Có | Có |
| Tạo phiếu thu từ công nợ | Có nếu quyền thu chi | Có nếu quyền |
| Xuất danh sách | Có | Có |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Debt model | Nên tính từ booking/payment, không lưu phân tán |

### 7.10 Phạt nguội

| Nút/chức năng | shop_owner/manager/staff | shop_viewer | platform support |
| --- | --- | --- | --- |
| Tra tất cả xe đang hoạt động | Có | Không | Có nếu hỗ trợ |
| Thêm thủ công | Có | Không | Có |
| Gán xe/đơn/khách liên quan | Có | Không | Có |
| Cập nhật trạng thái xử lý | Có | Không | Có |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| External API | Cần xác định nguồn API phạt nguội ổn định |
| Audit | Cần log khi gán lỗi cho khách/đơn |

### 7.11 Khu vực, chi nhánh, nhận xe

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | platform |
| --- | --- | --- | --- | --- | --- |
| Thêm khu vực | Có | Có | Không mặc định | Không | Có nếu hỗ trợ |
| Thêm chi nhánh | Có | Có | Không mặc định | Không | Có nếu hỗ trợ |
| Chọn tỉnh/thành | Có | Có | Không | Xem | Có |
| Ghim bản đồ chi nhánh | Có | Có | Không | Xem | Có |
| Đặt chi nhánh mặc định | Có | Có nếu quyền | Không | Không | Có audit |

Cần cho DB:

| Entity | Ghi chú |
| --- | --- |
| `branches` | Tên, địa chỉ, tỉnh, lat/lng, phone, default, active |
| `pickup_areas` | Khu vực nhận xe thủ công |
| `delivery_policy` | Bán kính, phí giao, miễn phí km |

### 7.12 Người dùng và phân quyền gian hàng

| Hiện có | Role dùng | Trạng thái |
| --- | --- | --- |
| Có users, roles, permissions | owner/admin tenant | Cần đổi tên role |

Chức năng và nút:

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | platform support |
| --- | --- | --- | --- | --- | --- |
| Tạo tài khoản | Có | Có nếu có quyền users | Không | Không | Hỗ trợ/reset nếu được quyền |
| Sửa role nhân viên | Có | Có nếu quyền | Không | Không | Có audit |
| Xóa user khỏi gian hàng | Có | Có nếu quyền | Không | Không | Có audit |
| Thêm vai trò mới | Có | Có nếu quyền users | Không | Không | Không mặc định |
| Tick quyền view/create/edit/delete/finance/users | Có | Có nếu quyền | Không | Không | Không mặc định |

Cần đổi:

| Hiện tại | Mục tiêu |
| --- | --- |
| `owner` | `shop_owner` |
| `admin` tenant | `shop_manager` hoặc custom role, không dùng tên admin |
| `staff` | `shop_staff` |
| `viewer` | `shop_viewer` |

### 7.13 Tài xế

| Nút/chức năng | shop_owner/manager | shop_staff | shop_viewer | platform support |
| --- | --- | --- | --- |
| Thêm tài xế | Có | Không mặc định | Không | Có nếu hỗ trợ |
| Tài xế nhân viên | Có | Có nếu quyền | Xem | Có |
| Tài xế cộng tác viên | Có | Có nếu quyền | Xem | Có |
| Bật/tắt hoạt động | Có | Không mặc định | Không | Có audit |
| Gán tài xế vào đơn | Có | Có nếu xử lý đơn | Không | Có nếu hỗ trợ |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Driver app | Hiện chưa phải một portal riêng cho tài xế |
| Driver assignment | Cần DB rõ giữa staff user và driver profile |

### 7.14 Nâng cấp xe

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer |
| --- | --- | --- | --- | --- |
| Thêm nâng cấp | Có | Có nếu quyền | Không mặc định | Không |
| Sửa/xóa nâng cấp | Có | Có nếu quyền | Không | Không |
| Lọc theo xe | Có | Có | Có | Có |
| Tính chi phí vào lợi nhuận xe | Có | Có | Có nếu quyền tài chính | Có |

Cần cho DB:

| Entity | Ghi chú |
| --- | --- |
| `vehicle_upgrades` | Xe, hạng mục, chi phí, ngày, ảnh, ghi chú |

### 7.15 Thùng rác, nhật ký, yêu cầu xóa dữ liệu

| Nút/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | platform admin |
| --- | --- | --- | --- | --- | --- |
| Xem thùng rác | Có | Có nếu quyền delete | Không | Không | Có |
| Khôi phục | Có | Có nếu quyền | Không | Không | Có |
| Xóa vĩnh viễn | Chỉ owner | Không mặc định | Không | Không | Có |
| Cấu hình ngày lưu | Chỉ owner | Không | Không | Không | Có |
| Lịch sử thao tác | Có | Có | Có dữ liệu của mình | Có nếu được xem | Có toàn hệ thống |
| Yêu cầu xóa dữ liệu | Có | Có | Có | Có | Xử lý yêu cầu |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Audit toàn hệ thống | Platform admin cần audit chuẩn |
| Data deletion compliance | Cần workflow xử lý và lưu bằng chứng |

### 7.16 Cửa hàng và cài đặt gian hàng

| Tab/chức năng | shop_owner | shop_manager | shop_staff | shop_viewer | platform admin |
| --- | --- | --- | --- | --- | --- |
| Hồ sơ cửa hàng | Có | Sửa hạn chế | Không | Xem | Xem/sửa khi hỗ trợ |
| QR ngân hàng | Có | Có nếu quyền | Không | Xem nếu được | Xem khi hỗ trợ |
| Yêu cầu duyệt phiếu thu/chi | Có | Có nếu quyền | Không | Xem | Có |
| Buffer time | Có | Có | Không | Xem | Có nếu hỗ trợ |
| Grace period/phí quá giờ | Có | Có | Không | Xem | Có nếu hỗ trợ |
| Đánh số chứng từ | Có | Có | Không | Xem | Có |
| Dịch vụ cộng thêm | Có | Có | Không | Xem | Có |
| Checklist giao/nhận xe | Có | Có | Staff dùng checklist | Xem | Có |
| Giao diện/ngôn ngữ | Theo user | Theo user | Theo user | Theo user | Theo user |
| Notification settings | Có | Có | Có tùy quyền | Xem | Có |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Hồ sơ shop public | Cần trạng thái duyệt và version public |
| Slug | Cần quản lý slug shop |
| Shop documents | Nếu business cần giấy phép/CCCD/đăng ký kinh doanh |

### 7.17 Trò chuyện trong Management Portal

| Nút/chức năng | shop_owner/manager/staff | shop_viewer | platform support/admin |
| --- | --- | --- | --- |
| Danh sách hội thoại | Có | Có nếu được xem | Có theo scope |
| Mở thread | Có | Có nếu được xem | Có audit |
| Gửi tin | Có | Không mặc định | Có nếu hỗ trợ được ủy quyền |
| Đóng chat | Có | Có | Có |
| Badge unread | Có | Có | Có |

Cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Metadata MySQL | Conversation phải gắn customer, tenant, listing, booking |
| Support access | Admin xem/gửi thay phải có audit rõ |
| Archive | Không để Firestore phình mãi |

### 7.18 AI trợ lý

| Hiện có | Role dùng | Định hướng |
| --- | --- | --- |
| Có tab AI trong Host | shop roles | Để giai đoạn sau |

Chức năng hiện tại:

| Nút/chức năng | Hành động |
| --- | --- |
| Gửi câu hỏi | Trả lời dựa trên dữ liệu xe/đơn/tài chính đang load |
| Xóa chat | Xóa lịch sử UI |
| Câu hỏi nhanh | Gợi ý câu hỏi vận hành |

Thiếu/cần sửa:

| Hạng mục | Cần làm |
| --- | --- |
| Backend AI API | Không nên để logic phân tích lớn ở client |
| Data permission | AI chỉ được đọc dữ liệu đúng role |

## 8. Admin nền tảng hiện tại và cần bổ sung

### 8.1 Admin hiện tại trong Firebase-code

File `Vietrent/admin.html` hiện có:

| Màn/chức năng | Nút/chức năng |
| --- | --- |
| Login admin | Đăng nhập email/password |
| Denied | Copy UID, đăng xuất nếu UID chưa nằm trong `ADMIN_UIDS` |
| Thống kê tenant | Tổng tenant, đang hoạt động, hết hạn trong 7 ngày, quá hạn/đã khóa |
| Bảng tenant | Tên tenant, gói, hạn dùng, kích hoạt, số xe, số đơn, ghi chú |
| Gia hạn nhanh | `+1T`, `+3T`, `+12T` |
| Lưu tenant | Lưu gói, hạn, kích hoạt, ghi chú |
| Làm mới | Reload danh sách tenant |
| Đăng xuất | Logout |

Kết luận: admin hiện tại chỉ là màn quản lý gói/hạn cơ bản, chưa phải admin nền tảng đầy đủ.

### 8.2 Admin nền tảng cần có trong bản mới

| Màn admin | Role | Nút/chức năng cần có | Hiện trạng |
| --- | --- | --- | --- |
| Platform Dashboard | platform_admin, platform_staff | Tổng shop, xe public, booking, doanh thu, pending approvals, cảnh báo | Thiếu |
| Duyệt mở gian hàng | platform_admin, reviewer | Xem hồ sơ, duyệt, từ chối, yêu cầu bổ sung, khóa hồ sơ | Thiếu |
| Duyệt xe public | platform_admin, reviewer | Xem xe, ảnh, giấy tờ, giá, duyệt, từ chối, ẩn listing | Thiếu |
| Quản lý gian hàng/tenant | platform_admin, support, finance_admin | Xem/sửa tenant, khóa/mở, reset, ghi chú, impersonate có audit | Một phần |
| Quản lý gói/hạn dùng | platform_admin, finance_admin | Đổi gói, gia hạn, lịch sử thanh toán, hóa đơn | Một phần |
| Quản lý xe toàn hệ thống | platform_admin, reviewer, support | Lọc xe public/private/pending, ẩn xe vi phạm | Thiếu |
| Quản lý đơn toàn hệ thống | platform_admin, support | Giám sát booking/đơn, can thiệp hỗ trợ, audit thao tác | Thiếu |
| Quản lý khách toàn hệ thống | platform_admin, support | Tra cứu khách, lịch sử thuê, cảnh báo rủi ro, masking PII | Thiếu |
| Quản lý nhân viên gian hàng | platform_admin, support | Reset tài khoản, hỗ trợ phân quyền, khóa user | Thiếu |
| Platform staff | platform_admin | Tạo nhân viên nền tảng, cấp role reviewer/support/finance | Thiếu |
| Chat/khiếu nại | platform_admin, support | Xem conversation, gắn ticket, ghi chú xử lý, audit khi gửi thay | Thiếu |
| Báo cáo nền tảng | platform_admin, finance_admin | Doanh thu gói, tăng trưởng shop, xe, booking, active users | Thiếu |
| Audit log | platform_admin | Xem log tenant, log admin, log duyệt, log impersonate | Thiếu |
| Cấu hình hệ thống | platform_admin | Chính sách duyệt, phí, trạng thái, templates notification | Thiếu |

### 8.3 Nút admin cần chuẩn hóa

| Nút | Màn | Hành động |
| --- | --- | --- |
| Duyệt | Shop approval, Vehicle approval | Chuyển trạng thái sang approved |
| Từ chối | Shop approval, Vehicle approval | Chuyển rejected, bắt nhập lý do |
| Yêu cầu bổ sung | Shop approval, Vehicle approval | Chuyển needs_revision, gửi thông báo |
| Ẩn khỏi marketplace | Vehicle/Listings | Chuyển hidden |
| Khóa tenant | Tenant detail | Chuyển suspended, chặn public và thao tác quan trọng |
| Mở tenant | Tenant detail | Chuyển active |
| Gia hạn | Plan/Billing | Cập nhật plan end date |
| Reset nhân viên | Users | Gửi reset password hoặc unlink device/session |
| Xem như gian hàng | Tenant detail | Impersonate/support mode có audit |
| Ghi chú nội bộ | Tenant/Booking/Customer | Lưu admin note |
| Xuất báo cáo | Reports | Export CSV/XLSX |

## 9. Ma trận màn hình theo role

| Màn hình | guest | customer | shop_owner | shop_manager | shop_staff | shop_viewer | platform_admin | platform_staff |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Marketplace | Xem | Xem/đặt/chat | Xem | Xem | Xem | Xem | Xem | Xem |
| Public shop | Xem | Xem/đặt/chat | Xem shop mình | Xem | Xem | Xem | Xem tất cả | Xem tất cả |
| Customer trips | Không | Có | Không | Không | Không | Không | Hỗ trợ xem | Hỗ trợ xem |
| Manage dashboard | Không | Không | Tenant | Tenant | Tenant giới hạn | Tenant read-only | Platform | Platform giới hạn |
| Lịch thuê xe | Không | Không | Có | Có | Có | Xem | Có | Có theo quyền |
| Xe | Không | Không | CRUD | CRUD theo quyền | C/U giới hạn | Xem | Toàn hệ thống | Theo quyền |
| Đơn đặt xe | Không | Không | Duyệt/từ chối | Duyệt/từ chối | Xử lý theo quyền | Xem | Giám sát/hỗ trợ | Theo quyền |
| Đơn thuê | Không | Không | CRUD | CRUD theo quyền | Xử lý | Xem | Giám sát/hỗ trợ | Theo quyền |
| Khách hàng | Không | Hồ sơ mình | CRUD tenant | CRUD theo quyền | Xem/sửa giới hạn | Xem | Toàn hệ thống | Theo quyền |
| Tài chính | Không | Không | Có | Theo quyền | Không mặc định | Xem nếu cấp | Toàn hệ thống | Finance/support |
| Thu Chi | Không | Không | Có/duyệt | Có/duyệt theo quyền | Tạo phiếu nếu cấp | Xem | Toàn hệ thống | Finance |
| Công nợ | Không | Không | Có | Có | Xem nếu cấp | Xem | Toàn hệ thống | Finance/support |
| Phạt nguội | Không | Không | Có | Có | Xử lý nếu cấp | Xem | Toàn hệ thống | Support |
| Khu vực/Chi nhánh | Không | Không | CRUD | CRUD theo quyền | Xem | Xem | Hỗ trợ | Theo quyền |
| Người dùng tenant | Không | Không | Có | Có nếu cấp | Không | Không | Hỗ trợ/reset | Support |
| Tài xế | Không | Không | CRUD | CRUD | Xem/gán nếu cấp | Xem | Hỗ trợ | Theo quyền |
| Cửa hàng settings | Không | Không | Có | Sửa hạn chế | Không | Xem | Xem/sửa hỗ trợ | Theo quyền |
| Chat portal | Không | Chat customer | Có | Có | Có | Xem nếu cấp | Hỗ trợ/audit | Support |
| Admin approvals | Không | Không | Không | Không | Không | Không | Có | Reviewer |
| Platform billing | Không | Không | Không | Không | Không | Không | Có | Finance |

## 10. Các màn hình còn thiếu/chưa rõ so với mục tiêu

### 10.1 Thiếu ở Marketplace/Customer

| Màn/luồng | Mức độ | Ghi chú |
| --- | --- | --- |
| Google/Facebook login | Thiếu | Cần thêm vào auth flow |
| Xác thực SĐT trước khi đặt xe | Thiếu dạng gate rõ | Hiện login OTP là chính |
| Public shop slug `/shops/[slug]` | Thiếu route chuẩn | Hiện open shop theo id/filter |
| Hồ sơ customer nâng cao | Một phần | Cần chuẩn hóa user profile |
| Thanh toán/cọc online | Thiếu | DB nên chuẩn bị |
| Khiếu nại/hỗ trợ chuyến | Thiếu | Cần nếu admin support |

### 10.2 Thiếu ở Host/Shop Portal

| Màn/luồng | Mức độ | Ghi chú |
| --- | --- | --- |
| Đăng ký gian hàng `pending_review` | Thiếu | Hiện tạo tenant trực tiếp |
| Gửi hồ sơ mở gian hàng | Thiếu | Cần giấy tờ, phone verified |
| Trạng thái duyệt gian hàng | Thiếu | pending/approved/rejected/suspended |
| Gửi xe duyệt public | Một phần | Hiện bật `congKhai` trực tiếp |
| Lý do từ chối xe/gian hàng | Thiếu | Cần feedback cho shop |
| Role rename | Cần sửa | `owner/admin/staff/viewer` sang `shop_*` |
| Permission backend | Thiếu | Hiện nhiều quyền còn ở client/rules |

### 10.3 Thiếu ở Admin nền tảng

| Màn/luồng | Mức độ | Ghi chú |
| --- | --- | --- |
| Duyệt mở gian hàng | Thiếu | Rất quan trọng |
| Duyệt xe public | Thiếu | Rất quan trọng |
| Quản lý xe toàn hệ thống | Thiếu | Admin cần xem/ẩn xe public |
| Quản lý đơn toàn hệ thống | Thiếu | Admin cần giám sát/hỗ trợ |
| Quản lý khách toàn hệ thống | Thiếu | Cần masking PII |
| Quản lý nhân viên nền tảng | Thiếu | Cần `platform_staff` |
| Hỗ trợ/reset user gian hàng | Thiếu | Theo yêu cầu admin |
| Chat/khiếu nại support | Thiếu | Cần gắn ticket/audit |
| Audit log admin | Thiếu | Bắt buộc nếu có impersonate |
| Báo cáo nền tảng | Thiếu | Finance/admin |

## 11. Trạng thái chuẩn cần thiết kế DB

### 11.1 Tenant/Shop

| Status | Ý nghĩa |
| --- | --- |
| `draft` | Chủ shop đang nhập hồ sơ |
| `pending_review` | Đã gửi hồ sơ, chờ admin duyệt |
| `needs_revision` | Admin yêu cầu bổ sung |
| `active` | Được hoạt động |
| `suspended` | Bị khóa |
| `rejected` | Bị từ chối |
| `expired` | Hết hạn gói |

### 11.2 Vehicle public

| Status | Ý nghĩa |
| --- | --- |
| `draft` | Xe nội bộ, chưa gửi duyệt |
| `pending_public_review` | Chờ duyệt public |
| `approved_public` | Được hiển thị marketplace |
| `needs_revision` | Cần sửa thông tin |
| `rejected` | Không được public |
| `hidden` | Đã từng public nhưng bị ẩn |
| `archived` | Ngừng sử dụng |

### 11.3 Booking request

| Status | Ý nghĩa |
| --- | --- |
| `pending_host_approval` | Khách gửi yêu cầu, chờ chủ shop |
| `approved_by_host` | Chủ shop đồng ý |
| `rejected_by_host` | Chủ shop từ chối |
| `cancelled_by_customer` | Khách hủy |
| `expired` | Quá thời gian phản hồi |
| `converted_to_booking` | Đã tạo đơn thuê thật |

### 11.4 Booking/Đơn thuê

| Status | Ý nghĩa |
| --- | --- |
| `reserved` | Đã đặt trước |
| `confirmed` | Đã xác nhận |
| `active` | Đang thuê |
| `completed` | Hoàn thành |
| `cancelled` | Hủy |
| `no_show` | Khách không đến |

### 11.5 Chat

| Status | Ý nghĩa |
| --- | --- |
| `open` | Đang mở |
| `closed` | Đã đóng |
| `flagged` | Cần admin/support xem |
| `archived` | Đã archive |

## 12. Gợi ý module DB cần có sau tài liệu màn hình

| Module | Bảng/entity chính |
| --- | --- |
| Auth/User | users, user_identities, phone_verifications |
| Tenant/Shop | tenants, tenant_profiles, tenant_documents, tenant_memberships |
| RBAC | roles, permissions, role_permissions, membership_permissions |
| Branch/Pickup | branches, pickup_areas, delivery_policies |
| Vehicle | vehicles, vehicle_images, vehicle_documents, vehicle_pricing, vehicle_public_reviews |
| Listing | public_listings hoặc vehicle_public_snapshots |
| Booking | booking_requests, bookings, booking_status_logs, booking_assignments |
| Customer | customers, customer_documents, customer_notes |
| Payment/Finance | receipts, payments, deposits, debts, finance_categories |
| Chat | conversations, conversation_participants, message_archive, support_tickets |
| Firebase shadow | firestore_conversation_shadow, recent_messages trong Firestore |
| Notification | notifications, push_tokens, notification_templates |
| Admin | platform_users, approval_tasks, admin_notes, audit_logs, impersonation_logs |
| Plan/Billing | plans, tenant_subscriptions, subscription_history, invoices |
| Review | reviews, review_replies, rating_aggregates |
| Compliance | deletion_requests, privacy_audit_logs |

## 13. Ưu tiên trước khi thiết kế DB

1. Chốt role mục tiêu: `customer`, `shop_owner`, `shop_manager`, `shop_staff`, `shop_viewer`, `platform_admin`, `platform_staff`.
2. Chốt việc chủ xe và chủ gian hàng là một role `shop_owner` ở MVP.
3. Chốt Management Portal dùng chung cho Host/Admin, khác scope.
4. Chốt trạng thái tenant, vehicle public, booking request, booking.
5. Chốt chat hybrid Firebase + MySQL.
6. Chốt login Google/Facebook, phone verification chỉ ở bước đặt xe/mở gian hàng/public xe.
7. Chốt admin phải có duyệt gian hàng và duyệt xe public trước khi marketplace mở rộng.

## 14. Kết luận cuối

Source hiện tại đã có nền tốt cho vận hành chủ xe/gian hàng: xe, đơn, khách, lịch, tài chính, thu chi, chat, nhân viên, chi nhánh. Tuy nhiên, để clone sang Next.js + NestJS và thiết kế DB đúng, không nên bê nguyên cấu trúc role và flow hiện tại.

Điểm cần sửa lớn nhất là tách rõ:

| Hiện tại | Mục tiêu |
| --- | --- |
| Chủ xe tự tạo tenant và public xe | Chủ shop gửi hồ sơ, admin duyệt shop, admin duyệt xe public |
| Host và admin là 2 trang lệch chức năng | Dùng chung Management Portal, khác scope |
| `owner/admin/staff/viewer` | `shop_owner/shop_manager/shop_staff/shop_viewer` |
| Super admin whitelist UID đơn giản | `platform_admin/platform_staff` có RBAC/audit |
| Chat Firestore là chính | Firestore realtime gần nhất + MySQL metadata/archive |
| OTP là login chính | Google/Facebook login + verify SĐT khi có giao dịch |

Tài liệu này nên dùng làm checklist duyệt lần cuối trước khi bắt đầu thiết kế database.
