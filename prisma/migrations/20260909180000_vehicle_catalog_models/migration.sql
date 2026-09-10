-- ═══════════════════════════════════════════════════════════════════════════
-- Danh mục MẪU XE + tách hồ sơ ô tô / xe máy (09/09/2026)
--
-- Vấn đề đang có: `vehicles.brand` và `vehicles.model` là chữ tự do. Không gì ngăn một chiếc
-- `motorbike` mang `brand = 'toyota'`, `model = 'Vios'`; danh sách hãng hiện đủ cả hai loại xe
-- cho mọi form; và `transmission` chỉ có bộ mã của ô tô nên xe máy tay ga không khai đúng được.
--
-- Bốn phần:
--   1. `vehicle_catalog_models` — mẫu xe chuẩn, thuộc một hãng và một loại phương tiện, kèm
--      nguồn tra cứu chính hãng đã đối chiếu (`source_url` + `verified_at`).
--   2. `catalog_items.vehicle_types` — chiều áp dụng, để danh sách hãng và tiện nghi lọc theo
--      loại xe thay vì đổ hết ra.
--   3. `vehicles.vehicle_catalog_model_id` + `motorbike_category` (mirror sang `public_listings`
--      để lọc), và nới CHECK hộp số cho bộ mã mở rộng — mã cũ giữ nguyên giá trị nên dữ liệu cũ
--      không phải chuyển đổi.
--   4. Backfill: dọn những giá trị vốn đã vô nghĩa (số chỗ/kiểu dáng trên xe máy) — chỉ ở đúng
--      phạm vi đó, KHÔNG đụng dữ liệu mà chủ xe cố ý nhập.
--
-- Không sửa migration cũ: staging/production đã chạy chúng.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Bảng mẫu xe ─────────────────────────────────────────────────────────
CREATE TABLE "public"."vehicle_catalog_models" (
    "id"                     CHAR(26)       NOT NULL,
    "key"                    VARCHAR(120)   NOT NULL,
    "label"                  VARCHAR(120)   NOT NULL,
    "brand_key"              VARCHAR(80)    NOT NULL,
    "vehicle_type"           VARCHAR(20)    NOT NULL,
    "market_status"          VARCHAR(20)    NOT NULL DEFAULT 'current',
    "year_from"              INTEGER,
    "year_to"                INTEGER,
    "motorbike_category"     VARCHAR(30),
    "fuel_types"             VARCHAR(20)[]  NOT NULL DEFAULT ARRAY[]::VARCHAR(20)[],
    "transmissions"          VARCHAR(30)[]  NOT NULL DEFAULT ARRAY[]::VARCHAR(30)[],
    "engine_displacement_cc" INTEGER,
    "seat_count"             INTEGER,
    "source_url"             TEXT,
    "verified_at"            TIMESTAMPTZ(3),
    "sort_order"             INTEGER        NOT NULL DEFAULT 0,
    "active"                 BOOLEAN        NOT NULL DEFAULT true,
    "created_at"             TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_catalog_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_catalog_models_key_key"
    ON "public"."vehicle_catalog_models" ("key");

-- Một hãng không có hai mẫu trùng tên trong cùng loại phương tiện. Đây là ràng buộc chống trùng
-- THẬT: `key` sinh từ nhãn đã bỏ dấu, nên hai cách viết khác nhau của cùng một tên vẫn lọt nếu
-- chỉ có unique trên `key`.
CREATE UNIQUE INDEX "vehicle_catalog_models_brand_key_vehicle_type_label_key"
    ON "public"."vehicle_catalog_models" ("brand_key", "vehicle_type", "label");

-- Truy vấn của form: mẫu đang bật của một hãng + loại xe, nhóm theo trạng thái thị trường.
CREATE INDEX "vehicle_catalog_models_vehicle_type_brand_key_active_marke_idx"
    ON "public"."vehicle_catalog_models" ("vehicle_type", "brand_key", "active", "market_status", "sort_order");

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_vehicle_type_check"
    CHECK ("vehicle_type" IN ('car', 'motorbike'));

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_market_status_check"
    CHECK ("market_status" IN ('current', 'legacy'));

-- Phân khúc là chiều của XE MÁY. Một mẫu ô tô mang 'scooter' là dữ liệu sai mà bộ lọc ngoài chợ
-- sẽ đọc — chặn ở DB thay vì tin rằng mọi đường ghi đều nhớ kiểm.
ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_motorbike_category_check"
    CHECK (
        ("vehicle_type" = 'motorbike'
            AND ("motorbike_category" IS NULL
                OR "motorbike_category" IN ('scooter', 'underbone', 'naked', 'sport',
                                            'cruiser', 'adventure', 'touring', 'offroad', 'other')))
        OR ("vehicle_type" <> 'motorbike' AND "motorbike_category" IS NULL)
    );

-- Số chỗ là chiều của Ô TÔ.
ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_seat_count_check"
    CHECK (
        "seat_count" IS NULL
        OR ("vehicle_type" = 'car' AND "seat_count" BETWEEN 2 AND 64)
    );

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_years_check"
    CHECK (
        ("year_from" IS NULL OR "year_from" BETWEEN 1950 AND 2100)
        AND ("year_to" IS NULL OR "year_to" BETWEEN 1950 AND 2100)
        AND ("year_from" IS NULL OR "year_to" IS NULL OR "year_to" >= "year_from")
    );

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_fuel_types_check"
    CHECK ("fuel_types" <@ ARRAY['gasoline'::VARCHAR(20), 'diesel'::VARCHAR(20),
                                 'electric'::VARCHAR(20), 'hybrid'::VARCHAR(20)]);

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_transmissions_check"
    CHECK ("transmissions" <@ ARRAY[
        'automatic'::VARCHAR(30), 'manual'::VARCHAR(30), 'cvt'::VARCHAR(30), 'dct'::VARCHAR(30),
        'amt'::VARCHAR(30), 'e_cvt'::VARCHAR(30), 'direct_drive'::VARCHAR(30),
        'automatic_cvt'::VARCHAR(30), 'semi_automatic'::VARCHAR(30), 'manual_clutch'::VARCHAR(30),
        'other'::VARCHAR(30)
    ]);

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_engine_displacement_check"
    CHECK ("engine_displacement_cc" IS NULL OR "engine_displacement_cc" > 0);

-- ── 2. Chiều áp dụng của danh mục ──────────────────────────────────────────
ALTER TABLE "public"."catalog_items"
    ADD COLUMN "vehicle_types" VARCHAR(20)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(20)[];

ALTER TABLE "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_vehicle_types_check"
    CHECK ("vehicle_types" <@ ARRAY['car'::VARCHAR(20), 'motorbike'::VARCHAR(20)]);

-- Kiểu dáng thân xe (Sedan/SUV/MPV…) chỉ có nghĩa với ô tô. Đây là sự thật sẵn có của dữ liệu,
-- không phải quyết định mới: cột `vehicles.body_type` đã ghi "chỉ khi vehicleType = car".
UPDATE "public"."catalog_items"
   SET "vehicle_types" = ARRAY['car']::VARCHAR(20)[]
 WHERE "type" = 'body_type';

-- Dầu (diesel) chỉ có ở ô tô; xăng/điện/hybrid có ở cả hai nên để rỗng = áp dụng mọi loại.
UPDATE "public"."catalog_items"
   SET "vehicle_types" = ARRAY['car']::VARCHAR(20)[]
 WHERE "type" = 'fuel_type' AND "key" = 'diesel';

-- Mẫu xe phải trỏ vào một hãng CÓ THẬT. `catalog_items` unique theo (type, key) nên FK nhắm vào
-- chính unique index đó; cột sinh cố định 'vehicle_brand' khiến DB tự chặn một mẫu xe trỏ nhầm
-- sang key của chiều khác (ví dụ 'suv' bên body_type).
ALTER TABLE "public"."vehicle_catalog_models"
    ADD COLUMN "brand_catalog_type" VARCHAR(50)
    GENERATED ALWAYS AS ('vehicle_brand'::VARCHAR(50)) STORED;

ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_brand_key_fkey"
    FOREIGN KEY ("brand_catalog_type", "brand_key")
    REFERENCES "public"."catalog_items" ("type", "key")
    ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ── 3. Cột mới trên vehicles và public_listings ────────────────────────────
ALTER TABLE "public"."vehicles"
    ADD COLUMN "vehicle_catalog_model_id" CHAR(26),
    ADD COLUMN "motorbike_category"       VARCHAR(30);

ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_vehicle_catalog_model_id_fkey"
    FOREIGN KEY ("vehicle_catalog_model_id")
    REFERENCES "public"."vehicle_catalog_models" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Chỉ mục PHẦN: đại đa số xe không gắn mẫu chuẩn (xe đời cũ, xe khai tay), nên index đầy đủ chỉ
-- tốn chỗ cho hàng NULL.
CREATE INDEX "vehicles_vehicle_catalog_model_id_idx"
    ON "public"."vehicles" ("vehicle_catalog_model_id")
    WHERE "vehicle_catalog_model_id" IS NOT NULL;

ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_motorbike_category_check"
    CHECK (
        ("vehicle_type" = 'motorbike'
            AND ("motorbike_category" IS NULL
                OR "motorbike_category" IN ('scooter', 'underbone', 'naked', 'sport',
                                            'cruiser', 'adventure', 'touring', 'offroad', 'other')))
        OR ("vehicle_type" <> 'motorbike' AND "motorbike_category" IS NULL)
    );

-- Bộ mã hộp số mở rộng. Năm mã cũ giữ nguyên giá trị, nên đây là NỚI RỘNG thuần: không hàng nào
-- đang hợp lệ mà thành sai.
ALTER TABLE "public"."vehicles" DROP CONSTRAINT "vehicles_transmission_check";
ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_transmission_check"
    CHECK ("transmission" IS NULL OR "transmission" IN (
        -- ô tô
        'automatic', 'manual', 'cvt', 'dct', 'amt', 'e_cvt',
        -- xe điện (ô tô và xe máy)
        'direct_drive',
        -- xe máy
        'automatic_cvt', 'semi_automatic', 'manual_clutch',
        'other'
    ));

-- Ảnh chiếu ra chợ: phân khúc xe máy là chiều LỌC, nên nó phải nằm trên `public_listings` —
-- bộ lọc marketplace đọc bảng này chứ không join sang `vehicles` (ADR 0008).
ALTER TABLE "public"."public_listings"
    ADD COLUMN "motorbike_category" VARCHAR(30);

ALTER TABLE "public"."public_listings"
    ADD CONSTRAINT "public_listings_motorbike_category_check"
    CHECK (
        ("vehicle_type" = 'motorbike'
            AND ("motorbike_category" IS NULL
                OR "motorbike_category" IN ('scooter', 'underbone', 'naked', 'sport',
                                            'cruiser', 'adventure', 'touring', 'offroad', 'other')))
        OR ("vehicle_type" <> 'motorbike' AND "motorbike_category" IS NULL)
    );

CREATE INDEX "public_listings_status_motorbike_category_idx"
    ON "public"."public_listings" ("status", "motorbike_category")
    WHERE "motorbike_category" IS NOT NULL;

-- ── 4. Backfill ────────────────────────────────────────────────────────────
-- Xe máy không có kiểu dáng thân xe của ô tô, và không có "số chỗ ngồi" theo nghĩa ô tô. Những
-- giá trị này lọt vào vì form cũ hỏi chung một bộ cho cả hai loại — chúng chưa bao giờ mang
-- thông tin đúng, nên xoá là trả dữ liệu về đúng thực tế, không phải mất mát.
--
-- KHÔNG đụng `seat_count` của ô tô, và KHÔNG suy đoán `motorbike_category` cho xe máy đang có:
-- phân khúc phải do chủ xe (hoặc mẫu xe trong danh mục) khai — đoán hộ là bịa ra một dữ liệu
-- rồi đem hiển thị ngoài chợ.
UPDATE "public"."vehicles"
   SET "body_type" = NULL
 WHERE "vehicle_type" = 'motorbike' AND "body_type" IS NOT NULL;

UPDATE "public"."vehicles"
   SET "seat_count" = NULL
 WHERE "vehicle_type" = 'motorbike' AND "seat_count" IS NOT NULL;

-- Dọn cùng lúc ở ảnh chiếu, bằng không bộ lọc "Sedan · 5 chỗ" còn trả về một chiếc Wave.
UPDATE "public"."public_listings" pl
   SET "body_type" = NULL, "seat_count" = NULL
  FROM "public"."vehicles" v
 WHERE pl."vehicle_id" = v."id"
   AND v."vehicle_type" = 'motorbike'
   AND (pl."body_type" IS NOT NULL OR pl."seat_count" IS NOT NULL);
