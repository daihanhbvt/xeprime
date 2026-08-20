-- Chuẩn hoá chính sách BẢO ĐẢM (thế chấp) — gap C-04, 20/08.
--
-- Trước đây bảo đảm chỉ là MỘT ô tiền cọc, còn "miễn thế chấp" là boolean marketing rời trên
-- `vehicles` không liên quan gì tới số cọc — một xe có thể vừa gắn nhãn "Miễn thế chấp" trên
-- sàn vừa đòi cọc 5 triệu. Nay bảo đảm là ba chế độ LOẠI TRỪ nhau, ràng ở DB:
--
--   cash  → khách đặt cọc TIỀN   (deposit_amount > 0, không có loại tài sản)
--   asset → khách thế chấp TÀI SẢN (deposit_amount = 0, ít nhất một loại)
--   none  → miễn thế chấp        (deposit_amount = 0, không có loại nào)
--
-- Quan hệ ba bên này là CHECK chứ không phải kiểm ở app: hai request đua nhau vẫn không được
-- phép tạo ra một chính sách vừa "miễn thế chấp" vừa giữ tiền cọc.

ALTER TABLE "rental_policies"
    ADD COLUMN "collateral_mode" VARCHAR(20) NOT NULL DEFAULT 'cash',
    ADD COLUMN "collateral_asset_types" VARCHAR(50)[] NOT NULL DEFAULT '{}';

-- Backfill TRƯỚC khi ràng CHECK: hàng đang giữ cọc là 'cash', hàng cọc 0 là 'none'.
-- Không hàng nào rơi vào 'asset' — hệ thống cũ không mô tả được khái niệm đó, nên suy ra
-- một loại tài sản cụ thể ở đây là bịa dữ liệu chính sách của gian hàng.
UPDATE "rental_policies"
   SET "collateral_mode" = CASE WHEN "deposit_amount" > 0 THEN 'cash' ELSE 'none' END;

ALTER TABLE "rental_policies"
    ADD CONSTRAINT "rental_policies_collateral_mode_check"
        CHECK ("collateral_mode" IN ('cash', 'asset', 'none')),
    ADD CONSTRAINT "rental_policies_collateral_asset_types_check"
        CHECK ("collateral_asset_types" <@ ARRAY['vehicle_registration', 'motorbike', 'passport']::VARCHAR(50)[]),
    ADD CONSTRAINT "rental_policies_collateral_scope_check"
        CHECK (
            CASE "collateral_mode"
                WHEN 'cash'  THEN "deposit_amount" >  0 AND CARDINALITY("collateral_asset_types") = 0
                WHEN 'asset' THEN "deposit_amount" =  0 AND CARDINALITY("collateral_asset_types") > 0
                WHEN 'none'  THEN "deposit_amount" =  0 AND CARDINALITY("collateral_asset_types") = 0
            END
        );

-- ĐỐI CHIẾU giấy tờ tuỳ thân của khách (thủ công có ghi nhận — không gọi API VNeID).
-- Bốn cột đi cùng nhau; nửa vời ("đã đối chiếu" mà không biết ai, hoặc biết ai mà không biết
-- lúc nào) là bản ghi không dùng được để truy vết, nên CHECK cấm luôn.
ALTER TABLE "tenant_customer_documents"
    ADD COLUMN "verified_at" TIMESTAMPTZ(3),
    ADD COLUMN "verified_by_user_id" CHAR(26),
    ADD COLUMN "verify_method" VARCHAR(20),
    ADD COLUMN "verify_note" VARCHAR(255);

ALTER TABLE "tenant_customer_documents"
    ADD CONSTRAINT "tenant_customer_documents_verify_method_check"
        CHECK ("verify_method" IS NULL OR "verify_method" IN ('vneid', 'in_person')),
    ADD CONSTRAINT "tenant_customer_documents_verify_scope_check"
        CHECK (
            ("verified_at" IS NULL     AND "verified_by_user_id" IS NULL     AND "verify_method" IS NULL)
         OR ("verified_at" IS NOT NULL AND "verified_by_user_id" IS NOT NULL AND "verify_method" IS NOT NULL)
        );

-- Màn đơn thuê hỏi "khách này đã đối chiếu đủ giấy tờ chưa" trên từng lần mở chi tiết đơn:
-- lọc theo (khách, loại giấy tờ) trong phạm vi tenant, chỉ quan tâm hàng còn sống.
CREATE INDEX "tenant_customer_documents_verify_idx"
    ON "tenant_customer_documents"("tenant_id", "tenant_customer_id", "document_type")
    WHERE "deleted_at" IS NULL AND "status" = 'ready';
