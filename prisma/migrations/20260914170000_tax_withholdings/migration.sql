-- ═══════════════════════════════════════════════════════════════════════════
-- Sổ thuế khấu trừ — `tax_withholdings`
-- (14/09/2026 — Phase 8, ADR 0032 điều 3, ADR 0028 điều 3–4)
--
-- ## Vì sao ghi ở HAI nơi (cột trên `bookings` và bảng này)
--
-- Chúng trả lời hai câu khác nhau:
--
--   · `bookings.tax_amount`  — "đơn này dự kiến khấu trừ bao nhiêu", đóng băng lúc TẠO ĐƠN từ
--     snapshot giá. Nó là một phần của bảng kê, đọc cùng lúc với mọi con số khác của đơn.
--   · `tax_withholdings`     — "nghĩa vụ THẬT đã phát sinh", chỉ ra đời khi chuyến BẮT ĐẦU
--     (ADR 0032 điều 3). Huỷ trước chuyến ⇒ đơn vẫn có `tax_amount` dự kiến, nhưng KHÔNG có
--     dòng nào ở đây. Kê khai theo kỳ đọc bảng này, không bao giờ đọc cột kia.
--
-- Gộp lại là mất một trong hai: nếu chỉ có cột thì không kê khai theo kỳ được (và những đơn huỷ
-- sẽ lọt vào tờ khai); nếu chỉ có bảng thì bảng kê của một đơn chưa khởi hành không nói được nó
-- sẽ bị trừ bao nhiêu.
--
-- ## Sổ CHỈ-GHI-THÊM
--
-- Sửa sai bằng một dòng ÂM trỏ về dòng gốc (`reversal_of_id`), KHÔNG `UPDATE amount`. Một con số
-- đã nộp cho cơ quan thuế mà bị ghi lại là mất bằng chứng của chính lần nộp đó — cùng kỷ luật
-- `wallet_entries` (ADR 0023 điều 4).
--
-- Bất biến do DB canh: **đúng MỘT dòng còn hiệu lực mỗi đơn**. Partial unique bên dưới cho phép
-- đường sửa sai ba bước (gốc → đảo → dòng đúng) mà vẫn không cho hai nghĩa vụ song song tồn tại.
--
-- ## Snapshot, không join lúc đọc
--
-- `percent`, `label`, `taxable_base`, `seller_profile_id` chụp tại thời điểm phát sinh. Tỷ lệ
-- thuế phụ thuộc LOẠI CHỦ THỂ (cá nhân · hộ kinh doanh · doanh nghiệp) và sẽ đổi khi có tư vấn
-- thuế; một kỳ đã khai không bao giờ được diễn giải lại theo tỷ lệ của hôm nay (ADR 0024).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."tax_withholdings" (
    "id"                CHAR(26)       NOT NULL,
    "booking_id"        CHAR(26)       NOT NULL,
    "tenant_id"         CHAR(26)       NOT NULL,
    -- Hồ sơ người bán tại thời điểm phát sinh — nguồn của LOẠI CHỦ THỂ khi kê khai.
    -- NULL với gian hàng chưa khai hồ sơ; tờ khai phải thấy được khoảng trống đó.
    "seller_profile_id" CHAR(26),

    -- SNAPSHOT: giá trị thuê chịu thuế `B`, tỷ lệ và nhãn đã áp. KHÔNG join lại lúc đọc.
    "taxable_base"      NUMERIC(14, 2) NOT NULL,
    "percent"           NUMERIC(5, 2)  NOT NULL,
    "label"             VARCHAR(100)   NOT NULL,
    -- Dòng ĐẢO mang số ÂM. Phép cộng một kỳ vì thế chỉ là `SUM(amount)`.
    "amount"            NUMERIC(14, 2) NOT NULL,
    "fee_policy_id"     CHAR(26)       NOT NULL,

    -- @xeprime/types → TaxWithholdingStatus
    "status"            VARCHAR(20)    NOT NULL DEFAULT 'accrued',
    "accrued_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "declared_at"       TIMESTAMPTZ(3),
    "remitted_at"       TIMESTAMPTZ(3),

    -- Kỳ kê khai `YYYY-MM` theo GIỜ VIỆT NAM. Cột chứ không suy từ `accrued_at` lúc đọc: mỗi
    -- tháng có một khoảng bảy giờ mà giờ UTC và giờ VN thuộc hai kỳ khác nhau, và một phép suy
    -- ở tầng SQL sẽ xếp những chuyến đó sang tờ khai của tháng trước.
    "period_key"        VARCHAR(7)     NOT NULL,

    -- Dòng gốc mà dòng này đảo. NULL = dòng gốc.
    "reversal_of_id"    CHAR(26),
    "reversal_reason"   TEXT,
    "created_by"        CHAR(26),
    "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_withholdings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_withholdings_status_check"
        CHECK ("status" IN ('accrued', 'declared', 'remitted', 'reversed')),
    CONSTRAINT "tax_withholdings_period_key_check"
        CHECK ("period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "tax_withholdings_taxable_base_check" CHECK ("taxable_base" >= 0),
    CONSTRAINT "tax_withholdings_percent_check" CHECK ("percent" >= 0 AND "percent" <= 100),
    /*
     * Chỉ dòng ĐẢO được mang số âm, và nó BẮT BUỘC âm. Không có dòng 0đ: thuế 0 nghĩa là cổng
     * thuế tắt, và lúc đó không sinh dòng nào cả.
     */
    CONSTRAINT "tax_withholdings_amount_sign_check"
        CHECK (
            ("reversal_of_id" IS NULL AND "amount" > 0)
         OR ("reversal_of_id" IS NOT NULL AND "amount" < 0)
        ),
    -- Dòng đảo phải có lý do: một khoản thuế biến mất khỏi sổ mà không ai giải thích là thứ
    -- kiểm toán sẽ hỏi đúng một lần và không ai trả lời được.
    CONSTRAINT "tax_withholdings_reversal_needs_reason_check"
        CHECK ("reversal_of_id" IS NULL OR ("reversal_reason" IS NOT NULL AND length(btrim("reversal_reason")) >= 5)),
    -- Mốc trạng thái phải khớp trạng thái — `remitted` mà không có ngày nộp là một dòng không kê được.
    CONSTRAINT "tax_withholdings_declared_at_check"
        CHECK ("status" <> 'declared' OR "declared_at" IS NOT NULL),
    CONSTRAINT "tax_withholdings_remitted_at_check"
        CHECK ("status" <> 'remitted' OR ("remitted_at" IS NOT NULL AND "declared_at" IS NOT NULL))
);

/*
 * BẤT BIẾN: đúng MỘT nghĩa vụ còn hiệu lực mỗi đơn.
 *
 * `reversal_of_id IS NULL` loại các dòng đảo (chúng là bút toán đối ứng, không phải nghĩa vụ);
 * `status <> 'reversed'` loại dòng gốc đã bị đảo. Nhờ vậy đường sửa sai ba bước chạy được:
 *
 *   1. gốc  (+49.000, accrued)                → unique giữ
 *   2. đảo  (−49.000, reversal_of_id = gốc)   → không tính vì có `reversal_of_id`
 *      + lật gốc sang `reversed`               → không tính vì `status = reversed`
 *   3. dòng đúng (+42.000, accrued)           → chèn được
 *
 * Đồng thời nó là chốt IDEMPOTENT của `accrueForBookingWithinTx`: chuyển trạng thái chạy lại
 * (worker retry, hai chuyển nối tiếp) không sinh nghĩa vụ thứ hai — DB từ chối, không phải code nhớ.
 */
CREATE UNIQUE INDEX "tax_withholdings_live_booking_key"
    ON "public"."tax_withholdings" ("booking_id")
    WHERE "reversal_of_id" IS NULL AND "status" <> 'reversed';

-- Một dòng gốc bị đảo ĐÚNG MỘT LẦN. Không có "đảo của đảo" — cùng khuôn `wallet_entries`.
--
-- Unique THƯỜNG, không partial: Postgres cho phép nhiều NULL trong một unique index, nên
-- `WHERE reversal_of_id IS NOT NULL` là dư thừa — và Prisma tả được bản thường bằng `@unique`,
-- nên schema không mang một index mà nó không hiểu.
CREATE UNIQUE INDEX "tax_withholdings_reversal_of_id_key"
    ON "public"."tax_withholdings" ("reversal_of_id");

-- Tờ khai theo kỳ + hàng đợi "kỳ nào chưa nộp" — hai truy vấn thật của màn admin.
CREATE INDEX "tax_withholdings_period_status_idx"
    ON "public"."tax_withholdings" ("period_key", "status");
-- Chủ xe xem "thuế đã khấu trừ trong kỳ" của CHÍNH gian hàng mình.
CREATE INDEX "tax_withholdings_tenant_period_idx"
    ON "public"."tax_withholdings" ("tenant_id", "period_key");

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_seller_profile_id_fkey"
    FOREIGN KEY ("seller_profile_id") REFERENCES "public"."seller_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_fee_policy_id_fkey"
    FOREIGN KEY ("fee_policy_id") REFERENCES "public"."fee_policies"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_reversal_of_id_fkey"
    FOREIGN KEY ("reversal_of_id") REFERENCES "public"."tax_withholdings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
