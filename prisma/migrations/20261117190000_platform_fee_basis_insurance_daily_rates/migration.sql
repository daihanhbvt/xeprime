-- ADR 0098 (17/11/2026) — hai thay đổi cấu hình phí, người dùng chốt cùng ngày:
--
--  1. Phí sàn `S` của TỪNG loại xe tính một lần mỗi chuyến (`per_trip`, như cũ) hoặc × số ngày
--     thuê (`per_day`, mọi loại thuê kể cả dài hạn). Có phiên bản như mọi số của chính sách phí,
--     đóng băng vào đơn qua snapshot. Bản cũ mặc định `per_trip` — không đổi tiền của ai.
--
--  2. Biểu phí bảo hiểm THEO NGÀY rời `fee_policies` sang `insurance_products` (sản phẩm tính theo
--     ngày — `premium_basis = 'daily'`): một chỗ quản lý bảo hiểm duy nhất (Admin › Bảo hiểm).
--     Báo giá đọc mức ngày, công tắc bán và tên đối tác từ sản phẩm + đối tác đang chạy; các cột
--     `*_daily_*`, `*_enabled`, `insurance_partner_name` của `fee_policies` thôi được đọc khi tính
--     tiền mới (giữ để đọc lại phiên bản cũ).

-- ── 1. Cách tính phí sàn theo loại xe ─────────────────────────────────────────────────────────
ALTER TABLE "public"."fee_policies"
    ADD COLUMN "customer_platform_fee_basis_car"       VARCHAR(10) NOT NULL DEFAULT 'per_trip',
    ADD COLUMN "customer_platform_fee_basis_motorbike" VARCHAR(10) NOT NULL DEFAULT 'per_trip';
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_platform_fee_basis_check" CHECK (
        "customer_platform_fee_basis_car" IN ('per_trip', 'per_day')
        AND "customer_platform_fee_basis_motorbike" IN ('per_trip', 'per_day')
    );

-- ── 2. Mức phí ngày trên sản phẩm bảo hiểm ────────────────────────────────────────────────────
-- NULL = không áp dụng (sản phẩm theo bậc giá trị xe). Bội 1.000đ như mọi số cấu hình (ADR 0069).
ALTER TABLE "public"."insurance_products"
    ADD COLUMN "daily_amount_car"       NUMERIC(14, 2),
    ADD COLUMN "daily_amount_motorbike" NUMERIC(14, 2);
ALTER TABLE "public"."insurance_products"
    ADD CONSTRAINT "insurance_products_daily_amount_check" CHECK (
        ("daily_amount_car" IS NULL OR ("daily_amount_car" >= 0 AND mod("daily_amount_car", 1000) = 0))
        AND ("daily_amount_motorbike" IS NULL
             OR ("daily_amount_motorbike" >= 0 AND mod("daily_amount_motorbike", 1000) = 0))
    );

-- Chép mức ngày của chính sách ĐANG áp dụng sang sản phẩm cùng loại (chỉ sản phẩm tính theo ngày).
UPDATE "public"."insurance_products" AS p
SET "daily_amount_car" = f."vehicle_protection_daily_car",
    "daily_amount_motorbike" = f."vehicle_protection_daily_motorbike"
FROM "public"."fee_policies" AS f
WHERE f."status" = 'active'
  AND p."kind" = 'vehicle_trip'
  AND p."premium_basis" = 'daily';

UPDATE "public"."insurance_products" AS p
SET "daily_amount_car" = f."trip_insurance_daily_car",
    "daily_amount_motorbike" = f."trip_insurance_daily_motorbike"
FROM "public"."fee_policies" AS f
WHERE f."status" = 'active'
  AND p."kind" = 'personal_accident'
  AND p."premium_basis" = 'daily';

-- Giữ nguyên hành vi bán: trước đây một loại chỉ được bán khi sản phẩm bật VÀ chính sách bật dòng
-- đó. Nay chỉ còn công tắc của sản phẩm ⇒ loại nào chính sách đang tắt thì tắt sản phẩm tương ứng.
UPDATE "public"."insurance_products" AS p
SET "is_active" = false, "updated_at" = now()
FROM "public"."fee_policies" AS f
WHERE f."status" = 'active'
  AND p."is_active"
  AND (
      (p."kind" = 'vehicle_trip' AND NOT f."vehicle_protection_enabled")
   OR (p."kind" = 'personal_accident' AND NOT f."trip_insurance_enabled")
  );
