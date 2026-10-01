-- Chi nhánh của một PHIẾU THU CHI không gắn xe — ADR 0052.
--
-- Trước đây chi nhánh của phiếu chỉ suy được qua `vehicle_id`. Phiếu nhập tay không gắn xe
-- (thuê mặt bằng, lương, marketing) vì thế không thuộc chi nhánh nào, và tổng của từng chi
-- nhánh KHÔNG bằng tổng gian hàng. Đo trên dữ liệu thật: 122/562 phiếu (21,7%) không gắn xe.
--
-- Cột này CHỈ có nghĩa khi phiếu không gắn xe. Có xe thì chi nhánh luôn SUY TỪ XE — một phiếu
-- mang hai nguồn chi nhánh là cách chắc chắn để hai báo cáo nói hai số khác nhau về cùng một
-- đồng tiền. CHECK bên dưới làm điều đó bất khả thi, không phải "nhớ đừng làm".
--
-- Chi nhánh của phiếu, ở mọi truy vấn: COALESCE(vehicles.branch_id, receipts.branch_id).
-- NULL cả hai = khoản CHUNG toàn gian hàng, vẫn còn và vẫn được đếm riêng.
ALTER TABLE "public"."receipts" ADD COLUMN "branch_id" CHAR(26);

-- Khoá ngoại TỔ HỢP `(branch_id, tenant_id)`: chặn gán chi nhánh của gian hàng KHÁC ngay ở
-- database, không phụ thuộc tầng app nhớ kiểm (CLAUDE.md mục 6). `tenant_branches` đã có
-- unique `(id, tenant_id)` phục vụ đúng việc này.
ALTER TABLE "public"."receipts"
  ADD CONSTRAINT "receipts_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "public"."tenant_branches"("id", "tenant_id")
  -- NO ACTION, KHÔNG `SET NULL`: FK này TỔ HỢP, nên SET NULL sẽ set cả `tenant_id` — một cột
  -- NOT NULL. Lệnh xoá chi nhánh sẽ chết với lỗi NOT NULL thay vì nói đúng điều cần nói. Chi
  -- nhánh dừng hoạt động bằng `deleted_at` (xoá mềm), nên đường xoá cứng không có thật.
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."receipts"
  ADD CONSTRAINT "receipts_branch_only_without_vehicle"
  CHECK ("branch_id" IS NULL OR "vehicle_id" IS NULL);

-- Phục vụ bộ lọc chi nhánh của sổ thu chi và các báo cáo tiền: chỉ phiếu KHÔNG gắn xe mới đi
-- qua cột này, nên index partial giữ cây nhỏ hơn hẳn (dưới 1/4 số dòng).
CREATE INDEX "receipts_tenant_branch_idx" ON "public"."receipts" ("tenant_id", "branch_id")
  WHERE "branch_id" IS NOT NULL;

-- Danh mục BẮT BUỘC gắn xe — ADR 0052.
--
-- Đo trên dữ liệu thật, phiếu không gắn xe trộn HAI loại: khoản chung thật (marketing, văn
-- phòng) và khoản ĐÁNG LẼ phải gắn xe mà người nhập bỏ trống (đổ xăng, rửa xe, phí quá giờ).
-- Loại thứ hai là lỗ nhập liệu: nó rơi khỏi báo cáo hiệu quả theo xe và không ai biết để sửa.
-- Cờ này cho phép bắt buộc ô Xe ngay tại form, theo từng danh mục.
ALTER TABLE "public"."finance_categories"
  ADD COLUMN "requires_vehicle" BOOLEAN NOT NULL DEFAULT false;

-- Bộ lọc chi nhánh đọc `vehicles` ở MỌI màn (xe, đơn thuê, lịch, bảo dưỡng, thu chi, báo cáo):
-- mọi truy vấn đều quy về "xe nào thuộc các chi nhánh này". `branch_id` chưa có index nào — một
-- gian hàng 40 xe thì không ai thấy, nhưng đây là đường đọc NÓNG nhất của ADR 0052 và nó nằm
-- trong mọi subquery phạm vi. `tenant_id` đứng trước vì mọi truy vấn đều đã khoá theo tenant.
CREATE INDEX "vehicles_tenant_branch_idx" ON "public"."vehicles" ("tenant_id", "branch_id");
