-- Logo hãng xe đợt 2: lấy từ thư viện "Car-Brand-Logo" của design v2 (Figma `21746:58162`) và
-- popup Bộ lọc xe máy (`19719:49416`, SYM · Yamaha). Chỉ các hãng CÓ trong danh mục của dự án —
-- thư viện có ~280 hãng, phần lớn không phân phối chính hãng ở Việt Nam nên không được thêm vào.
--
-- Ảnh ở `apps/web/public/brands/<key>.webp`, đã cắt bỏ dòng chữ tên hãng (ô logo ở bộ lọc chỉ
-- 20×20). Mazda giữ icon cũ: symbol Mazda trong thư viện Figma rỗng. Piaggio, Vespa chưa có logo
-- trong thiết kế ⇒ vẫn hiện chữ cái đầu cho tới khi admin tải lên.
--
-- Cùng luật với đợt 1 (`20261026100000_catalog_brand_color_logos`): chỉ ghi vào ô admin CHƯA tự
-- đổi — `icon_url` trống hoặc còn trỏ file SVG mặc định. Hãng tạo bởi seed (SYM) nhận logo ngay lúc
-- tạo qua `ADDITIONAL_BRANDS`; câu lệnh dưới phủ các DB đã chạy seed trước đó.
UPDATE "catalog_items" AS c
SET "icon_url" = v.icon_url,
    "updated_at" = CURRENT_TIMESTAMP
FROM (
  VALUES
    ('kia', '/brands/kia.webp'),
    ('honda', '/brands/honda.webp'),
    ('ford', '/brands/ford.webp'),
    ('suzuki', '/brands/suzuki.webp'),
    ('nissan', '/brands/nissan.webp'),
    ('peugeot', '/brands/peugeot.webp'),
    ('volkswagen', '/brands/volkswagen.webp'),
    ('mini', '/brands/mini.webp'),
    ('chevrolet', '/brands/chevrolet.webp'),
    ('yamaha', '/brands/yamaha.webp'),
    ('sym', '/brands/sym.webp')
) AS v(key, icon_url)
WHERE c."type" = 'vehicle_brand'
  AND c."key" = v.key
  AND (c."icon_url" IS NULL OR c."icon_url" = '/brands/' || v.key || '.svg');
