-- Khoản CỘNG VÍ HẸN GIỜ (biên bản họp 19/11/2026, việc #4 — chính sách hoàn tiền khi khách huỷ).
--
-- Khách huỷ / không đến nhận xe (lỗi phía khách) ⇒ tiền hoàn KHÔNG vào ví khách ngay mà chờ
-- `cancel_refund_delay_hours`; phần của chủ xe trong cùng kết cục chờ `cancel_owner_payout_delay_hours`
-- (cả hai mặc định 4 giờ, admin đổi được, 0 = cộng ngay như trước). Trong lúc chờ, admin tạm giữ được
-- khoản đang tranh chấp. Ca khách không có lỗi (chủ xe huỷ, tài xế rút, chuyển thừa…) vẫn cộng ngay.
--
-- Chỉ THÊM — không đụng dữ liệu cũ.

ALTER TABLE "platform_app_configs"
  ADD COLUMN "cancel_refund_delay_hours" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "cancel_owner_payout_delay_hours" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "platform_app_configs"
  ADD CONSTRAINT "platform_app_configs_cancel_delay_hours_check"
  CHECK (
    "cancel_refund_delay_hours" BETWEEN 0 AND 168
    AND "cancel_owner_payout_delay_hours" BETWEEN 0 AND 168
  );

CREATE TABLE "scheduled_wallet_credits" (
    "id" CHAR(26) NOT NULL,
    "owner_type" VARCHAR(20) NOT NULL,
    "owner_id" CHAR(26) NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "source_type" VARCHAR(40) NOT NULL,
    "source_ref_id" CHAR(26) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "booking_id" CHAR(26),
    "hold_id" CHAR(26),
    "note" TEXT,
    "hold_refund_id" CHAR(26),
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "release_at" TIMESTAMPTZ(3) NOT NULL,
    "frozen_at" TIMESTAMPTZ(3),
    "frozen_by" CHAR(26),
    "freeze_note" TEXT,
    "released_at" TIMESTAMPTZ(3),
    "wallet_entry_id" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduled_wallet_credits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "scheduled_wallet_credits_owner_type_check" CHECK ("owner_type" IN ('user', 'tenant')),
    CONSTRAINT "scheduled_wallet_credits_status_check"
      CHECK ("status" IN ('scheduled', 'frozen', 'released')),
    CONSTRAINT "scheduled_wallet_credits_amount_check" CHECK ("amount" > 0),
    -- Đã cộng ⇔ có bút toán; tạm giữ ⇔ có mốc tạm giữ.
    CONSTRAINT "scheduled_wallet_credits_released_entry_check"
      CHECK (("status" = 'released') = ("wallet_entry_id" IS NOT NULL AND "released_at" IS NOT NULL)),
    CONSTRAINT "scheduled_wallet_credits_frozen_check"
      CHECK (("status" = 'frozen') = ("frozen_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "scheduled_wallet_credits_wallet_entry_id_key" ON "scheduled_wallet_credits"("wallet_entry_id");
CREATE INDEX "scheduled_wallet_credits_status_release_at_idx" ON "scheduled_wallet_credits"("status", "release_at");
CREATE INDEX "scheduled_wallet_credits_hold_refund_id_idx" ON "scheduled_wallet_credits"("hold_refund_id");
CREATE UNIQUE INDEX "scheduled_wallet_credits_source_key"
  ON "scheduled_wallet_credits"("owner_type", "owner_id", "kind", "source_type", "source_ref_id");

ALTER TABLE "scheduled_wallet_credits"
  ADD CONSTRAINT "scheduled_wallet_credits_hold_refund_id_fkey"
  FOREIGN KEY ("hold_refund_id") REFERENCES "hold_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Khoản hoàn của khách có thêm trạng thái CHỜ HOÀN vào ví.
ALTER TABLE "hold_refunds" DROP CONSTRAINT IF EXISTS "hold_refunds_status_check";
ALTER TABLE "hold_refunds"
  ADD CONSTRAINT "hold_refunds_status_check"
  CHECK ("status" IN ('pending', 'paid', 'credited', 'rejected', 'scheduled'));
