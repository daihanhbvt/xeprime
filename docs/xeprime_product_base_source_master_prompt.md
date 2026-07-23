# XePrime - Master prompt dựng product base source Next.js + NestJS

Ngày cập nhật: 22/07/2026

Tài liệu này dùng để đưa cho Claude Max/code agent khi bắt đầu dựng source mới. Mục tiêu là tạo **base source chuẩn product**, chưa làm sâu nghiệp vụ nhưng phải có nền móng đủ tốt để team tiếp tục build XePrime trong 2-3 tháng.

## 1. Phân tích hướng base source

Base source không nên chỉ là project chạy được. Nó phải giải quyết trước các điểm dễ làm dự án vỡ về sau:

| Vấn đề | Quyết định |
| --- | --- |
| Source mới hay sửa Firebase cũ | Tạo source mới song song, source Firebase chỉ làm tham chiếu nghiệp vụ |
| Kiến trúc repo | Monorepo: `apps/web`, `apps/api`, `apps/worker` optional, `packages/*`, `prisma`, `docs` |
| Frontend | Next.js App Router, TypeScript, AntD, styled-components, React Hook Form, Yup |
| State FE | Redux Toolkit cho UI/client state, TanStack Query cho server data/cache |
| Calendar | Custom scheduler bằng TanStack Virtual + dnd-kit, không dùng thư viện tính phí |
| Backend | NestJS modular monolith, không tách microservices ở MVP |
| Database | MySQL 8 + Prisma |
| Auth | Firebase Auth provider, backend verify token và sync user vào MySQL |
| RBAC | Role/permission lưu DB, guard backend là nguồn bảo vệ chính |
| Chat | Firebase/Firestore realtime recent + MySQL metadata/archive |
| Deploy MVP | 1 VPS 4GB RAM/40GB SSD có thể đủ nếu Docker và process được tối ưu |

## 2. Nguyên tắc code product base

1. Không hard code role/status/permission/text nghiệp vụ rải trong component.
2. Không dùng inline style; dùng styled-components/theme/tokens.
3. Không để client tự quyết định tenant scope, quyền duyệt, trạng thái public, hay lịch trống.
4. Không nhận `tenant_id` từ body/query cho API tenant-sensitive; backend lấy tenant scope từ membership/current scope.
5. API trả lỗi có cấu trúc, không throw string tùy tiện.
6. Form dùng React Hook Form + Yup; không đưa form state vào Redux.
7. Server data dùng TanStack Query; không tự viết reducer cache list thủ công.
8. Prisma schema dùng snake_case DB với `@@map`/`@map`, status dùng String để dễ migrate.
9. Mọi action quan trọng của platform/shop phải chuẩn bị audit log ngay từ base.
10. Base phải có seed data để test 3 scope: customer, shop owner, platform admin.

## 3. Folder structure đề xuất

```text
xeprime/
  apps/
    web/
      src/
        app/
          (public)/
          (auth)/
          (manage)/
          providers.tsx
          layout.tsx
        components/
          common/
          layout/
          form/
          data-display/
        features/
          auth/
          marketplace/
          calendar/
          vehicles/
          bookings/
          tenants/
          admin/
          chat/
        store/
        services/
        constants/
        hooks/
        styles/
    api/
      src/
        main.ts
        app.module.ts
        common/
          decorators/
          filters/
          guards/
          interceptors/
          pipes/
          types/
        config/
        prisma/
        modules/
          health/
          auth/
          users/
          tenants/
          rbac/
          vehicles/
          listings/
          bookings/
          calendar/
          chat/
          platform-admin/
          audit/
    worker/
      src/
  packages/
    types/
    validators/
    config/
    ui/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  docker/
  scripts/
  docs/
```

## 4. Master prompt để dựng base source

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
   - apps/worker: tạo skeleton optional, chưa cần chạy nếu chưa dùng
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
   - Response interceptor nếu cần chuẩn hóa response.
   - Swagger/OpenAPI cho API docs.
   - Health endpoint.
   - Logging bằng pino hoặc logger có cấu trúc.
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
5. Hooks:
   - useCurrentUser
   - usePermissions
   - useTenantScope
6. Services:
   - apiClient
   - queryKeys
   - authService
7. Constants:
   - roles
   - permissions
   - routes
   - statuses
8. Calendar skeleton:
   - `features/calendar/components/CalendarScheduler.tsx`
   - toolbar/filter
   - mock resource timeline read-only
   - dùng TanStack Virtual nếu kịp, nếu chưa thì chuẩn bị folder/API và note TODO rõ.

Backend base cần tạo:
1. Modules:
   - HealthModule
   - ConfigModule setup
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
   - Zod/class-validator DTO convention
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
- Success response:
  `{ "data": ..., "meta": ... }`
- Error response:
  `{ "error": { "code": "...", "message": "...", "details": ... } }`
- Pagination:
  `page`, `limit`, `total`, `hasNext`
- Date/time:
  Lưu UTC, hiển thị Asia/Bangkok ở frontend.

Security rules:
- Không expose PII quá mức.
- Không log token.
- Không để platform API dùng chung guard với tenant API.
- Không cho client set approval/public_status trực tiếp.
- API tenant-sensitive không tin `tenant_id` từ client.

Output sau khi làm:
1. In cây thư mục quan trọng.
2. Liệt kê file đã tạo.
3. Liệt kê env cần điền.
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

## 5. Prompt review base source sau khi Claude làm

```text
Hãy review base source vừa dựng cho XePrime.

Tập trung kiểm tra:
1. Monorepo có đúng cấu trúc apps/packages/prisma không.
2. Next.js App Router có dùng route groups và provider đúng không.
3. Redux Toolkit có chỉ giữ UI/client state không.
4. TanStack Query có dùng cho server data/cache không.
5. Có lỡ thêm Redux Saga hoặc thư viện calendar tính phí không.
6. styled-components/theme có tránh inline style không.
7. NestJS module/common guard/filter/interceptor có tổ chức rõ không.
8. Prisma schema có đúng snake_case map, ID Char(26), money Decimal không.
9. Auth/RBAC skeleton có tránh nhận tenant_id nguy hiểm không.
10. Docker/env/README/scripts có đủ để dev mới chạy local không.
11. Lint/typecheck/build/test có chạy được không.
12. Có TODO nào nguy hiểm cho production không.

Output:
- Findings High/Medium/Low.
- File/line nếu có.
- Cách sửa cụ thể.
- Danh sách việc phải sửa trước khi build module nghiệp vụ.
```

## 6. Nguồn kỹ thuật dùng để căn prompt

- Next.js App Router và project structure: https://nextjs.org/docs/app
- Next.js project structure: https://nextjs.org/docs/app/getting-started/project-structure
- NestJS workspace/monorepo: https://docs.nestjs.com/cli/monorepo
- Prisma với NestJS: https://docs.prisma.io/docs/guides/frameworks/nestjs
- TanStack Query SSR/hydration: https://tanstack.com/query/latest/docs/framework/react/guides/ssr
- Redux Toolkit với Next.js: https://redux-toolkit.js.org/usage/nextjs
- Ant Design với Next.js: https://ant.design/docs/react/use-with-next/
