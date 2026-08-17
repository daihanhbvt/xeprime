# Thiết kế User Flow tổng thể XePrime để chuyển sang Next.js + Node.js

Ngày lập: 2026-07-22

## 1. Mục tiêu tài liệu

Tài liệu này tổng hợp lại user flow tổng thể của XePrime dựa trên:

- Source Firebase hiện tại.
- Các phân tích role/trang đã làm.
- Mục tiêu chuyển sang Next.js + Node.js/NestJS.

Mục tiêu là làm rõ:

- Có những nhóm người dùng nào.
- Mỗi nhóm đi qua những trang nào.
- Luồng đăng ký, duyệt gian hàng, đăng xe, duyệt xe, đặt xe, xử lý đơn, chat, đánh giá diễn ra ra sao.
- Firebase nào nên giữ lại, phần nào nên chuyển sang Node.js API/MySQL.
- Các màn hình/API cần chuẩn bị trước khi triển khai Next.js.

### Cập nhật sau khi review hướng dự án

Hướng tài liệu hiện tại cơ bản đúng, nhưng cần cập nhật 2 điểm quan trọng:

1. **Đăng nhập không nên chỉ dùng OTP**. Người thuê xe và chủ xe/chủ gian hàng nên có thể đăng nhập bằng Google/Facebook trước. Chỉ bắt xác thực số điện thoại ở các thời điểm quan trọng:
   - Khách thuê: trước khi gửi yêu cầu đặt xe lần đầu.
   - Chủ xe/chủ gian hàng: trước khi gửi hồ sơ mở gian hàng hoặc gửi xe duyệt public.
2. **Chat nên dùng mô hình hybrid Firebase + MySQL**. Firebase/Firestore giữ vai trò realtime inbox/message ngắn hạn; MySQL lưu metadata, trạng thái nghiệp vụ, audit và có thể lưu bản archive/tóm tắt tin nhắn để tối ưu chi phí, báo cáo và backup.

## 2. Tóm tắt hiện trạng Firebase

Source hiện tại đã có nhiều mảnh quan trọng:

| Nhóm chức năng | Hiện trạng trong source |
|---|---|
| Marketplace khách thuê | `Vietrent/market/index.html`, đọc `public_listings`, đặt xe qua `booking_requests` |
| Đăng nhập khách | Hiện OTP qua `customerOtpLoginApi`, tạo custom token role `customer`; nên bổ sung Google/Facebook và chỉ xác thực số điện thoại khi đặt xe |
| Host/chủ xe | `Vietrent/index.html`, quản lý `xe`, `don`, `khach`, `taiXe`, `thuChi`, `chiNhanh`, chat |
| Đăng ký chủ xe | `registerTenantApi` tạo `tenants/{tenantId}` và user role `owner` |
| Public xe | Chủ xe bật `congKhai`, Cloud Function `syncPublicListing` ghi sang `public_listings` |
| Chat | Firestore `conversations/{convId}/messages` |
| Admin hiện tại | `admin.html`, whitelist UID, quản lý tenant/gói/hạn dùng/kích hoạt |
| Role hiện tại | `owner`, `admin`, `staff`, `viewer`, custom roles |

Vấn đề cần sửa khi chuyển sang Next.js + Node.js:

- Chủ xe có thể tự tạo tenant và tự public xe, chưa có admin duyệt.
- Role `admin` trong tenant dễ nhầm với admin nền tảng.
- Host và Admin đang tách trang nhưng nhiều màn nên dùng chung.
- Firestore rules đang cho member tenant ghi khá rộng, RBAC thật cần đưa về backend.
- Chưa có trạng thái chuẩn cho duyệt gian hàng và duyệt xe public.

## 3. Mô hình trang mục tiêu

### 3 trang/trải nghiệm chính

| Trang | URL đề xuất | Người dùng | Mục tiêu |
|---|---|---|---|
| Trang thuê xe / Marketplace | `/` | Public, `customer` | Xem xe, tìm xe, đặt xe, chat, xem chuyến, đánh giá |
| Trang gian hàng public | `/shops/[slug]` | Public, `customer` | Xem hồ sơ gian hàng, danh sách xe của một gian hàng |
| Management Portal | `/manage`, alias `/host`, `/admin` | Chủ gian hàng, nhân viên gian hàng, platform admin | Quản lý gian hàng hoặc quản lý nền tảng theo quyền |

### Vì sao Host và Admin nên dùng chung Management Portal

Host và Admin đều cần xem các màn quản lý như xe, đơn, khách, gian hàng, người dùng. Khác nhau ở phạm vi quyền:

- `shop_owner`, `shop_manager`, `shop_staff`: chỉ thấy dữ liệu trong gian hàng của mình.
- `platform_admin`, `platform_staff`: thấy nhiều gian hàng/toàn hệ thống và có quyền duyệt/khóa/mở/hỗ trợ.

Do đó, nên dùng chung code/layout/component, nhưng phân quyền bằng backend RBAC.

## 4. Role mục tiêu

| Role | Tên hiển thị | Thuộc phạm vi | Ý nghĩa |
|---|---|---|---|
| `customer` | Khách thuê xe | Marketplace | Xem xe, đặt xe, chat, đánh giá |
| `shop_owner` | Chủ xe / Chủ gian hàng | Tenant/gian hàng | Toàn quyền trong gian hàng |
| `shop_manager` | Quản lý gian hàng | Tenant/gian hàng | Quản lý vận hành theo quyền |
| `shop_staff` | Nhân viên gian hàng | Tenant/gian hàng | Xử lý đơn, giao nhận, chat, cập nhật trạng thái |
| `shop_viewer` | Chỉ xem | Tenant/gian hàng | Chỉ xem dữ liệu |
| `platform_admin` | Super Admin | Nền tảng | Toàn quyền toàn hệ thống |
| `platform_staff` | Nhân viên nền tảng | Nền tảng | Duyệt/hỗ trợ/giám sát theo quyền |

## 5. Chủ xe và chủ gian hàng

Ở MVP, **chủ xe và chủ gian hàng nên là một role**:

```text
shop_owner
```

Cách hiểu:

| Trường hợp | Cách mô hình hóa |
|---|---|
| Cá nhân có 1 xe | Một gian hàng cá nhân, `tenantType = individual`, user role `shop_owner` |
| Cá nhân có nhiều xe | Một gian hàng cá nhân lớn hơn, vẫn là `shop_owner` |
| Công ty có nhiều xe/nhiều nhân viên | Một gian hàng doanh nghiệp, `tenantType = business`, user role `shop_owner` |
| Người sở hữu xe nhưng gửi công ty quản lý hộ | Giai đoạn sau mới thêm `vehicle_owner` hoặc `external_owner` |

Không nên tách `car_owner` và `shop_owner` thành 2 role ở MVP vì quyền quản lý gần như giống nhau.

## 6. User Flow tổng thể

```text
Khách thuê xe
  -> Vào Marketplace
  -> Xem xe / xem gian hàng
  -> Đăng nhập OTP nếu muốn đặt
  -> Gửi yêu cầu đặt xe
  -> Chat với gian hàng
  -> Theo dõi chuyến
  -> Đánh giá sau chuyến

Chủ xe / Chủ gian hàng
  -> Đăng ký gian hàng
  -> Chờ admin duyệt mở gian hàng
  -> Hoàn thiện hồ sơ gian hàng
  -> Thêm xe
  -> Gửi xe duyệt public
  -> Nhận booking request
  -> Duyệt/từ chối booking
  -> Vận hành đơn thuê
  -> Quản lý nhân viên/tài chính/chat

Admin nền tảng
  -> Duyệt mở gian hàng
  -> Duyệt xe public
  -> Giám sát xe/đơn/khách/chat khi cần
  -> Khóa/mở tenant
  -> Quản lý gói/gia hạn
  -> Hỗ trợ/reset người dùng gian hàng
```

## 7. Flow A - Khách thuê xe

### A1. Khách xem xe

| Bước | Mô tả | Dữ liệu/API mục tiêu |
|---|---|---|
| 1 | Khách vào trang chủ | Next.js route `/` |
| 2 | Hệ thống hiển thị tối đa 8 xe public làm gợi ý, không phân trang trên homepage | `GET /public/listings?limit=8` |
| 3 | Khách nhập từ khóa, địa điểm và chọn khoảng nhận–trả trong một input thời gian thuê | Search context trên URL |
| 4 | Khách bấm “Tìm xe” | Chuyển sang `/search` với điều kiện tìm kiếm |
| 5 | Hoặc khách bấm “Khám phá xe” | Chuyển sang `/search` không bắt buộc có điều kiện |
| 6 | Trang `/search` hiển thị full filter, sort, kết quả và pagination; không lặp hero marketing của homepage | API search/listing có pagination |
| 7 | Khách mở chi tiết xe | Route public listing detail hiện hành |
| 8 | Khách xem thông tin gian hàng | Route `/shops/[slug]` |

### A2. Khách đăng nhập bằng Google/Facebook hoặc tiếp tục ẩn danh

| Bước | Mô tả | Mục tiêu |
|---|---|---|
| 1 | Khách có thể xem xe không cần đăng nhập | Giảm ma sát ở Marketplace |
| 2 | Khi muốn lưu xe/chat/đặt xe, khách đăng nhập Google hoặc Facebook | Firebase Auth provider hoặc NextAuth/Auth.js kết nối Firebase/custom session |
| 3 | Hệ thống tạo hồ sơ khách cơ bản | `customers` trong MySQL, liên kết với Firebase UID/provider ID |
| 4 | Nếu chưa có số điện thoại xác thực, hệ thống đánh dấu `phoneVerified = false` | Chưa chặn xem xe, chỉ chặn đặt xe |

### A3. Khách xác thực số điện thoại khi đặt xe

| Bước | Mô tả | API mục tiêu |
|---|---|---|
| 1 | Khách bấm “Đặt xe” | Kiểm tra đăng nhập |
| 2 | Nếu chưa đăng nhập, yêu cầu Google/Facebook hoặc phương thức khác | `GET /auth/session` |
| 3 | Nếu chưa xác thực số điện thoại, yêu cầu nhập số và OTP | `POST /auth/phone/send-otp` |
| 4 | Xác minh OTP thành công | `POST /auth/phone/verify-otp` |
| 5 | Cập nhật hồ sơ khách `phoneVerified = true` | `customers.phoneVerifiedAt` |

### A4. Khách gửi yêu cầu đặt xe

| Bước | Mô tả | Trạng thái |
|---|---|---|
| 1 | Chọn ngày/giờ nhận trả | validate availability |
| 2 | Chọn nhận tại cửa hàng hoặc giao tận nơi | tính phí giao nếu có |
| 3 | Gửi yêu cầu đặt xe | `booking_request.status = pending_host_approval` |
| 4 | Hệ thống thông báo cho gian hàng | notification/chat badge |
| 5 | Khách theo dõi trong “Chuyến của tôi” | pending/approved/rejected/cancelled |

Tên trạng thái đề xuất:

```text
pending_host_approval
approved
rejected
customer_cancelled
expired
```

## 8. Flow B - Đăng ký gian hàng/chủ xe

### B1. Đăng ký gian hàng

| Bước | Mô tả | Hiện tại | Mục tiêu |
|---|---|---|---|
| 1 | Chủ xe/chủ gian hàng đăng nhập | Hiện dùng số điện thoại/email + mật khẩu | Bổ sung Google/Facebook để giảm ma sát |
| 2 | Tạo hồ sơ owner cơ bản | Một phần đã có | Lưu `users`, provider, email, avatar nếu có |
| 3 | Nhập thông tin gian hàng | Có tên cửa hàng | Bổ sung tenant type, slug, địa chỉ, giấy tờ nếu cần |
| 4 | Xác thực số điện thoại | Có qua `registerTenantApi` | Chỉ bắt buộc trước khi gửi hồ sơ mở gian hàng |
| 5 | Tạo tenant | Hiện tạo xong là active | Tạo `tenant.status = pending_review` |
| 6 | Tạo membership owner | Hiện role `owner` | Đổi dần sang `shop_owner` |
| 7 | Vào portal | Hiện vào dashboard | Chỉ thấy checklist hồ sơ nếu chưa được duyệt |

### B2. Admin duyệt mở gian hàng

| Bước | Mô tả | Người thực hiện |
|---|---|---|
| 1 | Admin mở hàng chờ “Duyệt gian hàng” | `platform_admin` / `platform_staff` |
| 2 | Xem hồ sơ chủ xe/gian hàng | admin |
| 3 | Kiểm tra số điện thoại, tên gian hàng, slug, giấy tờ nếu có | admin |
| 4 | Duyệt | tenant chuyển `active` |
| 5 | Từ chối | tenant chuyển `rejected`, lưu lý do |
| 6 | Khóa | tenant chuyển `suspended` nếu vi phạm/hết hạn |

Trạng thái tenant đề xuất:

```text
draft
pending_review
active
rejected
suspended
expired
```

## 9. Flow C - Chủ gian hàng quản lý xe

### C1. Thêm xe nội bộ

| Bước | Mô tả | Trạng thái xe |
|---|---|---|
| 1 | Chủ gian hàng/nhân viên thêm xe | `draft` |
| 2 | Nhập ảnh, giá, giấy tờ, chi nhánh, điều kiện thuê | `draft` |
| 3 | Lưu xe để quản lý nội bộ | `draft` hoặc `internal_active` |
| 4 | Chưa gửi duyệt thì xe không hiện marketplace | không có public listing |

### C2. Gửi xe duyệt public

| Bước | Mô tả | Điều kiện |
|---|---|---|
| 1 | Bấm “Gửi duyệt public” | tenant phải `active` |
| 2 | Hệ thống kiểm tra bắt buộc | ảnh đại diện, tối thiểu ảnh, giá, địa điểm, mô tả |
| 3 | Xe chuyển trạng thái | `pending_review` |
| 4 | Admin thấy xe trong hàng chờ duyệt | `vehicle_review_queue` |

### C3. Admin duyệt xe public

| Bước | Mô tả | Kết quả |
|---|---|---|
| 1 | Admin mở hàng chờ duyệt xe | xem toàn hệ thống |
| 2 | Kiểm tra ảnh/giá/mô tả/giấy tờ/khu vực | approve/reject |
| 3 | Nếu duyệt | `vehicle.publicStatus = published` |
| 4 | Hệ thống tạo/cập nhật `public_listings` | xe hiện ngoài marketplace |
| 5 | Nếu từ chối | `vehicle.publicStatus = rejected`, lưu lý do |

Trạng thái xe public đề xuất:

```text
draft
pending_review
published
rejected
hidden
archived
```

## 10. Flow D - Chủ gian hàng xử lý booking

### D1. Nhận booking request

| Bước | Mô tả |
|---|---|
| 1 | Khách gửi yêu cầu đặt xe từ Marketplace |
| 2 | Hệ thống tạo `booking_request` |
| 3 | Chủ gian hàng/nhân viên nhận thông báo |
| 4 | Booking hiện trong màn “Đơn đặt xe” |
| 5 | Chủ gian hàng mở chi tiết, xem xe, thời gian, khách, phí giao |

### D2. Duyệt hoặc từ chối

| Hành động | Kết quả |
|---|---|
| Duyệt | Tạo booking/order chính thức, khóa lịch xe, thông báo khách |
| Từ chối | Lưu lý do, thông báo khách |
| Hết hạn | Hệ thống tự chuyển `expired` nếu quá thời gian phản hồi |
| Chat | Chủ gian hàng và khách có thể trao đổi trước/sau khi duyệt |

Trạng thái đơn thuê chính thức đề xuất:

```text
draft
reserved
confirmed
in_progress
completed
cancelled
no_show
```

## 11. Flow E - Chat và thông báo

### Hiện tại

Chat đang dùng Firestore:

```text
conversations/{convId}
conversations/{convId}/messages/{messageId}
```

Đây là phần nên giữ lại trong giai đoạn đầu vì realtime tốt và source hiện đã có.

### Chiến lược chat đề xuất: hybrid Firebase + MySQL

Không nên chọn cực đoan “chỉ Firebase” hoặc “chỉ MySQL” ở giai đoạn đầu.

| Thành phần | Nên lưu ở đâu | Lý do |
|---|---|---|
| Message realtime mới nhất | Firestore | Realtime nhanh, client đã có sẵn, dễ làm unread badge |
| Conversation metadata | MySQL là nguồn chính, Firestore shadow cho realtime | MySQL dễ query, lọc, audit, gắn booking/listing; Firestore giúp realtime |
| Message archive | MySQL hoặc object storage sau một thời gian | Giảm Firestore storage/read dài hạn, dễ backup |
| Attachment/ảnh chat | Firebase Storage hoặc object storage | Không nhét file/base64 vào Firestore |
| Audit/support note | MySQL | Admin cần tra cứu, phân quyền, log hỗ trợ |

Mô hình nên dùng:

```text
MySQL
  conversations
  conversation_participants
  conversation_metadata
  message_archive hoặc message_index

Firestore
  conversations/{conversationId}
  conversations/{conversationId}/messages_recent/{messageId}
```

Firestore chỉ giữ phần realtime cần thiết:

- 30-100 tin gần nhất mỗi conversation.
- `lastMessage`, `lastAt`, `unreadCustomer`, `unreadHost`.
- Không lưu lịch sử vô hạn nếu conversation quá dài.

MySQL giữ phần nghiệp vụ:

- Conversation thuộc tenant nào, customer nào, listing/booking nào.
- Trạng thái support/escalation.
- Message archive định kỳ nếu cần.
- Dữ liệu báo cáo/audit.

### Flow chat mục tiêu

| Bước | Mô tả |
|---|---|
| 1 | Khách bấm “Nhắn chủ xe” hoặc chat từ booking |
| 2 | Node.js tạo/cập nhật conversation metadata trong MySQL |
| 3 | Node.js hoặc client ghi message realtime vào Firestore |
| 4 | Badge/unread cập nhật realtime |
| 5 | NestJS job gửi notification nếu cần |
| 6 | Job nền archive/tóm tắt tin nhắn cũ sang MySQL hoặc storage |

### Mục tiêu khi chuyển Next.js

| Thành phần | Giai đoạn đầu | Giai đoạn sau |
|---|---|---|
| Tin nhắn realtime | Giữ Firestore | Có thể giữ lâu dài |
| Metadata conversation | MySQL nguồn chính + Firestore shadow | MySQL làm nguồn chính, Firestore phục vụ realtime |
| Notification | FCM hiện tại | Queue Node.js + FCM |

### Tối ưu chi phí Firebase cho 1.000 chủ xe và 10.000 khách thuê

Với quy mô ban đầu 1.000 chủ xe và 10.000 khách thuê, chat đơn giản vài tin giữa chủ và khách có thể rất rẻ nếu thiết kế đúng.

Giả định thận trọng:

| Chỉ số | Ước tính |
|---|---:|
| 10.000 khách, mỗi khách 10 tin/tháng | 100.000 message/tháng |
| Mỗi message ghi 1 message doc + update conversation | khoảng 200.000 writes/tháng |
| Reads trung bình 3-5 lần/message | 300.000-500.000 reads/tháng |
| Storage text chat | thường dưới 1GB giai đoạn đầu |

Firestore có free quota theo ngày: 50.000 reads/ngày, 20.000 writes/ngày, 20.000 deletes/ngày, 1GiB storage và 10GiB outbound/tháng. Với 100.000 message/tháng phân bổ đều, lượng write/read chat text thường vẫn nằm trong mức rất thấp so với quota.

Cách tối ưu:

1. **Không listen toàn bộ message history**. Chỉ listen 30-50 tin mới nhất.
2. **Phân trang tin cũ bằng cursor**, không dùng offset.
3. **Không query conversation toàn hệ thống trên client**. Luôn filter theo `customerUid` hoặc `tenantId`.
4. **Tắt listener khi đóng màn chat**.
5. **Không lưu ảnh/file trực tiếp vào Firestore**. Chỉ lưu URL và metadata.
6. **Archive tin cũ**: sau 30-90 ngày, chuyển message cũ sang MySQL/object storage nếu cần giữ lịch sử.
7. **Giữ document nhỏ**: message chỉ gồm text, senderId, senderType, createdAt, attachmentRefs.
8. **Dùng aggregate unread counter** trên conversation để tránh đọc nhiều message chỉ để tính badge.
9. **Giới hạn spam/rate limit** ở Node.js trước khi ghi Firestore.
10. **Theo dõi billing dashboard và đặt budget alert** ngay từ đầu.

Kết luận chat:

```text
Realtime ngắn hạn: Firestore
Nghiệp vụ/audit/metadata/archive: MySQL
File/ảnh: Storage/object storage
Notification: FCM qua Node.js job
```

Đây là cách tối ưu nhất giữa tốc độ triển khai, realtime tốt và kiểm soát chi phí.

## 12. Flow F - Đánh giá

| Bước | Mô tả |
|---|---|
| 1 | Chuyến hoàn tất hoặc được duyệt đủ điều kiện |
| 2 | Khách mở “Chuyến của tôi” |
| 3 | Khách gửi số sao/bình luận |
| 4 | Hệ thống lưu review |
| 5 | Bản public review được ẩn thông tin nhạy cảm |
| 6 | Hệ thống tính lại điểm trung bình cho xe/gian hàng |

Điều kiện đánh giá:

```text
customer đã thuê hoặc có booking approved/completed
review gắn đúng bookingId/listingId/tenantId
không cho đánh giá xe khác bằng booking không liên quan
```

## 13. Flow G - Admin nền tảng

### G1. Duyệt gian hàng

| Bước | Mô tả |
|---|---|
| 1 | Admin vào Management Portal với scope nền tảng |
| 2 | Mở menu “Duyệt gian hàng” |
| 3 | Xem hồ sơ đăng ký |
| 4 | Duyệt/từ chối/yêu cầu bổ sung |
| 5 | Hệ thống thông báo cho chủ gian hàng |

### G2. Duyệt xe public

| Bước | Mô tả |
|---|---|
| 1 | Admin vào “Duyệt xe public” |
| 2 | Xem xe đang `pending_review` |
| 3 | Kiểm tra ảnh/giá/mô tả/điều kiện thuê |
| 4 | Duyệt hoặc từ chối |
| 5 | Nếu duyệt, public listing mới xuất hiện ngoài Marketplace |

### G3. Quản lý tenant/gói

| Chức năng | Mô tả |
|---|---|
| Xem danh sách gian hàng | lọc theo active/pending/suspended/expired |
| Gia hạn gói | cập nhật plan/expiredAt |
| Khóa/mở tenant | xử lý vi phạm/hết hạn |
| Hỗ trợ/reset nhân viên | reset quyền/tài khoản khi chủ gian hàng cần hỗ trợ |
| Giám sát đơn/khách | phục vụ support/tranh chấp |

## 14. Management Portal - phân quyền theo scope

| Route/Màn | Shop Owner/Manager thấy | Platform Admin thấy |
|---|---|---|
| `/manage/dashboard` | Số liệu gian hàng mình | Số liệu toàn hệ thống |
| `/manage/vehicles` | Xe của gian hàng mình | Xe toàn hệ thống |
| `/manage/bookings` | Đơn của gian hàng mình | Đơn toàn hệ thống |
| `/manage/customers` | Khách của gian hàng mình | Khách toàn hệ thống hoặc theo gian hàng |
| `/manage/users` | Nhân viên gian hàng mình | User nền tảng và hỗ trợ user gian hàng |
| `/manage/shop` | Hồ sơ gian hàng mình | Danh sách/từng hồ sơ gian hàng |
| `/manage/reviews/shops` | Trạng thái duyệt của mình | Hàng chờ duyệt gian hàng |
| `/manage/reviews/vehicles` | Xe mình gửi duyệt | Hàng chờ duyệt xe toàn hệ thống |
| `/manage/plans` | Gói hiện tại của mình | Quản lý gói/gia hạn toàn hệ thống |

## 15. Trạng thái chuẩn cần dùng

### Tenant/Gian hàng

```text
draft
pending_review
active
rejected
suspended
expired
```

### Vehicle/Xe public

```text
draft
pending_review
published
rejected
hidden
archived
```

### Booking Request

```text
pending_host_approval
approved
rejected
customer_cancelled
expired
```

### Booking/Đơn thuê

```text
reserved
confirmed
in_progress
completed
cancelled
no_show
```

### Payment/Plan

```text
trial
active
past_due
expired
cancelled
```

## 16. Dữ liệu và API cần chuẩn bị cho Next.js + Node.js

### Module API Node.js/NestJS đề xuất

| Module | API chính |
|---|---|
| Auth | Google/Facebook login, verify Firebase token, current user, phone verification when needed |
| Tenants/Shops | đăng ký gian hàng, hồ sơ gian hàng, duyệt/khóa/mở |
| Users/RBAC | nhân viên gian hàng, role, permission |
| Vehicles | CRUD xe, gửi duyệt, duyệt xe public |
| Public Listings | danh sách xe public, chi tiết xe, trang shop |
| Booking Requests | khách gửi yêu cầu, chủ duyệt/từ chối |
| Bookings | đơn thuê chính thức, lịch xe |
| Customers | hồ sơ khách thuê, chuyến của tôi |
| Chat | metadata conversation, bridge Firestore |
| Notifications | FCM, in-app notification |
| Reviews | đánh giá, điểm trung bình |
| Admin | dashboard nền tảng, gói, tenant, audit |

### Data ownership

| Dữ liệu | Nguồn chính giai đoạn chuyển đổi | Ghi chú |
|---|---|---|
| Auth user | Firebase Auth | Giữ để tránh migrate tài khoản ngay |
| Chat messages | Firestore recent + MySQL archive/metadata | Giữ realtime nhưng tối ưu chi phí và backup |
| File/ảnh | Firebase Storage | Giữ giai đoạn đầu |
| Tenant/shop | MySQL qua Node.js | Cần migrate từ Firestore |
| Vehicles | MySQL qua Node.js | Có public status rõ |
| Public listings | MySQL hoặc Firestore shadow | Tùy tốc độ migrate Marketplace |
| Bookings | MySQL qua Node.js | Cần transaction/index |
| Finance | MySQL qua Node.js | Không nên để client ghi trực tiếp |
| Audit logs | MySQL | Bắt buộc cho admin/support |

## 17. Route Next.js đề xuất

### Public/Customer

| Route | Mục đích |
|---|---|
| `/` | Marketplace |
| `/cars/[id]` | Chi tiết xe |
| `/shops/[slug]` | Trang gian hàng public |
| `/me/trips` | Chuyến của tôi |
| `/me/chats` | Tin nhắn |
| `/me/profile` | Hồ sơ khách |
| `/auth/login` | Đăng nhập Google/Facebook |
| `/auth/verify-phone` | Xác thực số điện thoại khi đặt xe |

### Management Portal

| Route | Mục đích |
|---|---|
| `/manage` | Dashboard theo scope |
| `/manage/vehicles` | Xe |
| `/manage/bookings` | Đơn thuê |
| `/manage/booking-requests` | Đơn đặt xe |
| `/manage/customers` | Khách hàng |
| `/manage/finance` | Tài chính/thu chi |
| `/manage/chats` | Trò chuyện |
| `/manage/shop` | Hồ sơ gian hàng |
| `/manage/users` | Người dùng/nhân viên |
| `/manage/reviews/shops` | Duyệt gian hàng |
| `/manage/reviews/vehicles` | Duyệt xe public |
| `/manage/plans` | Gói cước/gia hạn |
| `/manage/audit` | Log/audit |

Alias:

```text
/host  -> /manage với tenant scope
/admin -> /manage với platform scope
```

## 18. Các user story chính cho MVP

### Customer

- Là khách thuê, tôi muốn xem xe public để chọn xe phù hợp.
- Là khách thuê, tôi muốn đăng nhập bằng Google/Facebook để dùng nhanh.
- Là khách thuê, tôi chỉ muốn xác thực số điện thoại khi thật sự đặt xe.
- Là khách thuê, tôi muốn gửi yêu cầu đặt xe và theo dõi trạng thái.
- Là khách thuê, tôi muốn chat với gian hàng.
- Là khách thuê, tôi muốn đánh giá sau chuyến.

### Shop Owner

- Là chủ gian hàng, tôi muốn đăng nhập bằng Google/Facebook và xác thực số điện thoại khi gửi hồ sơ mở gian hàng.
- Là chủ gian hàng, tôi muốn đăng ký gian hàng và gửi hồ sơ duyệt.
- Là chủ gian hàng, tôi muốn thêm xe và gửi xe duyệt public.
- Là chủ gian hàng, tôi muốn quản lý đơn đặt xe.
- Là chủ gian hàng, tôi muốn mời nhân viên và cấp quyền.
- Là chủ gian hàng, tôi muốn xem tài chính/thu chi của gian hàng.

### Platform Admin

- Là admin nền tảng, tôi muốn duyệt mở gian hàng.
- Là admin nền tảng, tôi muốn duyệt xe public.
- Là admin nền tảng, tôi muốn khóa/mở tenant.
- Là admin nền tảng, tôi muốn quản lý gói/gia hạn.
- Là admin nền tảng, tôi muốn giám sát xe/đơn/khách để hỗ trợ.

## 19. Ưu tiên triển khai khi chuyển qua Next.js + Node.js

### Phase 1 - Nền tảng flow

1. Auth + current user + scope, gồm Google/Facebook login và phone verification.
2. Role mới: `customer`, `shop_owner`, `shop_manager`, `shop_staff`, `shop_viewer`, `platform_admin`, `platform_staff`.
3. Management Portal chung.
4. Tenant status và Vehicle public status.
5. Marketplace đọc public listings.

### Phase 2 - Duyệt và vận hành

1. Đăng ký gian hàng `pending_review`.
2. Admin duyệt gian hàng.
3. Chủ gian hàng gửi xe duyệt.
4. Admin duyệt xe public.
5. Booking request và chủ gian hàng duyệt/từ chối.

### Phase 3 - Hoàn thiện

1. Chat hybrid Firestore + MySQL metadata/archive.
2. Notification FCM.
3. Review/rating.
4. Finance/thu chi.
5. Audit log và support tools.

## 20. Kết luận

User flow mục tiêu nên xoay quanh 3 nhóm:

```text
Customer thuê xe
Shop/Tenant cho thuê xe
Platform Admin quản lý nền tảng
```

Trang chủ/Marketplace phục vụ customer. Management Portal phục vụ cả host và admin, nhưng phân quyền theo scope. Chủ xe và chủ gian hàng nên dùng chung role `shop_owner` ở MVP, phân biệt cá nhân/doanh nghiệp bằng `tenantType`.

Khi chuyển sang Next.js + Node.js, điểm quan trọng nhất là đưa RBAC, duyệt gian hàng, duyệt xe public, phone verification theo thời điểm cần thiết và trạng thái booking về backend API. Firebase nên giữ cho Auth provider, Chat realtime, FCM và Storage trong giai đoạn đầu để giảm rủi ro migrate. Chat nên dùng hybrid: Firestore cho realtime ngắn hạn, MySQL cho metadata/archive/audit để tối ưu chi phí và vận hành.
