# XePrime - Prompt bàn giao cho Claude Code / Cursor / VS Code

Ngày cập nhật: 22/07/2026

Mục tiêu của file này: dùng khi chuyển sang Claude Code/Cursor/VS Code, nơi agent không có lịch sử chat trước đó.

## 1. Prompt dán vào Claude Code ở lần đầu

```text
Bạn không có lịch sử chat trước đó, vì vậy hãy coi toàn bộ context nằm trong thư mục `docs`.

Bạn là senior fullstack engineer kiêm architect. Nhiệm vụ là dựng source code mới chuẩn product cho dự án XePrime, chuyển từ source Firebase hiện tại sang Next.js + NestJS + MySQL + Prisma.

Trước khi code, bắt buộc đọc các tài liệu sau theo thứ tự:

1. `docs/README.md`
2. `docs/xeprime_product_base_source_master_prompt.md`
3. `docs/xeprime_build_plan_nextjs_nestjs_prod.md`
4. `docs/xeprime_screen_spec_by_role_before_db.md`
5. `docs/xeprime_database_design.md`
6. `docs/xeprime_fe_base_stack_calendar.md`
7. `docs/xeprime_claude_max_task_prompts.md`

Sau khi đọc xong, hãy làm 3 việc:

1. Tóm tắt lại trong 20-30 dòng:
   - Mục tiêu dự án.
   - Kiến trúc chính.
   - Stack frontend/backend/database.
   - Role/scope chính.
   - Những điều cấm làm.
2. Đề xuất cây thư mục source mới.
3. Sau khi tóm tắt xong mới bắt đầu implement Phase 0 - Product Base Source.

Yêu cầu kỹ thuật bắt buộc:

- Source mới không sửa trực tiếp source Firebase hiện tại.
- Dựng monorepo dùng pnpm workspace.
- `apps/web`: Next.js App Router + TypeScript.
- `apps/api`: NestJS modular monolith.
- `packages/types`, `packages/validators`, `packages/config`, `packages/ui`.
- `prisma/schema.prisma` dùng MySQL 8.
- Frontend dùng Ant Design, styled-components, React Hook Form, Yup.
- Client/UI state dùng Redux Toolkit.
- Server data/cache/mutation dùng TanStack Query.
- Không dùng Redux Saga ở MVP.
- Không dùng FullCalendar Premium/Bryntum hoặc thư viện calendar tính phí.
- Màn lịch thuê xe dùng custom scheduler: TanStack Virtual + dnd-kit.
- Backend dùng Prisma, Auth/RBAC Guard, ValidationPipe, exception filter, Swagger.
- Firebase giữ Auth provider, Firestore chat realtime recent, Storage.
- MySQL là nguồn dữ liệu chính cho nghiệp vụ.
- API tenant-sensitive không nhận `tenant_id` từ body/query một cách nguy hiểm; backend lấy scope từ user membership.
- Không hard code role/status/permission trong UI component.
- Không dùng inline style.

Phase đầu tiên cần implement:

1. Setup monorepo.
2. Setup Next.js web app.
3. Setup NestJS API app.
4. Setup Prisma + MySQL Docker Compose.
5. Setup `.env.example`.
6. Setup README chạy local.
7. Setup providers frontend:
   - AntD
   - Redux
   - TanStack Query
   - styled-components/theme
8. Setup layout placeholder:
   - public
   - auth
   - manage
9. Setup backend modules skeleton:
   - health
   - auth
   - users
   - tenants
   - rbac
   - audit
   - vehicles
   - bookings
   - calendar
   - chat
   - platform-admin
10. Setup Prisma schema tối thiểu:
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
11. Setup seed:
   - platform admin
   - shop owner
   - customer
   - 1 tenant active
   - 5-10 xe demo
   - vài booking demo cho calendar
12. Setup scripts:
   - lint
   - typecheck
   - build
   - test
   - db:up
   - db:migrate
   - db:seed
   - dev

Trước khi kết thúc Phase 0, phải chạy hoặc báo rõ nếu chưa chạy được:

- install dependencies
- lint
- typecheck
- build
- test
- prisma validate

Output cuối cùng:

1. Cây thư mục đã tạo.
2. File chính đã tạo/sửa.
3. Cách chạy local.
4. Env cần cấu hình.
5. Kết quả check/build/test.
6. TODO còn lại cho Phase 1.
```

## 2. Prompt ngắn nếu Claude Code đã đọc docs

```text
Hãy tiếp tục theo `docs/xeprime_product_base_source_master_prompt.md`.

Nhiệm vụ hiện tại: implement Phase 0 - Product Base Source.

Không dùng Redux Saga, không dùng thư viện calendar tính phí, không sửa source Firebase cũ. Dùng Next.js App Router, NestJS modular monolith, MySQL/Prisma, Redux Toolkit cho UI state, TanStack Query cho server data.

Trước khi code hãy tóm tắt lại plan ngắn, sau đó implement, chạy check/build/test, rồi báo cáo file đã tạo và cách chạy local.
```

## 3. Prompt review sau khi Claude Code code xong

```text
Hãy review source vừa dựng theo góc nhìn senior engineer.

Tập trung:

1. Monorepo có đúng cấu trúc apps/packages/prisma không.
2. Next.js App Router/provider có đúng không.
3. Redux Toolkit có bị dùng sai để cache server data không.
4. TanStack Query có dùng đúng cho API data/mutation không.
5. Có lỡ thêm Redux Saga không.
6. Có lỡ thêm FullCalendar Premium/Bryntum không.
7. Có inline style/hard code role/status không.
8. NestJS guards/filter/validation/prisma module có chuẩn không.
9. API tenant-sensitive có nhận tenant_id nguy hiểm từ client không.
10. Prisma schema có đúng mapping snake_case, ID Char(26), money Decimal không.
11. Docker/env/scripts/README có đủ để dev khác chạy local không.
12. Lint/typecheck/build/test có pass không.

Output:
- Findings High/Medium/Low.
- File/line cụ thể nếu có.
- Cách sửa.
- Việc phải sửa trước Phase 1.
```

## 4. Cách dùng thực tế

1. Tạo folder source mới, ví dụ `E:/Softrent/xeprime-next-nest`.
2. Copy thư mục `docs` hiện tại sang source mới.
3. Mở source mới bằng VS Code/Cursor.
4. Mở Claude Code trong đúng folder source mới.
5. Dán prompt ở mục 1.
6. Khi Claude Code hoàn thành Phase 0, dùng prompt review ở mục 3.
