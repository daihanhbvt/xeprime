-- ═══════════════════════════════════════════════════════════════════════════
-- Đối soát BA VẾ — đóng băng phân bổ, số dư ngân hàng nhập tay, chuẩn bị chiều RA
-- (14/09/2026 — Phase 9 · ADR 0025 điều 6 · ADR 0023 điều 6 · ADR 0033 điều 3–4)
--
-- ## Vì sao migration này tồn tại
--
-- Kế hoạch gốc định tính doanh thu nền tảng bằng
-- `SUM(booking_holds.service_fee_amount) WHERE outcome IN ('settled','split_late_cancel')`.
-- **Công thức đó SAI ở nhánh huỷ muộn.** `resolveHoldAllocation` chia `D + S` đôi:
--
--     D = 280.000 · S = 140.000  ⇒  chủ xe 210.000 · XePrime 210.000
--     SUM(service_fee_amount)    ⇒  140.000
--
-- Lệch 70.000đ mỗi đơn huỷ muộn, và lệch đó rơi thẳng vào `variance` mà không ai truy được
-- nguồn. Ở tuyến GÓI (S = 0) thì công thức cũ trả về 0 trong khi nền tảng thật sự giữ một nửa
-- khoản cọc — sai 100%.
--
-- Cách sửa KHÔNG phải là viết lại công thức ở chỗ đọc: phân bổ phụ thuộc `outcome`, thuế đã
-- đóng băng trên snapshot, và luật chia đôi có thể đổi ở ADR sau. Suy lại lúc đọc nghĩa là một
-- đơn chốt hôm nay sẽ được diễn giải theo luật của ngày mai (ADR 0024 cấm). Nên **đóng băng kết
-- quả phân bổ thành cột, ngay lúc chốt**, rồi đối soát chỉ còn là `SUM()`.
--
-- ## Bất biến
--
--     settled_customer + settled_owner + settled_platform + settled_insurer + settled_tax
--       = deposit_amount + service_fee_amount + vehicle_insurance_amount + personal_insurance_amount
--       = amount
--
-- CHECK bên dưới canh vế đầu. Ba kết cục LEGACY (`kept`, `forfeited`, `released_to_shop`) không
-- đi qua `allocateWithinTx` nên được miễn trừ tường minh — diễn giải lại chúng theo luật mới là
-- viết lại lịch sử của những đơn đã chốt xong.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Phân bổ ĐÃ CHỐT, đóng băng thành cột ─────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "settled_customer_amount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "settled_owner_amount"    NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "settled_platform_amount" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "settled_insurer_amount"  NUMERIC(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN "settled_tax_amount"      NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- ── 2. Backfill — chính là luật của `resolveHoldAllocation`, viết bằng SQL ───
--
-- Chạy trước CHECK để dữ liệu cũ không làm migration chết giữa chừng. Idempotent: chỉ đụng dòng
-- còn nguyên số 0 ở cả năm cột, nên chạy lại không cộng dồn.

-- 2a. `refunded` — hoàn TẤT CẢ về khách.
UPDATE "public"."booking_holds"
   SET "settled_customer_amount" = "deposit_amount" + "service_fee_amount"
                                 + "vehicle_insurance_amount" + "personal_insurance_amount"
 WHERE "outcome" = 'refunded'
   AND "settled_customer_amount" = 0 AND "settled_owner_amount" = 0
   AND "settled_platform_amount" = 0 AND "settled_insurer_amount" = 0
   AND "settled_tax_amount" = 0;

-- 2b. `split_late_cancel` — `D + S` chia đôi (phần LẺ về nền tảng, khớp `Math.floor` ở TS),
--     `IV + IP` hoàn 100% vì hợp đồng bảo hiểm chưa bao giờ được mua.
UPDATE "public"."booking_holds"
   SET "settled_customer_amount" = "vehicle_insurance_amount" + "personal_insurance_amount",
       "settled_owner_amount"    = FLOOR(("deposit_amount" + "service_fee_amount") / 2),
       "settled_platform_amount" = ("deposit_amount" + "service_fee_amount")
                                 - FLOOR(("deposit_amount" + "service_fee_amount") / 2)
 WHERE "outcome" = 'split_late_cancel'
   AND "settled_customer_amount" = 0 AND "settled_owner_amount" = 0
   AND "settled_platform_amount" = 0 AND "settled_insurer_amount" = 0
   AND "settled_tax_amount" = 0;

-- 2c. `settled` — chuyến hoàn thành. Thuế đọc từ snapshot ĐÃ ĐÓNG BĂNG của chính hold đó
--     (`fees.taxAmount`), kẹp trần bằng cọc y như `resolveHoldAllocation`. Cổng thuế đang tắt
--     nên thực tế mọi dòng ra 0 — đọc snapshot thay vì hard-code 0 để migration vẫn đúng nếu
--     có dữ liệu đã bật thuế ở môi trường nào đó.
UPDATE "public"."booking_holds" h
   SET "settled_tax_amount"      = LEAST(h."deposit_amount", t.tax),
       "settled_owner_amount"    = h."deposit_amount" - LEAST(h."deposit_amount", t.tax),
       "settled_platform_amount" = h."service_fee_amount",
       "settled_insurer_amount"  = h."vehicle_insurance_amount" + h."personal_insurance_amount"
  FROM (
        SELECT "id",
               COALESCE(
                 NULLIF("price_snapshot_json" -> 'fees' ->> 'taxAmount', '')::NUMERIC(14, 2),
                 0
               ) AS tax
          FROM "public"."booking_holds"
       ) t
 WHERE t."id" = h."id"
   AND h."outcome" = 'settled'
   AND h."settled_customer_amount" = 0 AND h."settled_owner_amount" = 0
   AND h."settled_platform_amount" = 0 AND h."settled_insurer_amount" = 0
   AND h."settled_tax_amount" = 0;

-- ── 3. CHECK bất biến ───────────────────────────────────────────────────────
--
-- Chỉ áp cho ba kết cục ĐI QUA phân bổ và có tiền thật. `paid_amount = 0` xảy ra khi hold bị
-- chốt mà khách chưa chuyển đồng nào — không có gì để chia, và `allocateWithinTx` thoát sớm.

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
        )
    );

-- Đối soát quét "hold đã chốt tới hết ngày D" — partial index giữ phép quét đó nằm trong số
-- hold đã chốt thay vì cả bảng, và `released_at` là mốc duy nhất trả lời "chốt vào ngày nào".
CREATE INDEX "booking_holds_released_idx"
    ON "public"."booking_holds" ("released_at")
    WHERE "outcome" IS NOT NULL;

-- Vế GIỮ HỘ đếm hold đã có tiền nhưng CHƯA chốt. Không index thì phép này quét toàn bộ lịch sử
-- mỗi lần admin mở màn đối soát.
CREATE INDEX "booking_holds_unsettled_amount_idx"
    ON "public"."booking_holds" ("paid_at")
    WHERE "outcome" IS NULL;

-- ── 4. Số dư ngân hàng cuối ngày — NHẬP TAY ─────────────────────────────────
--
-- SePay gửi từng giao dịch, KHÔNG gửi số dư tài khoản. Không có con số này thì không có vế trái
-- của phương trình, và "đối soát" chỉ còn là cộng các con số của chính mình lại với nhau rồi
-- gật đầu. Chưa nhập ⇒ API trả `null`, giao diện nói rõ — KHÔNG bịa 0, vì 0 là một khẳng định
-- (tài khoản rỗng) chứ không phải một khoảng trống.

CREATE TABLE "public"."platform_bank_balances" (
    -- Ngày theo GIỜ VIỆT NAM (`date`, không phải timestamp): số dư cuối ngày là một con số của
    -- một NGÀY LỊCH, và lưu nó dưới dạng mốc thời gian là mời hai múi giờ cãi nhau.
    "date"       DATE           NOT NULL,
    "balance"    NUMERIC(14, 2) NOT NULL,
    -- Lấy ở đâu: 'manual' (admin đọc app ngân hàng), sau này 'statement' | 'api'.
    "source"     VARCHAR(30)    NOT NULL DEFAULT 'manual',
    "entered_by" CHAR(26),
    "note"       TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_bank_balances_pkey" PRIMARY KEY ("date"),
    -- Số dư âm là lỗi nhập liệu, không phải một trạng thái của tài khoản thu hộ.
    CONSTRAINT "platform_bank_balances_balance_check" CHECK ("balance" >= 0)
);

ALTER TABLE "public"."platform_bank_balances"
    ADD CONSTRAINT "platform_bank_balances_entered_by_fkey"
    FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5. Chuẩn bị chiều RA của `bank_transactions` ────────────────────────────
--
-- Chưa có webhook chiều ra, nhưng mã `XPW…` đã được sinh từ Phase 5. Khai đích khớp và cột số
-- tiền NGAY BÂY GIỜ để ngày SePay mở chiều ra thì không phải migrate lại toàn bộ lệnh đã chi.
--
-- Hai cột thay vì một cột mang số âm: một cột tiền có thể âm là thứ mọi phép `SUM()` về sau
-- phải nhớ xử lý, và ai quên một lần thì đối soát lệch đúng hai lần khoản đó.

ALTER TABLE "public"."bank_transactions"
    ADD COLUMN "direction"  VARCHAR(10)    NOT NULL DEFAULT 'in',
    ADD COLUMN "amount_out" NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_direction_check"
    CHECK ("direction" IN ('in', 'out'));

-- CHECK cũ là `amount_in > 0` — đúng khi sổ chỉ có chiều vào, nhưng nó khiến một dòng chiều RA
-- KHÔNG BAO GIỜ chèn được (`amount_in = 0`). Nới thành `>= 0`; ràng buộc "chiều vào phải có tiền"
-- chuyển sang CHECK tổ hợp ngay bên dưới, nơi nó đọc được cùng với chiều.
ALTER TABLE "public"."bank_transactions"
    DROP CONSTRAINT IF EXISTS "bank_transactions_amount_in_check";

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_amount_in_check" CHECK ("amount_in" >= 0);

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_amount_out_check" CHECK ("amount_out" >= 0);

-- Mỗi dòng có đúng MỘT chiều mang số. Không có dòng "vừa vào vừa ra", và không có dòng 0đ.
ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_amount_direction_check"
    CHECK (
        ("direction" = 'in'  AND "amount_in"  > 0 AND "amount_out" = 0)
     OR ("direction" = 'out' AND "amount_out" > 0 AND "amount_in"  = 0)
    );

-- Đích khớp mở rộng cho lệnh rút. CHECK cũ (nếu có) liệt kê hai giá trị — thay bằng bản ba giá trị.
ALTER TABLE "public"."bank_transactions"
    DROP CONSTRAINT IF EXISTS "bank_transactions_matched_type_check";

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_matched_type_check"
    CHECK (
        "matched_type" IS NULL
        OR "matched_type" IN ('subscription_invoice', 'booking_hold', 'withdrawal_request')
    );

-- Đối soát quét theo NGÀY GIAO DỊCH của ngân hàng, không theo lúc webhook tới.
CREATE INDEX "bank_transactions_direction_bank_time_idx"
    ON "public"."bank_transactions" ("direction", "bank_time");
