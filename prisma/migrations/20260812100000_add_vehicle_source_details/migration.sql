-- Wave 4 — Vehicle Source & Finance.
--
-- `vehicle_source_details`: hồ sơ chi tiết đằng sau `vehicles.source_type` — MỘT bản ghi
-- mỗi xe (unique vehicle_id), biến thể theo source_type. Scalar `vehicles.source_type`
-- giữ nguyên cho filter/badge; hai nơi đồng bộ trong cùng transaction ở VehicleSourceService.
--
-- Kỷ luật constraint-first (skill database-change): cột không thuộc biến thể hiện tại PHẢI
-- NULL — CHECK theo từng nhóm biến thể, để một bản ghi "trả góp còn sót tiền thuê lại" là
-- điều DB từ chối chứ không phải điều code hứa sẽ không làm.

CREATE TABLE "vehicle_source_details" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,

    -- owned
    "purchase_date" DATE,
    "purchase_price" DECIMAL(14,2),
    "purchase_place" VARCHAR(255),

    -- financed
    "bank_name" VARCHAR(160),
    "contract_number" VARCHAR(120),
    "original_principal" DECIMAL(14,2),
    "monthly_principal" DECIMAL(14,2),
    "monthly_interest" DECIMAL(14,2),
    "interest_rate_percent" DECIMAL(5,2),
    "term_months" INTEGER,
    "interest_method" VARCHAR(30),

    -- rented + partnership
    "owner_name" VARCHAR(160),
    "owner_phone" VARCHAR(30),
    "owner_email" VARCHAR(160),
    "monthly_rent" DECIMAL(14,2),
    "commission_percent" DECIMAL(5,2),

    -- chung
    "payment_day" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "contract_files_json" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_source_details_pkey" PRIMARY KEY ("id"),

    -- Giá trị vô hướng hợp lệ
    CONSTRAINT "vsd_source_type_valid"
        CHECK ("source_type" IN ('owned', 'financed', 'rented', 'partnership')),
    CONSTRAINT "vsd_interest_method_valid"
        CHECK ("interest_method" IS NULL OR "interest_method" IN ('reducing_balance', 'flat')),
    CONSTRAINT "vsd_payment_day_range"
        CHECK ("payment_day" IS NULL OR ("payment_day" BETWEEN 1 AND 31)),
    CONSTRAINT "vsd_term_months_positive" CHECK ("term_months" IS NULL OR "term_months" > 0),
    CONSTRAINT "vsd_commission_percent_range"
        CHECK ("commission_percent" IS NULL OR ("commission_percent" >= 0 AND "commission_percent" <= 100)),
    CONSTRAINT "vsd_interest_rate_range"
        CHECK ("interest_rate_percent" IS NULL OR ("interest_rate_percent" >= 0 AND "interest_rate_percent" <= 100)),
    CONSTRAINT "vsd_money_nonnegative" CHECK (
        ("purchase_price" IS NULL OR "purchase_price" >= 0)
        AND ("original_principal" IS NULL OR "original_principal" >= 0)
        AND ("monthly_principal" IS NULL OR "monthly_principal" >= 0)
        AND ("monthly_interest" IS NULL OR "monthly_interest" >= 0)
        AND ("monthly_rent" IS NULL OR "monthly_rent" >= 0)
    ),
    CONSTRAINT "vsd_date_order"
        CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date"),

    -- Biến thể: cột nhóm khác phải NULL
    CONSTRAINT "vsd_owned_fields_scoped" CHECK (
        "source_type" = 'owned'
        OR ("purchase_date" IS NULL AND "purchase_price" IS NULL AND "purchase_place" IS NULL)
    ),
    CONSTRAINT "vsd_financed_fields_scoped" CHECK (
        "source_type" = 'financed'
        OR (
            "bank_name" IS NULL AND "contract_number" IS NULL AND "original_principal" IS NULL
            AND "monthly_principal" IS NULL AND "monthly_interest" IS NULL
            AND "interest_rate_percent" IS NULL AND "term_months" IS NULL AND "interest_method" IS NULL
        )
    ),
    CONSTRAINT "vsd_owner_fields_scoped" CHECK (
        "source_type" IN ('rented', 'partnership')
        OR ("owner_name" IS NULL AND "owner_phone" IS NULL AND "owner_email" IS NULL)
    ),
    CONSTRAINT "vsd_rented_fields_scoped"
        CHECK ("source_type" = 'rented' OR "monthly_rent" IS NULL),
    CONSTRAINT "vsd_partnership_fields_scoped"
        CHECK ("source_type" = 'partnership' OR "commission_percent" IS NULL),
    CONSTRAINT "vsd_payment_day_scoped"
        CHECK ("source_type" IN ('financed', 'rented') OR "payment_day" IS NULL),
    -- Sở hữu không có "hợp đồng đang chạy": ngày hiệu lực chỉ có nghĩa với 3 biến thể còn lại.
    CONSTRAINT "vsd_contract_dates_scoped"
        CHECK ("source_type" <> 'owned' OR ("start_date" IS NULL AND "end_date" IS NULL))
);

ALTER TABLE "vehicle_source_details"
    ADD CONSTRAINT "vehicle_source_details_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "vehicle_source_details_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1:1 với xe — hai request cùng "tạo hồ sơ nguồn" chỉ một cái thắng.
CREATE UNIQUE INDEX "vehicle_source_details_vehicle_id_key" ON "vehicle_source_details"("vehicle_id");

-- Màn tổng hợp nghĩa vụ tài chính (phase sau) lọc theo tenant + loại nguồn.
CREATE INDEX "vehicle_source_details_tenant_id_source_type_idx"
    ON "vehicle_source_details"("tenant_id", "source_type");
