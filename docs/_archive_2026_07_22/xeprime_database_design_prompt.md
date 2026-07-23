# Prompt thiết kế DB/ERD/Prisma cho XePrime

Dùng prompt này sau khi đã đọc tài liệu:

- `docs/xeprime_screen_spec_by_role_before_db.docx`
- `docs/xeprime_database_design.docx`

## Prompt tổng

Bạn là senior backend architect chuyên thiết kế hệ thống SaaS multi-tenant bằng NestJS, Next.js, MySQL 8 và Prisma.

Hãy thiết kế database chi tiết cho dự án XePrime, một nền tảng cho thuê xe có 3 trải nghiệm chính:

1. Marketplace cho khách thuê xe.
2. Public shop `/shops/[slug]` cho từng chủ xe/gian hàng.
3. Management Portal dùng chung cho chủ gian hàng và admin nền tảng, phân quyền theo scope.

Yêu cầu nghiệp vụ đã chốt:

- Chủ xe và chủ gian hàng ở MVP dùng chung role `shop_owner`.
- Phân biệt cá nhân/doanh nghiệp bằng `tenant_type = individual | business`, không tách role.
- Role mục tiêu gồm:
  - `customer`
  - `shop_owner`
  - `shop_manager`
  - `shop_staff`
  - `shop_viewer`
  - `platform_admin`
  - `platform_staff`
  - có thể mở rộng `reviewer`, `support`, `finance_admin`.
- Host và Admin dùng chung Management Portal nhưng khác scope:
  - tenant scope chỉ thấy dữ liệu gian hàng của mình.
  - platform scope thấy toàn hệ thống hoặc dữ liệu được phân quyền.
- Admin nền tảng phải có:
  - duyệt mở gian hàng
  - duyệt xe public
  - khóa/mở tenant
  - quản lý gói/hạn dùng
  - quản lý xe/đơn/khách toàn hệ thống
  - hỗ trợ/reset nhân viên gian hàng
  - chat/khiếu nại
  - audit log
  - báo cáo nền tảng.
- Auth:
  - hỗ trợ Google/Facebook login.
  - chỉ bắt xác thực SĐT khi khách gửi yêu cầu đặt xe.
  - chủ shop phải xác thực SĐT khi gửi hồ sơ mở gian hàng hoặc gửi xe duyệt public.
- Firebase:
  - giữ Firebase Auth provider nếu phù hợp.
  - giữ Firestore cho chat realtime gần nhất.
  - MySQL là nguồn chính cho metadata, archive, audit, booking, finance.
  - Firebase Storage hoặc object storage lưu file/ảnh.

Hãy tạo thiết kế database chi tiết theo các yêu cầu sau:

1. Dùng MySQL 8.
2. Dùng Prisma schema làm output chính.
3. Dùng `snake_case` cho bảng/cột trong DB, nhưng Prisma model có thể dùng PascalCase và `@@map`.
4. Dùng `id` dạng `String @id`, khuyến nghị ULID/UUID.
5. Mọi bảng tenant business phải có `tenant_id`.
6. Có đầy đủ `created_at`, `updated_at`, `deleted_at` ở bảng cần soft delete.
7. Không dùng MySQL enum cứng nếu không cần; ưu tiên string status để dễ migrate.
8. Thiết kế index rõ cho marketplace search, booking availability, tenant dashboard và platform admin.
9. Có quan hệ rõ giữa:
   - users
   - tenants
   - tenant_memberships
   - platform_memberships
   - roles
   - permissions
   - vehicles
   - public_listings
   - booking_requests
   - bookings
   - customers
   - tenant_customers
   - receipts/payments
   - conversations/message_archive
   - approval_tasks/audit_logs.
10. Thiết kế để migrate được từ Firestore hiện tại.

Output mong muốn:

1. ERD mô tả bằng Mermaid.
2. Prisma schema đầy đủ theo từng module.
3. Danh sách bảng theo module và giải thích ngắn.
4. Danh sách index quan trọng.
5. Danh sách foreign key quan trọng.
6. Enum/status dạng constant TypeScript.
7. Gợi ý NestJS modules tương ứng.
8. Gợi ý thứ tự migration từ Firebase sang MySQL.
9. Các điểm cần hỏi lại trước khi code nếu còn mơ hồ.

## Prompt sinh Prisma schema

Dựa trên tài liệu thiết kế database XePrime, hãy sinh file `schema.prisma` cho MySQL 8.

Yêu cầu:

- Prisma models dùng PascalCase.
- DB table dùng snake_case với `@@map`.
- DB column dùng snake_case với `@map`.
- Có model cho các module:
  - User/Auth
  - Tenant/Shop
  - RBAC
  - Platform Admin
  - Approval
  - Branch/Pickup/Delivery
  - Vehicle/PublicListing
  - Customer
  - BookingRequest/Booking
  - Finance/Receipt/Payment/Debt
  - Driver
  - Chat
  - Notification
  - Review
  - Plan/Subscription
  - Audit/Trash/Compliance
- Có `@@index` và `@@unique` cho các query chính.
- Có relation đầy đủ nhưng không quá phức tạp gây vòng lặp khó maintain.
- Các field JSON dùng `Json?`.
- Các field tiền dùng `Decimal @db.Decimal(14, 2)`.
- Các timestamp dùng `DateTime`.
- ID dùng `String @id @db.Char(26)`.

Sau khi sinh schema, hãy giải thích:

1. Vì sao tách `booking_requests` và `bookings`.
2. Vì sao tách `customers` và `tenant_customers`.
3. Vì sao `public_listings` là snapshot riêng.
4. Vì sao chat dùng hybrid Firestore + MySQL.
5. Những bảng nào có thể để phase sau.

## Prompt sinh ERD

Dựa trên tài liệu thiết kế database XePrime, hãy vẽ ERD bằng Mermaid.

Yêu cầu:

- Chia ERD thành 4 sơ đồ nhỏ để dễ đọc:
  1. User/RBAC/Tenant.
  2. Vehicle/Listing/Approval.
  3. Booking/Customer/Finance.
  4. Chat/Notification/Audit/Admin.
- Mỗi sơ đồ chỉ hiển thị cột chính và quan hệ chính.
- Không nhồi toàn bộ cột phụ vào Mermaid.
- Sau mỗi sơ đồ, giải thích quan hệ chính bằng bullet ngắn.

## Prompt sinh migration plan từ Firebase

Dựa trên source Firebase-code hiện tại và tài liệu DB XePrime, hãy viết kế hoạch migration dữ liệu từ Firestore sang MySQL.

Firestore hiện tại có các collection chính:

- `tenants/{tenantId}`
- `tenants/{tenantId}/users`
- `memberships`
- `tenants/{tenantId}/roles`
- `tenants/{tenantId}/xe`
- `public_listings`
- `tenants/{tenantId}/don`
- `booking_requests`
- `tenants/{tenantId}/khach`
- `tenants/{tenantId}/taiXe`
- `tenants/{tenantId}/thuChi`
- `tenants/{tenantId}/nangCap`
- `tenants/{tenantId}/xeKhoa`
- `tenants/{tenantId}/chiNhanh`
- `tenants/{tenantId}/khuVuc`
- `tenants/{tenantId}/phatNguoi`
- `conversations`
- `conversations/{id}/messages`
- `reviews`
- `tenants/{tenantId}/thongBao`
- `fcmTokens`
- `trash`, `deleteLog`, `activityLog`, `dataDeletionRequests`

Hãy output:

1. Mapping Firestore -> MySQL chi tiết.
2. Thứ tự migrate an toàn.
3. Cách xử lý ID cũ và ID mới.
4. Cách migrate ảnh/file chỉ bằng URL.
5. Cách migrate role `owner/admin/staff/viewer` sang `shop_owner/shop_manager/shop_staff/shop_viewer`.
6. Cách migrate `congKhai` sang `public_status`.
7. Script pseudo-code Node.js theo batch.
8. Checklist verify sau migration.

## Prompt sinh NestJS module design

Dựa trên tài liệu database XePrime, hãy thiết kế module backend NestJS.

Yêu cầu output:

1. Danh sách module:
   - AuthModule
   - UsersModule
   - TenantsModule
   - RbacModule
   - PlatformAdminModule
   - ApprovalModule
   - VehiclesModule
   - ListingsModule
   - BookingRequestsModule
   - BookingsModule
   - CustomersModule
   - FinanceModule
   - ChatModule
   - NotificationsModule
   - ReviewsModule
   - PlansModule
   - AuditModule
2. Mỗi module có:
   - controller routes
   - service chính
   - guards/policies
   - tables dùng
   - events phát ra.
3. Thiết kế guard:
   - Firebase/Auth guard
   - tenant scope guard
   - platform scope guard
   - permission guard.
4. Thiết kế transaction cho:
   - tạo booking request
   - approve booking request -> create booking
   - submit vehicle public review
   - approve vehicle public
   - suspend tenant.

## Prompt rà soát thiết kế

Hãy review thiết kế database XePrime dưới góc nhìn senior architect.

Tập trung tìm:

1. Bảng thừa hoặc thiếu.
2. Quan hệ sai hoặc dễ gây trùng dữ liệu.
3. Index thiếu cho marketplace search và booking availability.
4. Rủi ro multi-tenant data leak.
5. Rủi ro bảo mật PII như CCCD/GPLX/SĐT.
6. Rủi ro chat Firestore tốn phí.
7. Rủi ro migration từ Firebase.
8. Các bảng nên đưa vào phase sau để MVP nhẹ hơn.

Output theo format:

- Findings theo severity: High, Medium, Low.
- Đề xuất chỉnh schema.
- Câu hỏi cần chốt với product owner.
- Checklist trước khi triển khai.
