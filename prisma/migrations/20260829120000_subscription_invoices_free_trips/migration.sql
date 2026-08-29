-- ═══════════════════════════════════════════════════════════════════════════
-- Hoá đơn gói + bộ đếm lượt miễn phí (29/08/2026, ADR 0015 điều 5 · ADR 0026 điều 8)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`. Migration này chỉ THÊM một bảng + một cột.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── `subscription_invoices` — sinh khi mua / gia hạn / mua thêm chỗ ─────────
--
-- `subscription_id` NULL tới khi KÍCH HOẠT: gói chỉ bật khi tiền đã về (ADR 0026 điều 4);
-- admin gán tay tạo hoá đơn `paid` + subscription trong cùng transaction.
-- KHÔNG nối `payments.subscription_id` — ADR 0022 điều 6 (tiền gói không phải thu nhập của
-- gian hàng; docblock của `payments` đã ghi lý do).
CREATE TABLE "public"."subscription_invoices" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "subscription_id" CHAR(26),
    "code" VARCHAR(20) NOT NULL,
    "period_from" TIMESTAMPTZ(3) NOT NULL,
    "period_to" TIMESTAMPTZ(3) NOT NULL,
    "lines_json" JSONB NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(50) NOT NULL DEFAULT 'issued',
    "paid_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- UNIQUE TOÀN SÀN, không theo tenant (ADR 0022 điều 3): webhook chỉ có chuỗi nội dung chuyển
-- khoản, không có ngữ cảnh tenant nào để thu hẹp. Mã trùng giữa hai tenant là khớp nhầm tiền.
CREATE UNIQUE INDEX "subscription_invoices_code_key"
    ON "public"."subscription_invoices"("code");

-- Lịch sử hoá đơn của màn "Gói của tôi" (mới nhất trước) + quét hoá đơn quá hạn của job.
CREATE INDEX "subscription_invoices_tenant_id_created_at_idx"
    ON "public"."subscription_invoices"("tenant_id", "created_at");
CREATE INDEX "subscription_invoices_status_expires_at_idx"
    ON "public"."subscription_invoices"("status", "expires_at");

-- ADR 0005 — status lưu String, DB canh bằng CHECK; thêm giá trị mới thì sửa CẢ HAI nơi
-- (SUBSCRIPTION_INVOICE_STATUS ở packages/types/src/status/billing.ts và constraint này).
ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_status_check"
    CHECK ("status" IN ('draft', 'issued', 'partially_paid', 'paid', 'void'));

-- Số học của một hoá đơn phải tự đứng vững: kỳ xuôi chiều, tiền không âm, tổng = gộp − giảm.
ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_period_check"
    CHECK ("period_to" > "period_from");
ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_amounts_check"
    CHECK (
        "subtotal" >= 0 AND "discount_amount" >= 0 AND "paid_amount" >= 0
        AND "total_amount" = "subtotal" - "discount_amount"
    );

-- Xoá tenant thì hoá đơn đi theo; huỷ dòng thuê bao KHÔNG xoá hoá đơn (chứng từ tài chính) —
-- chỉ tháo liên kết.
ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."subscription_invoices"
    ADD CONSTRAINT "subscription_invoices_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "public"."tenant_subscriptions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── `tenants.free_trips_used` — ADR 0026 điều 8 ─────────────────────────────
--
-- CỘT, không phải phép đếm lúc đọc: đếm `bookings` mỗi lần tạo đơn là truy vấn trên bảng nóng
-- nhất, và hai đơn tạo đồng thời cùng đọc "đã dùng 1" rồi cùng cho miễn phí. Cột tăng trong
-- cùng transaction tạo đơn (W5/W6 thi công đường tăng).
ALTER TABLE "public"."tenants"
    ADD COLUMN "free_trips_used" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "public"."tenants"
    ADD CONSTRAINT "tenants_free_trips_used_check"
    CHECK ("free_trips_used" >= 0);
