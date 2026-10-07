-- Hộp số theo nguồn năng lượng + nguồn năng lượng Plug-in Hybrid (06/10/2026).
--
-- Viết TAY: chỉ các lệnh dưới, không kéo theo drift của `prisma migrate diff` (xem header baseline
-- `20260821000000_init`). Không đổi cột nào, không xoá dòng nào.
--
-- Luật (nguồn duy nhất: `vehicleTransmissionTypesFor` ở `packages/types/src/status/vehicle-profile.ts`):
--   • xe điện (ô tô và xe máy) ............ CHỈ 'direct_drive' (1 cấp)
--   • ô tô hybrid / plug-in hybrid ........ 'automatic' · 'e_cvt' · 'dct' · 'other'
--   • ô tô xăng / dầu ..................... 'manual' · 'automatic' · 'cvt' · 'dct' · 'amt' · 'other'
--   • xe máy không chạy điện .............. 'automatic_cvt' · 'semi_automatic' · 'manual_clutch' · 'other'
--
-- 1. Danh mục: thêm nguồn năng lượng 'plug_in_hybrid' (chỉ ô tô) — `CatalogService` từ chối mọi
--    nguồn năng lượng không có trong `catalog_items`, nên thiếu dòng này thì form không gửi được.
-- 2. CHECK mảng `vehicle_catalog_models.fuel_types` nhận thêm 'plug_in_hybrid'.
-- 3. CHUẨN HOÁ dữ liệu cũ (UPDATE, không xoá): form cũ cho xe điện giữ "số tự động", và seed demo
--    tự ghi `electric + automatic` / xe máy `automatic`. Xe đang trên chợ bị khoá ô hộp số
--    (ADR 0030) nên chủ xe không tự sửa được — chỉ migration sửa được. Ánh xạ chọn mã GẦN NGHĨA
--    nhất; không có mã gần nghĩa thì về 'other' chứ không xoá thành NULL. Phiếu duyệt xe đang chờ
--    được vá ảnh chụp theo (3e) để không bị chặn oan.
-- 4. CHECK: xe điện chỉ mang 'direct_drive' (hoặc chưa khai). API tự điền 'direct_drive' khi ghi
--    (`fixedTransmissionFor`); NULL vẫn được nhận để bản ghi của client cũ không bị chặn ở DB.

-- ── 1. Danh mục nguồn năng lượng ──────────────────────────────────────────────────────────
INSERT INTO "public"."catalog_items"
    ("id", "type", "key", "label", "description", "icon_url", "sort_order", "vehicle_types", "active", "updated_at")
VALUES
    ('01M480NDZCEJSSC27HPK2YSV4K', 'fuel_type', 'plug_in_hybrid', 'Plug-in Hybrid (PHEV)', NULL, NULL, 4,
     ARRAY['car']::VARCHAR(20)[], true, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "key") DO NOTHING;

-- ── 2. Mảng nguồn năng lượng của mẫu xe ──────────────────────────────────────────────────
ALTER TABLE "public"."vehicle_catalog_models" DROP CONSTRAINT "vehicle_catalog_models_fuel_types_check";
ALTER TABLE "public"."vehicle_catalog_models"
    ADD CONSTRAINT "vehicle_catalog_models_fuel_types_check"
    CHECK ("fuel_types" <@ ARRAY['gasoline'::VARCHAR(20), 'diesel'::VARCHAR(20),
                                 'electric'::VARCHAR(20), 'hybrid'::VARCHAR(20),
                                 'plug_in_hybrid'::VARCHAR(20)]);

-- ── 3. Chuẩn hoá hộp số của xe hiện có ───────────────────────────────────────────────────
-- 3a. Xe điện: chỉ có một đáp án.
UPDATE "public"."vehicles"
   SET "transmission" = 'direct_drive', "updated_at" = CURRENT_TIMESTAMP
 WHERE "fuel_type" = 'electric'
   AND "transmission" IS DISTINCT FROM 'direct_drive';

-- 3b. Xe máy không chạy điện: mã của ô tô → mã của xe máy.
UPDATE "public"."vehicles"
   SET "transmission" = CASE "transmission"
           WHEN 'automatic' THEN 'automatic_cvt'
           WHEN 'cvt'       THEN 'automatic_cvt'
           WHEN 'e_cvt'     THEN 'automatic_cvt'
           WHEN 'manual'    THEN 'manual_clutch'
           ELSE 'other'
       END,
       "updated_at" = CURRENT_TIMESTAMP
 WHERE "vehicle_type" = 'motorbike'
   AND "fuel_type" IS DISTINCT FROM 'electric'
   AND "transmission" IS NOT NULL
   AND "transmission" NOT IN ('automatic_cvt', 'semi_automatic', 'manual_clutch', 'other');

-- 3c. Ô tô hybrid / plug-in hybrid: CVT của hybrid là e-CVT.
UPDATE "public"."vehicles"
   SET "transmission" = CASE "transmission"
           WHEN 'cvt'           THEN 'e_cvt'
           WHEN 'automatic_cvt' THEN 'e_cvt'
           ELSE 'other'
       END,
       "updated_at" = CURRENT_TIMESTAMP
 WHERE "vehicle_type" = 'car'
   AND "fuel_type" IN ('hybrid', 'plug_in_hybrid')
   AND "transmission" IS NOT NULL
   AND "transmission" NOT IN ('automatic', 'e_cvt', 'dct', 'other');

-- 3d. Ô tô xăng / dầu / chưa khai nguồn năng lượng: mã của xe máy/hybrid/xe điện → mã ô tô.
UPDATE "public"."vehicles"
   SET "transmission" = CASE "transmission"
           WHEN 'e_cvt'          THEN 'cvt'
           WHEN 'automatic_cvt'  THEN 'cvt'
           WHEN 'semi_automatic' THEN 'amt'
           WHEN 'manual_clutch'  THEN 'manual'
           ELSE 'other'
       END,
       "updated_at" = CURRENT_TIMESTAMP
 WHERE "vehicle_type" = 'car'
   AND ("fuel_type" IS NULL OR "fuel_type" NOT IN ('electric', 'hybrid', 'plug_in_hybrid'))
   AND "transmission" IS NOT NULL
   AND "transmission" NOT IN ('manual', 'automatic', 'cvt', 'dct', 'amt', 'other');

-- 3e. Phiếu duyệt xe ĐANG CHỜ: ảnh chụp lúc gửi phải khớp dòng vừa chuẩn hoá. `transmission` là
--     trường khoá (ADR 0030) và lượt duyệt so ảnh chụp với xe hiện tại — lệch là mọi phiếu bị chặn
--     bằng `APPROVAL_SUBJECT_CHANGED` dù chủ xe không sửa gì. Vá đúng một khoá, GIỮ `capturedAt`
--     để trang duyệt đang mở không nhận `APPROVAL_SNAPSHOT_STALE`, và giữ các ô kiểm của người duyệt.
UPDATE "public"."approval_tasks" t
   SET "snapshot_json" = jsonb_set(t."snapshot_json", '{vehicle,transmission}', to_jsonb(v."transmission")),
       "updated_at" = CURRENT_TIMESTAMP
  FROM "public"."vehicles" v
 WHERE t."target_type" = 'vehicle'
   AND t."status" = 'pending'
   AND t."target_id" = v."id"
   AND t."snapshot_json" ? 'vehicle'
   AND (t."snapshot_json" -> 'vehicle' ->> 'transmission') IS DISTINCT FROM v."transmission";

-- ── 4. Xe điện chỉ mang truyền động một cấp ──────────────────────────────────────────────
ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_electric_transmission_check"
    CHECK ("fuel_type" IS DISTINCT FROM 'electric'
           OR "transmission" IS NULL
           OR "transmission" = 'direct_drive');
