-- ═══════════════════════════════════════════════════════════════════════════
-- R3 — Giao dịch Basic Owner: chính sách phí, khoản giữ chỗ, hoàn, hồ sơ người bán, support
-- (07/09/2026 — ADR 0028 · ADR 0029 · ADR 0024 · ADR 0022)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`. Thêm 6 bảng, thêm cột vào `bookings` + `public_listings`,
-- KHÔNG đụng dữ liệu cũ (mọi cột mới nullable hoặc có default an toàn).
--
-- Quyết định nằm trong DDL, có chủ đích:
--   1. `fee_policies`: unique MỘT PHẦN trên `status = 'active'` — đúng một bản hiệu lực; kích
--      hoạt bản mới và lưu trữ bản cũ trong cùng transaction thì không bao giờ vi phạm.
--   2. CHECK "bật cổng phải có căn cứ": thuế bật ⇒ có tỷ lệ + tên loại thuế; bảo hiểm bật ⇒ có
--      tỷ lệ + tên đối tác. ADR 0028 điều 4–5 là quy tắc, và DB là nơi nó không bị bỏ qua.
--   3. `booking_holds.code` UNIQUE toàn sàn — cùng không gian tên với mã hoá đơn gói (ADR 0022
--      điều 3): webhook chỉ có chuỗi nội dung chuyển khoản, không có ngữ cảnh tenant.
--   4. CHECK kết cục theo mục đích (ADR 0025 điều 4): `escrow` không được `kept`, `commission`
--      không được `released_to_shop`. Lỗi kế toán chặn ở DB, không bằng quy ước.
--   5. `hold_refunds.hold_id` UNIQUE — hoàn hai lần cho một khoản là lỗi tiền, chặn ở DB.
--   6. `bookings.service_fee_amount` TÁCH khỏi `total_amount`: tổng của gian hàng KHÔNG gồm phí
--      XePrime (ADR 0029 điều 1) — sổ thu chi của họ đọc `total_amount` và không được thấy tiền
--      của người khác trong đó.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. fee_policies ─────────────────────────────────────────────────────────

CREATE TABLE "public"."fee_policies" (
    "id"                          CHAR(26)       NOT NULL,
    "version"                     INTEGER        NOT NULL,
    "status"                      VARCHAR(30)    NOT NULL DEFAULT 'draft',
    "name"                        VARCHAR(120)   NOT NULL,
    "note"                        TEXT,
    "service_fee_percent"         DECIMAL(5,2)   NOT NULL,
    "hold_min_amount"             DECIMAL(14,2)  NOT NULL DEFAULT 20000,
    "hold_payment_window_minutes" INTEGER        NOT NULL DEFAULT 1440,
    "free_cancel_hours"           INTEGER        NOT NULL DEFAULT 4,
    "tax_enabled"                 BOOLEAN        NOT NULL DEFAULT false,
    "tax_percent"                 DECIMAL(5,2),
    "tax_label"                   VARCHAR(120),
    "trip_insurance_enabled"      BOOLEAN        NOT NULL DEFAULT false,
    "trip_insurance_percent"      DECIMAL(5,2),
    "vehicle_protection_enabled"  BOOLEAN        NOT NULL DEFAULT false,
    "vehicle_protection_percent"  DECIMAL(5,2),
    "insurance_partner_name"      VARCHAR(120),
    "effective_from"              TIMESTAMPTZ(3),
    "effective_to"                TIMESTAMPTZ(3),
    "activated_by"                CHAR(26),
    "activated_at"                TIMESTAMPTZ(3),
    "created_by"                  CHAR(26),
    "created_at"                  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                  TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fee_policies_version_key" ON "public"."fee_policies"("version");
CREATE INDEX "fee_policies_status_idx" ON "public"."fee_policies"("status");

-- Đúng MỘT bản đang hiệu lực.
CREATE UNIQUE INDEX "fee_policies_single_active_idx"
    ON "public"."fee_policies"("status")
    WHERE "status" = 'active';

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_status_check"
    CHECK ("status" IN ('draft', 'active', 'archived'));

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_service_fee_percent_check"
    CHECK ("service_fee_percent" >= 0 AND "service_fee_percent" <= 30);

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_hold_min_amount_check"
    CHECK ("hold_min_amount" >= 0);

-- Bật thuế ⇒ phải có tỷ lệ + tên loại thuế do tư vấn thuế chốt (ADR 0028 điều 4).
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_tax_requires_basis_check"
    CHECK (NOT "tax_enabled" OR ("tax_percent" IS NOT NULL AND "tax_label" IS NOT NULL));

-- Bật bảo hiểm ⇒ phải có đối tác THẬT + tỷ lệ (ADR 0028 điều 5). Không được điền "PVI" trước hợp đồng.
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_insurance_requires_partner_check"
    CHECK (
        (NOT "trip_insurance_enabled" AND NOT "vehicle_protection_enabled")
        OR "insurance_partner_name" IS NOT NULL
    );

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_trip_insurance_rate_check"
    CHECK (NOT "trip_insurance_enabled" OR "trip_insurance_percent" IS NOT NULL);

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_vehicle_protection_rate_check"
    CHECK (NOT "vehicle_protection_enabled" OR "vehicle_protection_percent" IS NOT NULL);

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_activated_by_fkey"
    FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 2. bookings: phụ phí phía KHÁCH (ADR 0029) ──────────────────────────────

ALTER TABLE "public"."bookings"
    ADD COLUMN "billing_mode"          VARCHAR(30),
    ADD COLUMN "service_fee_percent"   DECIMAL(5,2),
    ADD COLUMN "service_fee_amount"    DECIMAL(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN "customer_total_amount" DECIMAL(14,2),
    ADD COLUMN "fee_policy_id"         CHAR(26);

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_billing_mode_check"
    CHECK ("billing_mode" IS NULL OR "billing_mode" IN ('commission', 'package'));

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_service_fee_amount_check"
    CHECK ("service_fee_amount" >= 0);

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_fee_policy_id_fkey"
    FOREIGN KEY ("fee_policy_id") REFERENCES "public"."fee_policies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── 3. public_listings: denormalize chế độ thu phí (ADR 0024 ràng buộc 1) ──

ALTER TABLE "public"."public_listings"
    ADD COLUMN "billing_mode"        VARCHAR(30)  NOT NULL DEFAULT 'package',
    ADD COLUMN "service_fee_percent" DECIMAL(5,2);

ALTER TABLE "public"."public_listings"
    ADD CONSTRAINT "public_listings_billing_mode_check"
    CHECK ("billing_mode" IN ('commission', 'package'));

-- Backfill từ gói HIỆN HÀNH của tenant (cùng vị từ với `currentSubscriptionWhere`). Listing của
-- tenant không có gói hiện hành giữ default 'package' (0%) — an toàn khi hỏng: không thu phí mà
-- không giải thích được (ADR 0024 điều 3).
UPDATE "public"."public_listings" pl
SET "billing_mode" = ts."billing_mode"
FROM (
    SELECT DISTINCT ON (s."tenant_id") s."tenant_id", s."billing_mode"
    FROM "public"."tenant_subscriptions" s
    WHERE s."status" = 'active' AND s."starts_at" <= now() AND s."ends_at" > now()
      AND s."billing_mode" IN ('commission', 'package')
    ORDER BY s."tenant_id", s."ends_at" DESC
) ts
WHERE ts."tenant_id" = pl."tenant_id";

-- ── 4. booking_holds ────────────────────────────────────────────────────────

CREATE TABLE "public"."booking_holds" (
    "id"                  CHAR(26)       NOT NULL,
    "code"                VARCHAR(20)    NOT NULL,
    "tenant_id"           CHAR(26)       NOT NULL,
    "booking_request_id"  CHAR(26)       NOT NULL,
    "booking_id"          CHAR(26),
    "customer_user_id"    CHAR(26),
    "vehicle_id"          CHAR(26)       NOT NULL,
    "purpose"             VARCHAR(20)    NOT NULL DEFAULT 'commission',
    "status"              VARCHAR(20)    NOT NULL DEFAULT 'pending',
    "outcome"             VARCHAR(30),
    "amount"              DECIMAL(14,2)  NOT NULL,
    "paid_amount"         DECIMAL(14,2)  NOT NULL DEFAULT 0,
    "fee_policy_id"       CHAR(26)       NOT NULL,
    "allocation_json"     JSONB          NOT NULL,
    "price_snapshot_json" JSONB          NOT NULL,
    "schedule_json"       JSONB          NOT NULL,
    "free_cancel_until"   TIMESTAMPTZ(3) NOT NULL,
    "expires_at"          TIMESTAMPTZ(3) NOT NULL,
    "paid_at"             TIMESTAMPTZ(3),
    "released_at"         TIMESTAMPTZ(3),
    "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_holds_code_key" ON "public"."booking_holds"("code");
CREATE UNIQUE INDEX "booking_holds_booking_request_id_key" ON "public"."booking_holds"("booking_request_id");
CREATE UNIQUE INDEX "booking_holds_booking_id_key" ON "public"."booking_holds"("booking_id");
CREATE INDEX "booking_holds_status_expires_at_idx" ON "public"."booking_holds"("status", "expires_at");
CREATE INDEX "booking_holds_tenant_id_created_at_idx" ON "public"."booking_holds"("tenant_id", "created_at");
CREATE INDEX "booking_holds_customer_user_id_status_idx" ON "public"."booking_holds"("customer_user_id", "status");

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_purpose_check"
    CHECK ("purpose" IN ('commission', 'escrow'));

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_status_check"
    CHECK ("status" IN ('pending', 'underpaid', 'paid', 'expired', 'cancelled', 'released'));

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_outcome_check"
    CHECK ("outcome" IS NULL OR "outcome" IN ('kept', 'refunded', 'forfeited', 'released_to_shop'));

-- ADR 0025 điều 4: kết cục phải hợp với mục đích — tiền của gian hàng không bao giờ bị "giữ",
-- tiền của nền tảng không bao giờ "trả về gian hàng".
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_outcome_by_purpose_check"
    CHECK (
        "outcome" IS NULL
        OR ("purpose" = 'commission' AND "outcome" <> 'released_to_shop')
        OR ("purpose" = 'escrow' AND "outcome" <> 'kept')
    );

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_amount_check"
    CHECK ("amount" > 0 AND "paid_amount" >= 0);

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_booking_request_id_fkey"
    FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_customer_user_id_fkey"
    FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_fee_policy_id_fkey"
    FOREIGN KEY ("fee_policy_id") REFERENCES "public"."fee_policies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── 5. hold_refunds ─────────────────────────────────────────────────────────

CREATE TABLE "public"."hold_refunds" (
    "id"                  CHAR(26)       NOT NULL,
    "hold_id"             CHAR(26)       NOT NULL,
    "tenant_id"           CHAR(26)       NOT NULL,
    "customer_user_id"    CHAR(26),
    "amount"              DECIMAL(14,2)  NOT NULL,
    "status"              VARCHAR(20)    NOT NULL DEFAULT 'pending',
    "reason"              VARCHAR(30)    NOT NULL,
    "bank_code"           VARCHAR(20),
    "bank_account_number" VARCHAR(40),
    "bank_account_name"   VARCHAR(160),
    "paid_by"             CHAR(26),
    "paid_at"             TIMESTAMPTZ(3),
    "bank_reference"      VARCHAR(100),
    "note"                TEXT,
    "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hold_refunds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hold_refunds_hold_id_key" ON "public"."hold_refunds"("hold_id");
CREATE INDEX "hold_refunds_status_created_at_idx" ON "public"."hold_refunds"("status", "created_at");

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_status_check"
    CHECK ("status" IN ('pending', 'paid', 'rejected'));

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_reason_check"
    CHECK ("reason" IN ('early_cancel', 'owner_cancel', 'overpaid', 'admin_decision'));

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_amount_check"
    CHECK ("amount" > 0);

-- Đã chuyển thì phải có người chuyển + thời điểm; đây là bằng chứng, không phải cột trang trí.
ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_paid_evidence_check"
    CHECK ("status" <> 'paid' OR ("paid_by" IS NOT NULL AND "paid_at" IS NOT NULL));

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_hold_id_fkey"
    FOREIGN KEY ("hold_id") REFERENCES "public"."booking_holds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_customer_user_id_fkey"
    FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_paid_by_fkey"
    FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 6. seller_profiles ──────────────────────────────────────────────────────

CREATE TABLE "public"."seller_profiles" (
    "id"                  CHAR(26)       NOT NULL,
    "tenant_id"           CHAR(26)       NOT NULL,
    "entity_type"         VARCHAR(30)    NOT NULL DEFAULT 'individual',
    "legal_name"          VARCHAR(255),
    "tax_id"              VARCHAR(30),
    "id_number"           VARCHAR(30),
    "id_issued_at"        DATE,
    "id_issued_by"        VARCHAR(160),
    "bank_code"           VARCHAR(20),
    "bank_account_number" VARCHAR(40),
    "bank_account_name"   VARCHAR(160),
    "status"              VARCHAR(30)    NOT NULL DEFAULT 'draft',
    "submitted_at"        TIMESTAMPTZ(3),
    "verified_by"         CHAR(26),
    "verified_at"         TIMESTAMPTZ(3),
    "review_note"         TEXT,
    "bank_changed_at"     TIMESTAMPTZ(3),
    "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_profiles_tenant_id_key" ON "public"."seller_profiles"("tenant_id");
CREATE INDEX "seller_profiles_status_submitted_at_idx" ON "public"."seller_profiles"("status", "submitted_at");

ALTER TABLE "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_entity_type_check"
    CHECK ("entity_type" IN ('individual', 'household_business', 'company'));

ALTER TABLE "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_status_check"
    CHECK ("status" IN ('draft', 'submitted', 'verified', 'changes_requested', 'rejected'));

ALTER TABLE "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."seller_profiles"
    ADD CONSTRAINT "seller_profiles_verified_by_fkey"
    FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 7. support_cases + support_case_events ──────────────────────────────────

CREATE TABLE "public"."support_cases" (
    "id"                 CHAR(26)       NOT NULL,
    "code"               VARCHAR(20)    NOT NULL,
    "tenant_id"          CHAR(26),
    "booking_id"         CHAR(26),
    "booking_request_id" CHAR(26),
    "opened_by_user_id"  CHAR(26)       NOT NULL,
    "opened_by_scope"    VARCHAR(20)    NOT NULL,
    "category"           VARCHAR(30)    NOT NULL,
    "status"             VARCHAR(30)    NOT NULL DEFAULT 'open',
    "priority"           VARCHAR(20)    NOT NULL DEFAULT 'normal',
    "subject"            VARCHAR(255)   NOT NULL,
    "description"        TEXT           NOT NULL,
    "assignee_user_id"   CHAR(26),
    "resolution"         TEXT,
    "resolved_at"        TIMESTAMPTZ(3),
    "closed_at"          TIMESTAMPTZ(3),
    "created_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_cases_code_key" ON "public"."support_cases"("code");
CREATE INDEX "support_cases_status_priority_created_at_idx" ON "public"."support_cases"("status", "priority", "created_at");
CREATE INDEX "support_cases_tenant_id_status_idx" ON "public"."support_cases"("tenant_id", "status");
CREATE INDEX "support_cases_opened_by_user_id_created_at_idx" ON "public"."support_cases"("opened_by_user_id", "created_at");
CREATE INDEX "support_cases_booking_id_idx" ON "public"."support_cases"("booking_id");

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_opened_by_scope_check"
    CHECK ("opened_by_scope" IN ('customer', 'tenant', 'platform'));

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_category_check"
    CHECK ("category" IN ('dispute', 'incident', 'payment', 'account', 'other'));

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_status_check"
    CHECK ("status" IN ('open', 'in_progress', 'waiting_party', 'resolved', 'closed'));

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_priority_check"
    CHECK ("priority" IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_booking_request_id_fkey"
    FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_opened_by_user_id_fkey"
    FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_assignee_user_id_fkey"
    FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."support_case_events" (
    "id"              CHAR(26)       NOT NULL,
    "case_id"         CHAR(26)       NOT NULL,
    "actor_user_id"   CHAR(26)       NOT NULL,
    "actor_scope"     VARCHAR(20)    NOT NULL,
    "kind"            VARCHAR(30)    NOT NULL,
    "visibility"      VARCHAR(20)    NOT NULL DEFAULT 'public',
    "body"            TEXT,
    "from_status"     VARCHAR(30),
    "to_status"       VARCHAR(30),
    "attachment_key"  TEXT,
    "attachment_name" VARCHAR(255),
    "attachment_mime" VARCHAR(100),
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_case_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_case_events_case_id_created_at_idx" ON "public"."support_case_events"("case_id", "created_at");

ALTER TABLE "public"."support_case_events"
    ADD CONSTRAINT "support_case_events_actor_scope_check"
    CHECK ("actor_scope" IN ('customer', 'tenant', 'platform'));

ALTER TABLE "public"."support_case_events"
    ADD CONSTRAINT "support_case_events_kind_check"
    CHECK ("kind" IN ('message', 'status_change', 'evidence', 'assignment', 'resolution'));

ALTER TABLE "public"."support_case_events"
    ADD CONSTRAINT "support_case_events_visibility_check"
    CHECK ("visibility" IN ('public', 'internal'));

ALTER TABLE "public"."support_case_events"
    ADD CONSTRAINT "support_case_events_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "public"."support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."support_case_events"
    ADD CONSTRAINT "support_case_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 8. Chính sách pilot mặc định (ADR 0028 điều 2 · ADR 0029 điều 2) ────────
--
-- Nằm trong MIGRATION chứ không chỉ trong seed, cùng lý do với `backfill_default_plan`: đây là
-- điều kiện an toàn của luồng giữ chỗ — không có bản `active` thì duyệt yêu cầu tuyến hoa hồng
-- ném FEE_POLICY_MISSING ở MỌI môi trường, không phụ thuộc ai nhớ chạy seed. Chỉ phí dịch vụ 10%;
-- thuế/bảo hiểm TẮT vì chưa có căn cứ thật. Idempotent: có bản active rồi thì không chèn.
INSERT INTO "public"."fee_policies" (
    "id", "version", "status", "name", "note", "service_fee_percent",
    "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
    "effective_from", "activated_at", "created_at", "updated_at"
)
SELECT
    '01R3FEEPOLICYPILOT0000001', 1, 'active', 'Pilot — phí dịch vụ 10%',
    'Chính sách pilot theo ADR 0028/0029: chỉ phí dịch vụ XePrime 10% cho tuyến hoa hồng. Thuế và bảo hiểm chưa bật — chờ tư vấn thuế và hợp đồng đối tác.',
    10, 20000, 1440, 4, now(), now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "status" = 'active');
