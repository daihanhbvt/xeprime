-- Phân quyền theo CHI NHÁNH cho thành viên gian hàng — ADR 0052.
--
-- Viết tay vì Prisma không mô tả được hai thứ ở đây: FK TỔ HỢP `(x, tenant_id)` và `CHECK`.
-- Đọc header của `20260821000000_init` trước khi chạy `migrate dev`: nó cảnh báo rằng các FK tổ
-- hợp không nằm trong `schema.prisma` và Prisma sẽ sinh lệnh DROP chúng.

-- 1. Phạm vi của thành viên. Mặc định `all` để mọi membership ĐANG CÓ giữ nguyên hành vi sau
--    deploy — không ai mất quyền vì một lần chạy migration.
ALTER TABLE "public"."tenant_memberships"
  ADD COLUMN "branch_scope" VARCHAR(20) NOT NULL DEFAULT 'all';

-- Giá trị hợp lệ do `@xeprime/types` giữ (ADR 0005), nhưng cột này quyết định ai thấy dữ liệu
-- gì — nên DB chặn luôn, không để một lần ghi tay tạo ra một phạm vi không ai xử lý được.
ALTER TABLE "public"."tenant_memberships"
  ADD CONSTRAINT "tm_branch_scope_valid" CHECK ("branch_scope" IN ('all', 'limited'));

-- Mục tiêu cho FK tổ hợp của `membership_branches`.
ALTER TABLE "public"."tenant_memberships"
  ADD CONSTRAINT "tenant_memberships_id_tenant_id_key" UNIQUE ("id", "tenant_id");

-- 2. Chi nhánh được giao. Bảng NỐI vì một người phụ trách được nhiều chi nhánh.
CREATE TABLE "public"."membership_branches" (
  "membership_id" CHAR(26) NOT NULL,
  "branch_id"     CHAR(26) NOT NULL,
  "tenant_id"     CHAR(26) NOT NULL,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "membership_branches_pkey" PRIMARY KEY ("membership_id", "branch_id")
);

-- Hai FK TỔ HỢP mang theo `tenant_id`: DB tự bác bỏ việc giao cho một thành viên chi nhánh của
-- gian hàng KHÁC. Đây là lý do cột `tenant_id` được lặp lại ở bảng nối.
ALTER TABLE "public"."membership_branches"
  ADD CONSTRAINT "membership_branches_membership_fkey"
  FOREIGN KEY ("membership_id", "tenant_id")
  REFERENCES "public"."tenant_memberships"("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."membership_branches"
  ADD CONSTRAINT "membership_branches_branch_fkey"
  FOREIGN KEY ("branch_id", "tenant_id")
  REFERENCES "public"."tenant_branches"("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

-- KHÔNG có index riêng cho `membership_id`: PRIMARY KEY (membership_id, branch_id) đã là một
-- B-tree mở đầu bằng đúng cột đó, nên đường đọc NÓNG của `TenantScopeGuard` ("chi nhánh nào của
-- thành viên này") dùng luôn PK. Thêm index nữa chỉ là một cây nữa phải ghi ở mỗi lượt UPDATE.

-- Đường đọc ngược: "ai đang phụ trách chi nhánh này" — cần khi ngừng hoạt động một chi nhánh.
CREATE INDEX "membership_branches_branch_id_idx"
  ON "public"."membership_branches"("branch_id");
