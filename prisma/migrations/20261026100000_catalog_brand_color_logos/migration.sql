-- Logo hãng xe bản MÀU của design v2 (Figma "Bộ lọc" `19719:47126`) thay bộ icon xám vẽ tay
-- của migration gốc. Ảnh nằm ở `apps/web/public/brands/<key>.webp`.
--
-- Chỉ ghi vào ô admin CHƯA tự đổi: `icon_url` còn trống, hoặc còn trỏ đúng file SVG mặc định mà
-- migration gốc đã nạp. Logo admin đã tải lên ở màn "Danh mục hệ thống" (URL R2) giữ nguyên —
-- màn đó là nơi sửa logo về sau, migration này không giành quyền của nó.
--
-- File SVG cũ KHÔNG bị xoá: script `sync-brand-art.mjs` của app mobile còn đọc chúng.
UPDATE "catalog_items" AS c
SET "icon_url" = v.icon_url,
    "updated_at" = CURRENT_TIMESTAMP
FROM (
  VALUES
    ('vinfast', '/brands/vinfast.webp'),
    ('toyota', '/brands/toyota.webp'),
    ('hyundai', '/brands/hyundai.webp'),
    ('mitsubishi', '/brands/mitsubishi.webp'),
    ('mercedes', '/brands/mercedes.webp'),
    ('bmw', '/brands/bmw.webp')
) AS v(key, icon_url)
WHERE c."type" = 'vehicle_brand'
  AND c."key" = v.key
  AND (c."icon_url" IS NULL OR c."icon_url" = '/brands/' || v.key || '.svg');
