-- ---------------------------------------------------------------------------
-- Phase 7 (ngoài lõi) — 3 màn giám sát toàn hệ thống của admin nền tảng:
-- All vehicles / All bookings / All customers.
--
-- Khác mọi list đã có: các query này KHÔNG có `tenant_id` dẫn đường, nên toàn bộ
-- index composite `(tenant_id, …)` sẵn có đều vô dụng với chúng. Ba shape cần phủ:
--   1. feed mới-nhất-trước không lọc            → btree (created_at)
--   2. feed mới-nhất-trước lọc theo trạng thái  → btree (status, created_at)
--   3. ô tìm kiếm ILIKE '%q%' theo tên/biển số  → GIN trigram (pg_trgm đã bật ở init)
--
-- Không có (3) thì mỗi lần admin gõ vào ô tìm kiếm là một seq scan toàn bảng
-- `vehicles`/`users`/`bookings` — chính là 3 bảng lớn nhất hệ thống.
-- ---------------------------------------------------------------------------

-- Khách thuê: sắp theo ngày tạo + tìm theo tên. SĐT/email đã có unique index riêng
-- (tra cứu chính xác của bộ phận hỗ trợ đi qua đó).
CREATE INDEX "users_created_at_idx" ON "users"("created_at");
CREATE INDEX "users_display_name_trgm_idx" ON "users" USING GIN ("display_name" gin_trgm_ops);

-- Xe toàn hệ thống: lọc theo trạng thái duyệt public (mặc định của màn kiểm duyệt)
-- và tìm theo tên/biển số/mã. GIN phải phủ ĐỦ CẢ BA cột của vị từ OR: Postgres chỉ BitmapOr
-- được khi mọi nhánh có đường index — thiếu một nhánh là cả câu rơi về seq scan.
CREATE INDEX "vehicles_created_at_idx" ON "vehicles"("created_at");
CREATE INDEX "vehicles_public_status_created_at_idx" ON "vehicles"("public_status", "created_at");
CREATE INDEX "vehicles_search_trgm_idx" ON "vehicles" USING GIN ("name" gin_trgm_ops, "plate_number" gin_trgm_ops, "code" gin_trgm_ops);

-- Đơn thuê toàn hệ thống: `bookings_created_at_idx` đã có từ init; thiếu shape lọc
-- theo trạng thái xuyên tenant, tra theo SĐT khách, và tìm theo mã đơn/tên khách.
CREATE INDEX "bookings_status_created_at_idx" ON "bookings"("status", "created_at");
CREATE INDEX "bookings_customer_phone_idx" ON "bookings"("customer_phone");
CREATE INDEX "bookings_search_trgm_idx" ON "bookings" USING GIN ("code" gin_trgm_ops, "customer_name" gin_trgm_ops);
