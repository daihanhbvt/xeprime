# XePrime - Plan build source mới Next.js + NestJS để lên Production

Ngày cập nhật: 22/07/2026

Tài liệu này dựa trên:

- `docs/xeprime_screen_spec_by_role_before_db.docx`
- `docs/xeprime_database_design.docx`
- Source hiện tại trong `Vietrent` và `xeprime-functions`

Mục tiêu: dùng source Firebase hiện tại làm bản tham chiếu nghiệp vụ, xây source mới bằng Next.js + NestJS + MySQL, giữ được chức năng đang có, bổ sung chức năng thiếu, migrate dữ liệu an toàn và lên production.

## 1. Kết luận chiến lược

Không nên sửa lớn trực tiếp trên source Firebase hiện tại. Nên làm source mới song song.

| Hạng mục | Quyết định |
| --- | --- |
| Source cũ Firebase-code | Giữ làm bản chạy hiện tại và tài liệu nghiệp vụ sống |
| Source mới | Tạo repo/monorepo mới Next.js + NestJS |
| Database mới | MySQL 8 + Prisma |
| Backend | NestJS modular monolith |
| Frontend | Next.js App Router |
| Chat | Firebase/Firestore realtime gần nhất + MySQL metadata/archive |
| Auth | Google/Facebook login, verify SĐT ở bước đặt xe/mở shop/public xe |
| File | Firebase Storage hoặc object storage, DB chỉ lưu URL |
| Deploy ban đầu | 1 VPS 4GB RAM/40GB SSD có thể đủ cho MVP nếu tối ưu |

## 2. Kiến trúc source mới

### 2.1 Monorepo đề xuất

```text
xeprime/
  apps/
    web/                 # Next.js
    api/                 # NestJS
    worker/              # background jobs, optional sau MVP
  packages/
    ui/                  # common UI components
    types/               # shared TypeScript types
    config/              # eslint, tsconfig, constants
    validators/          # yup/zod schemas shared
  prisma/
    schema.prisma
    migrations/
    seed.ts
  scripts/
    migrate-firestore/
    import-images/
  docs/
```

Nếu muốn đơn giản hơn trong 2 tuần đầu:

```text
xeprime/
  web/
  api/
  prisma/
  docs/
```

Sau đó tách `packages` khi code bắt đầu lặp lại.

### 2.2 Stack frontend

| Mục | Thư viện/giải pháp |
| --- | --- |
| Framework | Next.js App Router |
| UI | Ant Design |
| Form | React Hook Form |
| Validation | Yup schema |
| Styling | styled-components hoặc CSS Modules; tránh inline style |
| Client/UI state | Redux Toolkit |
| State server data | TanStack Query |
| Date/time | dayjs |
| Table/list admin | AntD Table + custom filters |
| Lịch thuê xe | Custom scheduler bằng TanStack Virtual + dnd-kit |
| Icons | lucide-react hoặc AntD icons |
| Mobile web | ~~Responsive PWA trước, chưa build native app vội~~ — **SUPERSEDED 21/08/2026**: dự án đang chuẩn bị làm **app native (React Native)**, xem ghi chú cuối bảng "Chưa làm ở MVP" |
| Map | Leaflet/OpenStreetMap hoặc provider đang dùng |
| Firebase client | Auth, Firestore chat, Storage |

Ghi chú frontend:

- Không hard code text/status/role trong component.
- Tách constants: `roles`, `permissions`, `bookingStatus`, `vehicleStatus`.
- Tách hooks: `useCurrentUser`, `useTenantScope`, `usePermissions`, `useBookingActions`.
- Tách common UI: `DataTable`, `StatusTag`, `ConfirmAction`, `FileUploader`, `MoneyInput`, `DateRangePicker`.
- Không dùng inline style trừ trường hợp bất khả kháng.

### 2.2.1 Ghi chú riêng cho màn lịch thuê xe

Màn lịch thuê xe trong UI hiện tại là **resource timeline scheduler**, không phải calendar month/week đơn giản:

- Cột ngang là ngày/giờ.
- Hàng dọc là xe.
- Booking/đơn thuê là event kéo dài qua nhiều ngày.
- Cần sticky cột xe, sticky header ngày, scroll ngang/dọc, filter theo chi nhánh/loại xe/trạng thái.
- Mobile cần giao diện riêng: thanh ngày ngắn, bottom nav, nút tạo nhanh, drawer/bottom sheet chi tiết.

Khuyến nghị:

| Phương án | Khi nên dùng | Ghi chú |
| --- | --- | --- |
| Custom scheduler: TanStack Virtual + dnd-kit | Muốn UI giống ảnh, tối ưu mobile, không phụ thuộc license | Tốn công hơn nhưng kiểm soát tốt nhất cho production |
| FullCalendar Premium/Bryntum | Không chọn ở MVP | Có phí license production |

Định hướng nên làm:

1. Tạo abstraction `CalendarScheduler` ngay từ đầu để business code không dính vào implementation grid/drag/drop.
2. Không dùng FullCalendar Premium/Bryntum ở MVP vì bạn không muốn thư viện tính phí.
3. Build custom scheduler dựa trên `@tanstack/react-virtual` + `@dnd-kit` vì màn này là màn lõi của shop.
4. Không nên chọn `react-big-calendar` làm màn chính vì nó hợp lịch tháng/tuần/ngày, không mạnh với resource timeline xe x ngày như UI XePrime.

Store cho màn lịch:

| Loại state | Nên để ở đâu |
| --- | --- |
| Current tenant/branch/scope | Redux Toolkit |
| Filter lịch: range, loại xe, keyword, trạng thái | Redux Toolkit |
| Selected event, open drawer/modal | Redux Toolkit hoặc local state theo màn |
| Danh sách xe/event từ API | TanStack Query |
| Drag/resize/tạo booking/check conflict | TanStack Query mutation + API transaction check |

Tài liệu chi tiết: `docs/xeprime_fe_base_stack_calendar.md`.

### 2.3 Stack backend

| Mục | Thư viện/giải pháp |
| --- | --- |
| Framework | NestJS |
| ORM | Prisma |
| DB | MySQL 8 |
| Auth guard | Firebase Admin verify token hoặc Auth.js session bridge |
| RBAC | NestJS Guards + permissions từ DB |
| Validation | class-validator hoặc yup/zod ở DTO layer |
| API docs | Swagger/OpenAPI |
| Jobs | BullMQ + Redis sau MVP, hoặc cron đơn giản ban đầu |
| Logging | pino/winston |
| Error tracking | Sentry optional |
| File upload | Firebase Storage signed URL hoặc server upload endpoint |

### 2.4 Các module NestJS

| Module | Mục tiêu |
| --- | --- |
| AuthModule | Verify Firebase token, current user, social login mapping, phone verification |
| UsersModule | User profile, identities |
| TenantsModule | Đăng ký shop, hồ sơ shop, tenant status |
| RbacModule | Role, permission, membership |
| PlatformAdminModule | Admin dashboard, tenant management |
| ApprovalModule | Duyệt shop, duyệt xe public |
| VehiclesModule | Xe nội bộ, giá, ảnh, giấy tờ, khóa lịch |
| ListingsModule | Public listing, marketplace search |
| BookingRequestsModule | Yêu cầu đặt xe từ marketplace |
| BookingsModule | Đơn thuê thật, giao/nhận xe, trạng thái |
| CustomersModule | Customer global và customer theo tenant |
| FinanceModule | Thu chi, payment, debt |
| ChatModule | MySQL metadata + Firestore bridge |
| NotificationsModule | Notification DB + FCM |
| ReviewsModule | Đánh giá xe/shop |
| PlansModule | Gói, hạn dùng, subscription |
| AuditModule | Audit logs, impersonation logs |
| MigrationModule | Tools nội bộ migrate Firestore |

## 3. Nguyên tắc build để không vỡ dự án

1. Source mới chạy song song source cũ, không thay production ngay.
2. Mỗi phase phải có màn chạy được, không chỉ code backend.
3. Chức năng nào đang có ở Firebase thì clone luồng trước, sau đó mới cải tiến.
4. Chức năng thiếu quan trọng phải làm trước prod: duyệt gian hàng, duyệt xe public, RBAC backend.
5. Chat không migrate phức tạp ngay: giữ Firebase realtime, chỉ thêm MySQL metadata.
6. Không migrate toàn bộ dữ liệu một lần nếu chưa có script verify.
7. Mỗi module có seed/test data để Claude/dev test độc lập.
8. Admin actions quan trọng phải có audit ngay từ đầu.

## 4. Giai đoạn 0 - Chuẩn bị trước khi code

Thời gian: 2-3 ngày.

Mục tiêu: khóa scope, tạo repo, chuẩn bị môi trường, tránh Claude/code đi sai hướng.

### 4.1 Việc cần làm

| Việc | Output |
| --- | --- |
| Chốt tài liệu màn hình | `xeprime_screen_spec_by_role_before_db.docx` |
| Chốt tài liệu DB | `xeprime_database_design.docx` |
| Tạo source mới | Repo hoặc folder mới |
| Chọn convention | naming, folder, lint, format |
| Tạo Docker local | MySQL, Redis optional, API, web |
| Tạo env mẫu | `.env.example` cho web/api |
| Setup CI đơn giản | lint, typecheck, build |
| Setup seed data | admin, shop, xe, customer demo |

### 4.2 Checklist

| Checklist | Done |
| --- | --- |
| Có repo sạch |  |
| Có README setup local |  |
| Có MySQL local bằng Docker |  |
| Có Prisma migrate init |  |
| Có Next.js chạy được |  |
| Có NestJS chạy được |  |
| Có auth mock hoặc Firebase verify token |  |
| Có seed dữ liệu demo |  |

## 5. Giai đoạn 1 - Nền tảng Auth, RBAC, Tenant, Layout

Thời gian: 1 tuần.

Mục tiêu: login được, phân biệt customer/shop/platform, vào đúng portal.

### 5.1 Backend

| Module | API cần có |
| --- | --- |
| Auth | `GET /auth/me`, `POST /auth/sync-firebase-user`, `POST /auth/verify-phone/start`, `POST /auth/verify-phone/confirm` |
| Users | `GET /users/me`, `PATCH /users/me` |
| Tenants | `POST /tenants/register-draft`, `GET /tenants/current`, `PATCH /tenants/current/profile` |
| RBAC | `GET /rbac/my-permissions`, `GET /tenant-members`, `POST /tenant-members/invite` |
| Platform | `GET /platform/me` |

### 5.2 Frontend

| Màn | Chức năng |
| --- | --- |
| Login | Google/Facebook, fallback phone/email nếu cần |
| Customer shell | Header, account menu, trips/chat placeholder |
| Management shell | Sidebar, topbar, scope switch tenant/platform |
| No tenant screen | User login nhưng chưa thuộc shop |
| Register shop draft | Tạo hồ sơ shop nháp |
| Permission guard UI | Ẩn/disable menu theo quyền |

### 5.3 DB bảng dùng

- `users`
- `user_identities`
- `phone_verifications`
- `tenants`
- `tenant_profiles`
- `tenant_memberships`
- `roles`
- `permissions`
- `role_permissions`
- `platform_memberships`
- `audit_logs`

### 5.4 Done khi

| Điều kiện |
| --- |
| Customer login Google/Facebook được |
| Shop owner login và vào `/manage` được |
| Platform admin login và vào platform scope được |
| Tenant member chỉ thấy tenant của mình |
| API không nhận `tenant_id` từ client cho dữ liệu tenant |
| Permission guard chạy ở backend và frontend |

## 6. Giai đoạn 2 - Shop approval và Vehicle core

Thời gian: 1-1.5 tuần.

Mục tiêu: chủ shop đăng ký hồ sơ, admin duyệt shop, chủ shop thêm xe nội bộ.

### 6.1 Backend

| Module | API cần có |
| --- | --- |
| Tenants | Submit shop review, update profile, upload document metadata |
| Approval | List pending shop approvals, approve/reject/needs_revision |
| Vehicles | CRUD vehicle, pricing, images, documents |
| Branches | CRUD branches/pickup areas |
| Audit | Log admin approval và vehicle changes |

### 6.2 Frontend

| Màn | Chức năng |
| --- | --- |
| Shop profile | Thông tin shop, logo, cover, phone, address, bank |
| Submit shop review | Gửi hồ sơ mở gian hàng, bắt verify SĐT |
| Admin approval shops | List pending, xem hồ sơ, duyệt, từ chối, yêu cầu bổ sung |
| Vehicles list | Tìm, lọc, dạng grid/table |
| Add/Edit vehicle | Thông tin cơ bản, giá, ảnh, giấy tờ, chi nhánh |
| Branches | Chi nhánh, địa chỉ, GPS |

### 6.3 DB bảng dùng

- `tenant_documents`
- `approval_tasks`
- `approval_logs`
- `branches`
- `pickup_areas`
- `vehicles`
- `vehicle_pricing`
- `vehicle_images`
- `vehicle_documents`
- `vehicle_features`

### 6.4 Done khi

| Điều kiện |
| --- |
| Shop mới tạo là `draft/pending_review`, không active ngay |
| Admin duyệt shop thì tenant chuyển `active` |
| Chủ shop thêm/sửa xe nội bộ được |
| Xe chưa duyệt không xuất hiện marketplace |
| Có audit khi admin duyệt/từ chối |

## 7. Giai đoạn 3 - Public listing và Marketplace

Thời gian: 1-1.5 tuần.

Mục tiêu: khách vào marketplace xem xe đã duyệt, tìm/lọc/xem chi tiết/shop public.

### 7.1 Backend

| Module | API cần có |
| --- | --- |
| Vehicles | Submit vehicle public review |
| Approval | List pending vehicle approvals, approve/reject |
| Listings | Search listings, listing detail, shop listings |
| Reviews | Listing reviews read |

### 7.2 Frontend

| Màn | Chức năng |
| --- | --- |
| Vehicle public wizard | Chủ shop bổ sung ảnh, giá, tính năng, gửi duyệt |
| Admin approval vehicles | Duyệt xe public, từ chối, yêu cầu bổ sung |
| Marketplace home | Search xe theo loại, tỉnh, ngày, service type |
| Listing cards | Ảnh, giá, rating, trạng thái còn xe |
| Listing detail | Ảnh, thông số, chính sách, giá, đánh giá |
| Public shop `/shops/[slug]` | Hồ sơ shop và xe của shop |

### 7.3 DB bảng dùng

- `public_listings`
- `delivery_policies`
- `vehicle_blocked_ranges`
- `reviews`
- `rating_aggregates`

### 7.4 Done khi

| Điều kiện |
| --- |
| Chủ shop không thể tự public nếu chưa được duyệt |
| Admin duyệt xe thì tạo/update public listing |
| Marketplace chỉ hiển thị tenant active + listing active |
| Search theo tỉnh/loại xe/ngày/giá hoạt động |
| Public shop slug hoạt động |

## 8. Giai đoạn 4 - Booking request và Booking core

Thời gian: 1.5-2 tuần.

Mục tiêu: khách gửi yêu cầu đặt xe, chủ shop duyệt/từ chối, tạo đơn thuê thật, chống trùng lịch.

### 8.1 Backend

| Module | API cần có |
| --- | --- |
| BookingRequests | Create, customer list, tenant list, approve, reject, cancel |
| Bookings | Create from request, CRUD booking, status transition |
| Availability | Check vehicle busy ranges |
| Customers | Create/link customer profile |
| Notifications | Notify shop/customer |

### 8.2 Frontend

| Màn | Chức năng |
| --- | --- |
| Booking modal | Chọn ngày giờ, nhận tại chỗ/giao tận nơi, ghi chú |
| Phone verify gate | Bắt verify SĐT trước khi gửi request |
| Trips | Customer xem chuyến của tôi |
| Booking requests tab | Shop xem yêu cầu đặt xe |
| Booking request detail | Xem khách, xe, thời gian, chat, duyệt/từ chối |
| Bookings list | Đơn thuê thật |
| Booking detail/edit | Trạng thái, thanh toán, giao/nhận, ghi chú |
| Calendar | Lịch thuê theo xe/ngày |

### 8.3 DB bảng dùng

- `booking_requests`
- `bookings`
- `booking_status_logs`
- `booking_assignments`
- `booking_photos`
- `booking_extra_services`
- `customers`
- `tenant_customers`

### 8.4 Transaction bắt buộc

| Transaction | Mục tiêu |
| --- | --- |
| Create booking request | Check listing active, tenant active, phone verified |
| Approve request | Check conflict, lock request, create booking |
| Update booking date/vehicle | Check conflict trước khi save |
| Cancel booking | Update status, release schedule |

### 8.5 Done khi

| Điều kiện |
| --- |
| Khách chưa verify SĐT không gửi booking được |
| Hai đơn không thể trùng xe cùng thời gian |
| Chủ shop duyệt request tạo được booking thật |
| Customer thấy trạng thái chuyến |
| Shop thấy booking trên lịch |

## 9. Giai đoạn 5 - Chat, notification, review

Thời gian: 1 tuần.

Mục tiêu: giữ chat realtime hoạt động nhưng không tốn chi phí vô tội vạ.

### 9.1 Backend

| Module | API cần có |
| --- | --- |
| Chat | Create/get conversation metadata, sync Firestore ID, archive job |
| Notifications | Create notification log, send FCM |
| Reviews | Create review after booking completed, aggregate rating |

### 9.2 Frontend

| Màn | Chức năng |
| --- | --- |
| Customer chat | List chat, thread, send message |
| Shop chat | List conversation theo tenant, thread, unread badge |
| Support chat view | Admin xem chat khi có quyền |
| Notifications | Chuông thông báo, mark read |
| Review modal | Khách đánh giá sau khi hoàn thành |

### 9.3 Chat cost rules

> ⚠️ **Ghi đè bởi ADR 0009** (`docs/decisions/0009-chat-firestore-projection.md`) — chốt kiến trúc realtime cuối cùng. Bảng dưới giữ nguyên tinh thần "không listen toàn bộ", nhưng chi tiết đúng hiện tại: **PostgreSQL là source of truth** (không phải MySQL), Firestore chỉ là **projection realtime ~30–50 tin gần nhất**; lịch sử cũ phân trang **cursor từ Postgres**; đồng bộ PG→Firestore bằng **outbox/retry**; **chỉ backend Node ghi**, kèm **Firestore Security Rules + emulator test**; đính kèm ở **Cloudflare R2** (metadata ở PG + Firestore). Notification + Review của Phase 5 đã làm; Chat để đợt sau.

| Rule | Cách làm |
| --- | --- |
| Không listen toàn bộ message | Chỉ listen conversation list và thread đang mở (~30–50 tin) |
| Message recent | Firestore giữ ~30–50 tin mới nhất (projection realtime, rebuildable) |
| Metadata & source of truth | **PostgreSQL** giữ `conversations` + toàn bộ tin/thành viên/đã đọc (ADR 0009) |
| Archive/retention | Job định kỳ theo retention cấu hình; lịch sử phân trang cursor từ Postgres |
| File chat | **Cloudflare R2**; PG + Firestore chỉ lưu metadata (URL…) |

### 9.4 Done khi

| Điều kiện |
| --- |
| Khách và shop chat được |
| Chat gắn được listing/booking/request |
| Unread badge đúng |
| Review chỉ tạo được sau chuyến hợp lệ |
| Rating listing/shop cập nhật |

## 10. Giai đoạn 6 - Finance, Thu Chi, Công nợ, Hợp đồng

Thời gian: 1.5-2 tuần.

Mục tiêu: clone các chức năng vận hành đang có trong Host hiện tại.

### 10.1 Backend

| Module | API cần có |
| --- | --- |
| Finance | Categories, receipts, approve receipt, cancel receipt |
| Payments | Payment records, booking paid/debt update |
| Debts | Debt list, mark paid |
| Contracts | Create contract snapshot, export data |

### 10.2 Frontend

| Màn | Chức năng |
| --- | --- |
| Finance dashboard | Doanh thu, cọc, chi phí, lợi nhuận xe |
| Thu Chi | Thêm phiếu, duyệt phiếu, hủy phiếu |
| Công nợ | Xem đơn còn nợ, tạo phiếu thu |
| Contract view | Xem/in/lưu ảnh hợp đồng |
| Quick receipt mobile | Tạo phiếu nhanh |

### 10.3 DB bảng dùng

- `finance_categories`
- `receipts`
- `receipt_attachments`
- `payments`
- `debts`
- `contracts`

### 10.4 Done khi

| Điều kiện |
| --- |
| Tạo phiếu thu/chi được |
| Phiếu cần duyệt có workflow |
| Booking cập nhật paid/debt đúng |
| Dashboard tài chính khớp dữ liệu |
| In/xuất hợp đồng tối thiểu hoạt động |

## 11. Giai đoạn 7 - Admin platform đầy đủ

Thời gian: 1.5-2 tuần.

Mục tiêu: admin nền tảng đủ dùng để quản lý production.

### 11.1 Màn admin cần có

| Màn | Chức năng |
| --- | --- |
| Platform dashboard | Tổng tenant, xe public, booking, pending approval |
| Tenants | Xem, lọc, khóa/mở, ghi chú, gói/hạn |
| Shop approvals | Duyệt/từ chối/yêu cầu bổ sung |
| Vehicle approvals | Duyệt/từ chối/ẩn listing |
| All vehicles | Lọc xe toàn hệ thống, ẩn xe vi phạm |
| All bookings | Giám sát đơn, hỗ trợ shop/customer |
| All customers | Tra cứu có masking PII |
| Platform staff | Tạo nhân viên nền tảng, role support/reviewer/finance |
| Support tickets | Chat/khiếu nại |
| Audit logs | Xem log thao tác |
| Billing/plans | Gói, gia hạn, invoice |

### 11.2 Done khi

| Điều kiện |
| --- |
| Admin không cần sửa DB thủ công để duyệt shop/xe |
| Khóa tenant thì marketplace ẩn listing tenant đó |
| Gia hạn gói cập nhật subscription history |
| Mọi action admin có audit |
| Platform staff không có quyền super admin mặc định |

## 12. Giai đoạn 8 - Migration từ Firebase và chạy song song

Thời gian: 1-2 tuần.

Mục tiêu: đưa dữ liệu thật sang MySQL, so sánh với source cũ, không mất dữ liệu.

### 12.1 Thứ tự migrate

| Bước | Dữ liệu |
| --- | --- |
| 1 | Users, tenants, memberships, roles |
| 2 | Tenant profiles, settings, branches, pickup areas |
| 3 | Vehicles, pricing, images, documents |
| 4 | Public listings |
| 5 | Customers, drivers |
| 6 | Booking requests, bookings |
| 7 | Receipts/payments/debts |
| 8 | Reviews/ratings |
| 9 | Conversations metadata |
| 10 | Notifications/audit/trash |

### 12.2 Mapping quan trọng

| Firebase | MySQL |
| --- | --- |
| `owner` | `shop_owner` |
| `admin` tenant | `shop_manager` |
| `staff` | `shop_staff` |
| `viewer` | `shop_viewer` |
| `congKhai = true` | Không tự public; đưa vào `pending_public_review` hoặc `approved_public` tùy quyết định |
| `tenants/{id}/xe` | `vehicles`, `vehicle_pricing`, `vehicle_images` |
| `booking_requests` | `booking_requests` |
| `tenants/{id}/don` | `bookings` |
| `conversations` | `conversations` metadata, Firestore giữ recent |

### 12.3 Done khi

| Điều kiện |
| --- |
| Script chạy được trên staging nhiều lần |
| Có log migrate từng collection |
| Có file report số lượng trước/sau |
| Random check 20 xe, 20 đơn, 20 khách khớp dữ liệu |
| Có rollback plan |

## 13. Giai đoạn 9 - QA, hardening, production

Thời gian: 1-2 tuần.

Mục tiêu: đủ an toàn để chạy thật.

### 13.1 Test bắt buộc

| Nhóm | Test |
| --- | --- |
| Auth | Login Google/Facebook, verify phone |
| RBAC | Shop staff không xem tenant khác, viewer không sửa |
| Admin | Platform staff không có quyền super admin |
| Booking | Không trùng lịch, không đặt xe quá khứ |
| Listing | Chỉ xe approved mới public |
| Finance | Paid/debt không sai |
| Chat | Không load quá nhiều messages |
| Migration | Số lượng và dữ liệu khớp |

### 13.2 Production checklist

| Checklist |
| --- |
| `.env.production` không commit |
| MySQL backup tự động hằng ngày |
| SSL domain |
| API rate limit |
| CORS đúng domain |
| Firebase security rules chat/storage |
| Logging lỗi API |
| Audit admin |
| Health check |
| Seed platform admin an toàn |
| Rollback deploy |

## 14. Lộ trình tổng thể đề xuất

### 14.1 Bản clone chạy được trong 2 tuần

Mục tiêu: có demo source mới end-to-end, chưa cần full tính năng.

| Tuần | Việc |
| --- | --- |
| Tuần 1 | Setup repo, DB, Auth, RBAC, Tenant, shell web/manage |
| Tuần 2 | Vehicles, public listing cơ bản, marketplace search, booking request cơ bản |

Kết quả sau 2 tuần:

| Có |
| --- |
| Login được |
| Tạo shop/tenant được |
| Admin duyệt shop cơ bản |
| Shop thêm xe |
| Admin duyệt xe public cơ bản |
| Marketplace xem xe |
| Khách gửi booking request |
| Shop duyệt/từ chối request |

Chưa cần full trong 2 tuần:

| Chưa cần |
| --- |
| Full finance |
| Full contract |
| Full phạt nguội |
| AI trợ lý |
| Full migration |
| Full support ticket |

### 14.2 Bản beta nội bộ trong 6-8 tuần

| Sprint | Thời gian | Output |
| --- | --- | --- |
| Sprint 1 | Tuần 1 | Auth/RBAC/Tenant |
| Sprint 2 | Tuần 2 | Vehicle/Public Listing/Marketplace |
| Sprint 3 | Tuần 3-4 | Booking request/Booking/Calendar |
| Sprint 4 | Tuần 5 | Chat/Notification/Review |
| Sprint 5 | Tuần 6 | Finance/Thu Chi/Công nợ |
| Sprint 6 | Tuần 7 | Admin platform đầy đủ |
| Sprint 7 | Tuần 8 | Migration staging + QA |

### 14.3 Bản production trong 2-3 tháng

| Giai đoạn | Output |
| --- | --- |
| Tháng 1 | Core marketplace + shop management + booking |
| Tháng 2 | Finance + admin platform + chat/review + migration |
| Tháng 3 | QA, hardening, monitoring, data migration thật, go-live |

## 15. Cách dùng Claude Max hiệu quả

Claude Max nên dùng như một senior implementer theo task nhỏ, không giao một prompt quá lớn.

### 15.1 Quy tắc giao việc

| Quy tắc | Lý do |
| --- | --- |
| Mỗi prompt chỉ giao 1 module hoặc 1 flow | Giảm code lan man |
| Luôn đưa file tài liệu liên quan | Giữ đúng hướng |
| Bắt Claude đọc source hiện tại trước khi code | Tránh mất nghiệp vụ cũ |
| Bắt viết test hoặc checklist verify | Tránh code chạy cảm tính |
| Bắt output diff/summary | Dễ review |
| Không cho tự đổi architecture lớn | Giữ nhất quán |

### 15.2 Thứ tự prompt cho Claude

| Thứ tự | Prompt |
| --- | --- |
| 1 | Tạo monorepo Next.js/NestJS/Prisma/Docker |
| 2 | Sinh Prisma schema từ tài liệu DB |
| 3 | Sinh seed data |
| 4 | Implement Auth/RBAC |
| 5 | Implement Tenant/Shop approval |
| 6 | Implement Vehicle CRUD |
| 7 | Implement Public Listing + approval |
| 8 | Implement Marketplace search |
| 9 | Implement Booking Request |
| 10 | Implement Booking/Calendar |
| 11 | Implement Chat metadata bridge |
| 12 | Implement Finance |
| 13 | Implement Admin platform |
| 14 | Implement migration scripts |
| 15 | QA/hardening |

### 15.3 Prompt mẫu

```text
Bạn là senior fullstack engineer. Hãy đọc các tài liệu:
- docs/xeprime_screen_spec_by_role_before_db.docx
- docs/xeprime_database_design.docx
- docs/xeprime_build_plan_nextjs_nestjs_prod.docx

Nhiệm vụ: implement module [TÊN MODULE] trong source Next.js + NestJS hiện tại.

Yêu cầu:
1. Bám đúng database design.
2. Không hard code role/status trong component; dùng constants.
3. API tenant phải lấy tenant_id từ session/membership, không nhận từ body.
4. Có RBAC guard backend.
5. Có UI loading/empty/error.
6. Có validation form bằng React Hook Form + Yup.
7. Không dùng inline style.
8. Sau khi code, chạy lint/typecheck/build/test nếu có.
9. Báo cáo file đã sửa, API đã thêm, test đã chạy.

Không được tự đổi kiến trúc nếu chưa nêu lý do và xin xác nhận.
```

## 16. Tech debt cần tránh từ đầu

| Rủi ro | Cách tránh |
| --- | --- |
| Role rối như source cũ | Đổi ngay sang `shop_*` và `platform_*` |
| Client tự ghi dữ liệu quan trọng | Tất cả qua NestJS API |
| Public xe không duyệt | Dùng `approval_tasks` |
| Chat tốn Firebase | Limit recent messages, archive |
| DB quá phức tạp từ ngày đầu | MVP chỉ làm bảng bắt buộc |
| Admin thiếu audit | Audit mọi action quan trọng |
| Migrate mất dữ liệu | Script có report và chạy staging trước |
| Frontend hard code | Constants/hooks/common components |

## 17. Nên bỏ hoặc để sau MVP

| Chức năng | Đề xuất |
| --- | --- |
| AI trợ lý | Để sau khi core ổn |
| Phạt nguội nâng cao | Để sau MVP, chỉ migrate data nếu có |
| Native mobile app | ~~Chưa làm, ưu tiên PWA responsive~~ — **SUPERSEDED 21/08/2026**. Dự án đang chuẩn bị nhận React Native developer; app native là việc SẼ làm, không phải việc đã loại. Điều kiện kỹ thuật + thứ tự clone: `docs/mobile-readiness-audit.md`. Stack và phạm vi chờ ADR 0013 (chưa viết) |
| Payment online phức tạp | Chuẩn bị bảng, làm manual trước |
| Full support ticket | Làm sau, trước mắt admin notes + chat view |
| Full BI dashboard | Sau production, trước mắt dashboard cơ bản |

## 18. Kết luận

Để lên production an toàn, nên đi theo thứ tự:

1. Nền tảng auth/RBAC/tenant.
2. Duyệt shop và duyệt xe public.
3. Marketplace + booking request.
4. Booking thật + lịch xe.
5. Chat/notification/review.
6. Finance/thu chi/công nợ.
7. Admin platform đầy đủ.
8. Migration staging.
9. QA/hardening.
10. Production cutover.

Nếu dùng Claude Max, hãy dùng tài liệu này làm master plan, chia nhỏ prompt theo từng module. Không giao Claude làm toàn bộ dự án trong một prompt vì dễ sai kiến trúc và khó review.

## 19. Nguồn tham khảo kỹ thuật

- Next.js App Router: https://nextjs.org/docs/app
- Next.js Server/Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- NestJS Modules: https://docs.nestjs.com/modules
- Prisma Migrate: https://docs.prisma.io/docs/orm/prisma-migrate
- Firestore billing/listeners: https://firebase.google.com/docs/firestore/pricing
