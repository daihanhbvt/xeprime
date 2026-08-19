-- Epic "nối tiền vào sổ Thu-Chi" — Slice 1: nguồn gốc phiếu + ngày phát sinh trung thực.
--
-- Toàn bộ migration này là THÊM: không xoá cột, không sửa một ký tự nào của phiếu cũ ngoài việc
-- điền các cột mới. Chạy lại lần hai ra 0 dòng (mọi UPDATE đều có vị từ "chưa có giá trị").

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. receipts.occurred_at — khi tiền DI CHUYỂN, khác created_at (khi ai đó GÕ vào)
-- ─────────────────────────────────────────────────────────────────────────────
-- Trước đây mọi bộ lọc và tổng hợp chạy trên `created_at`, nên một phiếu chi nhập bù cho tuần
-- trước rơi vào kỳ nhập chứ không phải kỳ phát sinh. Dữ liệu cũ không phân biệt được hai thứ đó,
-- nên backfill bằng chính `created_at` — đúng với thực tế "nhập ngay lúc phát sinh".
ALTER TABLE "receipts" ADD COLUMN "occurred_at" TIMESTAMPTZ(3);

UPDATE "receipts" SET "occurred_at" = "created_at" WHERE "occurred_at" IS NULL;

ALTER TABLE "receipts"
  ALTER COLUMN "occurred_at" SET NOT NULL,
  ALTER COLUMN "occurred_at" SET DEFAULT now();

CREATE INDEX "receipts_tenant_occurred_idx" ON "receipts" ("tenant_id", "occurred_at");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. receipts.source + source_ref_id — nguồn gốc, và đường quay về nghiệp vụ gốc
-- ─────────────────────────────────────────────────────────────────────────────
-- `booking_id IS NOT NULL` KHÔNG đủ để suy ra nguồn: thu tiền thuê, thu cọc và hoàn cọc đều gắn
-- đơn nhưng đảo ở ba module khác nhau. Cặp (source, source_ref_id) vừa nói nguồn vừa trỏ thẳng về
-- bản ghi gốc, nên khi chặn huỷ trực tiếp hệ thống chỉ được ĐÚNG chỗ phải đảo.
ALTER TABLE "receipts"
  ADD COLUMN "source"        VARCHAR(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN "source_ref_id" CHAR(26);

ALTER TABLE "receipts" ADD CONSTRAINT "receipts_source_check"
  CHECK ("source" IN ('manual', 'payment', 'deposit', 'deposit_refund', 'maintenance'));

-- Phiếu tay không có nguồn; phiếu tự động BẮT BUỘC có. Để lửng lơ ở tầng app thì chỉ cần một
-- đường ghi quên truyền là sinh ra phiếu "tự động" không ai lần ngược được.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_source_ref_check" CHECK (
  ("source" =  'manual' AND "source_ref_id" IS NULL) OR
  ("source" <> 'manual' AND "source_ref_id" IS NOT NULL)
);

-- Phiếu cũ sinh từ thu tiền đơn: nhận diện qua chính liên kết payments.receipt_id đã có.
-- Mọi payment trước migration này đều là tiền THUÊ (kind mặc định 'rental', chưa có đường ghi
-- cọc nào tồn tại), nên tất cả về 'payment', không có 'deposit'.
UPDATE "receipts" r
   SET "source" = 'payment', "source_ref_id" = p."id"
  FROM "payments" p
 WHERE p."receipt_id" = r."id" AND r."source" = 'manual';

-- Chống ghi kép ở tầng DB: hoàn tất lại một phiếu bảo dưỡng, hay retry một lần thu, không được
-- đẻ phiếu thứ hai cho cùng một nghiệp vụ. Phủ CẢ dòng đã huỷ — vì thế đường sửa phiếu tự động
-- là UPDATE tại chỗ, không phải huỷ-rồi-tạo-lại.
CREATE UNIQUE INDEX "receipts_source_ref_uniq"
  ON "receipts" ("tenant_id", "source", "source_ref_id")
  WHERE "source" <> 'manual';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. receipts.tenant_customer_id — cột có từ S-01, chưa đường ghi nào điền
-- ─────────────────────────────────────────────────────────────────────────────
-- `b.tenant_id = r.tenant_id` là BẮT BUỘC, không phải cho chắc: FK là composite
-- (tenant_customer_id, tenant_id), backfill lệch tenant sẽ vỡ ngay tại đây.
UPDATE "receipts" r
   SET "tenant_customer_id" = b."tenant_customer_id"
  FROM "bookings" b
 WHERE b."id" = r."booking_id"
   AND b."tenant_id" = r."tenant_id"
   AND r."tenant_customer_id" IS NULL
   AND b."tenant_customer_id" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. finance_categories.system_key — khoá ổn định thay cho tên tiếng Việt
-- ─────────────────────────────────────────────────────────────────────────────
-- Phiếu tự động phải rơi vào đúng danh mục. Tra bằng `name = 'Thanh toán đơn'` là buộc một quan
-- hệ nghiệp vụ vào một chuỗi hiển thị — đổi một dấu cách là mọi phiếu tự động mất danh mục.
ALTER TABLE "finance_categories" ADD COLUMN "system_key" VARCHAR(50);

UPDATE "finance_categories" SET "system_key" = 'booking_payment'
 WHERE "is_system" AND "tenant_id" IS NULL AND "name" = 'Thanh toán đơn'  AND "system_key" IS NULL;
UPDATE "finance_categories" SET "system_key" = 'deposit'
 WHERE "is_system" AND "tenant_id" IS NULL AND "name" = 'Tiền cọc'         AND "system_key" IS NULL;
UPDATE "finance_categories" SET "system_key" = 'deposit_refund'
 WHERE "is_system" AND "tenant_id" IS NULL AND "name" = 'Hoàn cọc'         AND "system_key" IS NULL;
UPDATE "finance_categories" SET "system_key" = 'maintenance'
 WHERE "is_system" AND "tenant_id" IS NULL AND "name" = 'Bảo dưỡng/Thay nhớt' AND "system_key" IS NULL;
UPDATE "finance_categories" SET "system_key" = 'repair'
 WHERE "is_system" AND "tenant_id" IS NULL AND "name" = 'Sửa chữa sự cố'   AND "system_key" IS NULL;

CREATE UNIQUE INDEX "finance_categories_system_key_uniq"
  ON "finance_categories" ("system_key") WHERE "system_key" IS NOT NULL;

-- Danh mục của gian hàng không bao giờ mang khoá hệ thống — nếu không, một shop đổi tên danh mục
-- riêng thành "Tiền cọc" là cướp được đích đến của mọi phiếu cọc.
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_system_key_check"
  CHECK ("system_key" IS NULL OR "is_system" = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Số phiếu là chứng từ kế toán — trùng là hỏng
-- ─────────────────────────────────────────────────────────────────────────────
-- `receipt_no` sinh ở tầng app (PT-YYYYMMDD-XXXX, hậu tố 4 ký tự ULID) và tới giờ không có ràng
-- buộc nào. Thêm bây giờ rẻ; thêm sau khi có dữ liệu thật thì phải đi dọn trùng trước.
CREATE UNIQUE INDEX "receipts_tenant_receipt_no_uniq"
  ON "receipts" ("tenant_id", "receipt_no") WHERE "receipt_no" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Index cho ô tìm kiếm và bộ lọc theo xe
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Ô tìm kiếm dùng ILIKE '%q%' trên hai cột. Postgres chỉ BitmapOr khi MỌI nhánh của vị từ OR có
-- index — thiếu một cột là cả vị từ rơi về seq scan (bài học từ migration giám sát nền tảng 04/08).
CREATE INDEX "receipts_search_trgm_idx" ON "receipts"
  USING gin ("receipt_no" gin_trgm_ops, "reference_code" gin_trgm_ops);

CREATE INDEX "receipts_tenant_vehicle_idx" ON "receipts" ("tenant_id", "vehicle_id")
  WHERE "vehicle_id" IS NOT NULL;
