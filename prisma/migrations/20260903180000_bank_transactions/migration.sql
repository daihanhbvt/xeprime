-- ═══════════════════════════════════════════════════════════════════════════
-- `bank_transactions` — sổ giao dịch tiền VÀO tài khoản nền tảng
-- (03/09/2026, ADR 0022 điều 2 · ADR 0016 điều 4)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`. Chỉ THÊM một bảng, không đụng bảng nào có sẵn.
--
-- Ba quyết định nằm trong DDL chứ không trong code, có chủ đích:
--
--   1. UNIQUE (provider, provider_tx_id) — CHỐT CHỐNG GHI ĐÔI của webhook. SePay retry là
--      chuyện thường; check ở tầng app thì hai request song song cùng qua được vòng kiểm.
--      Webhook bắt vi phạm unique này và trả 200 ("đã xử lý rồi"), không bao giờ 500.
--   2. KHÔNG khoá ngoại cho matched_ref_id — đích có HAI loại (subscription_invoices /
--      booking_holds). Toàn vẹn đến từ kỷ luật một writer (`SepayService`) ghi cột matched_*
--      trong cùng transaction với hiệu ứng ở phía đích — ADR 0022 điều 2.
--   3. KHÔNG cột tenant_id — request webhook không có ngữ cảnh tenant nào; tenant luôn suy từ
--      đích đã khớp. Một cột tenant_id ở đây là lời mời điền nó từ payload.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."bank_transactions" (
    "id"             CHAR(26)       NOT NULL,
    "provider"       VARCHAR(30)    NOT NULL DEFAULT 'sepay',
    "provider_tx_id" VARCHAR(100)   NOT NULL,
    "amount_in"      DECIMAL(14,2)  NOT NULL,
    "content"        TEXT           NOT NULL,
    "reference_code" VARCHAR(20),
    "bank_time"      TIMESTAMPTZ(3),
    "match_status"   VARCHAR(30)    NOT NULL DEFAULT 'unmatched',
    "matched_type"   VARCHAR(50),
    "matched_ref_id" CHAR(26),
    "match_note"     TEXT,
    "matched_by"     CHAR(26),
    "matched_at"     TIMESTAMPTZ(3),
    "raw_json"       JSONB          NOT NULL,
    "created_at"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_transactions_provider_provider_tx_id_key"
    ON "public"."bank_transactions"("provider", "provider_tx_id");

-- Hàng đợi admin: "giao dịch chưa khớp, mới nhất trước" — đúng hình dạng câu SELECT của màn đó.
CREATE INDEX "bank_transactions_match_status_created_at_idx"
    ON "public"."bank_transactions"("match_status", "created_at");

-- Tra ngược "khoản này đã có tiền về chưa" theo mã đối soát (chi tiết hoá đơn / hold).
CREATE INDEX "bank_transactions_reference_code_idx"
    ON "public"."bank_transactions"("reference_code");

-- Status là String theo ADR 0005; CHECK giữ cho giá trị lạ không lọt vào bảng tiền.
-- Thêm giá trị mới vào union ở packages/types buộc phải viết migration nới CHECK — hai danh
-- sách không trôi khỏi nhau trong im lặng (cùng khuôn `tenants_used_features_check`).
ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_match_status_check"
    CHECK ("match_status" IN ('unmatched', 'matched', 'manual', 'ignored'));

ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_matched_type_check"
    CHECK ("matched_type" IS NULL OR "matched_type" IN ('subscription_invoice', 'booking_hold'));

-- Số tiền vào âm là dữ liệu hỏng từ nguồn — chặn từ cửa, đừng để nó trừ tiền một hoá đơn.
ALTER TABLE "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_amount_in_check"
    CHECK ("amount_in" > 0);
