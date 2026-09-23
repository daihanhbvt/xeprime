-- ════════════════════════════════════════════════════════════════════════════════════════════
-- MÃ KHUYẾN MÃI NỀN TẢNG — ADR 0046
--
-- Mã do XePrime TÀI TRỢ: giảm số khách phải trả, KHÔNG bớt một đồng nào của gian hàng. Vì vậy
-- nó không đi qua `bookings.discount_amount` (khuyến mãi trực tiếp của chủ xe, trừ vào doanh thu
-- của chính họ) mà là một dòng tiền RIÊNG, chỉ trừ vào phần khách chuyển online cho XePrime.
--
-- Ba thứ migration này dựng:
--   1. `promo_codes`        — chiến dịch + hai bộ đếm gác trần lượt.
--   2. `promo_redemptions`  — vòng đời GIỮ → CHỐT → NHẢ của từng lượt.
--   3. Cột tiền mới trên `booking_holds` / `bookings` / `booking_requests`, và MỘT check của
--      hold được viết lại để bất biến "tổng phân bổ = tiền mặt đã nhận" vẫn đúng khi có tài trợ.
--
-- Không backfill gì: mọi hàng cũ có `promo_discount_amount = 0`, và mọi CHECK dưới đây rút về
-- đúng dạng trước đợt này khi con số đó bằng 0.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Chiến dịch ────────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."promo_codes" (
    "id"                    CHAR(26)       NOT NULL,
    "code"                  VARCHAR(20)    NOT NULL,
    "name"                  VARCHAR(160)   NOT NULL,
    "description"           TEXT,
    "discount_type"         VARCHAR(20)    NOT NULL,
    "discount_amount"       DECIMAL(14,2),
    "discount_percent"      SMALLINT,
    "max_discount_amount"   DECIMAL(14,2),
    "min_order_amount"      DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "audience"              VARCHAR(30)    NOT NULL DEFAULT 'all',
    "vehicle_scope"         VARCHAR(20)    NOT NULL DEFAULT 'all',
    "service_scope"         TEXT[]         NOT NULL DEFAULT '{}',
    "province_codes"        CHAR(2)[]      NOT NULL DEFAULT '{}',
    "total_usage_limit"     INTEGER,
    "per_customer_limit"    INTEGER,
    "reserved_count"        INTEGER        NOT NULL DEFAULT 0,
    "redeemed_count"        INTEGER        NOT NULL DEFAULT 0,
    "starts_at"             TIMESTAMPTZ(3) NOT NULL,
    "ends_at"               TIMESTAMPTZ(3) NOT NULL,
    "is_active"             BOOLEAN        NOT NULL DEFAULT true,
    "listed"                BOOLEAN        NOT NULL DEFAULT true,
    "created_by"            CHAR(26),
    "created_at"            TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(3) NOT NULL,
    "deleted_at"            TIMESTAMPTZ(3),

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- Unique trên mã ĐÃ CHUẨN HOÁ. Chuẩn hoá nằm ở `normalizePromoCode` (in hoa, bỏ khoảng trắng) —
-- ràng buộc ở đây gác được "banmoi" ≡ "BANMOI" chính vì chuỗi lưu xuống luôn là dạng in hoa.
CREATE UNIQUE INDEX "promo_codes_code_key" ON "public"."promo_codes" ("code");

CREATE INDEX "promo_codes_is_active_ends_at_idx" ON "public"."promo_codes" ("is_active", "ends_at");
CREATE INDEX "promo_codes_created_at_idx" ON "public"."promo_codes" ("created_at");
-- Tìm theo mã/tên chương trình ở màn admin (ILIKE '%q%' — btree không dùng được).
CREATE INDEX "promo_codes_search_trgm_idx"
    ON "public"."promo_codes" USING GIN ("code" gin_trgm_ops, "name" gin_trgm_ops);

ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_discount_type_check"
    CHECK ("discount_type" IN ('fixed', 'percent'));

ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_audience_check"
    CHECK ("audience" IN ('all', 'new_customer'));

ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_vehicle_scope_check"
    CHECK ("vehicle_scope" IN ('all', 'car', 'motorbike'));

-- Mỗi hình thức giảm đòi ĐÚNG bộ số của nó, và cấm bộ số của hình thức kia. Không có CHECK này
-- thì một mã `fixed` mang thêm `discount_percent` sẽ tồn tại được, và hai con số cùng nói về một
-- mức giảm là bug chờ ngày ai đó đọc nhầm cột.
ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_discount_shape_check"
    CHECK (
        ("discount_type" = 'fixed'
            AND "discount_amount" IS NOT NULL AND "discount_amount" > 0
            AND "discount_percent" IS NULL
            AND "max_discount_amount" IS NULL)
     OR ("discount_type" = 'percent'
            AND "discount_percent" IS NOT NULL
            AND "discount_percent" BETWEEN 1 AND 100
            AND "discount_amount" IS NULL
            AND ("max_discount_amount" IS NULL OR "max_discount_amount" > 0))
    );

ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_window_check"
    CHECK ("ends_at" > "starts_at");

ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_limits_check"
    CHECK (
        "min_order_amount" >= 0
    AND ("total_usage_limit" IS NULL OR "total_usage_limit" >= 1)
    AND ("per_customer_limit" IS NULL OR "per_customer_limit" >= 1)
    );

-- Bộ đếm KHÔNG được vượt trần và không được âm. Đây là chốt chặn cuối cho câu
-- `UPDATE … WHERE reserved_count < total_usage_limit` gác lượt cuối: nếu một đường ghi nào bỏ
-- quên mệnh đề đó, DB từ chối thay vì bán vượt lượt.
ALTER TABLE "public"."promo_codes"
    ADD CONSTRAINT "promo_codes_counters_check"
    CHECK (
        "reserved_count" >= 0
    AND "redeemed_count" >= 0
    AND "redeemed_count" <= "reserved_count"
    AND ("total_usage_limit" IS NULL OR "reserved_count" <= "total_usage_limit")
    );

-- ── 2. Lượt dùng ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."promo_redemptions" (
    "id"                 CHAR(26)       NOT NULL,
    "promo_code_id"      CHAR(26)       NOT NULL,
    "code"               VARCHAR(20)    NOT NULL,
    "customer_user_id"   CHAR(26)       NOT NULL,
    "booking_request_id" CHAR(26)       NOT NULL,
    "booking_id"         CHAR(26),
    "status"             VARCHAR(20)    NOT NULL DEFAULT 'reserved',
    "release_reason"     VARCHAR(40),
    "discount_amount"    DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "snapshot_json"      JSONB          NOT NULL,
    "reserved_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at"        TIMESTAMPTZ(3),
    "released_at"        TIMESTAMPTZ(3),
    "updated_at"         TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

-- MỘT mã cho MỘT yêu cầu, và một đơn không mang hai lượt. Ràng buộc ở DB chứ không ở code: hai
-- lượt bấm gửi song song chỉ có đúng một bên ghi được (ADR 0046 điều 3).
CREATE UNIQUE INDEX "promo_redemptions_booking_request_id_key"
    ON "public"."promo_redemptions" ("booking_request_id");
CREATE UNIQUE INDEX "promo_redemptions_booking_id_key"
    ON "public"."promo_redemptions" ("booking_id");

CREATE INDEX "promo_redemptions_promo_code_id_customer_user_id_status_idx"
    ON "public"."promo_redemptions" ("promo_code_id", "customer_user_id", "status");
CREATE INDEX "promo_redemptions_promo_code_id_reserved_at_idx"
    ON "public"."promo_redemptions" ("promo_code_id", "reserved_at");

-- RESTRICT: chiến dịch đã phát sinh lượt thì chỉ xoá MỀM được. DB chặn, không dựa vào việc một
-- endpoint nào đó nhớ kiểm (ADR 0046 điều 8).
ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey"
    FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_customer_user_id_fkey"
    FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_booking_request_id_fkey"
    FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_status_check"
    CHECK ("status" IN ('reserved', 'redeemed', 'released'));

-- Mỗi trạng thái đòi đúng mốc thời gian của nó. `released` bắt buộc có LÝ DO: một bộ đếm tụt
-- xuống mà không ai giải thích được là thứ admin sẽ phải đoán, và đoán sai.
ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_lifecycle_check"
    CHECK (
        ("status" = 'reserved'
            AND "redeemed_at" IS NULL AND "released_at" IS NULL
            AND "release_reason" IS NULL AND "booking_id" IS NULL)
     OR ("status" = 'redeemed'
            AND "redeemed_at" IS NOT NULL AND "released_at" IS NULL
            AND "release_reason" IS NULL)
     OR ("status" = 'released'
            AND "released_at" IS NOT NULL AND "release_reason" IS NOT NULL)
    );

ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_release_reason_check"
    CHECK (
        "release_reason" IS NULL
     OR "release_reason" IN (
            'request_rejected', 'request_expired', 'request_cancelled',
            'slot_taken', 'hold_expired', 'no_longer_eligible'
        )
    );

ALTER TABLE "public"."promo_redemptions"
    ADD CONSTRAINT "promo_redemptions_discount_amount_check"
    CHECK ("discount_amount" >= 0);

-- ── 3. Dòng tiền tài trợ trên hold / đơn / yêu cầu ──────────────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "promo_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."bookings"
    ADD COLUMN "promo_code_id"         CHAR(26),
    ADD COLUMN "promo_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."booking_requests"
    ADD COLUMN "promo_code_id"       CHAR(26),
    ADD COLUMN "promo_snapshot_json" JSONB;

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_promo_code_id_fkey"
    FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_promo_code_id_fkey"
    FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_promo_discount_amount_check"
    CHECK ("promo_discount_amount" >= 0);

-- `D + S + IV + IP` là QUYỀN LỢI (chủ xe nhận đủ cọc, hãng bảo hiểm nhận đủ phí); `amount` là
-- TIỀN MẶT khách chuyển. Hiệu giữa hai con số đúng bằng phần XePrime tài trợ.
--
-- Viết lại check cũ thay vì thêm một check thứ hai: hai ràng buộc nói về cùng một phép cộng sẽ
-- mâu thuẫn ngay lần đầu có một hold mang mã khuyến mãi. Với `promo_discount_amount = 0` (toàn
-- bộ dữ liệu hiện có) biểu thức mới rút về đúng biểu thức cũ.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_money_lines_sum_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_money_lines_sum_check"
    CHECK (
        "deposit_amount" + "service_fee_amount"
      + "vehicle_insurance_amount" + "personal_insurance_amount"
      - "promo_discount_amount" = "amount"
    );

-- Tài trợ chỉ lấn được vào CỌC (nền tảng bù cho chủ xe) và PHÍ DỊCH VỤ (tiền của chính nền
-- tảng). Không bao giờ vào `IV`/`IP`: đó là tiền giữ hộ hãng bảo hiểm, và XePrime vẫn phải
-- chuyển đủ cho đối tác dù nó có giảm giá cho khách hay không (ADR 0033 điều 4).
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_promo_within_sponsorable_check"
    CHECK (
        "promo_discount_amount" >= 0
    AND "promo_discount_amount" <= "deposit_amount" + "service_fee_amount"
    );

-- Phân bổ phải khớp TIỀN MẶT đã nhận, không khớp quyền lợi — nếu không, một hold có tài trợ sẽ
-- phân bổ nhiều hơn số tiền nó từng cầm.
--
-- Hệ quả có chủ đích: `settled_platform_amount` ÂM ĐƯỢC khi khoản tài trợ lớn hơn phí dịch vụ
-- của chuyến. Đó là một khoản chi marketing thật (nền tảng gánh, chủ xe/hãng bảo hiểm/ngân sách
-- nhận đủ), không phải một lỗi làm tròn — nên ở đây không có CHECK nào đòi nó ≥ 0.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_settled_allocation_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_settled_allocation_check"
    CHECK (
        "outcome" IS NULL
        OR "outcome" NOT IN ('refunded', 'split_late_cancel', 'settled')
        OR "paid_amount" = 0
        OR (
            "settled_customer_amount" + "settled_owner_amount" + "settled_platform_amount"
          + "settled_insurer_amount"  + "settled_tax_amount"
          = "deposit_amount" + "service_fee_amount"
          + "vehicle_insurance_amount" + "personal_insurance_amount"
          - "promo_discount_amount"
        )
    );

-- Lọc "đơn đã dùng mã X" ở báo cáo tài trợ. Partial vì đại đa số đơn không có mã, và một index
-- toàn bảng bắt mọi lần ghi đơn phải bảo trì phần vô ích đó.
CREATE INDEX "bookings_promo_code_idx"
    ON "public"."bookings" ("promo_code_id")
    WHERE "promo_code_id" IS NOT NULL;
CREATE INDEX "booking_requests_promo_code_idx"
    ON "public"."booking_requests" ("promo_code_id")
    WHERE "promo_code_id" IS NOT NULL;
