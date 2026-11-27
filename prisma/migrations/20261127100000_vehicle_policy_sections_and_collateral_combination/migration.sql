-- ADR 0112 - Chính sách xe kế thừa gian hàng theo TỪNG MỤC + cọc kết hợp tiền và tài sản.
--
-- (1) `inherited_sections`: dòng ghi đè theo xe chọn từng mục đọc từ gian hàng. Xe đã có dòng giữ
--     nguyên hành vi "riêng toàn bộ" (mảng rỗng); xe chưa có dòng vẫn kế thừa trọn như cũ.
-- (2) Cọc: `collateral_mode` chỉ còn `required` | `none`; hình thức nằm ở hai cờ + cách kết hợp.
--     Chuyển thẳng: cash ⇒ required + tiền, asset ⇒ required + tài sản, none ⇒ none.
-- Không đổi số tiền, mức cọc hay loại tài sản nào.

ALTER TABLE "rental_policies"
    ADD COLUMN "inherited_sections" VARCHAR(30)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(30)[],
    ADD COLUMN "collateral_cash_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "collateral_asset_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "collateral_combination" VARCHAR(20) NOT NULL DEFAULT 'any_one';

ALTER TABLE "rental_policies" DROP CONSTRAINT "rental_policies_collateral_mode_check";
ALTER TABLE "rental_policies" DROP CONSTRAINT "rental_policies_collateral_scope_check";

UPDATE "rental_policies"
   SET "collateral_cash_enabled"  = ("collateral_mode" = 'cash'),
       "collateral_asset_enabled" = ("collateral_mode" = 'asset'),
       "collateral_mode"          = CASE WHEN "collateral_mode" = 'none' THEN 'none' ELSE 'required' END;

ALTER TABLE "rental_policies" ALTER COLUMN "collateral_mode" SET DEFAULT 'required';

ALTER TABLE "rental_policies"
    ADD CONSTRAINT "rental_policies_collateral_mode_check"
        CHECK ("collateral_mode" IN ('required', 'none')),
    ADD CONSTRAINT "rental_policies_collateral_combination_check"
        CHECK ("collateral_combination" IN ('any_one', 'all')),
    -- Mỗi cờ đi cặp với dữ liệu của nó; `required` cần ít nhất một hình thức; `all` cần cả hai.
    ADD CONSTRAINT "rental_policies_collateral_scope_check" CHECK (
        CASE "collateral_mode"
            WHEN 'none' THEN NOT "collateral_cash_enabled" AND NOT "collateral_asset_enabled"
                AND "deposit_amount" = 0 AND cardinality("collateral_asset_types") = 0
                AND "collateral_combination" = 'any_one'
            WHEN 'required' THEN ("collateral_cash_enabled" OR "collateral_asset_enabled")
                AND ("collateral_cash_enabled" = ("deposit_amount" > 0))
                AND ("collateral_asset_enabled" = (cardinality("collateral_asset_types") > 0))
                AND ("collateral_combination" = 'any_one'
                     OR ("collateral_cash_enabled" AND "collateral_asset_enabled"))
            ELSE NULL
        END
    ),
    ADD CONSTRAINT "rental_policies_inherited_sections_check" CHECK (
        "inherited_sections" <@ ARRAY['insurance', 'collateral', 'delivery', 'usage_limits',
                                      'long_term_discount']::VARCHAR(30)[]
    ),
    -- Kế thừa chỉ có nghĩa ở dòng ghi đè theo xe.
    ADD CONSTRAINT "rental_policies_inherited_sections_scope_check" CHECK (
        "vehicle_id" IS NOT NULL OR cardinality("inherited_sections") = 0
    );
