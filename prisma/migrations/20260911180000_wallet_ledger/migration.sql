-- ═══════════════════════════════════════════════════════════════════════════
-- SỔ CÔNG NỢ PHẢI TRẢ ("Ví điểm") + yêu cầu rút tiền
-- (11/09/2026 — ADR 0033 · ADR 0023 điều 4–8)
--
-- Vì sao cần ngay: theo ADR 0032, cọc `D` là một PHẦN của giá thuê, nên mỗi chuyến hoàn thành
-- đều sinh một khoản XePrime phải trả chủ xe (`D − T`) — ở CẢ HAI tuyến. Không có sổ này thì
-- tiền cọc vào rồi mắc kẹt: không chỗ nào ghi nợ, không đường nào trả ra.
--
-- Số dư là NGHĨA VỤ của nền tảng với chủ ví, không phải tiền của họ do nền tảng cất hộ. Tiền
-- vật lý nằm trong tài khoản ngân hàng XePrime; bảng này nói XePrime đang nợ ai bao nhiêu.
--
-- Bốn quyết định nằm trong DDL, và cả bốn đều là chống lỗi TIỀN:
--
--   1. `@@unique(wallet_id, kind, source_type, source_ref_id)` — chống cộng tiền hai lần bằng
--      RÀNG BUỘC, không bằng check ở tầng app. Worker chạy lại, webhook gửi lại, admin bấm hai
--      lần đều rơi vào đây. Ràng buộc nằm CÙNG migration với bảng (ADR 0023 điều 5): thêm sau
--      là chấp nhận một cửa sổ thời gian trong đó tiền tự nhân đôi mà không ai biết.
--
--      Khoá có `kind`, khác ADR 0023 (ba cột) — ADR 0033 điều 6 ghi đè. Một nguồn sinh được
--      nhiều dòng hợp lệ KHÁC LOẠI: một yêu cầu rút sinh `withdrawal` rồi `withdrawal_reversal`
--      khi chuyển hụt; một hold sinh `hold_refund` và `hold_overpay`. Khoá ba cột chặn nhầm
--      dòng thứ hai của chính những ca đúng đó.
--
--   2. `balance >= 0` và `pending_withdraw_amount >= 0` — số dư âm là một lỗi đã xảy ra rồi,
--      không phải một trạng thái. Chặn ở đây để nó dừng ngay tại câu lệnh gây ra nó.
--
--   3. CHECK owner XOR — một ví thuộc đúng một chủ, cùng luật với `bank_accounts`.
--
--   4. `status = 'paid'` phải có `bank_reference` — không lệnh chuyển nào được đánh dấu đã chi
--      mà không có bằng chứng. Đây là đầu duy nhất của đối soát chiều RA.
--
-- KHÔNG có bảng "giao dịch điểm", "nạp điểm" hay "chuyển điểm": ADR 0033 điều 1 khoá cứng bản
-- chất — không nạp, không chuyển ngang, không thanh toán nội bộ, không hết hạn, không thu hồi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. wallets ──────────────────────────────────────────────────────────────

CREATE TABLE "public"."wallets" (
    "id"                      CHAR(26)       NOT NULL,
    "owner_type"              VARCHAR(20)    NOT NULL,
    "owner_user_id"           CHAR(26),
    "owner_tenant_id"         CHAR(26),
    "balance"                 DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "pending_withdraw_amount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "status"                  VARCHAR(20)    NOT NULL DEFAULT 'active',
    "created_at"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_owner_type_check" CHECK ("owner_type" IN ('user', 'tenant'));

ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_status_check" CHECK ("status" IN ('active', 'frozen'));

ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_owner_xor_check"
    CHECK (
        ("owner_type" = 'user'   AND "owner_user_id" IS NOT NULL AND "owner_tenant_id" IS NULL)
     OR ("owner_type" = 'tenant' AND "owner_tenant_id" IS NOT NULL AND "owner_user_id" IS NULL)
    );

-- Số dư âm là lỗi đã xảy ra, không phải trạng thái.
ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_amounts_non_negative_check"
    CHECK ("balance" >= 0 AND "pending_withdraw_amount" >= 0);

-- Mỗi chủ đúng MỘT ví. Postgres cho phép nhiều NULL nên cột còn lại không vướng.
CREATE UNIQUE INDEX "wallets_owner_user_id_key" ON "public"."wallets" ("owner_user_id");
CREATE UNIQUE INDEX "wallets_owner_tenant_id_key" ON "public"."wallets" ("owner_tenant_id");

ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_owner_user_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_owner_tenant_fkey"
    FOREIGN KEY ("owner_tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. wallet_entries — CHỈ GHI THÊM ────────────────────────────────────────

CREATE TABLE "public"."wallet_entries" (
    "id"                   CHAR(26)       NOT NULL,
    "wallet_id"            CHAR(26)       NOT NULL,
    "kind"                 VARCHAR(30)    NOT NULL,
    "source_type"          VARCHAR(30)    NOT NULL,
    "source_ref_id"        CHAR(26)       NOT NULL,
    "amount"               DECIMAL(14, 2) NOT NULL,
    "balance_after"        DECIMAL(14, 2) NOT NULL,
    "booking_id"           CHAR(26),
    "hold_id"              CHAR(26),
    "reversal_of_entry_id" CHAR(26),
    "note"                 TEXT,
    "created_by_user_id"   CHAR(26),
    "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."wallet_entries"
    ADD CONSTRAINT "wallet_entries_kind_check"
    CHECK ("kind" IN (
        'hold_forfeit', 'hold_release', 'hold_refund', 'hold_overpay',
        'withdrawal', 'withdrawal_reversal', 'adjustment'
    ));

ALTER TABLE "public"."wallet_entries"
    ADD CONSTRAINT "wallet_entries_source_type_check"
    CHECK ("source_type" IN ('booking_hold', 'withdrawal_request', 'manual'));

-- Một bút toán 0đ không nói gì và chỉ làm sổ dài thêm.
ALTER TABLE "public"."wallet_entries"
    ADD CONSTRAINT "wallet_entries_amount_non_zero_check" CHECK ("amount" <> 0);

-- CHỐT chống cộng tiền hai lần. Nằm cùng migration với bảng, không có ngoại lệ.
CREATE UNIQUE INDEX "wallet_entries_source_key"
    ON "public"."wallet_entries" ("wallet_id", "kind", "source_type", "source_ref_id");

-- Một dòng chỉ bị đảo tối đa một lần.
CREATE UNIQUE INDEX "wallet_entries_reversal_of_entry_id_key"
    ON "public"."wallet_entries" ("reversal_of_entry_id");

CREATE INDEX "wallet_entries_wallet_created_idx"
    ON "public"."wallet_entries" ("wallet_id", "created_at");

ALTER TABLE "public"."wallet_entries"
    ADD CONSTRAINT "wallet_entries_wallet_fkey"
    FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."wallet_entries"
    ADD CONSTRAINT "wallet_entries_reversal_fkey"
    FOREIGN KEY ("reversal_of_entry_id") REFERENCES "public"."wallet_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. withdrawal_requests ──────────────────────────────────────────────────

CREATE TABLE "public"."withdrawal_requests" (
    "id"                   CHAR(26)       NOT NULL,
    "code"                 VARCHAR(20)    NOT NULL,
    "wallet_id"            CHAR(26)       NOT NULL,
    "amount"               DECIMAL(14, 2) NOT NULL,
    "status"               VARCHAR(20)    NOT NULL DEFAULT 'pending',
    "bank_code"            VARCHAR(20)    NOT NULL,
    "bank_account_number"  VARCHAR(40)    NOT NULL,
    "bank_account_name"    VARCHAR(160)   NOT NULL,
    "bank_account_id"      CHAR(26),
    "requested_by_user_id" CHAR(26)       NOT NULL,
    "reviewed_by"          CHAR(26),
    "reviewed_at"          TIMESTAMPTZ(3),
    "reject_reason"        TEXT,
    "paid_by"              CHAR(26),
    "paid_at"              TIMESTAMPTZ(3),
    "bank_reference"       VARCHAR(100),
    "due_by"               TIMESTAMPTZ(3),
    "row_version"          INTEGER        NOT NULL DEFAULT 0,
    "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_status_check"
    CHECK ("status" IN ('pending', 'approved', 'paid', 'rejected', 'cancelled'));

ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_amount_positive_check" CHECK ("amount" > 0);

-- Không lệnh nào được đánh dấu đã chi mà không có bằng chứng chuyển khoản.
ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_paid_needs_reference_check"
    CHECK ("status" <> 'paid' OR "bank_reference" IS NOT NULL);

CREATE UNIQUE INDEX "withdrawal_requests_code_key"
    ON "public"."withdrawal_requests" ("code");

CREATE INDEX "withdrawal_requests_status_created_idx"
    ON "public"."withdrawal_requests" ("status", "created_at");

CREATE INDEX "withdrawal_requests_wallet_created_idx"
    ON "public"."withdrawal_requests" ("wallet_id", "created_at");

ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_wallet_fkey"
    FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_requested_by_fkey"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
