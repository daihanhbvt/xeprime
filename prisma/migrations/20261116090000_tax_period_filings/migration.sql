-- Rà soát Admin 16/11/2026 — chứng cứ kê khai / nộp thuế theo KỲ.
--
-- Trước đây "đã kê khai" / "đã nộp" chỉ lật trạng thái các dòng `tax_withholdings` của cả kỳ, không
-- để lại số tờ khai hay chứng từ nộp. Bảng này giữ hai bộ chứng cứ đó, một dòng một kỳ.
-- Writer DUY NHẤT: `TaxService.advancePeriod` (cùng transaction với lượt lật trạng thái + audit).
CREATE TABLE "public"."tax_period_filings" (
    -- Kỳ `YYYY-MM` theo giờ Việt Nam — khoá tự nhiên (như `platform_bank_balances.date`).
    "period_key"      VARCHAR(7)     NOT NULL,
    "declaration_ref" VARCHAR(120),
    "declared_on"     DATE,
    "declared_by"     CHAR(26),
    "declared_at"     TIMESTAMPTZ(3),
    "remittance_ref"  VARCHAR(120),
    "remitted_on"     DATE,
    "remitted_amount" NUMERIC(14, 2),
    "ledger_amount"   NUMERIC(14, 2),
    "remittance_note" TEXT,
    "remitted_by"     CHAR(26),
    "remitted_at"     TIMESTAMPTZ(3),
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "updated_at"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tax_period_filings_pkey" PRIMARY KEY ("period_key"),
    CONSTRAINT "tax_period_filings_period_key_check"
        CHECK ("period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    -- Nhóm kê khai cùng có hoặc cùng vắng. `declared_by` đứng ngoài: FK `SET NULL` khi tài khoản
    -- bị gỡ không được làm một dòng chứng cứ vi phạm CHECK.
    CONSTRAINT "tax_period_filings_declaration_check"
        CHECK (
            ("declaration_ref" IS NULL AND "declared_on" IS NULL AND "declared_at" IS NULL)
            OR ("declaration_ref" IS NOT NULL AND "declared_on" IS NOT NULL AND "declared_at" IS NOT NULL)
        ),
    -- Nhóm nộp cùng có hoặc cùng vắng (lý do `remitted_by` đứng ngoài: như trên).
    CONSTRAINT "tax_period_filings_remittance_check"
        CHECK (
            ("remittance_ref" IS NULL AND "remitted_on" IS NULL AND "remitted_amount" IS NULL
                AND "ledger_amount" IS NULL AND "remitted_at" IS NULL)
            OR ("remittance_ref" IS NOT NULL AND "remitted_on" IS NOT NULL AND "remitted_amount" IS NOT NULL
                AND "ledger_amount" IS NOT NULL AND "remitted_at" IS NOT NULL)
        ),
    CONSTRAINT "tax_period_filings_remitted_amount_check"
        CHECK ("remitted_amount" IS NULL OR "remitted_amount" > 0),
    -- Số trên sổ lúc ghi nộp: một kỳ toàn dòng đảo cộng lại có thể bằng 0, không bao giờ âm.
    CONSTRAINT "tax_period_filings_ledger_amount_check"
        CHECK ("ledger_amount" IS NULL OR "ledger_amount" >= 0)
);

ALTER TABLE "public"."tax_period_filings"
    ADD CONSTRAINT "tax_period_filings_declared_by_fkey"
    FOREIGN KEY ("declared_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."tax_period_filings"
    ADD CONSTRAINT "tax_period_filings_remitted_by_fkey"
    FOREIGN KEY ("remitted_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
