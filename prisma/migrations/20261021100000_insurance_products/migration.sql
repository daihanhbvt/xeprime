-- ADR 0064 — Danh mục sản phẩm bảo hiểm chuyến + snapshot sản phẩm & cờ GCN thử nghiệm.
--
-- Biểu phí NGÀY của IV/IP KHÔNG nằm ở đây: nó có phiên bản ở `fee_policies` theo loại xe. Bảng
-- này giữ phần MÔ TẢ sản phẩm hiện cho khách (tên, quyền lợi, khấu trừ, bồi thường tối đa) và mẫu
-- URL tra cứu GCN. Seed (SEED_MODE=system) nạp hai sản phẩm MIC.

-- ── 1. insurance_products ──────────────────────────────────────────────────
CREATE TABLE "public"."insurance_products" (
    "id"                       CHAR(26)       NOT NULL,
    -- @xeprime/types → InsuranceProductKind
    "kind"                     VARCHAR(30)    NOT NULL,
    -- @xeprime/types → InsuranceProvider
    "provider"                 VARCHAR(30)    NOT NULL,
    "partner_product_code"     VARCHAR(100)   NOT NULL,
    "name_vi"                  VARCHAR(255)   NOT NULL,
    "name_en"                  VARCHAR(255)   NOT NULL,
    "coverage_vi"              TEXT           NOT NULL,
    "coverage_en"              TEXT           NOT NULL,
    "deductible_car"           DECIMAL(14,2),
    "deductible_motorbike"     DECIMAL(14,2),
    "max_payout_car"           DECIMAL(14,2),
    "max_payout_motorbike"     DECIMAL(14,2),
    "max_payout_note_vi"       VARCHAR(255),
    "max_payout_note_en"       VARCHAR(255),
    "certificate_url_template" TEXT           NOT NULL,
    "display_order"            INTEGER        NOT NULL DEFAULT 0,
    "is_active"                BOOLEAN        NOT NULL DEFAULT true,
    "created_at"               TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at"               TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurance_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "insurance_products_kind_check"
        CHECK ("kind" IN ('vehicle_trip', 'personal_accident')),
    CONSTRAINT "insurance_products_provider_check"
        CHECK ("provider" IN ('mic')),
    -- Tiền của khách là số nguyên nghìn đồng ở mọi nơi khác của luồng tiền v2 — khấu trừ và mức
    -- bồi thường hiện cạnh phí ngày nên giữ cùng bước giá, không sinh số lẻ.
    CONSTRAINT "insurance_products_amounts_check" CHECK (
        ("deductible_car" IS NULL OR ("deductible_car" >= 0 AND mod("deductible_car", 1000) = 0))
        AND ("deductible_motorbike" IS NULL OR ("deductible_motorbike" >= 0 AND mod("deductible_motorbike", 1000) = 0))
        AND ("max_payout_car" IS NULL OR ("max_payout_car" >= 0 AND mod("max_payout_car", 1000) = 0))
        AND ("max_payout_motorbike" IS NULL OR ("max_payout_motorbike" >= 0 AND mod("max_payout_motorbike", 1000) = 0))
    ),
    -- Mẫu URL phải là https và có chỗ thay số GCN: một mẫu thiếu `{certCode}` dựng ra cùng MỘT
    -- đường dẫn cho mọi khách, và khách bấm "Xem GCN" sẽ thấy giấy của người khác (hoặc 404).
    CONSTRAINT "insurance_products_certificate_url_template_check"
        CHECK ("certificate_url_template" LIKE 'https://%' AND position('{certCode}' IN "certificate_url_template") > 0),
    CONSTRAINT "insurance_products_display_order_check" CHECK ("display_order" >= 0)
);

-- Một hãng, một sản phẩm mỗi loại.
CREATE UNIQUE INDEX "insurance_products_provider_kind_key"
    ON "public"."insurance_products" ("provider", "kind");

-- Danh mục công khai: chỉ sản phẩm đang bật, theo thứ tự hiển thị.
CREATE INDEX "insurance_products_active_order_idx"
    ON "public"."insurance_products" ("is_active", "display_order");

-- ── 2. booking_insurance_policies: snapshot sản phẩm + cờ thử nghiệm ───────
ALTER TABLE "public"."booking_insurance_policies"
    ADD COLUMN "product_snapshot_json" JSONB,
    ADD COLUMN "is_test" BOOLEAN NOT NULL DEFAULT false;

-- Hai chiều: GCN thử nghiệm PHẢI mang tiền tố `TEST-`, và một số `TEST-…` không bao giờ được ghi
-- như một hợp đồng thật. Một màn hình quên đọc cờ vẫn để lộ chữ TEST trong chính số chứng nhận.
ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_test_certificate_check" CHECK (
        "certificate_number" IS NULL
        OR ("is_test" = (left("certificate_number", 5) = 'TEST-'))
    );

-- Hàng đợi GCN của admin khi xem TẤT CẢ trạng thái (không lọc status) — sắp theo ngày tạo.
CREATE INDEX "booking_insurance_policies_created_idx"
    ON "public"."booking_insurance_policies" ("created_at");
