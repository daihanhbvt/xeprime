-- Phiếu NHẬP TAY luôn thuộc về một chi nhánh — ADR 0052.
--
-- Vì sao không để "toàn gian hàng" làm một lựa chọn: một khoản chi 1tr xếp ngoài mọi chi nhánh
-- thì lọc chi nhánh A ra 0, B ra 0, ... E ra 0, nhưng tổng ra 1tr. Người dùng không đối chiếu
-- được con số nào nữa, và cái "bucket" đó phải được giải thích lại ở MỌI màn báo cáo, mãi mãi.
-- Mỗi đồng tiền đều phát sinh ở một chỗ có thật; chọn chỗ đó là việc của người nhập, không phải
-- việc của báo cáo đi đoán.
--
-- Danh mục KHÔNG suy ra được chi nhánh: "Chi phí văn phòng" ở Quận 5 và ở Cầu Giấy là hai khoản
-- khác nhau mang đúng một cái tên. Nên phải hỏi, và phải hỏi BẮT BUỘC — để tuỳ chọn là lặp lại
-- đúng cái đã hỏng: ô "Xe" vốn tuỳ chọn, và 122/562 phiếu đã trôi ra ngoài vì người nhập bỏ qua.

-- 1. Trả các phiếu mồ côi sẵn có về chi nhánh mặc định (mọi gian hàng đều có một cái).
UPDATE "public"."receipts" r
SET "branch_id" = b.id
FROM "public"."tenant_branches" b
WHERE b."tenant_id" = r."tenant_id"
  AND b."deleted_at" IS NULL
  AND b."is_default" = true
  AND r."source" = 'manual'
  AND r."vehicle_id" IS NULL
  AND r."branch_id" IS NULL;

-- Gian hàng không có chi nhánh mặc định thì lấy chi nhánh còn sống bất kỳ (ổn định theo mã).
UPDATE "public"."receipts" r
SET "branch_id" = (
  SELECT b.id FROM "public"."tenant_branches" b
  WHERE b."tenant_id" = r."tenant_id" AND b."deleted_at" IS NULL
  ORDER BY b."code" LIMIT 1
)
WHERE r."source" = 'manual' AND r."vehicle_id" IS NULL AND r."branch_id" IS NULL;

-- 2. Bất biến ở DATABASE, không phải "nhớ kiểm ở service".
--
-- Chỉ ràng buộc phiếu `manual`: phiếu TỰ ĐỘNG sinh từ nghiệp vụ luôn có xe (đo trên dữ liệu
-- thật: 440/440), và một nguồn tự động tương lai không gắn xe cũng không nên bị luật của ô nhập
-- tay chặn lại.
ALTER TABLE "public"."receipts"
  ADD CONSTRAINT "receipts_manual_needs_branch_or_vehicle"
  CHECK ("source" <> 'manual' OR "vehicle_id" IS NOT NULL OR "branch_id" IS NOT NULL);

-- 3. Bật cờ `requires_vehicle` cho các danh mục hệ thống KHÔNG có nghĩa nếu thiếu xe.
--
-- Phải nằm ở ĐÂY, không chỉ ở seed: production chỉ chạy `migrate deploy`; seed `demo` không bao
-- giờ chạy ở đó và `SEED_MODE=system` cũng không phải một bước của quy trình deploy. Để cờ chỉ
-- sống trong seed là để luật nhập liệu này không bao giờ có hiệu lực ở đúng nơi cần nó.
--
-- Danh mục hệ thống là hàng DÙNG CHUNG (`tenant_id IS NULL`) và seed nhận diện chúng theo TÊN,
-- nên ở đây cũng khớp theo tên — hai đường phải nói về cùng một tập hàng.
UPDATE "public"."finance_categories"
SET "requires_vehicle" = true
WHERE "tenant_id" IS NULL
  AND "is_system" = true
  AND "name" IN (
    'Phí quá giờ', 'Phí đền bù va quẹt', 'Phí phạt nguội',
    'Bảo dưỡng/Thay nhớt', 'Sửa chữa sự cố', 'Mua bảo hiểm',
    'Rửa xe', 'Giao/nhận xe', 'Đổ xăng'
  );
