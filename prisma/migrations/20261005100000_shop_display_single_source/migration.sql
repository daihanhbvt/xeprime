-- Tên hiển thị của gian hàng: MỘT nguồn là `tenants.name` (05/10/2026).
--
-- Trước migration này có hai cột cùng nghĩa: form hồ sơ gian hàng ghi `tenant_profiles.display_name`,
-- còn mọi nơi khách nhìn thấy (thẻ xe, trang gian hàng, chat, chuyến, hợp đồng) đọc `tenants.name` —
-- cột chỉ được ghi một lần lúc đăng ký. Chủ xe đổi tên ở hồ sơ thì khách vẫn thấy tên cũ mãi mãi.
--
-- Viết TAY: chỉ hai lệnh dưới, không kéo theo drift của `prisma migrate diff` (xem header baseline
-- `20260821000000_init`).
--
-- 1. Giữ tên người dùng ĐÃ SỬA: bản ở hồ sơ là bản mới nhất họ gõ (form chỉ ghi vào đó), nên nó
--    thắng `tenants.name` khi khác nhau. Bỏ qua chuỗi trắng — `tenants.name` NOT NULL và đã có giá trị.
UPDATE "tenants" t
SET "name" = btrim(p."display_name"),
    "updated_at" = now()
FROM "tenant_profiles" p
WHERE p."tenant_id" = t."id"
  AND btrim(coalesce(p."display_name", '')) <> ''
  AND btrim(p."display_name") <> t."name";

-- 2. Gỡ bản sao. `slug` KHÔNG đổi theo tên — link trang gian hàng đã chia sẻ phải sống.
ALTER TABLE "tenant_profiles" DROP COLUMN "display_name";
