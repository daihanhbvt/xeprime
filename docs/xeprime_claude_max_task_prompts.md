# XePrime - Bộ prompt làm việc với Claude Max

Dùng bộ prompt này cùng với:

- `docs/xeprime_screen_spec_by_role_before_db.docx`
- `docs/xeprime_database_design.docx`
- `docs/xeprime_build_plan_nextjs_nestjs_prod.docx`

## 1. Prompt khởi tạo source mới

```text
Bạn là senior fullstack engineer kiêm architect. Hãy dựng base source product cho XePrime bằng Next.js + NestJS + MySQL + Prisma.

Mục tiêu:
- Tạo source mới sạch, có kiến trúc đủ chuẩn để build production.
- Chưa cần implement toàn bộ nghiệp vụ thuê xe, nhưng base phải có auth/RBAC skeleton, layout, provider, API structure, Prisma, Docker, seed, test/build scripts.
- Source Firebase hiện tại chỉ dùng làm tham chiếu nghiệp vụ, không sửa trực tiếp.

Tài liệu cần bám:
- docs/xeprime_screen_spec_by_role_before_db.docx
- docs/xeprime_overall_user_flow_next_node_updated.docx
- docs/xeprime_database_design.docx
- docs/xeprime_build_plan_nextjs_nestjs_prod.docx
- docs/xeprime_fe_base_stack_calendar.docx

Quyết định kỹ thuật bắt buộc:
1. Monorepo:
   - apps/web: Next.js App Router + TypeScript
   - apps/api: NestJS modular monolith
   - apps/worker: skeleton optional, chưa cần chạy nếu chưa dùng
   - packages/types
   - packages/validators
   - packages/config
   - packages/ui
   - prisma
   - docs
2. Package manager: pnpm workspace.
3. Frontend:
   - Next.js App Router, dùng `src/app`.
   - Route groups: `(public)`, `(auth)`, `(manage)`.
   - Server Components mặc định; Client Components chỉ khi cần state/event/browser API.
   - Ant Design + `@ant-design/nextjs-registry`.
   - styled-components, không dùng inline style.
   - React Hook Form + Yup + `@hookform/resolvers`.
   - Redux Toolkit + React Redux cho UI/client state.
   - TanStack Query cho server data/cache/mutation.
   - Không dùng Redux Saga ở MVP.
   - dayjs cho date/time.
   - Không dùng calendar library tính phí; calendar dùng custom scheduler với TanStack Virtual + dnd-kit.
4. Backend:
   - NestJS modular monolith.
   - PrismaService dùng MySQL.
   - ConfigModule validate env.
   - Global ValidationPipe.
   - Global exception filter trả lỗi chuẩn.
   - Swagger/OpenAPI cho API docs.
   - Health endpoint.
   - Logging có cấu trúc.
5. Database:
   - MySQL 8.
   - Prisma schema đặt ở `prisma/schema.prisma`.
   - ID dùng `String @id @db.Char(26)`.
   - Table dùng snake_case với `@@map`.
   - Column dùng snake_case với `@map`.
   - Money dùng `Decimal @db.Decimal(14, 2)`.
   - Status dùng String, chưa dùng MySQL enum.
6. Auth/RBAC:
   - Firebase Auth là provider.
   - API verify Firebase token bằng Firebase Admin hoặc mock token local nếu chưa có credential.
   - Sync user vào MySQL.
   - Có skeleton role/permission/membership.
   - Backend guard là nguồn bảo vệ chính.
   - Không nhận `tenant_id` từ body cho API tenant-sensitive.
7. Chat:
   - Chỉ tạo skeleton service/module.
   - MySQL giữ conversations metadata.
   - Firestore chỉ dành cho recent realtime messages sau này.
8. DevOps local:
   - Docker Compose cho MySQL.
   - Redis optional, chỉ bật nếu đã tạo worker/job skeleton.
   - `.env.example` cho web/api/prisma.
   - README hướng dẫn setup local.
9. Quality:
   - TypeScript strict.
   - ESLint + Prettier.
   - Script lint/typecheck/build/test.
   - Unit test tối thiểu cho API health/auth guard mock và FE provider render.
   - Không để `any` tràn lan; nếu bắt buộc phải có comment lý do.

Frontend base cần tạo:
1. `apps/web/src/app/providers.tsx`
   - AntD registry/provider
   - Redux Provider
   - TanStack Query Provider
   - styled-components/theme nếu cần
2. Layout:
   - Public layout
   - Auth layout
   - Management layout
3. Pages placeholder:
   - `/`
   - `/login`
   - `/manage`
   - `/manage/calendar`
   - `/manage/vehicles`
   - `/manage/bookings`
   - `/manage/admin`
4. Common components:
   - AppShell
   - Sidebar
   - Topbar
   - DataTable wrapper
   - StatusTag
   - EmptyState
   - ConfirmAction
   - FormField wrappers
5. Hooks/services/constants:
   - useCurrentUser
   - usePermissions
   - useTenantScope
   - apiClient
   - queryKeys
   - roles, permissions, routes, statuses
6. Calendar skeleton:
   - `features/calendar/components/CalendarScheduler.tsx`
   - toolbar/filter
   - mock resource timeline read-only
   - dùng TanStack Virtual nếu kịp, nếu chưa thì chuẩn bị folder/API và note TODO rõ.

Backend base cần tạo:
1. Modules:
   - HealthModule
   - PrismaModule
   - AuthModule
   - UsersModule
   - TenantsModule
   - RbacModule
   - AuditModule
   - VehiclesModule skeleton
   - BookingsModule skeleton
   - CalendarModule skeleton
   - ChatModule skeleton
   - PlatformAdminModule skeleton
2. Common:
   - CurrentUser decorator
   - CurrentTenant decorator
   - AuthGuard
   - PermissionGuard
   - TenantScopeGuard
   - Roles/Permissions decorator
   - Http exception filter
3. API endpoints tối thiểu:
   - GET /health
   - GET /auth/me
   - POST /auth/sync-firebase-user
   - GET /rbac/my-permissions
   - GET /tenants/current
   - GET /calendar/resources mock hoặc seed-based
   - GET /calendar/events mock hoặc seed-based
4. Swagger tags rõ theo module.

Prisma/seed cần có:
1. Schema tối thiểu cho:
   - users
   - user_identities
   - tenants
   - tenant_memberships
   - roles
   - permissions
   - role_permissions
   - platform_memberships
   - vehicles
   - bookings
   - audit_logs
2. Seed:
   - platform admin
   - shop owner
   - customer
   - 1 tenant active
   - 5-10 xe demo
   - vài booking demo cho calendar

API convention:
- Success response: `{ "data": ..., "meta": ... }`
- Error response: `{ "error": { "code": "...", "message": "...", "details": ... } }`
- Pagination: `page`, `limit`, `total`, `hasNext`
- Date/time: lưu UTC, hiển thị Asia/Bangkok ở frontend.

Sau khi làm xong, hãy báo cáo:
1. Cây thư mục quan trọng.
2. File đã tạo.
3. Env cần điền.
4. Lệnh chạy local:
   - pnpm install
   - pnpm db:up
   - pnpm db:migrate
   - pnpm db:seed
   - pnpm dev
5. Kết quả lint/typecheck/build/test.
6. Những phần mock/TODO còn lại.

Không được làm:
- Không build toàn bộ nghiệp vụ thuê xe trong prompt này.
- Không dùng Redux Saga ở MVP.
- Không dùng FullCalendar Premium/Bryntum.
- Không hard code role/status trong UI component.
- Không dùng inline style.
- Không tạo microservices sớm.
- Không thay đổi source Firebase hiện tại.
```

## 2. Prompt sinh Prisma schema

```text
Hãy đọc `docs/xeprime_database_design.docx` và sinh Prisma schema cho MySQL 8.

Yêu cầu:
- ID dùng `String @id @db.Char(26)`.
- Table DB dùng snake_case với `@@map`.
- Column DB dùng snake_case với `@map`.
- Money dùng `Decimal @db.Decimal(14, 2)`.
- Status dùng String, chưa dùng MySQL enum.
- Có index cho marketplace search, booking availability, tenant dashboard, platform admin.
- Có các module bảng:
  - users, user_identities, phone_verifications
  - tenants, tenant_profiles, tenant_documents, tenant_memberships
  - roles, permissions, role_permissions, platform_memberships
  - approval_tasks, approval_logs, admin_notes
  - branches, pickup_areas, delivery_policies
  - vehicles, vehicle_pricing, vehicle_images, vehicle_documents, public_listings
  - customers, tenant_customers, customer_documents
  - booking_requests, bookings, booking_status_logs, booking_assignments
  - receipts, payments, debts
  - conversations, conversation_participants, message_archive
  - notifications, push_tokens
  - reviews, rating_aggregates
  - plans, tenant_subscriptions
  - audit_logs, trash_items, data_deletion_requests

Output:
1. File `prisma/schema.prisma`.
2. Giải thích quan hệ chính.
3. Danh sách bảng có thể để phase sau.
4. Lệnh migrate dev.
```

## 3. Prompt Auth/RBAC

```text
Implement Auth/RBAC cho XePrime.

Context:
- Frontend Next.js.
- Backend NestJS.
- Auth dùng Firebase token hoặc mock token local.
- MySQL/Prisma có users, user_identities, tenants, tenant_memberships, platform_memberships, roles, permissions.

Yêu cầu backend:
1. AuthGuard verify token và attach `req.user`.
2. TenantScopeGuard xác định tenant hiện tại từ membership/session.
3. PlatformScopeGuard xác định platform role.
4. PermissionGuard check permission key.
5. API:
   - GET /auth/me
   - POST /auth/sync-firebase-user
   - GET /rbac/my-permissions
   - GET /tenants/current
6. Không nhận tenant_id từ body cho API tenant.

Yêu cầu frontend:
1. Login page có Google/Facebook placeholder hoặc Firebase integration.
2. useCurrentUser hook.
3. usePermissions hook.
4. Management layout ẩn menu theo quyền.
5. No tenant screen.

Sau khi code:
- Chạy lint/typecheck/build.
- Báo cáo API, guard, file đã sửa.
```

## 4. Prompt Tenant/Shop Approval

```text
Implement module Tenant/Shop Approval.

Yêu cầu:
1. Chủ shop tạo hồ sơ draft.
2. Chủ shop verify SĐT trước khi submit review.
3. Submit tạo approval_task target_type='tenant'.
4. Platform admin/reviewer xem danh sách pending.
5. Admin có nút:
   - Duyệt
   - Từ chối
   - Yêu cầu bổ sung
6. Khi duyệt, tenant.status = active.
7. Khi từ chối/yêu cầu bổ sung, lưu reason.
8. Mọi action ghi approval_logs và audit_logs.

Frontend:
- Shop profile form.
- Submit review button.
- Admin shop approval list/detail.
- StatusTag dùng constants.
- Form dùng React Hook Form + Yup.
- Không inline style.

Backend:
- TenantsModule.
- ApprovalModule.
- AuditModule.
- Permission: tenant owner submit, platform reviewer approve.
```

## 5. Prompt Vehicle/Public Listing

```text
Implement Vehicle CRUD và Public Listing approval.

Yêu cầu:
1. Shop owner/manager thêm/sửa xe nội bộ.
2. Xe có pricing, images, documents, branch.
3. Xe mới public_status = draft.
4. Chủ shop gửi duyệt public, bắt phone verified nếu chưa có.
5. Tạo approval_task target_type='vehicle'.
6. Platform reviewer duyệt/từ chối/yêu cầu bổ sung.
7. Khi duyệt:
   - vehicle.public_status = approved_public
   - tạo/update public_listings.status = active
8. Marketplace chỉ đọc public_listings active + tenant active.

Frontend:
- Vehicle list grid/table.
- Vehicle form.
- Public wizard.
- Admin vehicle approval list/detail.

Backend:
- VehiclesModule.
- ListingsModule.
- ApprovalModule.
- Không cho client tự set approved_public.
```

## 6. Prompt Marketplace + Booking Request

```text
Implement Marketplace và Booking Request.

Yêu cầu Marketplace:
1. Search public listings theo:
   - vehicle_type
   - service_type
   - province
   - date range
   - price
   - brand/model
   - delivery/no_collateral/rating
2. Listing detail.
3. Public shop `/shops/[slug]`.

Yêu cầu booking:
1. Khách phải login.
2. Trước khi gửi booking request phải phone verified.
3. Backend check:
   - listing active
   - tenant active
   - date không quá khứ
   - không trùng booking/block range
4. Tạo booking_requests.status = pending_host_approval.
5. Shop nhận notification.

Frontend:
- Marketplace home.
- Listing card/detail.
- Booking modal.
- Phone verify gate.
- Trips page cơ bản.

Backend:
- ListingsModule.
- BookingRequestsModule.
- Availability service.
- NotificationsModule.
```

## 7. Prompt Booking/Calendar

```text
Implement Booking core và Calendar.

Yêu cầu:
1. Shop xem booking requests.
2. Shop approve/reject request.
3. Approve request chạy transaction:
   - check conflict
   - set request approved/converted
   - create booking
   - write booking_status_logs
4. Booking list/detail/edit.
5. Calendar theo xe/ngày.
6. Khi sửa ngày/xe phải check conflict.
7. Customer trips cập nhật status.

Frontend:
- Booking request tab.
- Booking list.
- Booking detail modal/page.
- Calendar view.

Backend:
- BookingRequestsModule.
- BookingsModule.
- Availability service.
- Audit logs.
```

## 8. Prompt Chat Hybrid

```text
Implement Chat hybrid Firestore + MySQL.

Yêu cầu:
1. MySQL conversations là metadata nguồn chính.
2. Firestore chỉ giữ realtime recent messages.
3. Conversation gắn được:
   - tenant
   - customer
   - listing
   - vehicle
   - booking_request
   - booking
4. Client chỉ listen:
   - conversation list
   - thread đang mở
5. Limit 30-100 messages gần nhất.
6. Không lưu file/base64 trong Firestore.
7. Có unread counters.
8. Có API tạo/get conversation metadata.

Frontend:
- Customer chat.
- Shop chat.
- Unread badge.

Backend:
- ChatModule.
- NotificationsModule.
- Firestore bridge service.
```

## 9. Prompt Finance

```text
Implement Finance/Thu Chi/Công nợ.

Yêu cầu:
1. Receipts thu/chi.
2. Categories.
3. Approval workflow cho phiếu nếu tenant bật yêu cầu duyệt.
4. Booking paid_amount/debt_amount cập nhật đúng.
5. Công nợ list.
6. Tạo phiếu thu từ booking/debt.
7. Receipt attachments.
8. Audit mọi thao tác approve/cancel.

Frontend:
- Finance dashboard.
- Thu Chi list/form.
- Công nợ.
- Quick receipt mobile nếu kịp.

Backend:
- FinanceModule.
- PaymentsModule.
- AuditModule.
```

## 10. Prompt Admin Platform

```text
Implement Platform Admin Portal.

Yêu cầu màn:
1. Platform dashboard.
2. Tenants list/detail.
3. Shop approval.
4. Vehicle approval.
5. All vehicles.
6. All booking requests/bookings.
7. All customers có masking PII.
8. Platform staff management.
9. Plans/subscriptions.
10. Audit logs.

Yêu cầu bảo mật:
- platform_staff không có quyền platform_admin mặc định.
- support chỉ xem/gửi hỗ trợ nếu có permission.
- Xem PII phải ghi audit.
- Impersonate phải có reason và log.

Frontend:
- Dùng chung Management Portal layout.
- Scope platform.

Backend:
- PlatformAdminModule.
- PlansModule.
- AuditModule.
```

## 11. Prompt Migration

```text
Viết script migrate dữ liệu từ Firebase Firestore sang MySQL.

Firestore collections:
- tenants/{tenantId}
- tenants/{tenantId}/users
- memberships
- tenants/{tenantId}/roles
- tenants/{tenantId}/xe
- public_listings
- tenants/{tenantId}/don
- booking_requests
- tenants/{tenantId}/khach
- tenants/{tenantId}/taiXe
- tenants/{tenantId}/thuChi
- tenants/{tenantId}/nangCap
- tenants/{tenantId}/xeKhoa
- tenants/{tenantId}/chiNhanh
- tenants/{tenantId}/khuVuc
- tenants/{tenantId}/phatNguoi
- conversations
- reviews

Yêu cầu:
1. Batch migration, có log.
2. Có mapping ID cũ -> ID mới.
3. Role mapping:
   - owner -> shop_owner
   - admin -> shop_manager
   - staff -> shop_staff
   - viewer -> shop_viewer
4. `congKhai=true` không auto approve nếu chưa chốt; đưa vào report hoặc pending_public_review.
5. Không download ảnh, chỉ migrate URL.
6. Có dry-run mode.
7. Có report số lượng trước/sau.
8. Có verify script.
```

## 12. Prompt Calendar Scheduler + FE Base

```text
Implement FE base source và màn Lịch thuê xe cho XePrime bằng Next.js.

Stack bắt buộc:
1. Next.js App Router + TypeScript.
2. Ant Design + @ant-design/nextjs-registry.
3. styled-components, không dùng inline style.
4. React Hook Form + Yup + @hookform/resolvers.
5. Redux Toolkit + React Redux.
6. TanStack Query cho server data/cache.
7. Không dùng Redux Saga ở MVP.
8. dayjs cho date/time.

Yêu cầu Redux/Next.js:
- Tạo store bằng `makeStore()` theo App Router, không dùng global singleton store cho server request.
- Redux Provider nằm trong Client Component.
- Redux dùng cho auth/session client, current tenant/scope, global UI, calendar filters, selected calendar event.
- Không đưa form state vào Redux; form dùng React Hook Form.
- Server data như list xe/event/booking dùng TanStack Query.
- Tạo/sửa/xóa/duyệt/check conflict dùng TanStack Query mutation.

Màn Lịch thuê xe:
1. Đây là resource timeline scheduler: hàng là xe, cột là ngày/giờ.
2. Có sticky cột xe, sticky header ngày, scroll ngang/dọc.
3. Có event bar thể hiện đơn thuê/đơn đặt/khóa lịch/bảo trì kéo dài nhiều ngày.
4. Toolbar có:
   - search
   - filter
   - chọn chi nhánh
   - hôm nay
   - tháng nhanh
   - loại xe: tất cả/ô tô/xe máy
   - tạo đơn
5. Desktop giống UI hiện tại.
6. Mobile có bottom nav, thanh ngày compact, FAB tạo nhanh, drawer/bottom sheet chi tiết.
7. Click ô trống để tạo đơn hoặc khóa lịch.
8. Click event để mở chi tiết.
9. Drag/resize event phải gọi API check conflict trước khi lưu.
10. Không cho client tự quyết định lịch trống; backend phải transaction check chống trùng.

Chọn thư viện:
- Không dùng FullCalendar Premium/Bryntum vì không muốn thư viện tính phí.
- Build custom scheduler bằng `@tanstack/react-virtual` + `@dnd-kit`.
- Business logic đi qua abstraction `CalendarScheduler`, không rải date math/drag logic lung tung trong app.

Folder đề xuất:
- `features/calendar/components`
- `features/calendar/hooks`
- `features/calendar/store`
- `features/calendar/services`
- `features/calendar/types`
- `features/calendar/utils`

Output cần có:
1. Base providers.
2. Redux store.
3. TanStack Query provider.
4. Calendar page mock chạy được.
5. Calendar components tách rõ toolbar/grid/resource column/event bar/mobile drawer.
6. Mock data 20-50 xe và nhiều booking/event.
7. Unit test cho date math và position util.
8. README giải thích cách đổi từ mock API sang API thật.
```

## 13. Prompt review code

```text
Hãy review code vừa implement.

Tập trung vào:
1. Multi-tenant data leak.
2. RBAC backend có bị bypass không.
3. API có nhận tenant_id từ client nguy hiểm không.
4. Booking có chống trùng lịch bằng transaction không.
5. Public listing có bypass duyệt không.
6. PII có bị trả về quá mức không.
7. Chat Firestore có listen quá nhiều không.
8. Có audit cho admin action chưa.
9. Test/build/lint có chạy không.

Output:
- Findings theo High/Medium/Low.
- File/line nếu có.
- Cách sửa cụ thể.
- Test cần bổ sung.
```
