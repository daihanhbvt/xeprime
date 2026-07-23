# Phân tích lại 3 trang chính, role và hướng gộp Host/Admin cho XePrime

Ngày lập: 2026-07-21

## 1. Tóm tắt vấn đề

Hiện tại hệ thống đang có 3 trang chính:

1. **Trang chủ / Marketplace**: nơi người đi thuê xe xem xe, đặt xe, chat với chủ xe. Trang này hiện tương đối ổn.
2. **Trang Host**: nơi chủ xe/chủ gian hàng quản lý xe, đơn thuê, khách, nhân viên, tài chính. Trang này đang bị rối vì chưa làm rõ “chủ xe” và “chủ gian hàng”.
3. **Trang Admin**: hiện chủ yếu dùng để gia hạn gói, khóa/mở tenant, xác thực hoặc quản lý đăng ký chủ xe/chủ gian hàng. Trang này còn thiếu nhiều quyền quản trị nền tảng như duyệt gian hàng, duyệt xe public, hỗ trợ/reset nhân viên gian hàng, giám sát xe/đơn/khách.

Kết luận đề xuất:

- **Trang chủ thuê xe giữ riêng**.
- **Trang Host và Trang Admin nên dùng chung một “Management Portal” về mặt code/layout**, sau đó phân quyền theo scope:
  - Người thuộc gian hàng chỉ thấy dữ liệu của gian hàng mình.
  - Admin nền tảng thấy toàn hệ thống và có thêm các màn duyệt/giám sát/gói cước.
- **Chủ xe và chủ gian hàng nên là một role ở MVP**: gọi là `shop_owner`.
  - Nếu cá nhân có 1 xe: vẫn là một gian hàng nhỏ.
  - Nếu doanh nghiệp có nhiều xe/nhiều nhân viên: vẫn là một gian hàng lớn.
  - Không nên tạo thêm role riêng `vehicle_owner` lúc này, trừ khi sau này có mô hình ký gửi xe cho doanh nghiệp quản lý hộ.

## 2. Định nghĩa lại 3 trang

| Trang | Tên nên dùng | Ai dùng | Mục tiêu |
|---|---|---|---|
| Trang chủ | Marketplace / Trang thuê xe | Người đi thuê xe, khách public | Tìm xe, xem chi tiết, đặt xe, chat, đánh giá |
| Trang Host | Management Portal - scope gian hàng | Chủ xe/chủ gian hàng/nhân viên | Quản lý xe, đơn, khách, nhân viên, tài chính, chat |
| Trang Admin | Management Portal - scope nền tảng | Super admin, nhân viên nền tảng | Giám sát toàn hệ thống, duyệt gian hàng, duyệt xe, khóa/mở tenant, quản lý gói |

Nên hiểu như sau:

- **Host và Admin không nhất thiết là 2 codebase/trang khác nhau**.
- Có thể dùng chung layout, component, bảng dữ liệu, form, filter, drawer chi tiết.
- Khác nhau ở quyền và phạm vi dữ liệu:
  - `shop_owner`, `shop_manager`, `shop_staff`: chỉ thao tác trong tenant/gian hàng của mình.
  - `platform_admin`, `platform_staff`: có thể xem nhiều tenant/gian hàng và có quyền duyệt/khóa/mở/hỗ trợ.

## 3. Có nên gộp Host và Admin không?

### Đề xuất: Nên gộp về một Management Portal

Gộp ở đây nghĩa là:

- Chung một ứng dụng quản trị, ví dụ URL `/manage`.
- Chung layout sidebar/topbar.
- Chung nhiều module như xe, đơn, khách, gian hàng, nhân viên.
- Phân quyền bằng RBAC và scope dữ liệu.

Không có nghĩa là admin nền tảng và chủ gian hàng có cùng quyền.

### Lý do nên gộp

| Lý do | Giải thích |
|---|---|
| Giảm rối UX | Người vận hành chỉ hiểu có “trang quản lý”, còn hệ thống tự hiện menu theo quyền |
| Tránh trùng chức năng | Xe, đơn, khách, gian hàng đều cần cả host và admin xem, chỉ khác quyền |
| Dễ phát triển Next.js/NestJS | Một bộ component quản lý, một hệ RBAC, một API pattern |
| Admin hỗ trợ dễ hơn | Admin có thể vào xem gian hàng như chế độ hỗ trợ, không cần trang riêng thiếu chức năng |
| Dễ mở rộng | Sau này thêm `support`, `reviewer`, `finance_admin` mà không cần tạo trang mới |

### Khi nào vẫn cần tách URL?

Có thể vẫn giữ URL dễ nhớ:

- `/host`: dành cho chủ gian hàng, redirect vào `/manage` với tenant scope.
- `/admin`: dành cho admin nền tảng, redirect vào `/manage` với platform scope.

Nhưng về code/layout nên là cùng một portal.

## 4. Trang chủ / Marketplace

### Vai trò

Trang này dành cho:

- Khách chưa đăng nhập.
- Khách đã đăng nhập OTP với role `customer`.

### Chức năng nên có

| Chức năng | Trạng thái |
|---|---|
| Xem danh sách xe public | Giữ |
| Lọc xe theo địa điểm, loại xe, giá, thời gian | Giữ/cải thiện |
| Xem chi tiết xe | Giữ |
| Xem gian hàng của chủ xe | Cần làm rõ bằng trang shop slug |
| Đặt xe | Giữ |
| Chat với chủ xe/gian hàng | Giữ Firebase giai đoạn đầu |
| Xem chuyến của tôi | Giữ |
| Đánh giá sau chuyến | Giữ |

### URL đề xuất

| URL | Ý nghĩa |
|---|---|
| `/` | Marketplace chính |
| `/cars/[id]` | Chi tiết xe |
| `/shops/[slug]` | Trang gian hàng public |
| `/me/trips` | Chuyến của tôi |
| `/me/chats` | Tin nhắn của tôi |

## 5. Trang Host / Management Portal - scope gian hàng

### Vấn đề hiện tại

Trang host đang vừa là:

- Trang chủ xe cá nhân.
- Trang doanh nghiệp/gian hàng nhiều xe.
- Trang quản lý nhân viên.
- Trang quản lý tài chính.
- Trang chat.
- Trang cài đặt cửa hàng.

Nhưng tên role và luồng chưa rõ:

- `owner` là chủ xe hay chủ gian hàng?
- `admin` là admin của gian hàng hay admin nền tảng?
- Chủ xe có 1 xe và doanh nghiệp có 100 xe nên dùng cùng mô hình hay tách?

### Đề xuất cách hiểu mới

**Chủ xe = Chủ gian hàng ở MVP.**

Lý do:

- Nếu một cá nhân có 1 xe, vẫn có thể coi họ là một “gian hàng cá nhân”.
- Nếu một công ty có nhiều xe, họ là “gian hàng doanh nghiệp”.
- Cả hai đều cần cùng chức năng: quản lý xe, đơn, khách, lịch, chat, thanh toán, nhân viên nếu có.
- Sự khác nhau nằm ở thông tin hồ sơ và quy mô, không cần tách role.

### Role trong scope gian hàng

| Role đề xuất | Tên hiển thị | Quyền |
|---|---|---|
| `shop_owner` | Chủ gian hàng / Chủ xe | Toàn quyền trong gian hàng |
| `shop_manager` | Quản lý gian hàng | Quản lý xe, đơn, khách, nhân viên cơ bản, tài chính theo quyền |
| `shop_staff` | Nhân viên | Xử lý đơn, giao nhận, chat, cập nhật trạng thái |
| `shop_viewer` | Chỉ xem | Xem dữ liệu, không sửa |

Không nên dùng tên `admin` trong gian hàng vì dễ nhầm với `platform_admin`.

### Module trong Host

| Module | Shop Owner | Shop Manager | Shop Staff | Shop Viewer |
|---|---:|---:|---:|---:|
| Dashboard | Có | Có | Có | Có |
| Xe | Toàn quyền | Tạo/sửa/gửi duyệt | Theo quyền | Xem |
| Đơn thuê | Toàn quyền | Toàn quyền vận hành | Xử lý đơn | Xem |
| Khách hàng | Toàn quyền | Tạo/sửa | Xem/sửa hạn chế | Xem |
| Lịch thuê xe | Có | Có | Có | Có |
| Chat | Có | Có | Có | Có |
| Tài chính/Thu chi | Có | Theo quyền | Không hoặc hạn chế | Xem nếu được cấp |
| Nhân viên | Có | Có thể được cấp | Không | Không |
| Hồ sơ gian hàng | Có | Sửa hạn chế | Không | Xem |
| Gửi xe duyệt public | Có | Có thể được cấp | Không hoặc theo quyền | Không |

## 6. Trang Admin / Management Portal - scope nền tảng

### Vấn đề hiện tại

Trang admin hiện có các chức năng như:

- Xem danh sách tenant/gian hàng.
- Gia hạn gói.
- Khóa/mở tenant.
- Ghi chú admin.
- Đếm số xe/đơn.

Nhưng còn thiếu các chức năng quan trọng nếu XePrime là marketplace thật:

- Duyệt mở gian hàng.
- Duyệt xe public.
- Xem xe public toàn hệ thống.
- Giám sát đơn/khách để hỗ trợ.
- Hỗ trợ/reset nhân viên gian hàng.
- Quản lý khiếu nại/tranh chấp.
- Quản lý chất lượng listing.

### Role admin nền tảng

| Role đề xuất | Tên hiển thị | Quyền |
|---|---|---|
| `platform_admin` | Super Admin | Toàn quyền toàn hệ thống |
| `platform_staff` | Nhân viên nền tảng | Quyền vận hành theo module |
| `reviewer` | Nhân viên kiểm duyệt | Duyệt gian hàng, duyệt xe, xử lý nội dung |
| `support` | Nhân viên hỗ trợ | Xem tenant/đơn/khách, hỗ trợ/reset, không đổi gói nếu không được cấp |
| `finance_admin` | Nhân viên tài chính | Quản lý gói, gia hạn, đối soát thanh toán |

Ở MVP có thể chỉ cần:

- `platform_admin`
- `platform_staff`

Sau đó tách nhỏ `reviewer`, `support`, `finance_admin` khi đội vận hành lớn hơn.

### Quyền admin theo mong muốn

| Chức năng | Platform Admin | Platform Staff |
|---|---:|---:|
| Xem xe public | Có | Có |
| Quản lý xe/đơn/khách toàn hệ thống | Có | Giám sát/hỗ trợ |
| Quản lý nhân viên gian hàng | Có | Hỗ trợ/reset nếu được cấp |
| Duyệt mở gian hàng | Có | Có nếu là reviewer |
| Duyệt xe public | Có | Có nếu là reviewer |
| Khóa/mở tenant | Có | Theo quyền |
| Quản lý gói/gia hạn | Có | Theo quyền finance |
| Xem log/audit | Có | Theo quyền |
| Impersonate/xem như chủ gian hàng | Có, có audit | Hạn chế, có audit |

## 7. Có nên tách Chủ xe và Chủ gian hàng thành 2 role?

### Khuyến nghị: Không tách ở MVP

Nên dùng một role:

```text
shop_owner
```

Tên hiển thị có thể linh hoạt:

- Nếu tenant type là `individual`: hiển thị “Chủ xe”.
- Nếu tenant type là `business`: hiển thị “Chủ gian hàng”.

Như vậy không cần tạo 2 role khác nhau. Chỉ cần tạo field:

```text
tenantType = individual | business
```

### Vì sao không nên tách?

| Lý do | Giải thích |
|---|---|
| Quyền gần như giống nhau | Chủ xe 1 xe và chủ gian hàng nhiều xe đều cần toàn quyền trong tenant |
| Tránh tăng độ phức tạp | Nếu tách role, mỗi màn phải xử lý thêm logic mà không có lợi rõ ràng |
| Dễ scale | Một cá nhân ban đầu có 1 xe, sau có 10 xe thì không cần đổi role |
| Dễ hiểu | “Bạn là chủ gian hàng của mình, dù gian hàng có 1 xe hay nhiều xe” |

### Khi nào mới cần tách?

Chỉ nên thêm role hoặc entity riêng khi có mô hình:

> Một người sở hữu xe nhưng không tự vận hành, gửi xe cho một gian hàng/doanh nghiệp quản lý hộ.

Khi đó cần thêm:

```text
vehicle_owner
```

Nhưng đây nên là role/portal giai đoạn sau, không nên đưa vào MVP.

## 8. Mô hình dữ liệu nên dùng

### Tenant / Gian hàng

```text
Tenant
- id
- name
- slug
- tenantType: individual | business
- ownerUserId
- status: pending_review | active | rejected | suspended
- plan
- expiredAt
- approvedAt
- approvedBy
- rejectedReason
- suspendedReason
```

### User / Membership

```text
User
- id
- phone
- email
- displayName
- type: customer | operator | platform
```

```text
TenantMembership
- tenantId
- userId
- role: shop_owner | shop_manager | shop_staff | shop_viewer
- status: active | disabled
```

### Platform user

```text
PlatformMembership
- userId
- role: platform_admin | platform_staff | reviewer | support | finance_admin
- permissions[]
- status
```

### Vehicle / Xe

```text
Vehicle
- id
- tenantId
- ownerType: tenant | external_owner
- title
- plateNumber
- publicStatus: draft | pending_review | published | rejected | hidden
- reviewNote
- submittedAt
- reviewedAt
- reviewedBy
```

### Public listing

```text
PublicListing
- id
- tenantId
- shopSlug
- vehicleId
- snapshotPublicFields
- status: published | hidden
```

Chỉ tạo/cập nhật `PublicListing` khi:

```text
tenant.status = active
vehicle.publicStatus = published
```

## 9. Luồng đăng ký và duyệt gian hàng

### Luồng đề xuất

1. Người cho thuê/chủ xe đăng ký tài khoản.
2. Hệ thống tạo tenant/gian hàng ở trạng thái `pending_review`.
3. Chủ xe vào Management Portal nhưng chỉ thấy checklist hoàn thiện hồ sơ.
4. Admin nền tảng xem hàng chờ duyệt gian hàng.
5. Admin duyệt hoặc từ chối:
   - Nếu duyệt: tenant chuyển `active`.
   - Nếu từ chối: tenant chuyển `rejected`, lưu lý do.
6. Khi tenant active, chủ gian hàng được thêm xe và gửi xe duyệt public.

### Vì sao cần duyệt gian hàng?

- Tránh gian hàng ảo.
- Kiểm soát chất lượng marketplace.
- Tránh tên/slug mạo danh.
- Tạo cơ chế khóa/mở rõ ràng.
- Phù hợp mô hình có gói cước.

## 10. Luồng đăng xe và duyệt public

### Luồng hiện tại

Hiện chủ xe có thể bật `congKhai`, sau đó Cloud Function đồng bộ xe sang `public_listings`.

Vấn đề:

- Không có admin duyệt xe.
- Không có trạng thái chờ duyệt.
- Nếu thông tin xe/ảnh/giá không đạt chất lượng vẫn có thể public.

### Luồng đề xuất

1. Chủ gian hàng/nhân viên tạo xe: `draft`.
2. Khi đủ thông tin, bấm “Gửi duyệt public”: `pending_review`.
3. Admin nền tảng/reviewer kiểm tra.
4. Nếu đạt: `published`, hệ thống tạo `public_listings`.
5. Nếu không đạt: `rejected`, trả lý do để chủ gian hàng sửa.
6. Nếu vi phạm sau khi đã public: admin có thể chuyển `hidden` hoặc tenant `suspended`.

### Điều kiện publish

```text
tenant.status == active
vehicle.publicStatus == published
vehicle.hasMainImage == true
vehicle.hasEnoughImages == true
vehicle.hasPrice == true
vehicle.hasLocation == true
```

## 11. Gợi ý cấu trúc menu nếu gộp Host/Admin

### Menu cho Shop Owner / Shop Manager

```text
Tổng quan
- Dashboard
- Lịch thuê xe

Vận hành
- Xe
- Đơn thuê
- Đơn đặt xe
- Khách hàng
- Trò chuyện

Tài chính
- Tài chính
- Thu chi
- Công nợ

Cài đặt gian hàng
- Hồ sơ gian hàng
- Chi nhánh / khu vực nhận xe
- Người dùng
- Vai trò
- Gói cước
```

### Menu cho Platform Admin

```text
Tổng quan nền tảng
- Dashboard hệ thống
- Gian hàng
- Chủ xe / Chủ gian hàng

Kiểm duyệt
- Duyệt mở gian hàng
- Duyệt xe public
- Báo cáo vi phạm

Giám sát
- Xe public
- Đơn thuê
- Khách hàng
- Chat / khiếu nại

Quản trị
- Gói cước
- Thanh toán / gia hạn
- Nhân viên nền tảng
- Log / audit
- Cấu hình hệ thống
```

### Cùng route, khác scope

Ví dụ:

| Route | Shop Owner thấy | Platform Admin thấy |
|---|---|---|
| `/manage/vehicles` | Xe của gian hàng mình | Xe toàn hệ thống |
| `/manage/bookings` | Đơn của gian hàng mình | Đơn toàn hệ thống |
| `/manage/customers` | Khách từng thuê của gian hàng mình | Khách toàn hệ thống hoặc theo tenant |
| `/manage/users` | Nhân viên gian hàng mình | User/nhân sự toàn hệ thống |
| `/manage/shops` | Hồ sơ gian hàng mình | Tất cả gian hàng |
| `/manage/reviews/shops` | Không thấy hoặc chỉ thấy trạng thái của mình | Hàng chờ duyệt gian hàng |
| `/manage/reviews/vehicles` | Xe mình đang chờ duyệt | Hàng chờ duyệt xe |

## 12. Ma trận quyền tổng quát

| Chức năng | Customer | Shop Owner | Shop Manager | Shop Staff | Platform Admin | Platform Staff |
|---|---:|---:|---:|---:|---:|---:|
| Xem marketplace | Có | Có | Có | Có | Có | Có |
| Đặt xe | Có | Không | Không | Không | Không | Không |
| Chat thuê xe | Có | Có | Có | Có | Giám sát khi cần | Hỗ trợ khi cần |
| Quản lý xe tenant | Không | Có | Có | Theo quyền | Giám sát/toàn quyền | Theo quyền |
| Gửi xe duyệt public | Không | Có | Có thể | Theo quyền | Không cần | Không cần |
| Duyệt xe public | Không | Không | Không | Không | Có | Theo quyền |
| Quản lý đơn tenant | Không | Có | Có | Theo quyền | Giám sát/toàn quyền | Theo quyền |
| Quản lý khách tenant | Không | Có | Có | Theo quyền | Giám sát/toàn quyền | Theo quyền |
| Quản lý nhân viên gian hàng | Không | Có | Có thể | Không | Hỗ trợ/reset | Theo quyền |
| Duyệt mở gian hàng | Không | Không | Không | Không | Có | Theo quyền |
| Khóa/mở tenant | Không | Không | Không | Không | Có | Theo quyền |
| Gia hạn/quản lý gói | Không | Xem gói của mình | Không | Không | Có | Theo quyền |
| Xem log/audit | Không | Tenant của mình | Tenant của mình nếu được cấp | Không | Toàn hệ thống | Theo quyền |

## 13. Các vấn đề cần sửa trong source hiện tại

| Vấn đề | Mức độ | Cách sửa |
|---|---|---|
| Role `admin` trong tenant dễ nhầm với admin nền tảng | Cao | Đổi label thành “Quản lý gian hàng”, về sau đổi code thành `shop_manager` |
| Trang admin quá ít chức năng | Cao | Gộp vào Management Portal và thêm module duyệt/giam sát |
| Chủ xe tự public xe không qua duyệt | Cao | Thêm `publicStatus` và queue duyệt xe |
| Đăng ký tenant có thể active ngay | Cao | Thêm `tenant.status = pending_review` trước khi admin duyệt |
| Firestore rules đang cho member tenant ghi rộng | Cao | Khi lên NestJS, enforce RBAC ở backend; trước mắt siết rules theo role |
| Chưa có trang gian hàng public theo slug | Trung bình | Thêm `/shops/[slug]` |
| Chưa rõ cá nhân 1 xe và doanh nghiệp nhiều xe | Trung bình | Dùng chung `shop_owner`, phân biệt bằng `tenantType` |

## 14. Kết luận cuối

Nên thiết kế lại theo hướng:

```text
Trang chủ thuê xe
  -> dành cho customer/public

Management Portal
  -> nếu user là shop_owner/shop_manager/shop_staff: scope gian hàng
  -> nếu user là platform_admin/platform_staff: scope nền tảng
```

Về nghiệp vụ:

- **Chủ xe và chủ gian hàng nên là một role ở MVP**: `shop_owner`.
- Phân biệt cá nhân/doanh nghiệp bằng `tenantType`, không bằng role.
- Chỉ khi có mô hình ký gửi xe cho người khác quản lý hộ mới thêm `vehicle_owner`.
- Admin nền tảng phải có quyền duyệt mở gian hàng và duyệt xe public.
- Host và Admin nên dùng chung nền tảng quản lý để tránh trùng màn, trùng logic và rối quyền.

Đây là hướng đơn giản hơn, đúng với ý tưởng sản phẩm hơn và dễ clone sang Next.js/NestJS hơn.
