-- ═══════════════════════════════════════════════════════════════════════════
-- Cọc booking và BỐN DÒNG TIỀN của khoản giữ chỗ
-- (11/09/2026 — ADR 0032 điều 2–4 · ADR 0033)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do ở header của
-- `20260821000000_init/migration.sql`. Chỉ THÊM cột, mọi cột đều có default an toàn nên
-- không đụng một dòng dữ liệu cũ nào.
--
-- Bối cảnh: trước đợt này khoản giữ chỗ ĐÚNG BẰNG phí dịch vụ (di sản ADR 0021), nên "tiền
-- này của ai" trả lời được bằng một cột `purpose`. ADR 0032 đổi công thức thành
-- `D + S + IV + IP`, và từ đó một hold chứa tiền của NHIỀU người cùng lúc:
--
--     D   cọc          → của CHỦ XE (XePrime giữ hộ, trả sau khi trừ thuế)
--     S   phí dịch vụ  → của XEPRIME
--     IV  bảo hiểm xe  → giữ hộ HÃNG BẢO HIỂM (chỉ mua ở mốc bàn giao)
--     IP  bảo hiểm người → giữ hộ HÃNG BẢO HIỂM
--
-- Quyết định nằm trong DDL, có chủ đích:
--
--   1. BỐN CỘT TIỀN trên `booking_holds`, không phải bốn khoá trong `allocation_json`.
--      Đối chiếu quỹ hằng ngày (ADR 0025 điều 6) phải trả lời "bao nhiêu tiền đang giữ hộ"
--      bằng một phép `SUM()` trên toàn sổ, mỗi ngày — không aggregate jsonb cho việc đó.
--      `allocation_json` vẫn giữ, nhưng để GIẢI THÍCH từng dòng chứ không để cộng.
--
--   2. CHECK tổng bốn cột = `amount`. Đây là bất biến sống còn: một allocation lệch nghĩa là
--      tiền được chia cho ai đó nhiều hơn hoặc ít hơn số đã thu, và sai số kiểu đó không bao
--      giờ tự lộ ra — nó chỉ hiện thành một khoản chênh không truy được sau vài tháng.
--      Dòng cũ (hold tạo trước đợt này) có bốn cột = 0 nên vi phạm CHECK ⇒ backfill TRƯỚC khi
--      thêm ràng buộc, trong cùng migration này: toàn bộ `amount` của chúng là phí dịch vụ,
--      đúng như công thức lúc chúng ra đời.
--
--   3. `deposit_percent` mặc định 0 — chính sách phí đang `active` KHÔNG tự nhiên bắt đầu thu
--      cọc sau khi deploy. Bản `active` là BẤT BIẾN theo thiết kế (ADR 0028 điều 2): muốn bật
--      cọc thì admin tạo version mới rồi kích hoạt, và đơn cũ giữ nguyên snapshot của chúng.
--
--   4. `bookings.deposit_collection_mode` đóng băng lúc tạo đơn. Gian hàng bật/tắt công tắc
--      thu cọc sau đó không được đổi cách hiểu một đơn đang chạy (ADR 0025 ràng buộc 4).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. fee_policies: mức cọc do NỀN TẢNG đặt (ADR 0033 điều 7) ──────────────

ALTER TABLE "public"."fee_policies"
    ADD COLUMN "deposit_percent"     DECIMAL(5, 2)  NOT NULL DEFAULT 0,
    ADD COLUMN "deposit_min_amount"  DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "deposit_max_percent" DECIMAL(5, 2)  NOT NULL DEFAULT 30;

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_deposit_percent_check"
    CHECK ("deposit_percent" >= 0 AND "deposit_percent" <= "deposit_max_percent");

-- Trần cứng 50%: trên mức đó "cọc giữ chỗ" thành thu tiền thuê trước (ADR 0025 điều 3).
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_deposit_max_percent_check"
    CHECK ("deposit_max_percent" >= 0 AND "deposit_max_percent" <= 50);

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_deposit_min_amount_check"
    CHECK ("deposit_min_amount" >= 0);

-- Thuế tính trên GIÁ THUÊ nhưng chỉ khấu trừ được từ phần XePrime đang cầm là `D`. Nếu
-- `deposit_percent < tax_percent` thì khoản phải trả chủ xe âm: nền tảng nhận nghĩa vụ nộp
-- thay một số lớn hơn số nó giữ, và không có chỗ nào lấy phần chênh.
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_deposit_covers_tax_check"
    CHECK (
        NOT "tax_enabled"
        OR "tax_percent" IS NULL
        OR "deposit_percent" >= "tax_percent"
    );

-- ── 2. booking_holds: bốn dòng tiền ─────────────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "deposit_amount"            DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "service_fee_amount"        DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "vehicle_insurance_amount"  DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "personal_insurance_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- Backfill TRƯỚC khi thêm CHECK: hold cũ sinh ra khi khoản giữ chỗ đúng bằng phí dịch vụ
-- (ADR 0021, đã bị 0028 thay), nên toàn bộ `amount` của chúng là `S`.
UPDATE "public"."booking_holds"
   SET "service_fee_amount" = "amount"
 WHERE "deposit_amount" = 0
   AND "service_fee_amount" = 0
   AND "vehicle_insurance_amount" = 0
   AND "personal_insurance_amount" = 0;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_money_lines_sum_check"
    CHECK (
        "deposit_amount" + "service_fee_amount"
      + "vehicle_insurance_amount" + "personal_insurance_amount" = "amount"
    );

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_money_lines_non_negative_check"
    CHECK (
        "deposit_amount" >= 0
    AND "service_fee_amount" >= 0
    AND "vehicle_insurance_amount" >= 0
    AND "personal_insurance_amount" >= 0
    );

-- Đối chiếu quỹ hằng ngày cộng phần GIỮ HỘ của các hold chưa chốt kết cục (ADR 0025 điều 6).
-- Không có index này thì phép cộng đó quét cả bảng, mỗi ngày, và chậm dần theo lịch sử.
CREATE INDEX "booking_holds_unsettled_idx"
    ON "public"."booking_holds" ("status", "created_at")
    WHERE "outcome" IS NULL;

-- ── 3. bookings: cọc, thuế, khoản phải trả chủ xe ───────────────────────────

ALTER TABLE "public"."bookings"
    ADD COLUMN "deposit_amount_online"   DECIMAL(14, 2),
    ADD COLUMN "owner_payable_amount"    DECIMAL(14, 2),
    ADD COLUMN "tax_amount"              DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "deposit_collection_mode" VARCHAR(20);

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_deposit_collection_mode_check"
    CHECK (
        "deposit_collection_mode" IS NULL
        OR "deposit_collection_mode" IN ('platform', 'direct', 'none')
    );

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_tax_amount_check"
    CHECK ("tax_amount" >= 0);

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_deposit_amount_online_check"
    CHECK ("deposit_amount_online" IS NULL OR "deposit_amount_online" >= 0);
