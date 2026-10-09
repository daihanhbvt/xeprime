-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THANH TOÁN QUA CỔNG MoMo · VNPAY — ADR 0058 (Proposed)
--
-- Một dòng = một lượt mở phiên thanh toán qua cổng cho MỘT hoá đơn gói hoặc MỘT khoản giữ chỗ.
-- Tiền qua cổng KHÔNG vào `bank_transactions` (sổ của một tài khoản ngân hàng, writer duy nhất
-- `SepayService`) — bảng này là sổ riêng của cổng, writer duy nhất `PaymentGatewayService`.
--
-- Những gì Prisma KHÔNG diễn đạt được, viết tay ở đây:
--   • CHECK cho từng cột mã (provider / target_type / status / client / apply_outcome /
--     review_status / review_reason / result_source) — ADR 0005;
--   • CHECK liên cột: đích là ĐÚNG MỘT FK khớp `target_type`; `succeeded` phải có bằng chứng của
--     cổng; `applied_at` ⇔ `apply_outcome` và chỉ có ở lượt `succeeded`; `resolved` phải có người,
--     mốc và ghi chú; số tiền dương, tiền tệ VND.
--
-- Chống ghi đôi bằng hai UNIQUE (không phải check ở tầng app — ADR 0016 điều 4):
--   (provider, provider_order_ref) — IPN gửi lại không tạo dòng thứ hai;
--   (provider, provider_tx_id)     — một giao dịch của cổng không bao giờ áp vào hai lượt.
-- `provider_tx_id` NULL tới khi cổng xác nhận; Postgres coi các NULL là khác nhau nên lượt đang
-- chờ không đụng nhau.
--
-- FK tới gian hàng / hoá đơn / khoản giữ chỗ là RESTRICT, không CASCADE: dòng này là bằng chứng tiền đã
-- đi qua cổng, và xoá đích không được kéo theo nó (cùng kỷ luật `wallets.owner_*`, ADR 0033).
--
-- Kèm `payment_gateway_order_events` — nhật ký CHỈ GHI THÊM mọi kết quả đã xác minh của cổng: dòng
-- `payment_gateway_orders` chỉ giữ kết quả gần nhất, bảng này giữ cả chuỗi để người trực đối chiếu.
--
-- Không có dữ liệu cũ để chuyển: bảng mới, mọi cổng mặc định TẮT (env).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "payment_gateway_orders" (
    "id" CHAR(26) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "subscription_invoice_id" CHAR(26),
    "booking_hold_id" CHAR(26),
    "target_code" VARCHAR(20) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "initiated_by" CHAR(26),
    "provider_order_ref" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'VND',
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "client" VARCHAR(10) NOT NULL DEFAULT 'web',
    "checkout_url" TEXT,
    "provider_created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "provider_tx_id" VARCHAR(100),
    "provider_result_code" VARCHAR(20),
    "provider_message" VARCHAR(255),
    "provider_pay_method" VARCHAR(50),
    "provider_paid_at" TIMESTAMPTZ(3),
    "paid_amount" DECIMAL(14,2),
    "result_source" VARCHAR(10),
    "result_at" TIMESTAMPTZ(3),
    "create_response_json" JSONB,
    "result_json" JSONB,
    "last_queried_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3),
    "apply_outcome" VARCHAR(30),
    "apply_error" TEXT,
    "review_status" VARCHAR(20) NOT NULL DEFAULT 'none',
    "review_reason" VARCHAR(40),
    "review_note" TEXT,
    "reviewed_by" CHAR(26),
    "reviewed_at" TIMESTAMPTZ(3),
    "refund_reference" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_gateway_orders_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "payment_gateway_orders_provider_check" CHECK ("provider" IN ('momo', 'vnpay')),
    CONSTRAINT "payment_gateway_orders_target_type_check" CHECK (
        "target_type" IN ('subscription_invoice', 'booking_hold')
    ),
    CONSTRAINT "payment_gateway_orders_status_check" CHECK (
        "status" IN ('pending', 'succeeded', 'failed', 'cancelled', 'expired')
    ),
    CONSTRAINT "payment_gateway_orders_client_check" CHECK ("client" IN ('web', 'native')),
    CONSTRAINT "payment_gateway_orders_apply_outcome_check" CHECK (
        "apply_outcome" IS NULL OR "apply_outcome" IN (
            'activated', 'partial', 'already_paid', 'target_closed', 'target_not_found'
        )
    ),
    CONSTRAINT "payment_gateway_orders_review_status_check" CHECK (
        "review_status" IN ('none', 'open', 'resolved')
    ),
    CONSTRAINT "payment_gateway_orders_review_reason_check" CHECK (
        "review_reason" IS NULL OR "review_reason" IN (
            'target_closed', 'target_not_found', 'amount_mismatch', 'apply_failed',
            'provider_flagged', 'duplicate_provider_tx', 'result_after_resolution',
            'overpaid'
        )
    ),
    CONSTRAINT "payment_gateway_orders_result_source_check" CHECK (
        "result_source" IS NULL OR "result_source" IN ('ipn', 'query')
    ),

    -- Đích là ĐÚNG MỘT trong hai FK, và khớp `target_type`.
    CONSTRAINT "payment_gateway_orders_target_check" CHECK (
        ("target_type" = 'subscription_invoice'
            AND "subscription_invoice_id" IS NOT NULL AND "booking_hold_id" IS NULL)
        OR ("target_type" = 'booking_hold'
            AND "booking_hold_id" IS NOT NULL AND "subscription_invoice_id" IS NULL)
    ),
    CONSTRAINT "payment_gateway_orders_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "payment_gateway_orders_paid_amount_check" CHECK (
        "paid_amount" IS NULL OR "paid_amount" > 0
    ),
    CONSTRAINT "payment_gateway_orders_currency_check" CHECK ("currency" = 'VND'),

    -- Cổng đã xác nhận thu tiền ⇒ có mã giao dịch của cổng, số tiền nó báo, và mốc nhận kết quả.
    CONSTRAINT "payment_gateway_orders_succeeded_evidence_check" CHECK (
        "status" <> 'succeeded' OR (
            "provider_tx_id" IS NOT NULL
            AND "paid_amount" IS NOT NULL
            AND "result_at" IS NOT NULL
            AND "result_source" IS NOT NULL
        )
    ),
    -- Lượt áp có kết luận ⇔ có kết cục; và chỉ lượt đã thu tiền mới được áp.
    CONSTRAINT "payment_gateway_orders_applied_check" CHECK (
        ("applied_at" IS NULL) = ("apply_outcome" IS NULL)
        AND ("applied_at" IS NULL OR "status" = 'succeeded')
    ),
    -- Hàng đợi người xử lý: `open` phải nói lý do; `resolved` phải có mốc và ghi chú. Người đóng
    -- (`reviewed_by`) KHÔNG bắt buộc ở đây: FK của nó là SET NULL khi tài khoản bị xoá, và audit_logs
    -- vẫn giữ người thao tác. Bắt buộc nó là biến mọi lần xoá tài khoản nhân sự thành lỗi CHECK.
    CONSTRAINT "payment_gateway_orders_review_open_check" CHECK (
        "review_status" <> 'open' OR "review_reason" IS NOT NULL
    ),
    CONSTRAINT "payment_gateway_orders_review_resolved_check" CHECK (
        "review_status" <> 'resolved' OR (
            "reviewed_at" IS NOT NULL AND "review_note" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_orders_provider_provider_order_ref_key"
    ON "payment_gateway_orders"("provider", "provider_order_ref");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_orders_provider_provider_tx_id_key"
    ON "payment_gateway_orders"("provider", "provider_tx_id");

-- CreateIndex
CREATE INDEX "payment_gateway_orders_subscription_invoice_id_created_at_idx"
    ON "payment_gateway_orders"("subscription_invoice_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_gateway_orders_booking_hold_id_created_at_idx"
    ON "payment_gateway_orders"("booking_hold_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_gateway_orders_review_status_created_at_idx"
    ON "payment_gateway_orders"("review_status", "created_at");

-- CreateIndex
CREATE INDEX "payment_gateway_orders_status_created_at_idx"
    ON "payment_gateway_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "payment_gateway_orders_tenant_id_created_at_idx"
    ON "payment_gateway_orders"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_subscription_invoice_id_fkey"
    FOREIGN KEY ("subscription_invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_booking_hold_id_fkey"
    FOREIGN KEY ("booking_hold_id") REFERENCES "booking_holds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_initiated_by_fkey"
    FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_gateway_orders" ADD CONSTRAINT "payment_gateway_orders_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable — nhật ký kết quả của cổng (chỉ ghi thêm)
CREATE TABLE "payment_gateway_order_events" (
    "id" CHAR(26) NOT NULL,
    "order_id" CHAR(26) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "result_code" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(14,2),
    "provider_tx_id" VARCHAR(100),
    "effect" VARCHAR(40) NOT NULL,
    "raw_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_gateway_order_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_gateway_order_events_source_check" CHECK ("source" IN ('ipn', 'query')),
    CONSTRAINT "payment_gateway_order_events_outcome_check" CHECK (
        "outcome" IN ('succeeded', 'pending', 'failed', 'cancelled', 'expired', 'flagged', 'not_found')
    )
);

-- CreateIndex
CREATE INDEX "payment_gateway_order_events_order_id_created_at_idx"
    ON "payment_gateway_order_events"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "payment_gateway_order_events" ADD CONSTRAINT "payment_gateway_order_events_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "payment_gateway_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
