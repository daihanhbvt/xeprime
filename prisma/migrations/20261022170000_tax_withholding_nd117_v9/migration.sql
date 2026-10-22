-- ═══════════════════════════════════════════════════════════════════════════
-- Khấu trừ thuế theo NĐ 117/2025 + NĐ 68/2026 — ADR 0068 (điều 1–4, phần sổ thuế)
-- (22/10/2026)
--
-- 1. `fee_policies.tax_rates` (jsonb) — bảng mức theo LOẠI DỊCH VỤ, tách GTGT/TNCN:
--      { "self_drive":  {"vatPercent": 5, "pitPercent": 2},
--        "long_term":   {"vatPercent": 5, "pitPercent": 2},
--        "with_driver": {"vatPercent": 3, "pitPercent": 1.5} }
--    Hình dạng đầy đủ do `parseTaxRates` / `feePolicyActivationBlockers` (@xeprime/types) canh ở
--    cổng kích hoạt; DB canh "là object" và sàn `deposit_percent` (mục 3).
--    `fee_policies.tax_legal_basis` — căn cứ pháp lý, thay `tax_label`.
--    `tax_percent` / `tax_label` GIỮ (LEGACY, ≤ v8): snapshot cũ còn đọc; phép tính mới không đọc.
--
-- 2. CHECK `fee_policies_tax_requires_basis_check` (thuế bật ⇒ có `tax_percent` + `tax_label`)
--    được THAY bằng `fee_policies_tax_requires_rates_check` (thuế bật ⇒ có `tax_rates` object +
--    `tax_legal_basis` khác rỗng). Bản `archived` được miễn: chúng là lịch sử bất biến (ADR 0024),
--    có thể mang mô hình một-mức của v4–v8, và không bao giờ tính tiền mới.
--    Bản NHÁP còn mô hình một-mức mà đang bật thuế (nếu có) được điền bảng mức NĐ 117 + căn cứ mặc
--    định để giữ được ý "bật thuế" của admin — họ vẫn phải xem và kích hoạt lại bằng tay.
--
-- 3. CHECK `fee_policies_deposit_covers_tax_check` viết lại: `deposit_percent` ≥ mức thuế TỔNG
--    CAO NHẤT của bảng (`GREATEST` của ba cặp `vat + pit`) — bảo đảm `D ≥ T` ở mọi đơn, mọi loại
--    dịch vụ (ADR 0068 điều 3). Giữ cả nhánh cũ `deposit_percent ≥ tax_percent` cho bản một-mức.
--
-- 4. `tax_withholdings` thêm GTGT/TNCN tách riêng, tỷ lệ, nhóm NĐ 117 và ĐỊNH DANH người bán chụp
--    lúc ghi sổ (loại chủ thể áp thuế, MST, số CCCD, tên pháp lý) — tờ khai đọc snapshot, không
--    join lại hồ sơ hôm nay. Dòng trước đợt này để NULL (một mức, không tách). CHECK: hai cột cùng
--    có hoặc cùng vắng, và `vat_amount + pit_amount = amount` (dòng đảo mang cả ba số âm).
--
-- 5. Chính sách phí v9: sao bản ĐANG HIỆU LỰC, điền bảng mức NĐ 117 (7% · 7% · 4,5%) + căn cứ,
--    `tax_percent` NULL (không còn một mức), `deposit_percent` giữ nguyên (15 ≥ 7) — nâng lên mức
--    thuế cao nhất nếu bản đang chạy thấp hơn, để CHECK mục 3 không bao giờ bị vi phạm.
--    Công tắc `tax_enabled` GIỮ NGUYÊN của bản đang chạy: migration chỉ đổi MÔ HÌNH mức thuế, không
--    tự bật một cổng mà admin đang để tắt (ADR 0028 điều 4 — bật thuế là quyết định có căn cứ, đi
--    qua cổng kích hoạt của màn quản trị).
--    Idempotent bằng id cố định: chạy lại không sinh v10.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): mọi CHECK dưới đây.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột mới của fee_policies ─────────────────────────────────────────────

ALTER TABLE "public"."fee_policies"
    ADD COLUMN "tax_rates"       JSONB,
    ADD COLUMN "tax_legal_basis" VARCHAR(255);

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_tax_rates_object_check"
    CHECK ("tax_rates" IS NULL OR jsonb_typeof("tax_rates") = 'object');

-- CHECK một-mức cũ (thuế bật ⇒ có tax_percent + tax_label) phải gỡ TRƯỚC khi chèn v9 — v9 bật
-- thuế với tax_percent NULL. CHECK thay thế được thêm ở mục 2 bên dưới, sau khi v8 đã lưu trữ.
ALTER TABLE "public"."fee_policies" DROP CONSTRAINT IF EXISTS "fee_policies_tax_requires_basis_check";

-- ── 2. Bản nháp một-mức đang bật thuế → bảng mức NĐ 117 ─────────────────────

UPDATE "public"."fee_policies"
   SET "tax_rates" = '{"self_drive":{"vatPercent":5,"pitPercent":2},"long_term":{"vatPercent":5,"pitPercent":2},"with_driver":{"vatPercent":3,"pitPercent":1.5}}'::jsonb,
       "tax_legal_basis" = 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
       "updated_at" = now()
 WHERE "status" = 'draft'
   AND "tax_enabled"
   AND "tax_rates" IS NULL;

-- ── 5. Chính sách phí v9 (trước khi đổi CHECK: bản v8 đang chạy phải được lưu trữ trước) ──────

DO $$
DECLARE
    cur          "public"."fee_policies"%ROWTYPE;
    next_version INT;
    deposit_pct  NUMERIC(5, 2);
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "id" = '01FEEPOLICYTAXND117V200009') THEN
        RETURN;
    END IF;

    SELECT * INTO cur FROM "public"."fee_policies" WHERE "status" = 'active';
    IF NOT FOUND THEN
        RAISE NOTICE 'fee_policy_v9: không có chính sách phí nào đang hiệu lực — bỏ qua v9, admin tạo bản mới qua màn quản trị';
        RETURN;
    END IF;

    SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version FROM "public"."fee_policies";
    -- Mức thuế tổng cao nhất của bảng NĐ 117 là 7% (tự lái/dài hạn).
    deposit_pct := GREATEST(cur."deposit_percent", 7);

    UPDATE "public"."fee_policies"
       SET "status" = 'archived', "effective_to" = now(), "updated_at" = now()
     WHERE "id" = cur."id";

    INSERT INTO "public"."fee_policies" (
        "id", "version", "status", "name", "note",
        "service_fee_percent", "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
        "deposit_percent", "deposit_min_amount", "deposit_max_percent",
        "tax_enabled", "tax_percent", "tax_label", "tax_rates", "tax_legal_basis",
        "trip_insurance_enabled", "trip_insurance_percent",
        "vehicle_protection_enabled", "vehicle_protection_percent", "insurance_partner_name",
        "customer_platform_fee_car", "customer_platform_fee_motorbike", "owner_commission_tiers",
        "vehicle_protection_daily_car", "vehicle_protection_daily_motorbike",
        "trip_insurance_daily_car", "trip_insurance_daily_motorbike",
        "effective_from", "activated_at", "created_at", "updated_at"
    ) VALUES (
        '01FEEPOLICYTAXND117V200009', next_version, 'active',
        'Khấu trừ thuế theo NĐ 117/2025 — 7% tự lái/dài hạn, 4,5% có tài xế',
        'Thuế khấu trừ, nộp thay theo loại dịch vụ, tách GTGT và TNCN, mỗi khoản tính đúng tới đồng: '
        || 'tự lái và dài hạn 5% GTGT + 2% TNCN, có tài xế 3% GTGT + 1,5% TNCN, trên tiền thuê (không '
        || 'gồm phí giao xe). Chỉ khấu trừ cá nhân và hộ kinh doanh; doanh nghiệp đã xác minh không bị '
        || 'khấu trừ. Mức phân loại cần tư vấn thuế xác nhận trước khi mở release gate. Các mục khác '
        || 'giữ nguyên bản trước.',
        cur."service_fee_percent", cur."hold_min_amount", cur."hold_payment_window_minutes", cur."free_cancel_hours",
        deposit_pct, cur."deposit_min_amount", GREATEST(cur."deposit_max_percent", deposit_pct),
        -- Giữ công tắc của bản đang chạy — chỉ điền bảng mức + căn cứ (xem mục 5 ở đầu file).
        cur."tax_enabled", NULL, 'Khấu trừ thay GTGT + TNCN (NĐ 117/2025)',
        '{"self_drive":{"vatPercent":5,"pitPercent":2},"long_term":{"vatPercent":5,"pitPercent":2},"with_driver":{"vatPercent":3,"pitPercent":1.5}}'::jsonb,
        'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
        cur."trip_insurance_enabled", cur."trip_insurance_percent",
        cur."vehicle_protection_enabled", cur."vehicle_protection_percent", cur."insurance_partner_name",
        cur."customer_platform_fee_car", cur."customer_platform_fee_motorbike", cur."owner_commission_tiers",
        cur."vehicle_protection_daily_car", cur."vehicle_protection_daily_motorbike",
        cur."trip_insurance_daily_car", cur."trip_insurance_daily_motorbike",
        now(), now(), now(), now()
    );
END $$;

-- ── 2. Thuế bật ⇒ bảng mức + căn cứ pháp lý (thay CHECK một-mức) ────────────

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_tax_requires_rates_check"
    CHECK (
        NOT "tax_enabled"
        OR "status" = 'archived'
        OR (
            "tax_rates" IS NOT NULL
            AND "tax_legal_basis" IS NOT NULL
            AND btrim("tax_legal_basis") <> ''
        )
    );

-- ── 3. D ≥ T ở mọi loại dịch vụ ─────────────────────────────────────────────

ALTER TABLE "public"."fee_policies" DROP CONSTRAINT IF EXISTS "fee_policies_deposit_covers_tax_check";

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_deposit_covers_tax_check"
    CHECK (
        NOT "tax_enabled"
        OR (
            ("tax_percent" IS NULL OR "deposit_percent" >= "tax_percent")
            AND (
                "tax_rates" IS NULL
                OR "deposit_percent" >= GREATEST(
                    COALESCE(("tax_rates" #>> '{self_drive,vatPercent}')::numeric, 0)
                        + COALESCE(("tax_rates" #>> '{self_drive,pitPercent}')::numeric, 0),
                    COALESCE(("tax_rates" #>> '{long_term,vatPercent}')::numeric, 0)
                        + COALESCE(("tax_rates" #>> '{long_term,pitPercent}')::numeric, 0),
                    COALESCE(("tax_rates" #>> '{with_driver,vatPercent}')::numeric, 0)
                        + COALESCE(("tax_rates" #>> '{with_driver,pitPercent}')::numeric, 0)
                )
            )
        )
    );

-- ── 4. Sổ thuế: GTGT/TNCN + định danh người bán ─────────────────────────────

ALTER TABLE "public"."tax_withholdings"
    ADD COLUMN "vat_amount"          DECIMAL(14, 2),
    ADD COLUMN "pit_amount"          DECIMAL(14, 2),
    ADD COLUMN "vat_percent"         DECIMAL(5, 2),
    ADD COLUMN "pit_percent"         DECIMAL(5, 2),
    ADD COLUMN "tax_category"        VARCHAR(20),
    ADD COLUMN "seller_entity_type"  VARCHAR(30),
    ADD COLUMN "seller_tax_id"       VARCHAR(30),
    ADD COLUMN "seller_id_number"    VARCHAR(30),
    ADD COLUMN "seller_legal_name"   VARCHAR(255);

ALTER TABLE "public"."tax_withholdings"
    -- Hai sắc thuế đi cùng nhau: một dòng chỉ có GTGT mà không có TNCN là một phép tách dở dang.
    ADD CONSTRAINT "tax_withholdings_vat_pit_pair_check"
    CHECK (("vat_amount" IS NULL) = ("pit_amount" IS NULL)),
    -- `amount` là TỔNG hai sắc thuế — tờ khai cộng theo cột nào cũng ra cùng một nghĩa vụ.
    ADD CONSTRAINT "tax_withholdings_vat_pit_sum_check"
    CHECK ("vat_amount" IS NULL OR "vat_amount" + "pit_amount" = "amount"),
    ADD CONSTRAINT "tax_withholdings_vat_pit_percent_check"
    CHECK (
        ("vat_percent" IS NULL OR ("vat_percent" >= 0 AND "vat_percent" <= 100))
        AND ("pit_percent" IS NULL OR ("pit_percent" >= 0 AND "pit_percent" <= 100))
    ),
    ADD CONSTRAINT "tax_withholdings_tax_category_check"
    CHECK ("tax_category" IS NULL OR "tax_category" IN ('service', 'transport')),
    ADD CONSTRAINT "tax_withholdings_seller_entity_type_check"
    CHECK (
        "seller_entity_type" IS NULL
        OR "seller_entity_type" IN ('individual', 'household_business', 'company')
    );
