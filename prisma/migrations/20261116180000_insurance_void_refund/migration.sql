-- ADR 0093 (16/11/2026) — thu hồi hợp đồng bảo hiểm theo hiệu lực: lý do + mã đối chiếu có cột riêng,
-- hợp đồng ĐÃ cấp mà bị thu hồi thì bắt buộc mã đối chiếu bên đối tác.

ALTER TABLE "public"."booking_insurance_policies"
    ADD COLUMN "void_reason"            TEXT,
    ADD COLUMN "void_partner_reference" VARCHAR(100);

-- Thu hồi hợp đồng đã từng cấp mà không có bằng chứng đối chiếu bên đối tác là để XePrime nợ hãng
-- một khoản không ai truy được. Dòng `voided` cũ (trước ADR này) không có cột này: NOT VALID rồi chỉ
-- VALIDATE khi không còn dòng cũ vi phạm.
ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_void_reference_check"
    CHECK (
        "status" <> 'voided'
        OR "issued_at" IS NULL
        OR "void_partner_reference" IS NOT NULL
    ) NOT VALID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "public"."booking_insurance_policies"
         WHERE "status" = 'voided'
           AND "issued_at" IS NOT NULL
           AND "void_partner_reference" IS NULL
    ) THEN
        ALTER TABLE "public"."booking_insurance_policies"
            VALIDATE CONSTRAINT "booking_insurance_policies_void_reference_check";
    ELSE
        RAISE NOTICE 'booking_insurance_policies_void_reference_check: còn dòng voided cũ thiếu mã đối chiếu — ràng buộc canh lượt ghi mới, CHƯA validate toàn bảng';
    END IF;
END $$;

-- Vòng tự hoàn nhặt hợp đồng đã huỷ mà CHƯA hoàn (chờ hold chốt) — tập nhỏ, index một phần.
CREATE INDEX "booking_insurance_policies_refund_due_idx"
    ON "public"."booking_insurance_policies" ("hold_id")
    WHERE "status" = 'cancelled' AND "refunded_at" IS NULL;
