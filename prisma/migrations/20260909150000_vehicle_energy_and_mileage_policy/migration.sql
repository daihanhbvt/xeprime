-- ═══════════════════════════════════════════════════════════════════════════
-- Thông số XE ĐIỆN + hạn mức quãng đường của chuyến tự lái (09/09/2026)
--
-- 1. Xe điện: dung lượng pin và mức tiêu thụ điện. `electric_range_km` đã có từ migration
--    trước; hai cột này là phần còn lại của bộ thông số mà khách thuê xe điện hỏi. Chúng KHÔNG
--    dồn vào `fuel_consumption_*` (lít/100km) — khác đơn vị, khác ý nghĩa.
--
-- 2. Hạn mức km/ngày và phí mỗi km vượt, đặt trên `rental_policies` (không phải trên `vehicles`)
--    vì đây là ĐIỀU KHOẢN thuê: nó kế thừa từ gian hàng, ghi đè được theo xe, và được đóng băng
--    vào yêu cầu/đơn giống mọi điều khoản khác.
--
--    Hai cột đi CẶP: cùng NULL = không giới hạn; đã đặt hạn mức thì phải có giá vượt. CHECK ràng
--    đúng điều đó, để không có chính sách nào hứa một hạn mức mà không ai tính nổi tiền vượt.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."vehicles"
    ADD COLUMN "battery_capacity_kwh"              DECIMAL(6,2),
    ADD COLUMN "electric_consumption_kwh_per_100km" DECIMAL(6,2);

ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_battery_capacity_check"
    CHECK ("battery_capacity_kwh" IS NULL
        OR ("battery_capacity_kwh" > 0 AND "battery_capacity_kwh" <= 500));
ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_electric_consumption_check"
    CHECK ("electric_consumption_kwh_per_100km" IS NULL
        OR ("electric_consumption_kwh_per_100km" > 0
            AND "electric_consumption_kwh_per_100km" <= 200));

ALTER TABLE "public"."rental_policies"
    ADD COLUMN "included_distance_km_per_day" INTEGER,
    ADD COLUMN "excess_distance_fee_per_km"   DECIMAL(14,2);

-- Cùng NULL (không giới hạn) hoặc cùng có giá trị — không có nửa vời.
ALTER TABLE "public"."rental_policies"
    ADD CONSTRAINT "rental_policies_mileage_pair_check"
    CHECK (("included_distance_km_per_day" IS NULL AND "excess_distance_fee_per_km" IS NULL)
        OR ("included_distance_km_per_day" IS NOT NULL AND "excess_distance_fee_per_km" IS NOT NULL));
ALTER TABLE "public"."rental_policies"
    ADD CONSTRAINT "rental_policies_mileage_range_check"
    CHECK ("included_distance_km_per_day" IS NULL
        OR ("included_distance_km_per_day" >= 50 AND "included_distance_km_per_day" <= 2000));
ALTER TABLE "public"."rental_policies"
    ADD CONSTRAINT "rental_policies_excess_fee_check"
    CHECK ("excess_distance_fee_per_km" IS NULL
        OR ("excess_distance_fee_per_km" >= 0 AND "excess_distance_fee_per_km" <= 100000));

-- ── Phụ phí vượt km: danh mục riêng của chuyến TỰ LÁI ───────────────────────
-- Không mượn `long_distance` (phụ phí đường dài của chuyến CÓ TÀI XẾ): hai khoản trả cho hai
-- thứ khác nhau, gộp lại là mất khả năng đối soát về sau.

ALTER TABLE "public"."booking_surcharges"
    DROP CONSTRAINT IF EXISTS "booking_surcharges_category_check";
ALTER TABLE "public"."booking_surcharges"
    ADD CONSTRAINT "booking_surcharges_category_check"
    CHECK ("category" IN ('overtime', 'cleaning', 'damage', 'waiting', 'long_distance',
                          'overnight', 'excess_mileage', 'other'));
