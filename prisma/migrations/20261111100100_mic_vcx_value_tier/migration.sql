-- ADR 0088 — sản phẩm VCX của MIC chuyển sang phí theo bậc giá trị xe.
--
-- Seed chỉ tạo mới, nên môi trường đã có dòng (staging) đổi ở đây. Biểu phí = bảng đo trên sandbox
-- MIC 11/11/2026 (loại xe M1.11); admin sửa ở màn "Bảo hiểm" khi MIC đổi biểu phí production.
UPDATE "public"."insurance_products"
SET "premium_basis"      = 'value_tier',
    "premium_tiers_json" = '[{"maxDays":2,"percent":"0.013"},{"maxDays":5,"percent":"0.033"},{"maxDays":10,"percent":"0.066"},{"maxDays":15,"percent":"0.098"},{"maxDays":30,"percent":"0.2"}]'::jsonb,
    "claim_hotline"      = '1900 558 891',
    "updated_at"         = now()
WHERE "provider" = 'mic' AND "kind" = 'vehicle_trip' AND "premium_basis" = 'daily';

UPDATE "public"."insurance_products"
SET "claim_hotline" = '1900 558 891', "updated_at" = now()
WHERE "provider" = 'mic' AND "kind" = 'personal_accident' AND "claim_hotline" IS NULL;
