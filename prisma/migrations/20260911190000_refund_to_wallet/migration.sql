-- ═══════════════════════════════════════════════════════════════════════════
-- Hoàn khoản giữ chỗ đi vào VÍ ĐIỂM; chuyển khoản tay giữ lại cho khách vãng lai
-- (11/09/2026 — ADR 0033 điều 5)
--
-- `hold_refunds` KHÔNG bị xoá và cũng không thành legacy. Nó chia hai kỷ nguyên SONG SONG bằng
-- `settlement_mode`:
--
--   balance        khách CÓ tài khoản  → ghi có ví điểm, tức thì, trạng thái cuối `credited`
--   bank_transfer  khách VÃNG LAI      → admin chuyển tay, trạng thái cuối `paid`
--
-- XePrime cho đặt xe không cần đăng ký, nên luôn tồn tại người được hoàn tiền mà không có ví để
-- ghi có. Đường chuyển khoản tay vì thế là VĨNH VIỄN, không phải một chặng quá độ.
--
-- `credited` tách khỏi `paid` có chủ đích: phải phân biệt "tiền đã rời tài khoản ngân hàng của
-- nền tảng" với "nghĩa vụ đổi hình thức". Gộp hai cái là mất khả năng đối chiếu chiều ra —
-- đúng thứ ADR 0025 điều 6 đòi trả lời được mỗi ngày.
--
-- BACKFILL nằm trong CHÍNH migration này, cùng chỗ với ràng buộc chống cộng đôi (ADR 0023 điều
-- 5): tách ra hai lần chạy là chấp nhận một cửa sổ thời gian trong đó một khoản hoàn có thể vừa
-- được ghi có vừa được chuyển tay.
--
--   - `pending` + CÓ `customer_user_id`  → tạo ví nếu chưa có, ghi có, lật `credited`.
--   - `paid` / `rejected`                → KHÔNG đụng. Tiền đã chuyển hoặc đã quyết.
--   - `pending` + KHÔNG có user          → giữ `pending` + `bank_transfer`.
--
-- `ON CONFLICT DO NOTHING` ở bước chèn bút toán: chạy lại migration trên một database đã backfill
-- không cộng tiền lần hai.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột mới ──────────────────────────────────────────────────────────────

ALTER TABLE "public"."hold_refunds"
    ADD COLUMN "settlement_mode" VARCHAR(20) NOT NULL DEFAULT 'bank_transfer',
    ADD COLUMN "wallet_entry_id" CHAR(26);

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_settlement_mode_check"
    CHECK ("settlement_mode" IN ('balance', 'bank_transfer'));

CREATE UNIQUE INDEX "hold_refunds_wallet_entry_id_key"
    ON "public"."hold_refunds" ("wallet_entry_id");

-- Mở rộng CHECK trạng thái cho `credited`.
ALTER TABLE "public"."hold_refunds" DROP CONSTRAINT IF EXISTS "hold_refunds_status_check";
ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_status_check"
    CHECK ("status" IN ('pending', 'paid', 'credited', 'rejected'));

-- Mở rộng CHECK lý do cho `hold_expired` (hold trả thiếu rồi hết hạn — tiền khách phải quay về).
ALTER TABLE "public"."hold_refunds" DROP CONSTRAINT IF EXISTS "hold_refunds_reason_check";
ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_reason_check"
    CHECK ("reason" IN ('early_cancel', 'owner_cancel', 'overpaid', 'hold_expired', 'admin_decision'));

-- DB tự cấm đánh dấu "đã chuyển tay" cho một khoản đã ghi có ví, và ngược lại.
ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_paid_only_bank_transfer_check"
    CHECK ("paid_at" IS NULL OR "settlement_mode" = 'bank_transfer');

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_credited_needs_entry_check"
    CHECK ("status" <> 'credited' OR "wallet_entry_id" IS NOT NULL);

-- ── 2. Backfill: khoản đang chờ của khách CÓ tài khoản → ví điểm ────────────

-- 2a. Tạo ví cho những khách đang có khoản hoàn chờ mà chưa có ví.
INSERT INTO "public"."wallets" ("id", "owner_type", "owner_user_id", "updated_at")
SELECT DISTINCT
    -- ULID giả lập từ id khách: tất định, nên chạy lại ra cùng một id và không đẻ ví thứ hai.
    'W' || UPPER(SUBSTRING(MD5(r."customer_user_id") FROM 1 FOR 25)),
    'user',
    r."customer_user_id",
    now()
  FROM "public"."hold_refunds" r
 WHERE r."status" = 'pending'
   AND r."customer_user_id" IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM "public"."wallets" w WHERE w."owner_user_id" = r."customer_user_id"
   )
ON CONFLICT DO NOTHING;

-- 2b. Ghi có từng khoản. `balance_after` tính dồn theo thứ tự tạo để sổ đọc lại được.
WITH pending AS (
    SELECT
        r."id"                AS refund_id,
        r."amount"            AS amount,
        r."hold_id"           AS hold_id,
        w."id"                AS wallet_id,
        w."balance"
          + SUM(r."amount") OVER (PARTITION BY w."id" ORDER BY r."created_at", r."id")
                              AS balance_after,
        'E' || UPPER(SUBSTRING(MD5(r."id") FROM 1 FOR 25)) AS entry_id
      FROM "public"."hold_refunds" r
      JOIN "public"."wallets" w ON w."owner_user_id" = r."customer_user_id"
     WHERE r."status" = 'pending'
       AND r."customer_user_id" IS NOT NULL
)
INSERT INTO "public"."wallet_entries" (
    "id", "wallet_id", "kind", "source_type", "source_ref_id",
    "amount", "balance_after", "hold_id", "note", "created_at"
)
SELECT
    p.entry_id, p.wallet_id, 'hold_refund', 'booking_hold', p.hold_id,
    p.amount, p.balance_after, p.hold_id,
    'Chuyển khoản hoàn đang chờ sang ví điểm (ADR 0033)', now()
  FROM pending p
ON CONFLICT DO NOTHING;

-- 2c. Cộng số dư đúng bằng tổng đã ghi có.
UPDATE "public"."wallets" w
   SET "balance"    = w."balance" + agg.total,
       "updated_at" = now()
  FROM (
      SELECT e."wallet_id", SUM(e."amount") AS total
        FROM "public"."wallet_entries" e
       WHERE e."note" = 'Chuyển khoản hoàn đang chờ sang ví điểm (ADR 0033)'
       GROUP BY e."wallet_id"
  ) agg
 WHERE w."id" = agg."wallet_id";

-- 2d. Lật trạng thái và nối bút toán.
UPDATE "public"."hold_refunds" r
   SET "status"          = 'credited',
       "settlement_mode" = 'balance',
       "wallet_entry_id" = e."id",
       "updated_at"      = now()
  FROM "public"."wallet_entries" e
 WHERE e."source_ref_id" = r."hold_id"
   AND e."kind" = 'hold_refund'
   AND e."note" = 'Chuyển khoản hoàn đang chờ sang ví điểm (ADR 0033)'
   AND r."status" = 'pending'
   AND r."customer_user_id" IS NOT NULL;
