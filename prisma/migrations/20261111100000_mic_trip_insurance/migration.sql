-- ADR 0088 — Bảo hiểm vật chất xe MIC cho chuyến thuê ô tô tự lái.
--
-- 1. `vehicles.insured_value` — giá trị xe chủ xe khai, mẫu số của phí theo bậc.
-- 2. `insurance_products` — cách tính phí (`daily` | `value_tier`), biểu phí bậc, hotline bồi thường.
-- 3. `booking_insurance_policies` — dữ liệu phía đối tác (id_tras, so_id, so_hd, ttrang, phí MIC),
--    giá trị xe đã dùng, mốc gửi ảnh, bảng kê đã gom.
-- 4. `insurance_premium_remittances` — bảng kê trả phí cho hãng theo tháng.

-- ── 1. vehicles ────────────────────────────────────────────────────────────
ALTER TABLE "public"."vehicles" ADD COLUMN "insured_value" DECIMAL(14,2);

-- Giá trị xe là con số tròn triệu trong một khoảng hợp lý — số rác ở đây đi thẳng vào phí khách trả
-- và vào hợp đồng bảo hiểm (MIC từ chối giá trị lệch quá xa giá thị trường).
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_insured_value_check" CHECK (
    "insured_value" IS NULL
    OR ("insured_value" BETWEEN 50000000 AND 20000000000 AND mod("insured_value", 1000000) = 0)
);

-- ── 2. insurance_products ──────────────────────────────────────────────────
ALTER TABLE "public"."insurance_products"
    ADD COLUMN "premium_basis"      VARCHAR(20) NOT NULL DEFAULT 'daily',
    ADD COLUMN "premium_tiers_json" JSONB,
    ADD COLUMN "claim_hotline"      VARCHAR(30);

ALTER TABLE "public"."insurance_products"
    ADD CONSTRAINT "insurance_products_premium_basis_check"
        CHECK ("premium_basis" IN ('daily', 'value_tier')),
    -- Phí theo bậc giá trị xe chỉ có nghĩa với bảo hiểm VẬT CHẤT XE, và luôn phải mang biểu phí:
    -- một sản phẩm bậc không có bậc nào là một sản phẩm không báo giá được.
    ADD CONSTRAINT "insurance_products_value_tier_check" CHECK (
        "premium_basis" = 'daily'
        OR ("kind" = 'vehicle_trip'
            AND "premium_tiers_json" IS NOT NULL
            AND jsonb_typeof("premium_tiers_json") = 'array'
            AND jsonb_array_length("premium_tiers_json") > 0)
    );

-- ── 3. booking_insurance_policies ──────────────────────────────────────────
ALTER TABLE "public"."booking_insurance_policies"
    ADD COLUMN "partner_ref"             VARCHAR(20),
    ADD COLUMN "partner_policy_id"       VARCHAR(50),
    ADD COLUMN "partner_contract_number" VARCHAR(50),
    ADD COLUMN "partner_status"          VARCHAR(10),
    ADD COLUMN "partner_premium_amount"  DECIMAL(14,2),
    ADD COLUMN "insured_value"           DECIMAL(14,2),
    ADD COLUMN "photos_sent_at"          TIMESTAMPTZ(3),
    ADD COLUMN "remittance_id"           CHAR(26);

ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_partner_amounts_check" CHECK (
        ("partner_premium_amount" IS NULL OR "partner_premium_amount" >= 0)
        AND ("insured_value" IS NULL OR "insured_value" > 0)
    );

-- Một mã giao dịch đối tác cho đúng một hợp đồng — gửi trùng là mua đôi.
CREATE UNIQUE INDEX "booking_insurance_policies_partner_ref_key"
    ON "public"."booking_insurance_policies" ("partner_ref");

CREATE INDEX "booking_insurance_policies_unremitted_idx"
    ON "public"."booking_insurance_policies" ("issued_at");

CREATE INDEX "booking_insurance_policies_remittance_idx"
    ON "public"."booking_insurance_policies" ("remittance_id");

-- ── 4. insurance_premium_remittances ───────────────────────────────────────
CREATE TABLE "public"."insurance_premium_remittances" (
    "id"                 CHAR(26)       NOT NULL,
    "provider"           VARCHAR(30)    NOT NULL,
    "period_month"       DATE           NOT NULL,
    "status"             VARCHAR(20)    NOT NULL DEFAULT 'draft',
    "policy_count"       INTEGER        NOT NULL,
    "gross_premium"      DECIMAL(14,2)  NOT NULL,
    "commission_percent" DECIMAL(5,2)   NOT NULL,
    "commission_amount"  DECIMAL(14,2)  NOT NULL,
    "payable_amount"     DECIMAL(14,2)  NOT NULL,
    "paid_amount"        DECIMAL(14,2),
    "paid_at"            TIMESTAMPTZ(3),
    "bank_reference"     VARCHAR(100),
    "note"               TEXT,
    "created_by"         CHAR(26),
    "finalized_at"       TIMESTAMPTZ(3),
    "finalized_by"       CHAR(26),
    "paid_recorded_by"   CHAR(26),
    "created_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurance_premium_remittances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "insurance_premium_remittances_provider_check" CHECK ("provider" IN ('mic')),
    CONSTRAINT "insurance_premium_remittances_status_check"
        CHECK ("status" IN ('draft', 'finalized', 'paid')),
    -- Kỳ kê luôn là NGÀY ĐẦU tháng — hai cách viết cùng một tháng không được thành hai bảng kê.
    CONSTRAINT "insurance_premium_remittances_period_check"
        CHECK (EXTRACT(DAY FROM "period_month") = 1),
    CONSTRAINT "insurance_premium_remittances_amounts_check" CHECK (
        "policy_count" >= 0
        AND "gross_premium" >= 0
        AND "commission_percent" BETWEEN 0 AND 50
        AND "commission_amount" >= 0
        AND "commission_amount" <= "gross_premium"
        AND "payable_amount" = "gross_premium" - "commission_amount"
    ),
    -- Đã trả ⇒ phải cầm đủ bằng chứng chuyển khoản; chưa trả ⇒ không có số đã trả nào.
    CONSTRAINT "insurance_premium_remittances_paid_check" CHECK (
        ("status" = 'paid' AND "paid_amount" IS NOT NULL AND "paid_amount" > 0 AND "paid_at" IS NOT NULL)
        OR ("status" <> 'paid' AND "paid_amount" IS NULL AND "paid_at" IS NULL)
    ),
    CONSTRAINT "insurance_premium_remittances_finalized_check" CHECK (
        "status" = 'draft' OR "finalized_at" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "insurance_premium_remittances_provider_period_key"
    ON "public"."insurance_premium_remittances" ("provider", "period_month");

CREATE INDEX "insurance_premium_remittances_period_idx"
    ON "public"."insurance_premium_remittances" ("period_month");

ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_remittance_id_fkey"
    FOREIGN KEY ("remittance_id") REFERENCES "public"."insurance_premium_remittances"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
