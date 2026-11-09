-- ═══════════════════════════════════════════════════════════════════════════
-- Phiếu thanh toán GỘP cho lượt mua nhiều gói + giới thiệu gian hàng ĐÃ ĐỊNH DẠNG (06/11/2026).
--
-- 1. `subscription_checkouts` (ADR 0083): gian hàng mua gói ô tô + gói xe máy trong MỘT lần chuyển
--    khoản, MỘT mã `XPC…`. Mỗi loại xe vẫn là một hàng `subscription_invoices` riêng (ADR 0065 điều
--    6 giữ nguyên), nối về phiếu bằng `checkout_id`. Tiền cộng dồn ở PHIẾU; đủ tổng thì mọi hoá đơn
--    con lật `paid` + kích hoạt trong cùng transaction.
-- 2. `bank_transactions.matched_type` nhận thêm đích `subscription_checkout`.
-- 3. `tenant_profiles.bio_html` — HTML đã lọc ở server; `bio` vẫn là chữ thuần cho app native.
--
-- ⚠️ FK TỔ HỢP `(checkout_id, tenant_id) → subscription_checkouts(id, tenant_id)` không mô tả được
-- trong `schema.prisma` (cùng loại với các FK tổ hợp ở header baseline). `prisma migrate dev` sẽ
-- sinh lệnh DROP cho nó và cho unique `(id, tenant_id)` — đọc diff và giữ lại. Nó là thứ bảo đảm
-- một phiếu không bao giờ gom hoá đơn của gian hàng khác.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. subscription_checkouts ──────────────────────────────────────────────
CREATE TABLE "public"."subscription_checkouts" (
    "id"           CHAR(26)       NOT NULL,
    "tenant_id"    CHAR(26)       NOT NULL,
    "code"         VARCHAR(20)    NOT NULL,
    "total_amount" DECIMAL(14, 2) NOT NULL,
    "paid_amount"  DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "status"       VARCHAR(50)    NOT NULL DEFAULT 'issued',
    "paid_at"      TIMESTAMPTZ(3),
    "expires_at"   TIMESTAMPTZ(3),
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_checkouts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_checkouts_code_key"
    ON "public"."subscription_checkouts" ("code");
-- Đích của FK tổ hợp từ hoá đơn con (xem header).
CREATE UNIQUE INDEX "subscription_checkouts_id_tenant_id_key"
    ON "public"."subscription_checkouts" ("id", "tenant_id");
CREATE INDEX "subscription_checkouts_tenant_id_created_at_idx"
    ON "public"."subscription_checkouts" ("tenant_id", "created_at");
-- Job hết hạn quét `issued` + `expires_at <= now`.
CREATE INDEX "subscription_checkouts_status_expires_at_idx"
    ON "public"."subscription_checkouts" ("status", "expires_at");

-- Cùng tập trạng thái với hoá đơn (ADR 0005 — sửa cả `SUBSCRIPTION_INVOICE_STATUS` lẫn đây).
-- Phiếu không có `draft`: nó chỉ ra đời ở lượt mua.
ALTER TABLE "public"."subscription_checkouts"
    ADD CONSTRAINT "subscription_checkouts_status_check"
    CHECK ("status" IN ('issued', 'partially_paid', 'paid', 'void'));
ALTER TABLE "public"."subscription_checkouts"
    ADD CONSTRAINT "subscription_checkouts_amounts_check"
    CHECK ("total_amount" > 0 AND "paid_amount" >= 0);
-- Mã của phiếu mang tiền tố riêng: tiền tố quyết định đích (ADR 0022 điều 3), nên một mã XPG lọt
-- vào bảng này là tiền chảy nhầm sổ.
ALTER TABLE "public"."subscription_checkouts"
    ADD CONSTRAINT "subscription_checkouts_code_prefix_check"
    CHECK ("code" LIKE 'XPC%');

ALTER TABLE "public"."subscription_checkouts"
    ADD CONSTRAINT "subscription_checkouts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Hoá đơn con ────────────────────────────────────────────────────────────
ALTER TABLE "public"."subscription_invoices"
    ADD COLUMN "checkout_id" CHAR(26);

ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_checkout_id_fkey"
    FOREIGN KEY ("checkout_id") REFERENCES "public"."subscription_checkouts"("id")
    ON DELETE NO ACTION ON UPDATE CASCADE;
-- Xem header: phiếu và hoá đơn con luôn cùng một gian hàng.
ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_checkout_tenant_fkey"
    FOREIGN KEY ("checkout_id", "tenant_id")
    REFERENCES "public"."subscription_checkouts"("id", "tenant_id")
    ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE INDEX "subscription_invoices_checkout_id_idx"
    ON "public"."subscription_invoices" ("checkout_id");

-- ── 2. Đích đối soát mới ───────────────────────────────────────────────────
ALTER TABLE "public"."bank_transactions" DROP CONSTRAINT IF EXISTS "bank_transactions_matched_type_check";
ALTER TABLE "public"."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_type_check"
    CHECK (
        "matched_type" IS NULL
        OR "matched_type" IN (
            'subscription_invoice', 'booking_hold', 'withdrawal_request', 'booking_extension',
            'subscription_checkout'
        )
    );

-- ── 3. Giới thiệu gian hàng đã định dạng ────────────────────────────────────
ALTER TABLE "public"."tenant_profiles"
    ADD COLUMN "bio_html" TEXT;
