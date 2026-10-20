-- ═══════════════════════════════════════════════════════════════════════════
-- LUỒNG TIỀN v2 (20/10/2026) — phí sàn cố định, hoa hồng lũy tiến, cọc 30% trên tổng khách trả,
-- bảo hiểm tuỳ chọn tính theo ngày.
--
-- Năm việc, theo thứ tự phụ thuộc:
--
--   1. `fee_policies` thêm bộ số của v2: phí sàn `S` theo loại xe, nấc hoa hồng `H` theo ngày,
--      biểu phí bảo hiểm `IV`/`IP` MỖI NGÀY theo loại xe. Số tiền là CỘT (không jsonb) để CHECK
--      gác được "không âm, bội 1.000đ" — bước giá bắt đầu từ chính số cấu hình.
--   2. Hai CHECK "bật bảo hiểm phải có tỷ lệ" nới thành "có tỷ lệ CŨ hoặc có biểu phí ngày cho MỌI
--      loại xe": bản lưu trữ đời cũ vẫn hợp lệ, bản v2 không cần cột phần trăm nữa.
--   3. Chính sách phí v7. KHÔNG `UPDATE` bản đang chạy: bản `active` là BẤT BIẾN (ADR 0028 điều 2)
--      và mọi hold đã tạo phải đọc lại được đúng chính sách đã áp cho chúng (ADR 0024). Sao bản
--      đang hiệu lực rồi chỉ đổi những gì v2 đổi — chép tay từng con số là cách để một mức thuế bị
--      bỏ quên và cả sàn lặng lẽ ngừng thu nó.
--   4. `booking_holds` thêm dòng tiền thứ năm `H` và viết lại BỐN CHECK nói về phép cộng các dòng
--      tiền. Với `owner_commission_amount = 0` (toàn bộ dữ liệu hiện có) mỗi biểu thức mới rút về
--      đúng biểu thức cũ — không dòng nào đang hợp lệ trở thành vi phạm.
--   5. `bookings.owner_commission_amount` (cột phẳng cho báo cáo) và hai cột lựa chọn bảo hiểm
--      của khách trên `booking_requests`.
--
-- ⚠️ KHÔNG đụng `expires_at` / `free_cancel_until` của hold đang mở. Cửa sổ ĐỘNG (`holdWindowsFor`)
-- chỉ áp cho hold sinh SAU lần deploy này; hold cũ sống hết cửa sổ đã hiển thị cho khách.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. fee_policies: bộ số của luồng tiền v2 ────────────────────────────────

ALTER TABLE "public"."fee_policies"
    ADD COLUMN "customer_platform_fee_car"          DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "customer_platform_fee_motorbike"    DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "owner_commission_tiers"             JSONB          NOT NULL DEFAULT '[]',
    ADD COLUMN "vehicle_protection_daily_car"       DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "vehicle_protection_daily_motorbike" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "trip_insurance_daily_car"           DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "trip_insurance_daily_motorbike"     DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Phí sàn và biểu phí bảo hiểm đi THẲNG vào mã QR: một số lẻ ở đây là một số lẻ trên mọi đơn.
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_v2_amounts_thousand_step_check"
    CHECK (
        "customer_platform_fee_car"          >= 0 AND mod("customer_platform_fee_car", 1000) = 0
    AND "customer_platform_fee_motorbike"    >= 0 AND mod("customer_platform_fee_motorbike", 1000) = 0
    AND "vehicle_protection_daily_car"       >= 0 AND mod("vehicle_protection_daily_car", 1000) = 0
    AND "vehicle_protection_daily_motorbike" >= 0 AND mod("vehicle_protection_daily_motorbike", 1000) = 0
    AND "trip_insurance_daily_car"           >= 0 AND mod("trip_insurance_daily_car", 1000) = 0
    AND "trip_insurance_daily_motorbike"     >= 0 AND mod("trip_insurance_daily_motorbike", 1000) = 0
    );

-- Hình dạng TỪNG nấc (bắt đầu từ ngày 1, tăng nghiêm ngặt, % trong biên) do
-- `feePolicyActivationBlockers` canh ở cổng kích hoạt; DB chỉ canh "là một mảng", đủ để
-- `ownerCommissionTiers` không bao giờ đọc ra một object hay một chuỗi.
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_owner_commission_tiers_array_check"
    CHECK (jsonb_typeof("owner_commission_tiers") = 'array');

-- ── 2. "Bật bảo hiểm phải có biểu phí" — nhận cả tỷ lệ cũ lẫn biểu phí ngày ──

ALTER TABLE "public"."fee_policies" DROP CONSTRAINT IF EXISTS "fee_policies_trip_insurance_rate_check";
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_trip_insurance_rate_check"
    CHECK (
        NOT "trip_insurance_enabled"
        OR "trip_insurance_percent" IS NOT NULL
        OR ("trip_insurance_daily_car" > 0 AND "trip_insurance_daily_motorbike" > 0)
    );

ALTER TABLE "public"."fee_policies" DROP CONSTRAINT IF EXISTS "fee_policies_vehicle_protection_rate_check";
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_vehicle_protection_rate_check"
    CHECK (
        NOT "vehicle_protection_enabled"
        OR "vehicle_protection_percent" IS NOT NULL
        OR ("vehicle_protection_daily_car" > 0 AND "vehicle_protection_daily_motorbike" > 0)
    );

-- ── 3. Chính sách phí v7 — luồng tiền v2 ────────────────────────────────────
--
-- Sao bản ĐANG HIỆU LỰC (không gõ cứng số phiên bản: một admin có thể đã kích hoạt bản mới qua
-- màn quản trị) và chỉ đổi những gì v2 đổi:
--   • `S` phí sàn cố định 50.000đ ô tô / 30.000đ xe máy;
--   • `H` hoa hồng lũy tiến 10% (ngày 1–2) · 7% (3–7) · 3% (8–30) · 0% (từ ngày 31);
--   • cọc online 30% trên TỔNG KHÁCH TRẢ;
--   • `IV` 50.000đ/15.000đ và `IP` 20.000đ/5.000đ mỗi ngày (ô tô/xe máy), cả hai TUỲ CHỌN.
-- Cổng thuế, cổng bảo hiểm, tên đối tác, sàn giữ chỗ, sàn cọc và hai cửa sổ giữ nguyên bản cũ.
--
-- Idempotent bằng id cố định: chạy lại không sinh v8.
DO $$
DECLARE
    cur          "public"."fee_policies"%ROWTYPE;
    next_version INT;
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "id" = '01FEEPOLICYFINANCEFLOWV207') THEN
        RETURN;
    END IF;

    SELECT * INTO cur FROM "public"."fee_policies" WHERE "status" = 'active';
    IF NOT FOUND THEN
        RAISE NOTICE 'financial_flow_v2: không có chính sách phí nào đang hiệu lực — bỏ qua v7, admin tạo bản v2 qua màn quản trị';
        RETURN;
    END IF;

    SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version FROM "public"."fee_policies";

    UPDATE "public"."fee_policies"
       SET "status" = 'archived', "effective_to" = now(), "updated_at" = now()
     WHERE "id" = cur."id";

    INSERT INTO "public"."fee_policies" (
        "id", "version", "status", "name", "note",
        "service_fee_percent", "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
        "deposit_percent", "deposit_min_amount", "deposit_max_percent",
        "tax_enabled", "tax_percent", "tax_label",
        "trip_insurance_enabled", "trip_insurance_percent",
        "vehicle_protection_enabled", "vehicle_protection_percent", "insurance_partner_name",
        "customer_platform_fee_car", "customer_platform_fee_motorbike", "owner_commission_tiers",
        "vehicle_protection_daily_car", "vehicle_protection_daily_motorbike",
        "trip_insurance_daily_car", "trip_insurance_daily_motorbike",
        "effective_from", "activated_at", "created_at", "updated_at"
    ) VALUES (
        '01FEEPOLICYFINANCEFLOWV207', next_version, 'active',
        'Luồng tiền v2 — phí sàn cố định, hoa hồng lũy tiến, cọc 30%',
        'Phí sàn phía khách 50.000đ (ô tô) / 30.000đ (xe máy) mỗi đơn, cả hai tuyến. Hoa hồng tuyến '
        || 'hoa hồng lũy tiến theo ngày thuê 10% · 7% · 3% · 0%, trừ vào phần của chủ xe; tuyến gói '
        || '0%. Cọc online 30% trên tổng khách trả. Bảo hiểm vật chất xe và tai nạn người TUỲ CHỌN, '
        || 'tính theo ngày. Cửa sổ thanh toán/huỷ miễn phí co theo khoảng cách tới giờ nhận xe. Thuế, '
        || 'cổng bảo hiểm và các sàn tiền giữ nguyên bản trước.',
        cur."service_fee_percent", cur."hold_min_amount", cur."hold_payment_window_minutes", cur."free_cancel_hours",
        30, cur."deposit_min_amount", GREATEST(cur."deposit_max_percent", 30),
        cur."tax_enabled", cur."tax_percent", cur."tax_label",
        cur."trip_insurance_enabled", NULL,
        cur."vehicle_protection_enabled", NULL, cur."insurance_partner_name",
        50000, 30000,
        '[{"fromDay":1,"percent":10},{"fromDay":3,"percent":7},{"fromDay":8,"percent":3},{"fromDay":31,"percent":0}]'::jsonb,
        50000, 15000,
        20000, 5000,
        now(), now(), now(), now()
    );
END $$;

-- ── 4. booking_holds: dòng tiền thứ năm `H` ─────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "owner_commission_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_owner_commission_non_negative_check"
    CHECK ("owner_commission_amount" >= 0);

-- QUYỀN LỢI `D + S + H + IV + IP` trừ TÀI TRỢ = TIỀN MẶT khách chuyển.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_money_lines_sum_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_money_lines_sum_check"
    CHECK (
        "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
      + "vehicle_insurance_amount" + "personal_insurance_amount"
      - "promo_discount_amount" = "amount"
    );

-- Tài trợ lấn được vào cọc, phí sàn và hoa hồng (tiền của chủ xe mà nền tảng bù, và tiền của
-- chính nền tảng) — KHÔNG BAO GIỜ vào `IV`/`IP`, tiền giữ hộ hãng bảo hiểm (ADR 0033 điều 4).
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_promo_within_sponsorable_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_promo_within_sponsorable_check"
    CHECK (
        "promo_discount_amount" >= 0
    AND "promo_discount_amount" <= "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
    );

-- Phân bổ đã chốt khớp TIỀN MẶT, gồm cả `H`.
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
          = "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
          + "vehicle_insurance_amount" + "personal_insurance_amount"
          - "promo_discount_amount"
        )
    );

-- Kết cục LEGACY không phân bổ gì ⇒ chỉ hợp lệ khi MỌI dòng tiền đều 0, kể cả `H`. Cùng khuôn
-- NOT VALID + VALIDATE có điều kiện của 20261001110000: dữ liệu đời cũ vi phạm (nếu có) không làm
-- hỏng lần deploy, ràng buộc vẫn canh mọi lượt ghi mới.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_legacy_outcome_without_lines_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_legacy_outcome_without_lines_check" CHECK (
        "outcome" IS NULL
        OR "outcome" NOT IN ('kept', 'forfeited', 'released_to_shop')
        OR (
            "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
          + "vehicle_insurance_amount" + "personal_insurance_amount"
        ) = 0
    ) NOT VALID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "public"."booking_holds"
         WHERE "outcome" IN ('kept', 'forfeited', 'released_to_shop')
           AND (
                "deposit_amount" + "service_fee_amount" + "owner_commission_amount"
              + "vehicle_insurance_amount" + "personal_insurance_amount"
           ) > 0
    ) THEN
        ALTER TABLE "public"."booking_holds" VALIDATE CONSTRAINT "booking_holds_legacy_outcome_without_lines_check";
    ELSE
        RAISE NOTICE 'booking_holds_legacy_outcome_without_lines_check: còn dòng cũ vi phạm — ràng buộc canh lượt ghi mới, CHƯA validate toàn bảng';
    END IF;
END $$;

-- ── 5. bookings + booking_requests ──────────────────────────────────────────

ALTER TABLE "public"."bookings"
    ADD COLUMN "owner_commission_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_owner_commission_amount_check"
    CHECK ("owner_commission_amount" >= 0);

-- Lựa chọn bảo hiểm của khách lúc GỬI — lượt chốt giá đọc lại. Yêu cầu cũ mặc định "không chọn":
-- đúng với `IP` (vốn tuỳ chọn), và với `IV` thì chỉ ảnh hưởng yêu cầu CHƯA duyệt lúc deploy — chúng
-- được chốt giá theo luồng tiền v2, nơi bảo hiểm xe không còn bắt buộc.
ALTER TABLE "public"."booking_requests"
    ADD COLUMN "vehicle_protection_selected" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "personal_accident_selected"  BOOLEAN NOT NULL DEFAULT false;
