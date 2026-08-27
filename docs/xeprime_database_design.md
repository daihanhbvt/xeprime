# XePrime - Tài liệu thiết kế Database cho Next.js + NestJS

Ngày cập nhật: 22/07/2026

Tài liệu này được thiết kế dựa trên file:

`docs/xeprime_screen_spec_by_role_before_db.docx`

Mục tiêu là chốt thiết kế database MySQL trước khi bước sang thiết kế ERD chi tiết, Prisma schema, NestJS modules và migration từ Firebase-code hiện tại.

## 1. Kết luận thiết kế

Database chính nên dùng **MySQL 8** làm nguồn dữ liệu nghiệp vụ. Firebase chỉ nên giữ các phần có lợi thế rõ:

| Phần | Nguồn chính | Ghi chú |
| --- | --- | --- |
| User, role, tenant, xe, đơn, tài chính, duyệt, audit | MySQL | Nguồn dữ liệu chuẩn |
| Auth provider Google/Facebook/phone | Firebase Auth hoặc Auth.js + Firebase custom token | Lưu mapping trong MySQL |
| Chat realtime gần nhất | Firestore | Chỉ giữ recent messages, unread, listener |
| Chat metadata/archive/audit | MySQL | Dễ query, backup, support, report |
| Ảnh xe, giấy tờ, file chat, bill | Firebase Storage hoặc object storage | MySQL chỉ lưu URL/metadata |
| Push notification | FCM | MySQL lưu notification log |

Nguyên tắc lớn:

1. Không bê nguyên cấu trúc Firestore sang MySQL.
2. Không để frontend ghi trực tiếp nghiệp vụ quan trọng.
3. Tất cả thao tác có rủi ro phải đi qua NestJS API.
4. Mọi bảng nghiệp vụ của gian hàng phải có `tenant_id`.
5. Admin nền tảng dùng scope riêng, không nhầm với quản lý gian hàng.
6. Chủ xe và chủ gian hàng ở MVP là một role `shop_owner`.

## 2. Công nghệ và convention

### 2.1 Stack đề xuất

| Thành phần | Đề xuất |
| --- | --- |
| Database | MySQL 8 |
| ORM | Prisma, hoặc TypeORM nếu team quen NestJS classic |
| Backend | NestJS modular monolith |
| Frontend | Next.js |
| Auth | Firebase Auth provider + MySQL user profile |
| File | Firebase Storage giai đoạn đầu |
| Chat | Firestore realtime + MySQL metadata/archive |
| Migration | Script Node.js đọc Firestore, ghi MySQL theo batch |

Khuyến nghị ORM: **Prisma** vì dễ đọc schema, migration rõ, hợp với team chưa quá rành backend.

### 2.2 Quy ước đặt tên

| Loại | Quy ước |
| --- | --- |
| Table | snake_case, số nhiều: `users`, `vehicles`, `booking_requests` |
| Column | snake_case: `tenant_id`, `created_at` |
| Primary key | `id` |
| Foreign key | `{table_singular}_id`, ví dụ `tenant_id`, `vehicle_id` |
| Status | varchar enum logic, không dùng MySQL enum ở giai đoạn đầu |
| Money | `decimal(14,2)` hoặc integer VND nếu chỉ dùng VND |
| Timestamp | `created_at`, `updated_at`, `deleted_at` |
| Audit | `created_by`, `updated_by`, `deleted_by` nếu cần |

### 2.3 Kiểu ID

Đề xuất dùng `char(26)` ULID hoặc `char(36)` UUID.

| Lựa chọn | Ưu điểm | Khuyến nghị |
| --- | --- | --- |
| ULID `char(26)` | Sort theo thời gian, ngắn hơn UUID | Tốt nhất |
| UUID `char(36)` | Phổ biến, dễ dùng | Chấp nhận được |
| Auto increment | Dễ đọc | Không nên dùng cho toàn bộ vì migration/multi-tenant khó hơn |

Tài liệu này dùng tên cột `id` trung lập, có thể triển khai bằng ULID hoặc UUID.

## 3. Multi-tenant và phân quyền dữ liệu

### 3.1 Scope dữ liệu

| Scope | Ý nghĩa | Ví dụ bảng |
| --- | --- | --- |
| Global | Dữ liệu dùng toàn hệ thống | `users`, `permissions`, `plans` |
| Tenant | Dữ liệu thuộc một gian hàng | `vehicles`, `bookings`, `branches` |
| Platform | Dữ liệu quản trị nền tảng | `platform_memberships`, `approval_tasks`, `audit_logs` |
| Hybrid | Dữ liệu có cả tenant và customer | `booking_requests`, `conversations`, `reviews` |

### 3.2 Rule bắt buộc

Mọi bảng tenant phải có:

| Cột | Mục đích |
| --- | --- |
| `tenant_id` | Khoanh vùng dữ liệu |
| `created_at` | Audit cơ bản |
| `updated_at` | Audit cơ bản |
| `deleted_at` | Soft delete nếu dữ liệu quan trọng |

Các API của shop roles luôn filter theo `tenant_id` lấy từ membership/session, không lấy từ body client gửi lên.

## 4. Nhóm bảng Auth và User

### 4.1 `users`

Lưu một người dùng toàn hệ thống. Một user có thể là customer, shop owner, nhân viên shop hoặc platform staff.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `firebase_uid` | varchar(128), unique nullable | UID Firebase nếu dùng Firebase Auth |
| `email` | varchar(255), nullable | Email chính |
| `email_verified_at` | datetime nullable | Xác thực email |
| `phone` | varchar(30), nullable | SĐT chuẩn E.164 |
| `phone_verified_at` | datetime nullable | Chỉ bắt khi đặt xe/mở shop/public xe |
| `display_name` | varchar(255) | Tên hiển thị |
| `avatar_url` | text nullable | Ảnh đại diện |
| `status` | varchar(50) | `active`, `locked`, `deleted` |
| `last_login_at` | datetime nullable | Lần login gần nhất |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |
| `deleted_at` | datetime nullable | Soft delete |

Index:

| Index | Cột |
| --- | --- |
| unique | `firebase_uid` |
| unique nullable | `email` |
| unique nullable | `phone` |
| normal | `status` |

### 4.2 `user_identities`

Mapping user với provider đăng nhập.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `user_id` | char(26) | FK `users.id` |
| `provider` | varchar(50) | `google`, `facebook`, `firebase_phone`, `password`, `custom_token` |
| `provider_user_id` | varchar(255) | ID từ provider |
| `provider_email` | varchar(255) nullable | Email từ provider |
| `provider_phone` | varchar(30) nullable | Phone từ provider |
| `raw_profile_json` | json nullable | Lưu tối thiểu, tránh nhạy cảm |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

Index:

| Index | Cột |
| --- | --- |
| unique | `provider`, `provider_user_id` |
| normal | `user_id` |

### 4.3 `phone_verifications`

Lưu luồng xác thực SĐT.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `user_id` | char(26) nullable | Có thể chưa có user lúc gửi OTP |
| `phone` | varchar(30) | E.164 |
| `purpose` | varchar(50) | `booking`, `shop_register`, `vehicle_public`, `password_reset` |
| `provider` | varchar(50) | `firebase`, `esms`, `manual` |
| `otp_hash` | varchar(255) nullable | Nếu tự gửi OTP |
| `status` | varchar(50) | `pending`, `verified`, `expired`, `failed` |
| `sent_count` | int | Chống spam |
| `expires_at` | datetime |  |
| `verified_at` | datetime nullable |  |
| `created_at` | datetime |  |

Rule:

| Luồng | Cần xác thực SĐT |
| --- | --- |
| Khách chỉ xem xe | Không |
| Khách chat/lưu xe | Không bắt buộc |
| Khách gửi booking request | Có |
| Chủ shop gửi hồ sơ mở shop | Có |
| Chủ shop gửi xe duyệt public | Có nếu chưa verify |

## 5. Nhóm bảng Tenant/Shop

### 5.1 `tenants`

Gian hàng/đơn vị cho thuê. Cá nhân 1 xe cũng là một tenant.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `code` | varchar(50), unique | Mã nội bộ |
| `slug` | varchar(120), unique | Public URL `/shops/[slug]` |
| `name` | varchar(255) | Tên gian hàng |
| `tenant_type` | varchar(50) | `individual`, `business` |
| `status` | varchar(50) | `draft`, `pending_review`, `needs_revision`, `active`, `suspended`, `rejected`, `expired` |
| `owner_user_id` | char(26) | FK `users.id` |
| `phone` | varchar(30) nullable | SĐT gian hàng |
| `email` | varchar(255) nullable | Email liên hệ |
| `public_phone` | varchar(30) nullable | SĐT hiển thị nếu cho phép |
| `zalo_url` | text nullable | Link Zalo |
| `rating_avg` | decimal(3,2) default 0 | Tổng hợp rating |
| `rating_count` | int default 0 | Tổng số review |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |
| `deleted_at` | datetime nullable |  |

Index:

| Index | Cột |
| --- | --- |
| unique | `slug` |
| normal | `status` |
| normal | `owner_user_id` |
| normal | `tenant_type` |

### 5.2 `tenant_profiles`

Thông tin hồ sơ public và cấu hình gian hàng.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `tenant_id` | char(26) | PK/FK `tenants.id` |
| `display_name` | varchar(255) | Tên public |
| `bio` | text nullable | Mô tả |
| `logo_url` | text nullable | Logo |
| `cover_url` | text nullable | Ảnh bìa |
| `address` | text nullable | Địa chỉ chính |
| `province_code` | varchar(50) nullable | Mã tỉnh |
| `province_name` | varchar(100) nullable | Tên tỉnh |
| `tax_code` | varchar(50) nullable | MST nếu business |
| `business_license_no` | varchar(100) nullable | GPKD |
| `bank_name` | varchar(100) nullable | Ngân hàng nhận tiền |
| `bank_account_no` | varchar(100) nullable | STK |
| `bank_account_name` | varchar(255) nullable | Chủ tài khoản |
| `qr_url` | text nullable | QR thanh toán |
| `settings_json` | json nullable | Cấu hình nhỏ chưa tách bảng |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

### 5.3 `tenant_documents`

Giấy tờ mở gian hàng.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) | FK |
| `document_type` | varchar(50) | `cccd_front`, `cccd_back`, `business_license`, `contract`, `other` |
| `file_url` | text | Storage URL |
| `status` | varchar(50) | `pending`, `approved`, `rejected` |
| `reject_reason` | text nullable | Lý do từ chối |
| `uploaded_by` | char(26) nullable | FK users |
| `reviewed_by` | char(26) nullable | FK users |
| `reviewed_at` | datetime nullable |  |
| `created_at` | datetime |  |

### 5.4 `tenant_memberships`

User thuộc một tenant với role trong gian hàng.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) | FK |
| `user_id` | char(26) | FK |
| `role_key` | varchar(50) | `shop_owner`, `shop_manager`, `shop_staff`, `shop_viewer` |
| `role_id` | char(26) nullable | Custom role nếu có |
| `status` | varchar(50) | `active`, `invited`, `locked`, `removed` |
| `display_name_in_tenant` | varchar(255) nullable | Tên nội bộ |
| `invited_by` | char(26) nullable | FK users |
| `joined_at` | datetime nullable |  |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

Index:

| Index | Cột |
| --- | --- |
| unique | `tenant_id`, `user_id` |
| normal | `user_id` |
| normal | `tenant_id`, `role_key` |

### 5.5 `tenant_invites`

Mời nhân viên vào gian hàng.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) | FK |
| `email` | varchar(255) nullable |  |
| `phone` | varchar(30) nullable |  |
| `role_key` | varchar(50) | Role được mời |
| `token_hash` | varchar(255) | Token invite |
| `status` | varchar(50) | `pending`, `accepted`, `expired`, `revoked` |
| `expires_at` | datetime |  |
| `created_by` | char(26) | FK users |
| `accepted_by` | char(26) nullable | FK users |
| `created_at` | datetime |  |

## 6. RBAC và Platform Admin

### 6.1 `roles`

Role hệ thống hoặc custom theo tenant.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `scope` | varchar(50) | `tenant`, `platform` |
| `tenant_id` | char(26) nullable | Null nếu role platform/system |
| `key` | varchar(80) | `shop_owner`, `platform_admin`, custom key |
| `name` | varchar(255) | Tên hiển thị |
| `is_system` | boolean | Role hệ thống không xóa |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

### 6.2 `permissions`

Danh sách quyền chuẩn.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `key` | varchar(120), unique | Ví dụ `vehicles.create`, `bookings.approve` |
| `name` | varchar(255) | Tên hiển thị |
| `module` | varchar(80) | `vehicles`, `bookings`, `finance`, `platform` |
| `scope` | varchar(50) | `tenant`, `platform`, `both` |
| `created_at` | datetime |  |

### 6.3 `role_permissions`

| Column | Type gợi ý |
| --- | --- |
| `role_id` | char(26) |
| `permission_id` | char(26) |

Unique: `role_id`, `permission_id`.

### 6.4 `platform_memberships`

User là nhân viên nền tảng.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `user_id` | char(26) | FK |
| `role_key` | varchar(50) | `platform_admin`, `platform_staff`, `reviewer`, `support`, `finance_admin` |
| `role_id` | char(26) nullable | Custom role |
| `status` | varchar(50) | `active`, `locked`, `removed` |
| `created_by` | char(26) nullable | Ai cấp quyền |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

Unique: `user_id`, `role_key`.

## 7. Duyệt gian hàng, duyệt xe, admin notes

### 7.1 `approval_tasks`

Dùng chung cho duyệt mở gian hàng, duyệt xe public, duyệt giấy tờ.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) nullable | Có nếu liên quan shop |
| `target_type` | varchar(50) | `tenant`, `vehicle`, `tenant_document`, `vehicle_document` |
| `target_id` | char(26) | ID đối tượng |
| `status` | varchar(50) | `pending`, `approved`, `rejected`, `needs_revision`, `cancelled` |
| `submitted_by` | char(26) | FK users |
| `submitted_at` | datetime |  |
| `reviewed_by` | char(26) nullable | FK platform user |
| `reviewed_at` | datetime nullable |  |
| `reason` | text nullable | Lý do reject/needs_revision |
| `snapshot_json` | json nullable | Snapshot lúc gửi duyệt |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

Index:

| Index | Cột |
| --- | --- |
| normal | `status`, `target_type` |
| normal | `tenant_id`, `status` |
| normal | `target_type`, `target_id` |

### 7.2 `approval_logs`

Lịch sử từng bước duyệt.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `approval_task_id` | char(26) |
| `action` | varchar(50) |
| `from_status` | varchar(50) nullable |
| `to_status` | varchar(50) |
| `note` | text nullable |
| `actor_user_id` | char(26) |
| `created_at` | datetime |

### 7.3 `admin_notes`

Ghi chú nội bộ của admin/support.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `target_type` | varchar(50) | `tenant`, `vehicle`, `booking`, `customer`, `conversation` |
| `target_id` | char(26) |  |
| `tenant_id` | char(26) nullable |  |
| `note` | text |  |
| `visibility` | varchar(50) | `platform_only`, `tenant_internal` |
| `created_by` | char(26) | FK users |
| `created_at` | datetime |  |

## 8. Chi nhánh, khu vực nhận xe, chính sách giao xe

### 8.1 `branches`

Thay cho `tenants/{tenantId}/chiNhanh`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `name` | varchar(255) |
| `phone` | varchar(30) nullable |
| `province_code` | varchar(50) nullable |
| `province_name` | varchar(100) nullable |
| `address` | text nullable |
| `lat` | decimal(10,7) nullable |
| `lng` | decimal(10,7) nullable |
| `is_default` | boolean |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

Index: `tenant_id`, `province_code`, `status`.

### 8.2 `pickup_areas`

Thay cho `khuVuc`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `name` | varchar(255) |
| `address` | text nullable |
| `branch_id` | char(26) nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |

### 8.3 `delivery_policies`

Cấu hình giao xe tận nơi cấp tenant hoặc vehicle.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) | FK |
| `vehicle_id` | char(26) nullable | Null nếu policy cấp tenant |
| `enabled` | boolean |  |
| `free_radius_km` | decimal(8,2) nullable | Miễn phí trong bán kính |
| `max_radius_km` | decimal(8,2) nullable | Giới hạn giao |
| `fee_per_km` | decimal(14,2) nullable | Phí/km |
| `fixed_fee` | decimal(14,2) nullable | Phí cố định |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

## 9. Xe và public listing

### 9.1 `vehicles`

Bảng xe nội bộ của gian hàng.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) | FK |
| `branch_id` | char(26) nullable | FK `branches.id` |
| `code` | varchar(80) | Mã xe nội bộ |
| `name` | varchar(255) | Tên xe |
| `plate_number` | varchar(50) nullable | Biển số |
| `vehicle_type` | varchar(50) | `car`, `motorbike` |
| `service_type` | varchar(50) | `self_drive`, `with_driver`, `both`, `long_term` |
| `brand` | varchar(100) nullable | Hãng |
| `model` | varchar(100) nullable | Model |
| `body_type` | varchar(80) nullable | Sedan, SUV, hatchback... |
| `manufacture_year` | int nullable | Năm SX |
| `color` | varchar(80) nullable | Màu |
| `seat_count` | int nullable | Số chỗ |
| `fuel_type` | varchar(50) nullable | Xăng, dầu, điện, hybrid |
| `current_km` | int nullable | Số km hiện tại |
| `operation_status` | varchar(50) | `available`, `renting`, `maintenance`, `inactive` |
| `public_status` | varchar(50) | `draft`, `pending_public_review`, `approved_public`, `needs_revision`, `rejected`, `hidden`, `archived` |
| `description` | text nullable | Mô tả |
| `main_image_url` | text nullable | Ảnh đại diện |
| `owner_type` | varchar(50) | `owned`, `leased`, `cooperated` |
| `commission_percent` | decimal(5,2) nullable | Xe hợp tác |
| `created_by` | char(26) nullable | FK users |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |
| `deleted_at` | datetime nullable |  |

Index:

| Index | Cột |
| --- | --- |
| unique | `tenant_id`, `code` |
| normal | `tenant_id`, `public_status` |
| normal | `tenant_id`, `operation_status` |
| normal | `branch_id` |
| normal | `vehicle_type`, `service_type` |
| normal | `brand`, `model` |

### 9.2 `vehicle_owner_profiles`

Thông tin chủ xe thật trong trường hợp xe thuê lại/hợp tác.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `vehicle_id` | char(26) |
| `owner_name` | varchar(255) |
| `owner_phone` | varchar(30) nullable |
| `owner_id_no` | varchar(100) nullable |
| `contract_urls_json` | json nullable |
| `monthly_payment_amount` | decimal(14,2) nullable |
| `monthly_payment_day` | int nullable |
| `handover_note` | text nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

### 9.3 `vehicle_images`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `vehicle_id` | char(26) |
| `tenant_id` | char(26) |
| `image_url` | text |
| `image_type` | varchar(50) |
| `sort_order` | int |
| `created_at` | datetime |

### 9.4 `vehicle_documents`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `vehicle_id` | char(26) |
| `tenant_id` | char(26) |
| `document_type` | varchar(50) |
| `document_no` | varchar(100) nullable |
| `file_url` | text nullable |
| `issued_at` | date nullable |
| `expires_at` | date nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |

Document types:

| Type | Ý nghĩa |
| --- | --- |
| `registration` | Đăng ký/cà vẹt |
| `insurance` | Bảo hiểm |
| `inspection` | Đăng kiểm |
| `contract` | Hợp đồng xe hợp tác/thuê lại |
| `other` | Khác |

### 9.5 `vehicle_features`

| Column | Type gợi ý |
| --- | --- |
| `vehicle_id` | char(26) |
| `feature_key` | varchar(80) |

Unique: `vehicle_id`, `feature_key`.

### 9.6 `vehicle_pricing`

| Column | Type gợi ý |
| --- | --- |
| `vehicle_id` | char(26) |
| `weekday_price` | decimal(14,2) nullable |
| `weekend_price` | decimal(14,2) nullable |
| `hourly_price` | decimal(14,2) nullable |
| `monthly_price` | decimal(14,2) nullable |
| `default_deposit_amount` | decimal(14,2) nullable |
| `discount_percent` | decimal(5,2) nullable |
| `overtime_fee` | decimal(14,2) nullable |
| `cleaning_fee` | decimal(14,2) nullable |
| `odor_fee` | decimal(14,2) nullable |
| `km_limit_enabled` | boolean |
| `km_limit_per_day` | int nullable |
| `extra_km_fee` | decimal(14,2) nullable |
| `collateral_json` | json nullable |
| `rental_documents_json` | json nullable |
| `updated_at` | datetime |

### 9.7 `vehicle_blocked_ranges`

Thay cho `xeKhoa`, dùng để khóa xe/bảo dưỡng/chặn lịch.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `vehicle_id` | char(26) |
| `start_at` | datetime |
| `end_at` | datetime |
| `reason` | varchar(255) nullable |
| `created_by` | char(26) nullable |
| `created_at` | datetime |

Index: `vehicle_id`, `start_at`, `end_at`.

### 9.8 `vehicle_upgrades`

Thay cho `nangCap`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `vehicle_id` | char(26) |
| `name` | varchar(255) |
| `cost_amount` | decimal(14,2) |
| `date` | date nullable |
| `note` | text nullable |
| `image_urls_json` | json nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

### 9.9 `public_listings`

Bản public của xe đã duyệt, dùng cho Marketplace.

| Column | Type gợi ý | Ghi chú |
| --- | --- | --- |
| `id` | char(26) | PK |
| `tenant_id` | char(26) | FK |
| `vehicle_id` | char(26) | FK |
| `shop_slug` | varchar(120) | Denormalize để route nhanh |
| `title` | varchar(255) | Tên hiển thị |
| `status` | varchar(50) | `active`, `hidden`, `suspended`, `archived` |
| `vehicle_type` | varchar(50) | Search |
| `service_type` | varchar(50) | Search |
| `brand` | varchar(100) nullable | Search |
| `model` | varchar(100) nullable | Search |
| `body_type` | varchar(80) nullable | Search |
| `seat_count` | int nullable | Search |
| `fuel_type` | varchar(50) nullable | Search |
| `province_code` | varchar(50) nullable | Search |
| `province_name` | varchar(100) nullable | Search |
| `branch_id` | char(26) nullable |  |
| `lat` | decimal(10,7) nullable | Search geo |
| `lng` | decimal(10,7) nullable | Search geo |
| `main_image_url` | text nullable |  |
| `weekday_price` | decimal(14,2) nullable | Search/sort |
| `weekend_price` | decimal(14,2) nullable |  |
| `hourly_price` | decimal(14,2) nullable |  |
| `delivery_enabled` | boolean | Filter |
| `no_collateral` | boolean | Filter |
| `discount_percent` | decimal(5,2) nullable | Filter |
| `rating_avg` | decimal(3,2) default 0 | Sort/filter |
| `rating_count` | int default 0 |  |
| `approved_at` | datetime nullable |  |
| `approved_by` | char(26) nullable | FK users |
| `created_at` | datetime |  |
| `updated_at` | datetime |  |

Index quan trọng:

| Index | Cột |
| --- | --- |
| normal | `status`, `vehicle_type`, `service_type` |
| normal | `province_code`, `status` |
| normal | `tenant_id`, `status` |
| normal | `brand`, `model` |
| normal | `weekday_price` |
| normal | `rating_avg`, `rating_count` |

Ghi chú: `public_listings` là snapshot public để Marketplace query nhanh. Khi xe đổi thông tin, nếu đã approved thì có thể yêu cầu duyệt lại phần public.

## 10. Customer và hồ sơ khách

### 10.1 `customers`

Hồ sơ khách thuê toàn hệ thống.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `user_id` | char(26), unique |
| `full_name` | varchar(255) |
| `phone` | varchar(30) nullable |
| `date_of_birth` | date nullable |
| `address` | text nullable |
| `license_no` | varchar(100) nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

### 10.2 `tenant_customers`

Khách trong sổ khách của một gian hàng. Bảng này giúp giữ dữ liệu khách quen theo từng shop nhưng vẫn link về customer global nếu có.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `customer_id` | char(26) nullable |
| `full_name` | varchar(255) |
| `phone` | varchar(30) nullable |
| `id_no` | varchar(100) nullable |
| `license_no` | varchar(100) nullable |
| `address` | text nullable |
| `source` | varchar(80) nullable |
| `note` | text nullable |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

Index: `tenant_id`, `phone`; `tenant_id`, `full_name`.

### 10.3 `customer_documents`

CCCD, GPLX, giấy tờ khách.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `customer_id` | char(26) nullable |
| `tenant_customer_id` | char(26) nullable |
| `tenant_id` | char(26) nullable |
| `document_type` | varchar(50) |
| `file_url` | text |
| `status` | varchar(50) |
| `created_at` | datetime |

Rule bảo mật: mọi lần xem giấy tờ nhạy cảm nên ghi audit nếu là platform/admin.

### 10.4 `customer_notes`

Ghi chú/rủi ro khách, dùng cho tenant hoặc platform.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `customer_id` | char(26) nullable |
| `tenant_customer_id` | char(26) nullable |
| `tenant_id` | char(26) nullable |
| `note_type` | varchar(50) |
| `note` | text |
| `visibility` | varchar(50) |
| `created_by` | char(26) |
| `created_at` | datetime |

## 11. Booking request và đơn thuê

### 11.1 `booking_requests`

Yêu cầu đặt xe từ Marketplace.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `vehicle_id` | char(26) |
| `listing_id` | char(26) |
| `customer_id` | char(26) |
| `customer_user_id` | char(26) |
| `status` | varchar(50) |
| `pickup_at` | datetime |
| `return_at` | datetime |
| `pickup_mode` | varchar(50) |
| `delivery_address` | text nullable |
| `delivery_lat` | decimal(10,7) nullable |
| `delivery_lng` | decimal(10,7) nullable |
| `delivery_distance_km` | decimal(8,2) nullable |
| `delivery_fee` | decimal(14,2) default 0 |
| `estimated_vehicle_amount` | decimal(14,2) nullable |
| `estimated_total_amount` | decimal(14,2) nullable |
| `customer_note` | text nullable |
| `host_reject_reason` | text nullable |
| `approved_by` | char(26) nullable |
| `approved_at` | datetime nullable |
| `converted_booking_id` | char(26) nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

Status:

| Status | Ý nghĩa |
| --- | --- |
| `pending_host_approval` | Chờ chủ shop duyệt |
| `approved_by_host` | Chủ shop đồng ý |
| `rejected_by_host` | Chủ shop từ chối |
| `cancelled_by_customer` | Khách hủy |
| `expired` | Quá thời gian phản hồi |
| `converted_to_booking` | Đã tạo đơn thuê |

Index:

| Index | Cột |
| --- | --- |
| normal | `tenant_id`, `status`, `created_at` |
| normal | `customer_user_id`, `created_at` |
| normal | `vehicle_id`, `pickup_at`, `return_at` |

### 11.2 `bookings`

Đơn thuê thật trong Management Portal.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `booking_request_id` | char(26) nullable |
| `vehicle_id` | char(26) |
| `tenant_customer_id` | char(26) nullable |
| `customer_id` | char(26) nullable |
| `customer_name` | varchar(255) |
| `customer_phone` | varchar(30) nullable |
| `status` | varchar(50) |
| `service_type` | varchar(50) |
| `pickup_at` | datetime |
| `return_at` | datetime |
| `actual_pickup_at` | datetime nullable |
| `actual_return_at` | datetime nullable |
| `pickup_area` | varchar(255) nullable |
| `delivery_address` | text nullable |
| `base_amount` | decimal(14,2) |
| `driver_fee` | decimal(14,2) default 0 |
| `delivery_fee` | decimal(14,2) default 0 |
| `discount_amount` | decimal(14,2) default 0 |
| `total_amount` | decimal(14,2) |
| `paid_amount` | decimal(14,2) default 0 |
| `debt_amount` | decimal(14,2) default 0 |
| `deposit_amount` | decimal(14,2) default 0 |
| `deposit_status` | varchar(50) nullable |
| `deposit_json` | json nullable |
| `km_pickup` | int nullable |
| `km_return` | int nullable |
| `note` | text nullable |
| `created_by` | char(26) nullable |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

Status:

| Status | Ý nghĩa |
| --- | --- |
| `reserved` | Đặt trước |
| `confirmed` | Đã xác nhận |
| `active` | Đang thuê |
| `completed` | Hoàn thành |
| `cancelled` | Hủy |
| `no_show` | Khách không đến |

Index:

| Index | Cột |
| --- | --- |
| normal | `tenant_id`, `status` |
| normal | `vehicle_id`, `pickup_at`, `return_at` |
| normal | `tenant_customer_id` |
| normal | `created_at` |

### 11.3 `booking_status_logs`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `booking_id` | char(26) |
| `from_status` | varchar(50) nullable |
| `to_status` | varchar(50) |
| `note` | text nullable |
| `actor_user_id` | char(26) nullable |
| `created_at` | datetime |

### 11.4 `booking_assignments`

Giao nhân viên/tài xế cho đơn.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `booking_id` | char(26) |
| `assignment_type` | varchar(50) |
| `user_id` | char(26) nullable |
| `driver_id` | char(26) nullable |
| `display_name` | varchar(255) nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |

Assignment type: `handover_staff`, `return_staff`, `driver`.

### 11.5 `booking_photos`

Ảnh giao xe, nhận xe, bill, CCCD/GPLX snapshot.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `booking_id` | char(26) |
| `photo_type` | varchar(50) |
| `file_url` | text |
| `uploaded_by` | char(26) nullable |
| `created_at` | datetime |

### 11.6 `booking_extra_services`

Dịch vụ cộng thêm trong đơn.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `booking_id` | char(26) |
| `name` | varchar(255) |
| `quantity` | int |
| `unit_price` | decimal(14,2) |
| `total_amount` | decimal(14,2) |
| `created_at` | datetime |

### 11.7 `contracts`

Lưu snapshot hợp đồng/phiếu thuê.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `booking_id` | char(26) |
| `contract_no` | varchar(100) |
| `template_version` | varchar(50) |
| `snapshot_json` | json |
| `file_url` | text nullable |
| `signed_at` | datetime nullable |
| `created_at` | datetime |

## 12. Tài chính, thu chi, công nợ

### 12.1 `finance_categories`

Danh mục thu/chi.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `type` | varchar(20) |
| `name` | varchar(255) |
| `is_system` | boolean |
| `created_at` | datetime |

Type: `income`, `expense`.

### 12.2 `receipts`

Thay cho `thuChi`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `receipt_no` | varchar(100) nullable |
| `type` | varchar(20) |
| `category_id` | char(26) nullable |
| `booking_id` | char(26) nullable |
| `vehicle_id` | char(26) nullable |
| `tenant_customer_id` | char(26) nullable |
| `amount` | decimal(14,2) |
| `payment_method` | varchar(50) |
| `reference_code` | varchar(255) nullable |
| `description` | text nullable |
| `status` | varchar(50) |
| `requested_by` | char(26) nullable |
| `approved_by` | char(26) nullable |
| `approved_at` | datetime nullable |
| `cancelled_by` | char(26) nullable |
| `cancelled_at` | datetime nullable |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

Status: `draft`, `pending_approval`, `approved`, `cancelled`.

### 12.3 `receipt_attachments`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `receipt_id` | char(26) |
| `file_url` | text |
| `file_type` | varchar(50) nullable |
| `created_at` | datetime |

### 12.4 `payments`

Giao dịch thanh toán gắn với booking/subscription/receipt.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `booking_id` | char(26) nullable |
| `subscription_id` | char(26) nullable |
| `receipt_id` | char(26) nullable |
| `payer_user_id` | char(26) nullable |
| `amount` | decimal(14,2) |
| `currency` | varchar(10) |
| `method` | varchar(50) |
| `status` | varchar(50) |
| `provider` | varchar(50) nullable |
| `provider_transaction_id` | varchar(255) nullable |
| `paid_at` | datetime nullable |
| `created_at` | datetime |

### 12.5 `debts`

Có thể tính realtime từ booking/payment, nhưng bảng này hữu ích để snapshot công nợ.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `booking_id` | char(26) |
| `customer_id` | char(26) nullable |
| `amount` | decimal(14,2) |
| `status` | varchar(50) |
| `due_at` | datetime nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

Status: `open`, `partial_paid`, `paid`, `cancelled`.

## 13. Tài xế và nhân sự vận hành

### 13.1 `drivers`

Thay cho `taiXe`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `user_id` | char(26) nullable |
| `driver_type` | varchar(50) |
| `name` | varchar(255) |
| `phone` | varchar(30) nullable |
| `id_no` | varchar(100) nullable |
| `license_no` | varchar(100) nullable |
| `note` | text nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

Driver type: `staff`, `collaborator`, `temporary`.

### 13.2 `driver_documents`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `driver_id` | char(26) |
| `document_type` | varchar(50) |
| `file_url` | text |
| `created_at` | datetime |

## 14. Phạt nguội

### 14.1 `traffic_fines`

Thay cho `phatNguoi`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `vehicle_id` | char(26) nullable |
| `booking_id` | char(26) nullable |
| `plate_number` | varchar(50) |
| `violation_time` | datetime nullable |
| `location` | text nullable |
| `violation_description` | text nullable |
| `fine_amount` | decimal(14,2) nullable |
| `source` | varchar(50) |
| `status` | varchar(50) |
| `handled_by` | char(26) nullable |
| `handled_at` | datetime nullable |
| `raw_json` | json nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

Status: `new`, `linked`, `notified_customer`, `paid`, `dismissed`.

## 15. Chat hybrid Firebase + MySQL

> ⚠️ **Chi tiết realtime + nguồn sự thật theo [ADR 0009](decisions/0009-chat-firestore-projection.md)** (thắng phần công nghệ ở mục này). Chốt lại: DB là **PostgreSQL** (ADR 0001, không phải MySQL); **PostgreSQL là single source of truth** cho `conversations`/thành viên/**toàn bộ** tin/đính kèm/đã đọc; Firestore chỉ là **projection realtime ~30–50 tin gần nhất** (rebuildable); đồng bộ PG→Firestore bằng **outbox/retry**, chỉ backend Node ghi; Security Rules + emulator test; đính kèm ở **Cloudflare R2**. Cấu trúc bảng dưới vẫn dùng (dịch type sang convention Postgres ở ADR 0001); riêng vai trò Firestore/nguồn-sự-thật đọc theo ADR 0009.

### 15.1 Luồng dữ liệu chat

Firestore giữ:

| Path | Dữ liệu |
| --- | --- |
| `conversations/{conversationId}` | `tenantId`, `customerUid`, `lastText`, `lastAt`, unread counters |
| `conversations/{conversationId}/messages_recent/{messageId}` | 30-100 tin gần nhất |

MySQL giữ:

| Bảng | Vai trò |
| --- | --- |
| `conversations` | Metadata nguồn chính |
| `conversation_participants` | Người tham gia |
| `message_archive` | Lưu tin cũ hoặc bản archive |
| `support_tickets` | Khiếu nại/hỗ trợ |
| `conversation_audit_logs` | Audit admin/support |

### 15.2 `conversations`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `firebase_conversation_id` | varchar(160) unique nullable |
| `tenant_id` | char(26) |
| `customer_id` | char(26) nullable |
| `customer_user_id` | char(26) nullable |
| `listing_id` | char(26) nullable |
| `vehicle_id` | char(26) nullable |
| `booking_request_id` | char(26) nullable |
| `booking_id` | char(26) nullable |
| `status` | varchar(50) |
| `last_message_text` | text nullable |
| `last_message_at` | datetime nullable |
| `last_sender_type` | varchar(50) nullable |
| `unread_customer_count` | int default 0 |
| `unread_tenant_count` | int default 0 |
| `created_at` | datetime |
| `updated_at` | datetime |
| `archived_at` | datetime nullable |

Index:

| Index | Cột |
| --- | --- |
| normal | `tenant_id`, `last_message_at` |
| normal | `customer_user_id`, `last_message_at` |
| normal | `booking_id` |
| unique nullable | `firebase_conversation_id` |

### 15.3 `conversation_participants`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `conversation_id` | char(26) |
| `user_id` | char(26) nullable |
| `participant_type` | varchar(50) |
| `tenant_id` | char(26) nullable |
| `last_read_at` | datetime nullable |
| `created_at` | datetime |

Participant type: `customer`, `shop_member`, `platform_support`.

### 15.4 `message_archive`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `conversation_id` | char(26) |
| `firebase_message_id` | varchar(160) nullable |
| `sender_user_id` | char(26) nullable |
| `sender_type` | varchar(50) |
| `message_type` | varchar(50) |
| `text` | text nullable |
| `file_url` | text nullable |
| `metadata_json` | json nullable |
| `sent_at` | datetime |
| `created_at` | datetime |

Index: `conversation_id`, `sent_at`.

### 15.5 `support_tickets`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `customer_id` | char(26) nullable |
| `conversation_id` | char(26) nullable |
| `booking_id` | char(26) nullable |
| `title` | varchar(255) |
| `status` | varchar(50) |
| `priority` | varchar(50) |
| `assigned_to` | char(26) nullable |
| `created_by` | char(26) nullable |
| `created_at` | datetime |
| `updated_at` | datetime |
| `closed_at` | datetime nullable |

## 16. Notification và push token

### 16.1 `notifications`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `user_id` | char(26) nullable |
| `target_type` | varchar(50) nullable |
| `target_id` | char(26) nullable |
| `channel` | varchar(50) |
| `type` | varchar(80) |
| `title` | varchar(255) |
| `body` | text nullable |
| `data_json` | json nullable |
| `read_at` | datetime nullable |
| `sent_at` | datetime nullable |
| `created_at` | datetime |

### 16.2 `push_tokens`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `user_id` | char(26) |
| `token` | text |
| `provider` | varchar(50) |
| `device_info_json` | json nullable |
| `last_used_at` | datetime nullable |
| `created_at` | datetime |

### 16.3 `notification_preferences`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `user_id` | char(26) nullable |
| `event_key` | varchar(120) |
| `enabled` | boolean |
| `channels_json` | json |
| `updated_at` | datetime |

## 17. Reviews và rating

### 17.1 `reviews`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `vehicle_id` | char(26) |
| `listing_id` | char(26) |
| `booking_request_id` | char(26) nullable |
| `booking_id` | char(26) nullable |
| `customer_id` | char(26) |
| `rating` | int |
| `comment` | text nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |
| `deleted_at` | datetime nullable |

Unique: `booking_id` hoặc `booking_request_id` để tránh đánh giá trùng.

### 17.2 `review_replies`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `review_id` | char(26) |
| `tenant_id` | char(26) |
| `user_id` | char(26) |
| `content` | text |
| `created_at` | datetime |

### 17.3 `rating_aggregates`

Có thể tính bằng job, nhưng bảng này giúp Marketplace query nhanh.

| Column | Type gợi ý |
| --- | --- |
| `target_type` | varchar(50) |
| `target_id` | char(26) |
| `rating_avg` | decimal(3,2) |
| `rating_count` | int |
| `updated_at` | datetime |

Unique: `target_type`, `target_id`.

## 18. Plan, subscription, billing nền tảng

### 18.1 `plans`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `code` | varchar(50) unique |
| `name` | varchar(255) |
| `price_monthly` | decimal(14,2) |
| `vehicle_limit` | int nullable |
| `staff_limit` | int nullable |
| `features_json` | json nullable |
| `status` | varchar(50) |
| `created_at` | datetime |
| `updated_at` | datetime |

### 18.2 `tenant_subscriptions`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `plan_id` | char(26) |
| `status` | varchar(50) |
| `started_at` | datetime |
| `current_period_start` | datetime |
| `current_period_end` | datetime |
| `cancelled_at` | datetime nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

Status: `trial`, `active`, `past_due`, `expired`, `cancelled`.

### 18.3 `subscription_history`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `subscription_id` | char(26) |
| `action` | varchar(80) |
| `from_plan_id` | char(26) nullable |
| `to_plan_id` | char(26) nullable |
| `from_end_at` | datetime nullable |
| `to_end_at` | datetime nullable |
| `note` | text nullable |
| `created_by` | char(26) nullable |
| `created_at` | datetime |

### 18.4 `invoices`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `subscription_id` | char(26) nullable |
| `invoice_no` | varchar(100) |
| `amount` | decimal(14,2) |
| `status` | varchar(50) |
| `issued_at` | datetime |
| `paid_at` | datetime nullable |
| `created_at` | datetime |

## 19. Audit, thùng rác, compliance

### 19.1 `audit_logs`

Audit chung cho tenant và platform.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `actor_user_id` | char(26) nullable |
| `actor_scope` | varchar(50) |
| `action` | varchar(120) |
| `target_type` | varchar(80) |
| `target_id` | char(26) nullable |
| `before_json` | json nullable |
| `after_json` | json nullable |
| `ip_address` | varchar(80) nullable |
| `user_agent` | text nullable |
| `created_at` | datetime |

Index: `tenant_id`, `created_at`; `target_type`, `target_id`; `actor_user_id`, `created_at`.

### 19.2 `trash_items`

Thay cho `trash`.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `original_table` | varchar(100) |
| `original_id` | char(26) |
| `data_json` | json |
| `deleted_by` | char(26) nullable |
| `deleted_at` | datetime |
| `purge_after` | datetime nullable |

### 19.3 `data_deletion_requests`

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) nullable |
| `user_id` | char(26) nullable |
| `customer_id` | char(26) nullable |
| `requester_name` | varchar(255) nullable |
| `requester_contact` | varchar(255) nullable |
| `reason` | text nullable |
| `status` | varchar(50) |
| `handled_by` | char(26) nullable |
| `handled_at` | datetime nullable |
| `created_at` | datetime |
| `updated_at` | datetime |

### 19.4 `impersonation_logs`

Nếu admin có chức năng xem như gian hàng.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `platform_user_id` | char(26) |
| `tenant_id` | char(26) |
| `target_user_id` | char(26) nullable |
| `reason` | text |
| `started_at` | datetime |
| `ended_at` | datetime nullable |
| `ip_address` | varchar(80) nullable |

## 20. Cấu hình gian hàng

### 20.1 `tenant_settings`

Lưu các cài đặt chung ít query.

| Column | Type gợi ý |
| --- | --- |
| `tenant_id` | char(26) |
| `setting_key` | varchar(120) |
| `setting_value_json` | json |
| `updated_at` | datetime |

Unique: `tenant_id`, `setting_key`.

Setting keys gợi ý:

| Key | Nội dung |
| --- | --- |
| `marketplace` | Min hours, bán kính giao mặc định |
| `buffer_time` | Thời gian chuẩn bị giữa 2 đơn |
| `grace_period` | Quá giờ và phí quá giờ |
| `document_numbering` | Đánh số hợp đồng/phiếu |
| `receipt_approval` | Có yêu cầu duyệt thu chi không |
| `appearance` | Theme/ngôn ngữ |
| `notification` | Vai trò nhận thông báo |

### 20.2 `checklist_templates`

Checklist giao/nhận xe.

| Column | Type gợi ý |
| --- | --- |
| `id` | char(26) |
| `tenant_id` | char(26) |
| `type` | varchar(50) |
| `title` | varchar(255) |
| `is_required` | boolean |
| `sort_order` | int |
| `status` | varchar(50) |
| `created_at` | datetime |

Type: `checkout`, `checkin`.

## 21. Quan hệ tổng thể

### 21.1 Quan hệ chính

```text
users
  -> tenant_memberships -> tenants
  -> platform_memberships
  -> customers

tenants
  -> tenant_profiles
  -> tenant_documents
  -> branches
  -> vehicles
  -> bookings
  -> receipts
  -> drivers

vehicles
  -> vehicle_images
  -> vehicle_documents
  -> vehicle_pricing
  -> public_listings
  -> vehicle_blocked_ranges
  -> vehicle_upgrades

public_listings
  -> booking_requests
  -> reviews

booking_requests
  -> bookings
  -> conversations

bookings
  -> booking_status_logs
  -> booking_assignments
  -> booking_photos
  -> receipts
  -> payments
  -> reviews

conversations
  -> conversation_participants
  -> message_archive
  -> support_tickets
```

### 21.2 Luồng duyệt

```text
tenant.status = draft
  -> owner submit
  -> approval_tasks(target_type='tenant', status='pending')
  -> platform reviewer approve/reject
  -> tenant.status = active | rejected | needs_revision

vehicle.public_status = draft
  -> shop submit public
  -> approval_tasks(target_type='vehicle', status='pending')
  -> platform reviewer approve/reject
  -> vehicle.public_status = approved_public | rejected | needs_revision
  -> public_listings.status = active nếu approved
```

### 21.3 Luồng booking

```text
customer login Google/Facebook
  -> verify phone when booking
  -> booking_requests.status = pending_host_approval
  -> shop approve
  -> booking_requests.status = approved_by_host
  -> create bookings.status = reserved/confirmed
  -> booking_requests.status = converted_to_booking
```

## 22. Mapping từ Firestore hiện tại sang MySQL

| Firestore hiện tại | MySQL mục tiêu | Ghi chú |
| --- | --- | --- |
| `tenants/{tenantId}` | `tenants`, `tenant_profiles`, `tenant_subscriptions` | Tách hồ sơ/gói |
| `tenants/{tenantId}/users` | `users`, `tenant_memberships`, `roles` | Đổi role `owner/admin/staff/viewer` |
| `memberships` | `tenant_memberships` | Gộp mapping |
| `tenants/{tenantId}/roles` | `roles`, `role_permissions` | Custom role |
| `tenants/{tenantId}/xe` | `vehicles`, `vehicle_pricing`, `vehicle_images`, `vehicle_documents` | Tách bảng con |
| `public_listings` | `public_listings` | Giữ concept nhưng MySQL là nguồn chính |
| `tenants/{tenantId}/don` | `bookings`, `booking_status_logs`, `booking_photos` | Chuẩn hóa trạng thái |
| `booking_requests` | `booking_requests` | Chuẩn hóa status |
| `tenants/{tenantId}/khach` | `tenant_customers`, `customers` | Có thể link global customer |
| `tenants/{tenantId}/taiXe` | `drivers`, `driver_documents` |  |
| `tenants/{tenantId}/thuChi` | `receipts`, `receipt_attachments`, `payments` |  |
| `tenants/{tenantId}/nangCap` | `vehicle_upgrades` |  |
| `tenants/{tenantId}/xeKhoa` | `vehicle_blocked_ranges` |  |
| `tenants/{tenantId}/chiNhanh` | `branches` |  |
| `tenants/{tenantId}/khuVuc` | `pickup_areas` |  |
| `tenants/{tenantId}/phatNguoi` | `traffic_fines` |  |
| `conversations` | `conversations` + Firestore shadow | MySQL metadata, Firestore realtime |
| `conversations/{id}/messages` | `message_archive` + Firestore recent | Archive sau 30-90 ngày |
| `reviews` | `reviews`, `rating_aggregates` |  |
| `tenants/{tenantId}/thongBao` | `notifications` + FCM |  |
| `fcmTokens` | `push_tokens` |  |
| `trash`, `deleteLog` | `trash_items`, `audit_logs` |  |
| `activityLog` | `audit_logs` |  |
| `dataDeletionRequests` | `data_deletion_requests` |  |

## 23. Index và hiệu năng cần ưu tiên

### 23.1 Marketplace search

Quan trọng nhất:

| Bảng | Index |
| --- | --- |
| `public_listings` | `status`, `vehicle_type`, `service_type` |
| `public_listings` | `province_code`, `status` |
| `public_listings` | `weekday_price` |
| `public_listings` | `brand`, `model` |
| `public_listings` | `rating_avg`, `rating_count` |
| `bookings` | `vehicle_id`, `pickup_at`, `return_at` |
| `vehicle_blocked_ranges` | `vehicle_id`, `start_at`, `end_at` |

### 23.2 Tenant dashboard

| Bảng | Index |
| --- | --- |
| `vehicles` | `tenant_id`, `operation_status` |
| `bookings` | `tenant_id`, `status` |
| `bookings` | `tenant_id`, `pickup_at`, `return_at` |
| `receipts` | `tenant_id`, `created_at`, `status` |

### 23.3 Admin platform

| Bảng | Index |
| --- | --- |
| `approval_tasks` | `status`, `target_type` |
| `tenants` | `status`, `tenant_type` |
| `vehicles` | `public_status`, `tenant_id` |
| `audit_logs` | `target_type`, `target_id` |
| `audit_logs` | `actor_user_id`, `created_at` |

## 24. Dữ liệu nhạy cảm và bảo mật

Các dữ liệu cần bảo vệ:

| Dữ liệu | Cách xử lý |
| --- | --- |
| CCCD/GPLX khách | Chỉ role cần thiết được xem; audit khi platform xem |
| Giấy tờ tenant | Chỉ owner/admin/reviewer được xem |
| SĐT khách | Masking với role không cần thiết |
| Conversation support | Admin xem/gửi thay phải có audit |
| Impersonate | Bắt buộc nhập lý do và ghi log |

Gợi ý policy:

| Policy | Mô tả |
| --- | --- |
| Row-level scope | API tự filter `tenant_id` |
| Permission guard | NestJS guard check role/permission |
| PII masking | Response DTO ẩn bớt field nếu role không đủ quyền |
| Audit write | Ghi `audit_logs` cho thao tác quan trọng |
| Soft delete | Không hard delete nghiệp vụ chính |

## 25. Thứ tự thiết kế Prisma schema

Nên làm theo thứ tự:

1. Auth/User/RBAC: `users`, `user_identities`, `tenant_memberships`, `platform_memberships`, `roles`, `permissions`.
2. Tenant/Shop: `tenants`, `tenant_profiles`, `tenant_documents`, `approval_tasks`.
3. Vehicle/Public Listing: `vehicles`, `vehicle_pricing`, `vehicle_images`, `public_listings`.
4. Booking: `booking_requests`, `bookings`, `booking_status_logs`, `booking_assignments`.
5. Customer: `customers`, `tenant_customers`, `customer_documents`.
6. Finance: `receipts`, `payments`, `debts`, `finance_categories`.
7. Chat: `conversations`, `conversation_participants`, `message_archive`.
8. Admin/Audit/Plan: `plans`, `subscriptions`, `audit_logs`, `admin_notes`.

## 26. MVP nên làm bảng nào trước

Nếu clone trong 2 tuần, không cần làm toàn bộ ngay. Ưu tiên:

| Mức | Bảng |
| --- | --- |
| Bắt buộc | `users`, `user_identities`, `tenants`, `tenant_profiles`, `tenant_memberships`, `roles`, `permissions` |
| Bắt buộc | `branches`, `vehicles`, `vehicle_pricing`, `vehicle_images`, `public_listings` |
| Bắt buộc | `booking_requests`, `bookings`, `booking_status_logs` |
| Bắt buộc | `customers`, `tenant_customers` |
| Bắt buộc | `approval_tasks`, `approval_logs`, `audit_logs` |
| Nên có | `receipts`, `payments`, `finance_categories` |
| Nên có | `conversations`, `conversation_participants` |
| Sau MVP | `traffic_fines`, `vehicle_upgrades`, `contracts`, `support_tickets`, `data_deletion_requests` |

## 27. Checklist trước khi viết DB schema thật

1. Chốt dùng ULID hay UUID.
2. Chốt ORM: Prisma hay TypeORM.
3. Chốt tiền lưu integer VND hay decimal.
4. Chốt Firebase Auth là provider chính hay chỉ là social/phone bridge.
5. Chốt public listing là bảng snapshot hay view từ vehicles.
6. Chốt booking request và booking là 2 bảng riêng.
7. Chốt tenant customer và global customer có tồn tại song song.
8. Chốt chat archive lưu MySQL full text hay chỉ metadata + object storage.
9. Chốt role platform chi tiết hay MVP chỉ `platform_admin/platform_staff`.
10. Chốt có cần full-text search MySQL hay dùng search service sau.

## 28. Kết luận

Thiết kế DB nên đi theo hướng **modular monolith, MySQL là nguồn nghiệp vụ chính, Firebase chỉ giữ phần realtime/auth/storage có lợi**.

Bảng quan trọng nhất cần chốt trước khi code là:

| Nhóm | Bảng lõi |
| --- | --- |
| User/RBAC | `users`, `tenant_memberships`, `platform_memberships`, `roles`, `permissions` |
| Shop | `tenants`, `tenant_profiles`, `approval_tasks` |
| Xe | `vehicles`, `vehicle_pricing`, `vehicle_images`, `public_listings` |
| Đặt xe | `booking_requests`, `bookings`, `booking_status_logs` |
| Khách | `customers`, `tenant_customers` |
| Admin | `audit_logs`, `admin_notes`, `approval_logs` |
| Chat | `conversations`, `conversation_participants`, `message_archive` |

Khi thiết kế Prisma/ERD, cần ưu tiên đúng scope `tenant_id`, trạng thái duyệt shop/xe, booking chống trùng lịch, RBAC backend và audit admin.
