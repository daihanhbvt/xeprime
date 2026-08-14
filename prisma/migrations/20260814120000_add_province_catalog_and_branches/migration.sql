-- Kiến trúc TỈNH/THÀNH chuẩn hoá + CHI NHÁNH gian hàng (forward-only, không phá dữ liệu).
--
-- Vì sao: trước migration này vị trí xe suy từ `tenant_profiles.province_name` — một chuỗi TỰ DO,
-- một shop chỉ ở được một tỉnh, và marketplace lọc bằng `contains` không dấu không mã. Kết quả là
-- "Hà Nam" khớp nhầm, "TP.HCM" và "Hồ Chí Minh" thành hai điểm đến khác nhau, và không có cách nào
-- nói "xe này nằm ở chi nhánh Đà Nẵng".
--
-- Migration làm 4 việc, theo thứ tự:
--   1. Dựng danh mục tỉnh CHÍNH THỨC (34 đơn vị từ 01/07/2025) + bí danh tên cũ/cách viết khác.
--      Dữ liệu nằm TRONG migration chứ không ở seed demo: mọi môi trường có ngay sau deploy.
--   2. Dựng bảng `tenant_branches` + cột `branch_id` cho xe và snapshot công khai.
--   3. Quy dữ liệu tỉnh tự do cũ về mã chuẩn — KHÔNG đoán khi không quy được.
--   4. Sinh chi nhánh mặc định cho mọi gian hàng đang có và gắn toàn bộ xe cũ vào đó.
--
-- Không xoá/ghi đè bản ghi nghiệp vụ nào. Giá trị tỉnh gốc không quy được được GIỮ ở
-- `tenant_branches.legacy_province_value` kèm cờ `needs_location_review`.
--
-- `branch_id` để NULLABLE ở đây vì dữ liệu cũ phải nâng cấp an toàn; API tạo xe vẫn BẮT BUỘC có
-- chi nhánh (DTO + service), nên dữ liệu mới không sinh ra hàng NULL.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bảng, cột, index, khoá ngoại
-- ─────────────────────────────────────────────────────────────────────────────
-- DropIndex
DROP INDEX "public_listings_province_name_idx";

-- AlterTable
ALTER TABLE "public_listings" ADD COLUMN     "branch_id" CHAR(26),
ADD COLUMN     "province_code" CHAR(2);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "branch_id" CHAR(26);

-- CreateTable
CREATE TABLE "provinces" (
    "code" CHAR(2) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "administrative_type" VARCHAR(20) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_public_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "province_aliases" (
    "id" CHAR(26) NOT NULL,
    "province_code" CHAR(2) NOT NULL,
    "alias" VARCHAR(150) NOT NULL,
    "normalized_alias" VARCHAR(150) NOT NULL,
    "alias_type" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "province_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_branches" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "province_code" CHAR(2),
    "address" TEXT,
    "phone" VARCHAR(30),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "needs_location_review" BOOLEAN NOT NULL DEFAULT false,
    "legacy_province_value" VARCHAR(150),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provinces_name_key" ON "provinces"("name");

-- CreateIndex
CREATE UNIQUE INDEX "provinces_slug_key" ON "provinces"("slug");

-- CreateIndex
CREATE INDEX "provinces_is_enabled_sort_order_idx" ON "provinces"("is_enabled", "sort_order");

-- CreateIndex
CREATE INDEX "provinces_is_public_visible_sort_order_idx" ON "provinces"("is_public_visible", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "province_aliases_normalized_alias_key" ON "province_aliases"("normalized_alias");

-- CreateIndex
CREATE INDEX "province_aliases_province_code_idx" ON "province_aliases"("province_code");

-- CreateIndex
CREATE INDEX "tenant_branches_tenant_id_status_idx" ON "tenant_branches"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenant_branches_province_code_idx" ON "tenant_branches"("province_code");

-- CreateIndex
CREATE INDEX "tenant_branches_tenant_id_is_default_idx" ON "tenant_branches"("tenant_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_branches_tenant_id_code_key" ON "tenant_branches"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_branches_id_tenant_id_key" ON "tenant_branches"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "public_listings_status_province_code_idx" ON "public_listings"("status", "province_code");

-- AddForeignKey
ALTER TABLE "province_aliases" ADD CONSTRAINT "province_aliases_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_branches" ADD CONSTRAINT "tenant_branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_branches" ADD CONSTRAINT "tenant_branches_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_branches" ADD CONSTRAINT "tenant_branches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_branch_id_tenant_id_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "tenant_branches"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_branch_id_tenant_id_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "tenant_branches"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public_listings" ADD CONSTRAINT "public_listings_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dữ liệu danh mục tỉnh (sinh từ packages/types/src/province.ts)
-- ─────────────────────────────────────────────────────────────────────────────

-- Bản sao của `normalizeProvinceAlias` (packages/types) dưới dạng SQL, để migration quy được
-- dữ liệu tỉnh tự do cũ mà không cần extension `unaccent` (VPS có thể không cài).
CREATE OR REPLACE FUNCTION xeprime_normalize_province(raw text) RETURNS text AS $fn$
DECLARE s text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  s := lower(raw);
  s := translate(s, 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := btrim(s);
  -- Tiền tố hành chính ở ĐẦU chuỗi; `tp` không cần dấu phân cách để bắt `TPHCM`.
  s := regexp_replace(s, '^(thanh pho|tinh|t p|tp)\s*', '');
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN btrim(s);
END; $fn$ LANGUAGE plpgsql IMMUTABLE;

-- 34 đơn vị hành chính cấp tỉnh (QĐ 19/2025/QĐ-TTg, hiệu lực 01/07/2025).
-- ON CONFLICT: migration/seed chạy lại KHÔNG nhân bản và KHÔNG đè cờ hiển thị admin đã đổi.
INSERT INTO "provinces" ("code", "name", "administrative_type", "slug", "sort_order") VALUES
  ('01', 'Hà Nội', 'municipality', 'ha-noi', 1),
  ('04', 'Cao Bằng', 'province', 'cao-bang', 2),
  ('08', 'Tuyên Quang', 'province', 'tuyen-quang', 3),
  ('11', 'Điện Biên', 'province', 'dien-bien', 4),
  ('12', 'Lai Châu', 'province', 'lai-chau', 5),
  ('14', 'Sơn La', 'province', 'son-la', 6),
  ('15', 'Lào Cai', 'province', 'lao-cai', 7),
  ('19', 'Thái Nguyên', 'province', 'thai-nguyen', 8),
  ('20', 'Lạng Sơn', 'province', 'lang-son', 9),
  ('22', 'Quảng Ninh', 'province', 'quang-ninh', 10),
  ('24', 'Bắc Ninh', 'province', 'bac-ninh', 11),
  ('25', 'Phú Thọ', 'province', 'phu-tho', 12),
  ('31', 'Hải Phòng', 'municipality', 'hai-phong', 13),
  ('33', 'Hưng Yên', 'province', 'hung-yen', 14),
  ('37', 'Ninh Bình', 'province', 'ninh-binh', 15),
  ('38', 'Thanh Hóa', 'province', 'thanh-hoa', 16),
  ('40', 'Nghệ An', 'province', 'nghe-an', 17),
  ('42', 'Hà Tĩnh', 'province', 'ha-tinh', 18),
  ('44', 'Quảng Trị', 'province', 'quang-tri', 19),
  ('46', 'Huế', 'municipality', 'hue', 20),
  ('48', 'Đà Nẵng', 'municipality', 'da-nang', 21),
  ('51', 'Quảng Ngãi', 'province', 'quang-ngai', 22),
  ('52', 'Gia Lai', 'province', 'gia-lai', 23),
  ('56', 'Khánh Hòa', 'province', 'khanh-hoa', 24),
  ('66', 'Đắk Lắk', 'province', 'dak-lak', 25),
  ('68', 'Lâm Đồng', 'province', 'lam-dong', 26),
  ('75', 'Đồng Nai', 'province', 'dong-nai', 27),
  ('79', 'Hồ Chí Minh', 'municipality', 'ho-chi-minh', 28),
  ('80', 'Tây Ninh', 'province', 'tay-ninh', 29),
  ('82', 'Đồng Tháp', 'province', 'dong-thap', 30),
  ('86', 'Vĩnh Long', 'province', 'vinh-long', 31),
  ('91', 'An Giang', 'province', 'an-giang', 32),
  ('92', 'Cần Thơ', 'municipality', 'can-tho', 33),
  ('96', 'Cà Mau', 'province', 'ca-mau', 34)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "administrative_type" = EXCLUDED."administrative_type",
  "slug" = EXCLUDED."slug",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();

-- Bí danh: tên tỉnh CŨ trước sáp nhập + các cách viết khác. `normalized_alias` là khoá tra cứu.
INSERT INTO "province_aliases" ("id", "province_code", "alias", "normalized_alias", "alias_type") VALUES
  ('01PROVALIAS000000000000001', '01', 'Hà Nội', 'ha noi', 'canonical_name'),
  ('01PROVALIAS000000000000002', '04', 'Cao Bằng', 'cao bang', 'canonical_name'),
  ('01PROVALIAS000000000000003', '08', 'Hà Giang', 'ha giang', 'legacy_name'),
  ('01PROVALIAS000000000000004', '08', 'Tuyên Quang', 'tuyen quang', 'canonical_name'),
  ('01PROVALIAS000000000000005', '11', 'Điện Biên', 'dien bien', 'canonical_name'),
  ('01PROVALIAS000000000000006', '12', 'Lai Châu', 'lai chau', 'canonical_name'),
  ('01PROVALIAS000000000000007', '14', 'Sơn La', 'son la', 'canonical_name'),
  ('01PROVALIAS000000000000008', '15', 'Lào Cai', 'lao cai', 'canonical_name'),
  ('01PROVALIAS000000000000009', '15', 'Yên Bái', 'yen bai', 'legacy_name'),
  ('01PROVALIAS000000000000010', '19', 'Bắc Cạn', 'bac can', 'legacy_name'),
  ('01PROVALIAS000000000000011', '19', 'Bắc Kạn', 'bac kan', 'legacy_name'),
  ('01PROVALIAS000000000000012', '19', 'Thái Nguyên', 'thai nguyen', 'canonical_name'),
  ('01PROVALIAS000000000000013', '20', 'Lạng Sơn', 'lang son', 'canonical_name'),
  ('01PROVALIAS000000000000014', '22', 'Quảng Ninh', 'quang ninh', 'canonical_name'),
  ('01PROVALIAS000000000000015', '24', 'Bắc Giang', 'bac giang', 'legacy_name'),
  ('01PROVALIAS000000000000016', '24', 'Bắc Ninh', 'bac ninh', 'canonical_name'),
  ('01PROVALIAS000000000000017', '25', 'Hòa Bình', 'hoa binh', 'legacy_name'),
  ('01PROVALIAS000000000000018', '25', 'Phú Thọ', 'phu tho', 'canonical_name'),
  ('01PROVALIAS000000000000019', '25', 'Vĩnh Phúc', 'vinh phuc', 'legacy_name'),
  ('01PROVALIAS000000000000020', '31', 'Hải Dương', 'hai duong', 'legacy_name'),
  ('01PROVALIAS000000000000021', '31', 'Hải Phòng', 'hai phong', 'canonical_name'),
  ('01PROVALIAS000000000000022', '33', 'Hưng Yên', 'hung yen', 'canonical_name'),
  ('01PROVALIAS000000000000023', '33', 'Thái Bình', 'thai binh', 'legacy_name'),
  ('01PROVALIAS000000000000024', '37', 'Hà Nam', 'ha nam', 'legacy_name'),
  ('01PROVALIAS000000000000025', '37', 'Nam Định', 'nam dinh', 'legacy_name'),
  ('01PROVALIAS000000000000026', '37', 'Ninh Bình', 'ninh binh', 'canonical_name'),
  ('01PROVALIAS000000000000027', '38', 'Thanh Hóa', 'thanh hoa', 'canonical_name'),
  ('01PROVALIAS000000000000028', '40', 'Nghệ An', 'nghe an', 'canonical_name'),
  ('01PROVALIAS000000000000029', '42', 'Hà Tĩnh', 'ha tinh', 'canonical_name'),
  ('01PROVALIAS000000000000030', '44', 'Quảng Bình', 'quang binh', 'legacy_name'),
  ('01PROVALIAS000000000000031', '44', 'Quảng Trị', 'quang tri', 'canonical_name'),
  ('01PROVALIAS000000000000032', '46', 'Huế', 'hue', 'canonical_name'),
  ('01PROVALIAS000000000000033', '46', 'Thừa Thiên Huế', 'thua thien hue', 'legacy_name'),
  ('01PROVALIAS000000000000034', '48', 'Đà Nẵng', 'da nang', 'canonical_name'),
  ('01PROVALIAS000000000000035', '48', 'Quảng Nam', 'quang nam', 'legacy_name'),
  ('01PROVALIAS000000000000036', '51', 'Kon Tum', 'kon tum', 'legacy_name'),
  ('01PROVALIAS000000000000037', '51', 'Quảng Ngãi', 'quang ngai', 'canonical_name'),
  ('01PROVALIAS000000000000038', '52', 'Bình Định', 'binh dinh', 'legacy_name'),
  ('01PROVALIAS000000000000039', '52', 'Gia Lai', 'gia lai', 'canonical_name'),
  ('01PROVALIAS000000000000040', '56', 'Khánh Hòa', 'khanh hoa', 'canonical_name'),
  ('01PROVALIAS000000000000041', '56', 'Ninh Thuận', 'ninh thuan', 'legacy_name'),
  ('01PROVALIAS000000000000042', '66', 'Đắk Lắk', 'dak lak', 'canonical_name'),
  ('01PROVALIAS000000000000043', '66', 'Phú Yên', 'phu yen', 'legacy_name'),
  ('01PROVALIAS000000000000044', '68', 'Bình Thuận', 'binh thuan', 'legacy_name'),
  ('01PROVALIAS000000000000045', '68', 'Đắk Nông', 'dak nong', 'legacy_name'),
  ('01PROVALIAS000000000000046', '68', 'Lâm Đồng', 'lam dong', 'canonical_name'),
  ('01PROVALIAS000000000000047', '75', 'Bình Phước', 'binh phuoc', 'legacy_name'),
  ('01PROVALIAS000000000000048', '75', 'Đồng Nai', 'dong nai', 'canonical_name'),
  ('01PROVALIAS000000000000049', '79', 'Bà Rịa - Vũng Tàu', 'ba ria vung tau', 'legacy_name'),
  ('01PROVALIAS000000000000050', '79', 'Bình Dương', 'binh duong', 'legacy_name'),
  ('01PROVALIAS000000000000051', '79', 'TP HCM', 'hcm', 'display_variant'),
  ('01PROVALIAS000000000000052', '79', 'Hồ Chí Minh', 'ho chi minh', 'canonical_name'),
  ('01PROVALIAS000000000000053', '79', 'Sài Gòn', 'sai gon', 'display_variant'),
  ('01PROVALIAS000000000000054', '80', 'Long An', 'long an', 'legacy_name'),
  ('01PROVALIAS000000000000055', '80', 'Tây Ninh', 'tay ninh', 'canonical_name'),
  ('01PROVALIAS000000000000056', '82', 'Đồng Tháp', 'dong thap', 'canonical_name'),
  ('01PROVALIAS000000000000057', '82', 'Tiền Giang', 'tien giang', 'legacy_name'),
  ('01PROVALIAS000000000000058', '86', 'Bến Tre', 'ben tre', 'legacy_name'),
  ('01PROVALIAS000000000000059', '86', 'Trà Vinh', 'tra vinh', 'legacy_name'),
  ('01PROVALIAS000000000000060', '86', 'Vĩnh Long', 'vinh long', 'canonical_name'),
  ('01PROVALIAS000000000000061', '91', 'An Giang', 'an giang', 'canonical_name'),
  ('01PROVALIAS000000000000062', '91', 'Kiên Giang', 'kien giang', 'legacy_name'),
  ('01PROVALIAS000000000000063', '92', 'Cần Thơ', 'can tho', 'canonical_name'),
  ('01PROVALIAS000000000000064', '92', 'Hậu Giang', 'hau giang', 'legacy_name'),
  ('01PROVALIAS000000000000065', '92', 'Sóc Trăng', 'soc trang', 'legacy_name'),
  ('01PROVALIAS000000000000066', '96', 'Bạc Liêu', 'bac lieu', 'legacy_name'),
  ('01PROVALIAS000000000000067', '96', 'Cà Mau', 'ca mau', 'canonical_name')
ON CONFLICT ("normalized_alias") DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Ràng buộc nghiệp vụ mà datamodel Prisma không diễn đạt được
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "provinces"
  ADD CONSTRAINT "provinces_administrative_type_check"
  CHECK ("administrative_type" IN ('province', 'municipality'));

ALTER TABLE "province_aliases"
  ADD CONSTRAINT "province_aliases_type_check"
  CHECK ("alias_type" IN ('canonical_name', 'legacy_name', 'display_variant'));

ALTER TABLE "tenant_branches"
  ADD CONSTRAINT "tenant_branches_status_check"
  CHECK ("status" IN ('active', 'inactive'));

-- Chi nhánh mặc định phải là chi nhánh ĐANG HOẠT ĐỘNG: gian hàng không thể có "trụ sở" đã đóng.
ALTER TABLE "tenant_branches"
  ADD CONSTRAINT "tenant_branches_default_is_active_check"
  CHECK ("is_default" = false OR "status" = 'active');

-- Đúng MỘT chi nhánh mặc định còn sống mỗi gian hàng — do DB giữ, không phải service nhớ kiểm.
-- Partial unique (Prisma không diễn đạt được WHERE) nên viết tay ở đây.
CREATE UNIQUE INDEX "tenant_branches_one_default_per_tenant"
  ON "tenant_branches" ("tenant_id")
  WHERE "is_default" = true AND "deleted_at" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Quy dữ liệu tỉnh TỰ DO cũ về mã chuẩn
-- ─────────────────────────────────────────────────────────────────────────────
-- Hai lượt, theo thứ tự tin cậy giảm dần. Không lượt nào ĐOÁN: không khớp thì để nguyên và
-- lượt 7 sẽ đánh dấu chi nhánh cần bổ sung vị trí.

-- 5a. `province_code` cũ tình cờ đã là mã chuẩn ('79', '01'…) → chỉ đồng bộ lại tên.
UPDATE "tenant_profiles" p
SET "province_name" = pr."name",
    "updated_at" = now()
FROM "provinces" pr
WHERE pr."code" = btrim(p."province_code")
  AND p."province_name" IS DISTINCT FROM pr."name";

-- 5b. Tra bí danh theo tên (ưu tiên) rồi theo chuỗi `province_code` tự do.
UPDATE "tenant_profiles" p
SET "province_code" = a."province_code",
    "province_name" = pr."name",
    "updated_at" = now()
FROM "province_aliases" a
JOIN "provinces" pr ON pr."code" = a."province_code"
WHERE a."normalized_alias" = xeprime_normalize_province(
        COALESCE(NULLIF(btrim(p."province_name"), ''), p."province_code")
      )
  AND (p."province_code" IS DISTINCT FROM a."province_code"
       OR p."province_name" IS DISTINCT FROM pr."name");

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Mỗi gian hàng đang có nhận ĐÚNG MỘT chi nhánh mặc định
-- ─────────────────────────────────────────────────────────────────────────────
-- `id` suy tất định từ `md5(tenant_id)` (26 ký tự, toàn [0-9A-F] — hợp lệ với Crockford base32
-- của ULID). Tất định để chạy lại migration/seed KHÔNG đẻ chi nhánh thứ hai; tiền tố `0MGBRANCH0`
-- để nhìn là biết bản ghi do migration sinh. `ON CONFLICT (tenant_id, code)` là chốt chặn thứ hai.
INSERT INTO "tenant_branches" (
  "id", "tenant_id", "code", "name", "province_code", "address", "phone",
  "is_default", "status", "needs_location_review", "legacy_province_value",
  "created_at", "updated_at"
)
SELECT
  '0MGBRANCH0' || upper(substr(md5(t."id"), 1, 16)),
  t."id",
  'CN01',
  -- Có tỉnh → đặt tên theo tỉnh. Không có → tên trung tính, KHÔNG bịa địa danh.
  CASE WHEN pr."name" IS NOT NULL THEN 'Chi nhánh ' || pr."name" ELSE 'Chi nhánh chính' END,
  pr."code",
  p."address",
  t."phone",
  true,
  'active',
  pr."code" IS NULL,
  -- Giữ nguyên chuỗi gốc để người sửa biết dữ liệu cũ ghi gì (chỉ khi không quy được).
  CASE WHEN pr."code" IS NULL
       THEN NULLIF(btrim(COALESCE(p."province_name", p."province_code", '')), '')
       ELSE NULL END,
  now(),
  now()
FROM "tenants" t
LEFT JOIN "tenant_profiles" p ON p."tenant_id" = t."id"
LEFT JOIN "provinces" pr ON pr."code" = btrim(p."province_code")
WHERE NOT EXISTS (
  SELECT 1 FROM "tenant_branches" b WHERE b."tenant_id" = t."id" AND b."deleted_at" IS NULL
)
ON CONFLICT ("tenant_id", "code") DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Xe cũ về chi nhánh mặc định của chính gian hàng nó
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "vehicles" v
SET "branch_id" = b."id"
FROM "tenant_branches" b
WHERE b."tenant_id" = v."tenant_id"
  AND b."is_default" = true
  AND b."deleted_at" IS NULL
  AND v."branch_id" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Snapshot marketplace lấy vị trí từ chi nhánh của xe
-- ─────────────────────────────────────────────────────────────────────────────
-- `province_name` ghi lại theo TÊN CHUẨN từ bảng `provinces`. Bản ghi không quy được tỉnh sẽ có
-- `province_code` NULL — chúng biến mất khỏi marketplace (scope công khai đòi tỉnh hợp lệ) cho tới
-- khi chủ shop bổ sung. Giá trị tỉnh gốc KHÔNG mất: nó nằm ở `tenant_branches.legacy_province_value`.
UPDATE "public_listings" l
SET "branch_id" = v."branch_id",
    "province_code" = b."province_code",
    "province_name" = pr."name",
    "updated_at" = now()
FROM "vehicles" v
LEFT JOIN "tenant_branches" b ON b."id" = v."branch_id"
LEFT JOIN "provinces" pr ON pr."code" = b."province_code"
WHERE l."vehicle_id" = v."id";

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Quyền mới của wave này
-- ─────────────────────────────────────────────────────────────────────────────
-- `PermissionGuard` đọc quyền TỪ DATABASE mỗi request (ADR 0002). Key mới chỉ có trong
-- `packages/types` thì guard không tìm thấy và trả 403 — endpoint mới "không tồn tại" với mọi
-- người cho tới khi ai đó nhớ chạy seed.
--
-- Vì thế quyền đi CÙNG migration, đúng như danh mục tỉnh ở mục 2: deploy xong là `/branches` và
-- `/platform/locations` dùng được ngay, không phụ thuộc một bước thủ công.
--
-- `id` suy tất định từ `md5(key)` (26 ký tự [0-9A-F], hợp lệ với Crockford base32 của ULID) để
-- chạy lại không đẻ bản ghi thứ hai; `ON CONFLICT (key)` là chốt chặn thứ hai khi seed đã tạo
-- trước bằng id ULID thật — lúc đó giữ nguyên bản ghi cũ.
INSERT INTO "permissions" ("id", "key", "name", "module", "scope") VALUES
  (upper(substr(md5('branches.view'), 1, 26)), 'branches.view', 'branches.view', 'branches', 'tenant'),
  (upper(substr(md5('branches.manage'), 1, 26)), 'branches.manage', 'branches.manage', 'branches', 'tenant'),
  (upper(substr(md5('platform.locations.view'), 1, 26)), 'platform.locations.view', 'platform.locations.view', 'platform', 'platform'),
  (upper(substr(md5('platform.locations.manage'), 1, 26)), 'platform.locations.manage', 'platform.locations.manage', 'platform', 'platform')
ON CONFLICT ("key") DO NOTHING;

-- Cấp cho các role HỆ THỐNG đúng như `DEFAULT_TENANT_ROLE_PERMISSIONS` / `DEFAULT_PLATFORM_ROLE_PERMISSIONS`.
-- Nối qua `key` chứ không qua id vừa chèn: nếu seed đã tạo quyền trước, id thật là của seed.
-- Chỉ đụng role hệ thống (`tenant_id IS NULL`) — role tuỳ biến do chủ shop tạo là quyết định của
-- họ, migration không tự thêm quyền vào đó.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'branches.view'
WHERE r."tenant_id" IS NULL
  AND r."scope" = 'tenant'
  AND r."key" IN ('shop_owner', 'shop_manager', 'shop_staff', 'shop_viewer')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'branches.manage'
WHERE r."tenant_id" IS NULL
  AND r."scope" = 'tenant'
  AND r."key" IN ('shop_owner', 'shop_manager')
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('platform.locations.view', 'platform.locations.manage')
WHERE r."tenant_id" IS NULL
  AND r."scope" = 'platform'
  AND r."key" = 'platform_admin'
ON CONFLICT DO NOTHING;

-- Nhân sự nền tảng chỉ ĐỌC danh mục: bật/tắt hiển thị công khai là quyền riêng của admin.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'platform.locations.view'
WHERE r."tenant_id" IS NULL
  AND r."scope" = 'platform'
  AND r."key" = 'platform_staff'
ON CONFLICT DO NOTHING;
