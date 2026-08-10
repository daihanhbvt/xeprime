-- ---------------------------------------------------------------------------
-- catalog_items — danh mục dữ liệu dùng chung cho BỘ LỌC
--
-- Bốn chiều lọc của marketplace (hãng xe, kiểu dáng, nhiên liệu, tiện ích) trước đây là hằng số
-- TypeScript trong `@xeprime/types`: platform admin không sửa được, thêm một hãng xe phải sửa
-- code và deploy, và không màn quản trị nào tạo được dữ liệu này. Chuyển sang DB để admin là
-- NGUỒN DUY NHẤT; form tạo/sửa xe (manage) và bộ lọc (public) chỉ đọc.
--
-- MỘT bảng chung thay vì bốn bảng riêng: cả bốn cùng shape (key/label/mô tả/ảnh/thứ tự/bật-tắt)
-- và cùng một màn quản trị; tách ra chỉ nhân bốn lần code mà không thêm được ràng buộc nào.
--
-- `key` là giá trị LƯU trên `vehicles`/`public_listings` — đổi nhãn không đụng dữ liệu xe.
-- CatalogService là đường ghi duy nhất của bảng này.
-- ---------------------------------------------------------------------------

CREATE TABLE "catalog_items" (
    "id"          CHAR(26) NOT NULL,
    -- @xeprime/types → CatalogType
    "type"        VARCHAR(50) NOT NULL,
    -- Slug lưu xuống cột xe (vehicles.brand / body_type / fuel_type, vehicle_features.feature_key).
    -- Bất biến sau khi tạo: sửa key = mồ côi toàn bộ xe đang trỏ vào.
    "key"         VARCHAR(80) NOT NULL,
    "label"       VARCHAR(120) NOT NULL,
    -- Dòng phụ dưới nhãn ở picker/bộ lọc — ví dụ "5 chỗ · gầm cao" cho CUV.
    "description" VARCHAR(255),
    -- Ảnh minh hoạ: kiểu dáng dùng /body-types/*.png, hãng xe dùng logo /brands/*.svg.
    "icon_url"    TEXT,
    "sort_order"  INTEGER NOT NULL DEFAULT 0,
    -- Tắt = ẩn khỏi form và bộ lọc. KHÔNG xoá dữ liệu xe đang trỏ vào key này, nên xe cũ vẫn
    -- hiển thị đúng nhãn; chỉ không chọn mới được nữa.
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id"),
    -- Bộ giá trị đóng: thêm chiều lọc mới là một quyết định có migration, không phải gõ nhầm.
    CONSTRAINT "catalog_items_type_check" CHECK (
        "type" IN ('vehicle_brand', 'body_type', 'fuel_type', 'vehicle_feature')
    ),
    -- Nhãn rỗng lọt qua thì bộ lọc hiện ô trắng — chặn ở DB, không chỉ ở DTO.
    CONSTRAINT "catalog_items_label_not_blank" CHECK (btrim("label") <> '')
);

-- Trùng key trong cùng một chiều = hai dòng cùng nghĩa trong bộ lọc. Chặn ở DB.
CREATE UNIQUE INDEX "catalog_items_type_key_key" ON "catalog_items"("type", "key");
-- Query duy nhất của bảng: "các mục đang bật của chiều X, theo thứ tự hiển thị".
CREATE INDEX "catalog_items_type_active_sort_order_idx" ON "catalog_items"("type", "active", "sort_order");

INSERT INTO "catalog_items" ("id", "type", "key", "label", "description", "icon_url", "sort_order", "updated_at") VALUES
    ('01KZMFG500Y4H4BEK3RMZNWJ81', 'vehicle_brand', 'vinfast', 'VinFast', NULL, '/brands/vinfast.svg', 0, CURRENT_TIMESTAMP),
    ('01KZMFG500G3QZDS0VVTZ2574D', 'vehicle_brand', 'toyota', 'Toyota', NULL, '/brands/toyota.svg', 1, CURRENT_TIMESTAMP),
    ('01KZMFG500YZVE15GWXZ4TV1C3', 'vehicle_brand', 'hyundai', 'Hyundai', NULL, '/brands/hyundai.svg', 2, CURRENT_TIMESTAMP),
    ('01KZMFG50082G0TK0ZKB4GPPXM', 'vehicle_brand', 'kia', 'Kia', NULL, '/brands/kia.svg', 3, CURRENT_TIMESTAMP),
    ('01KZMFG5005T550JG27C8F6M8Z', 'vehicle_brand', 'mazda', 'Mazda', NULL, '/brands/mazda.svg', 4, CURRENT_TIMESTAMP),
    ('01KZMFG500N60QM3KVRJ7AJJ9Z', 'vehicle_brand', 'honda', 'Honda', NULL, '/brands/honda.svg', 5, CURRENT_TIMESTAMP),
    ('01KZMFG5003E9GRFAYEG7CD4AH', 'vehicle_brand', 'ford', 'Ford', NULL, '/brands/ford.svg', 6, CURRENT_TIMESTAMP),
    ('01KZMFG500D49RRA508XAR9B2F', 'vehicle_brand', 'mitsubishi', 'Mitsubishi', NULL, '/brands/mitsubishi.svg', 7, CURRENT_TIMESTAMP),
    ('01KZMFG500JWNPFVVFRNWPT56D', 'vehicle_brand', 'suzuki', 'Suzuki', NULL, NULL, 8, CURRENT_TIMESTAMP),
    ('01KZMFG500E782DBR5DEM8SDJ5', 'vehicle_brand', 'nissan', 'Nissan', NULL, '/brands/nissan.svg', 9, CURRENT_TIMESTAMP),
    ('01KZMFG500VPYE6EXBCZYXGRX3', 'vehicle_brand', 'peugeot', 'Peugeot', NULL, NULL, 10, CURRENT_TIMESTAMP),
    ('01KZMFG500APXVA1SCVARJ5813', 'vehicle_brand', 'mercedes', 'Mercedes-Benz', NULL, '/brands/mercedes.svg', 11, CURRENT_TIMESTAMP),
    ('01KZMFG500HB5KN41TC4NFBY2K', 'vehicle_brand', 'bmw', 'BMW', NULL, '/brands/bmw.svg', 12, CURRENT_TIMESTAMP),
    ('01KZMFG500K3RZDTR97RS1T5XF', 'vehicle_brand', 'volkswagen', 'Volkswagen', NULL, '/brands/volkswagen.svg', 13, CURRENT_TIMESTAMP),
    ('01KZMFG500YGHW0GQPHWNREE6Q', 'vehicle_brand', 'mini', 'MINI', NULL, '/brands/mini.svg', 14, CURRENT_TIMESTAMP),
    ('01KZMFG5000C3C8GRK8CFTBZWN', 'vehicle_brand', 'chevrolet', 'Chevrolet', NULL, '/brands/chevrolet.svg', 15, CURRENT_TIMESTAMP),
    ('01KZMFG500P45677Q2ZH2NP5HY', 'vehicle_brand', 'yamaha', 'Yamaha', NULL, NULL, 16, CURRENT_TIMESTAMP),
    ('01KZMFG5003YKQZC3XNA7ZFA0C', 'body_type', 'mini', 'Mini car', '4 chỗ', '/body-types/mini.png', 0, CURRENT_TIMESTAMP),
    ('01KZMFG500CPCKAXSTA619QNH0', 'body_type', 'sedan', 'Sedan', '4 chỗ', '/body-types/sedan.png', 1, CURRENT_TIMESTAMP),
    ('01KZMFG50028J03KNZMYED7ZXJ', 'body_type', 'cuv', 'CUV', '5 chỗ · gầm cao', '/body-types/cuv.png', 2, CURRENT_TIMESTAMP),
    ('01KZMFG500B9W88B1R7BGT3R9F', 'body_type', 'suv', 'SUV', '7 chỗ · gầm cao', '/body-types/suv.png', 3, CURRENT_TIMESTAMP),
    ('01KZMFG500NT7JTCJYMQZA2GGM', 'body_type', 'mpv', 'MPV (7 chỗ)', '7 chỗ · gầm thấp', '/body-types/mpv.png', 4, CURRENT_TIMESTAMP),
    ('01KZMFG500F84QD618HJFKKC0Q', 'body_type', 'pickup', 'Bán tải', 'Bán tải', '/body-types/pickup.png', 5, CURRENT_TIMESTAMP),
    ('01KZMFG500C1NB2RFY6S80ZK9A', 'body_type', 'van', 'Van', '7 chỗ · minivan', '/body-types/van.png', 6, CURRENT_TIMESTAMP),
    ('01KZMFG500TWJ6J10J9JAN4RRS', 'body_type', 'minibus', 'Xe 16 chỗ', '16 chỗ', NULL, 7, CURRENT_TIMESTAMP),
    ('01KZMFG500NA3WYRKXN1W0RHWD', 'body_type', 'cargo', 'Xe tải – Cargo', 'Xe tải', NULL, 8, CURRENT_TIMESTAMP),
    ('01KZMFG50019T4NYHQNXFC8W8P', 'fuel_type', 'gasoline', 'Xăng', NULL, NULL, 0, CURRENT_TIMESTAMP),
    ('01KZMFG500247156738GRHDZQ1', 'fuel_type', 'diesel', 'Dầu (Diesel)', NULL, NULL, 1, CURRENT_TIMESTAMP),
    ('01KZMFG5003QB086QAZPD2Q690', 'fuel_type', 'electric', 'Điện', NULL, NULL, 2, CURRENT_TIMESTAMP),
    ('01KZMFG500J113NAF3XHAFRGAB', 'fuel_type', 'hybrid', 'Hybrid', NULL, NULL, 3, CURRENT_TIMESTAMP),
    ('01KZMFG500EQP21A3ANZ963KJ4', 'vehicle_feature', 'bluetooth', 'Bluetooth', NULL, NULL, 0, CURRENT_TIMESTAMP),
    ('01KZMFG500T8AF4M9C5ZY44KFJ', 'vehicle_feature', 'gps', 'Định vị GPS', NULL, NULL, 1, CURRENT_TIMESTAMP),
    ('01KZMFG5003J4WHAAA21DRBQ8G', 'vehicle_feature', 'backup_camera', 'Camera lùi', NULL, NULL, 2, CURRENT_TIMESTAMP),
    ('01KZMFG500V9VDDDQK9KCY0DZE', 'vehicle_feature', 'camera_360', 'Camera 360', NULL, NULL, 3, CURRENT_TIMESTAMP),
    ('01KZMFG500Z1TSC82466HJHST7', 'vehicle_feature', 'dash_camera', 'Camera hành trình', NULL, NULL, 4, CURRENT_TIMESTAMP),
    ('01KZMFG500E3XZ5T8NGZXN6EJH', 'vehicle_feature', 'reverse_sensor', 'Cảm biến lùi', NULL, NULL, 5, CURRENT_TIMESTAMP),
    ('01KZMFG500T30AE5R4J56D21YX', 'vehicle_feature', 'sunroof', 'Cửa sổ trời', NULL, NULL, 6, CURRENT_TIMESTAMP),
    ('01KZMFG500QE3CVK5SYMDY2F25', 'vehicle_feature', 'etc', 'ETC thu phí', NULL, NULL, 7, CURRENT_TIMESTAMP),
    ('01KZMFG500T0KZGPN8DFT2ECPV', 'vehicle_feature', 'spare_tire', 'Lốp dự phòng', NULL, NULL, 8, CURRENT_TIMESTAMP),
    ('01KZMFG500B4KP10CGRVAT0Y3F', 'vehicle_feature', 'airbag', 'Túi khí an toàn', NULL, NULL, 9, CURRENT_TIMESTAMP),
    ('01KZMFG500Y81YWA242BN8SBS7', 'vehicle_feature', 'usb', 'Cổng USB', NULL, NULL, 10, CURRENT_TIMESTAMP),
    ('01KZMFG5001FTWE0E6HARHSEZ5', 'vehicle_feature', 'screen', 'Màn hình giải trí', NULL, NULL, 11, CURRENT_TIMESTAMP),
    ('01KZMFG500KK9WK8W1BPQBERFB', 'vehicle_feature', 'map', 'Bản đồ', NULL, NULL, 12, CURRENT_TIMESTAMP),
    ('01KZMFG500GRXWQWXVWKA4063W', 'vehicle_feature', 'child_seat', 'Ghế trẻ em', NULL, NULL, 13, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Chuẩn hoá `brand` đang lưu NHÃN ("VinFast") sang KEY ("vinfast").
--
-- Trước bảng này cột brand là free-text nên bộ lọc marketplace gom nhóm theo chính chuỗi đã lưu:
-- "VinFast" và "vinfast" ra hai dòng facet khác nhau. Sau khi có catalog, key là định danh.
-- Hãng lạ không khớp catalog thì GIỮ NGUYÊN — không bịa dữ liệu; form từ giờ chỉ cho chọn
-- trong catalog nên chuỗi lạ chỉ tồn tại đến lần sửa xe kế tiếp.
-- ---------------------------------------------------------------------------

UPDATE "vehicles" v SET "brand" = c."key"
FROM "catalog_items" c
WHERE c."type" = 'vehicle_brand' AND v."brand" IS NOT NULL AND lower(btrim(v."brand")) = lower(c."label");

UPDATE "public_listings" p SET "brand" = c."key"
FROM "catalog_items" c
WHERE c."type" = 'vehicle_brand' AND p."brand" IS NOT NULL AND lower(btrim(p."brand")) = lower(c."label");
