-- ---------------------------------------------------------------------------
-- plans + tenant_subscriptions (Phase 7 §11 Billing/plans — ADR 0010)
--
-- Lịch sử gia hạn là các dòng append-only; "hết hạn" suy ra từ ends_at, KHÔNG có job lật
-- status (dòng chỉ lưu active | cancelled). Giá snapshot trên dòng thuê bao — plan đổi giá
-- sau không ảnh hưởng. BillingService là ĐƯỜNG GHI DUY NHẤT của cả hai bảng.
-- ---------------------------------------------------------------------------

CREATE TABLE "plans" (
    "id"            CHAR(26) NOT NULL,
    "code"          VARCHAR(50) NOT NULL,
    "name"          VARCHAR(255) NOT NULL,
    "description"   TEXT,
    "price"         DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency"      VARCHAR(10) NOT NULL DEFAULT 'VND',
    "duration_days" INTEGER NOT NULL,
    -- NULL = không giới hạn số xe (ADR 0010: không gói / không limit = unlimited).
    "max_vehicles"  INTEGER,
    -- Giới hạn tương lai (booking/tháng, ghế nhân sự…) — thêm không cần migrate.
    "limits_json"   JSONB,
    -- @xeprime/types → PlanStatus (active | archived)
    "status"        VARCHAR(50) NOT NULL DEFAULT 'active',
    "sort_order"    INTEGER NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "plans_status_sort_order_idx" ON "plans"("status", "sort_order");

CREATE TABLE "tenant_subscriptions" (
    "id"         CHAR(26) NOT NULL,
    "tenant_id"  CHAR(26) NOT NULL,
    "plan_id"    CHAR(26) NOT NULL,
    -- @xeprime/types → SubscriptionStatus; chỉ ghi active | cancelled (expired = suy ra).
    "status"     VARCHAR(50) NOT NULL DEFAULT 'active',
    -- Snapshot giá lúc gán.
    "price"      DECIMAL(14,2) NOT NULL,
    "starts_at"  TIMESTAMPTZ(3) NOT NULL,
    "ends_at"    TIMESTAMPTZ(3) NOT NULL,
    "note"       TEXT,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_subscriptions_ends_after_starts" CHECK ("ends_at" > "starts_at")
);

-- "Gói hiện hành của tenant X" lọc theo tenant + điều kiện thời gian.
CREATE INDEX "tenant_subscriptions_tenant_id_ends_at_idx" ON "tenant_subscriptions"("tenant_id", "ends_at");
-- Lịch sử thuê bao của tenant, mới nhất trước.
CREATE INDEX "tenant_subscriptions_tenant_id_created_at_idx" ON "tenant_subscriptions"("tenant_id", "created_at");

ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: không xoá plan đang có thuê bao tham chiếu (plan chỉ archive, không xoá).
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
