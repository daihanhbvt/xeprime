-- Chính sách thuê mặc định TÁCH THEO LOẠI XE (đợt hoàn thiện 17/08).
--
-- Ô tô và xe máy khác hẳn nhau về cọc/phí — một policy mặc định chung cho cả gian hàng ép
-- hai loại xe dùng cùng mức. Thứ tự áp dụng mới (PricingService.effectivePolicy):
--   1. override riêng của xe (vehicle_id set)         — cao nhất, giữ nguyên;
--   2. mặc định theo LOẠI XE (vehicle_id NULL + vehicle_type set);
--   3. mặc định legacy toàn gian hàng (cả hai NULL)   — giai đoạn tương thích.

ALTER TABLE "rental_policies" ADD COLUMN "vehicle_type" VARCHAR(50);

ALTER TABLE "rental_policies"
    ADD CONSTRAINT "rental_policies_vehicle_type_check"
        CHECK ("vehicle_type" IS NULL OR "vehicle_type" IN ('car', 'motorbike')),
    -- vehicle_type chỉ dành cho hàng MẶC ĐỊNH: bản ghi đè theo xe đọc loại từ chính chiếc xe.
    ADD CONSTRAINT "rental_policies_vehicle_type_scope_check"
        CHECK ("vehicle_type" IS NULL OR "vehicle_id" IS NULL);

-- Unique cũ (tenant_id WHERE vehicle_id IS NULL) sẽ chặn các hàng theo loại — thu hẹp nó về
-- đúng hàng legacy, rồi thêm unique riêng cho (tenant, loại xe).
DROP INDEX "rental_policies_shop_default_key";
CREATE UNIQUE INDEX "rental_policies_shop_default_key"
    ON "rental_policies"("tenant_id")
    WHERE "vehicle_id" IS NULL AND "vehicle_type" IS NULL;
CREATE UNIQUE INDEX "rental_policies_type_default_key"
    ON "rental_policies"("tenant_id", "vehicle_type")
    WHERE "vehicle_id" IS NULL AND "vehicle_type" IS NOT NULL;

-- Nhân bản policy mặc định hiện có cho car + motorbike: xe hai loại tiếp tục nhận ĐÚNG các
-- thông số đang áp — migration không làm đổi giá/chính sách đột ngột. Hàng legacy giữ lại làm
-- fallback đọc; id sinh bằng ký tự hex ngẫu nhiên đủ 26 ký tự (đúng độ dài CHAR(26); ULID
-- "đẹp" chỉ sinh được ở app — với dữ liệu backfill điều quan trọng là không đụng nhau).
INSERT INTO "rental_policies" (
    "id", "tenant_id", "vehicle_id", "vehicle_type", "deposit_amount", "delivery_enabled",
    "delivery_max_radius_km", "delivery_tiers_json", "overtime_fee_per_hour",
    "overtime_grace_minutes", "overtime_rounding_minutes", "discount_enabled",
    "discount_tiers_json", "created_at", "updated_at"
)
SELECT
    UPPER(SUBSTR(MD5(random()::text || p."id" || vt.vt), 1, 26)),
    p."tenant_id", NULL, vt.vt, p."deposit_amount", p."delivery_enabled",
    p."delivery_max_radius_km", p."delivery_tiers_json", p."overtime_fee_per_hour",
    p."overtime_grace_minutes", p."overtime_rounding_minutes", p."discount_enabled",
    p."discount_tiers_json", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "rental_policies" p
CROSS JOIN (VALUES ('car'), ('motorbike')) AS vt(vt)
WHERE p."vehicle_id" IS NULL AND p."vehicle_type" IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM "rental_policies" q
      WHERE q."tenant_id" = p."tenant_id" AND q."vehicle_id" IS NULL AND q."vehicle_type" = vt.vt
  );
