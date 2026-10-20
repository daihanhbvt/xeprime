-- ═══════════════════════════════════════════════════════════════════════════
-- Nhãn danh mục xe hai ngôn ngữ (20/10/2026 — ADR 0012)
--
-- `catalog_items.label` / `description` là chữ tiếng Việt do admin nhập; giao diện tiếng Anh vẫn
-- hiện "Xăng", "Camera lùi", "7 chỗ · gầm cao". Thêm bản tiếng Anh ĐI KÈM chứ không thay: một
-- response `/catalog` chở cả hai nhãn, client chọn theo ngôn ngữ đang hiển thị — nên cache công
-- khai của danh mục vẫn theo URL, không tách theo ngôn ngữ (ADR 0012 :96).
--
-- Cả hai cột cho phép NULL: mục chưa có bản dịch (tên hãng là tên riêng — "Toyota" không dịch)
-- thì giao diện rơi về nhãn gốc. Có giá trị thì không được là chuỗi trắng — cùng luật với
-- `catalog_items_label_not_blank`.
--
-- Backfill theo KHOÁ cho bộ dữ liệu nền (baseline + seed `catalog-sync`). `description_en` chỉ nạp
-- khi mô tả tiếng Việt còn ĐÚNG bản gốc: admin đã sửa mô tả thì một câu tiếng Anh dịch từ bản cũ
-- sẽ nói một điều khác — để trống cho admin tự nhập ở màn danh mục.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "catalog_items"
  ADD COLUMN "label_en" VARCHAR(120),
  ADD COLUMN "description_en" VARCHAR(255);

ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_label_en_not_blank"
    CHECK ("label_en" IS NULL OR btrim("label_en") <> ''),
  ADD CONSTRAINT "catalog_items_description_en_not_blank"
    CHECK ("description_en" IS NULL OR btrim("description_en") <> '');

UPDATE "catalog_items" AS c
SET "label_en" = v.label_en
FROM (VALUES
  ('body_type', 'mini', 'Mini car'),
  ('body_type', 'sedan', 'Sedan'),
  ('body_type', 'cuv', 'CUV'),
  ('body_type', 'suv', 'SUV'),
  ('body_type', 'mpv', 'MPV (7 seats)'),
  ('body_type', 'pickup', 'Pickup truck'),
  ('body_type', 'van', 'Van'),
  ('body_type', 'minibus', '16-seat minibus'),
  ('body_type', 'cargo', 'Cargo truck'),
  ('fuel_type', 'gasoline', 'Petrol'),
  ('fuel_type', 'diesel', 'Diesel'),
  ('fuel_type', 'electric', 'Electric'),
  ('fuel_type', 'hybrid', 'Hybrid'),
  ('fuel_type', 'plug_in_hybrid', 'Plug-in Hybrid (PHEV)'),
  ('vehicle_feature', 'bluetooth', 'Bluetooth'),
  ('vehicle_feature', 'gps', 'GPS navigation'),
  ('vehicle_feature', 'backup_camera', 'Reversing camera'),
  ('vehicle_feature', 'camera_360', '360° camera'),
  ('vehicle_feature', 'dash_camera', 'Dash cam'),
  ('vehicle_feature', 'reverse_sensor', 'Parking sensors'),
  ('vehicle_feature', 'sunroof', 'Sunroof'),
  ('vehicle_feature', 'etc', 'ETC toll tag'),
  ('vehicle_feature', 'spare_tire', 'Spare tyre'),
  ('vehicle_feature', 'airbag', 'Airbags'),
  ('vehicle_feature', 'usb', 'USB port'),
  ('vehicle_feature', 'screen', 'Infotainment screen'),
  ('vehicle_feature', 'map', 'Maps'),
  ('vehicle_feature', 'child_seat', 'Child seat'),
  ('vehicle_feature', 'abs', 'ABS brakes'),
  ('vehicle_feature', 'traction_control', 'Traction control'),
  ('vehicle_feature', 'smart_key', 'Smart key'),
  ('vehicle_feature', 'phone_holder', 'Phone holder'),
  ('vehicle_feature', 'top_box', 'Top box'),
  ('vehicle_feature', 'helmet_included', 'Helmet included'),
  ('vehicle_feature', 'raincoat_included', 'Raincoat included'),
  ('vehicle_feature', 'anti_theft', 'Anti-theft lock')
) AS v(type, key, label_en)
WHERE c."type" = v.type AND c."key" = v.key AND c."label_en" IS NULL;

UPDATE "catalog_items" AS c
SET "description_en" = v.description_en
FROM (VALUES
  ('body_type', 'mini', '4 chỗ', '4 seats'),
  ('body_type', 'sedan', '4 chỗ', '4 seats'),
  ('body_type', 'cuv', '5 chỗ · gầm cao', '5 seats · high clearance'),
  ('body_type', 'suv', '7 chỗ · gầm cao', '7 seats · high clearance'),
  ('body_type', 'mpv', '7 chỗ · gầm thấp', '7 seats · low clearance'),
  ('body_type', 'pickup', 'Bán tải', 'Pickup'),
  ('body_type', 'van', '7 chỗ · minivan', '7 seats · minivan'),
  ('body_type', 'minibus', '16 chỗ', '16 seats'),
  ('body_type', 'cargo', 'Xe tải', 'Truck')
) AS v(type, key, description_vi, description_en)
WHERE c."type" = v.type
  AND c."key" = v.key
  AND c."description" = v.description_vi
  AND c."description_en" IS NULL;
