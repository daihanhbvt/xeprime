-- ═══════════════════════════════════════════════════════════════════════════
-- XePrime — baseline schema (gộp 44 migration, 22/07/2026 → 20/08/2026)
--
-- Vì sao gộp: một chuỗi migration tăng dần chỉ có giá trị với database ĐANG CHẠY cần
-- đi tiếp từng bước. Dự án chưa lên production nên không database nào phải đi lại chuỗi
-- đó — nó chỉ bắt người mới đọc 44 file để đoán ra hình thù cuối cùng. File này LÀ hình
-- thù cuối cùng, dựng từ database đã áp đủ chuỗi cũ nên không rơi một ràng buộc nào.
--
-- Cách sinh ra file (ghi lại để lần sau lặp lại được):
--   1. `prisma migrate deploy` toàn bộ chuỗi cũ lên một database sạch;
--   2. `prisma migrate diff --from-empty --to-config-datasource` → bảng / cột / khoá ngoại;
--   3. phần Prisma KHÔNG diễn đạt được (function, trigger, CHECK, EXCLUDE, index có WHERE)
--      trích thẳng từ `pg_get_*def()` của chính database đó, rồi viết ngược dạng chuẩn hoá
--      của Postgres (`= ANY (ARRAY[…])`) về `IN (…)` cho người đọc được;
--   4. đối chiếu `pg_dump --schema-only` giữa database cũ và database dựng từ file này.
--      Kết quả: trùng từng ký tự, trừ 5 cột dưới đây — đó là bằng chứng bước 3 không
--      đổi ngữ nghĩa.
--
-- Khác biệt duy nhất còn lại so với chuỗi cũ, và vì sao chấp nhận được:
--   `booking_deposit_settlements.created_at/updated_at`, `booking_surcharges.created_at/
--   updated_at`, `receipts.occurred_at` đổi `DEFAULT now()` → `DEFAULT CURRENT_TIMESTAMP`.
--   Postgres coi hai cái là MỘT (cùng trả về transaction_timestamp()); đổi để 5 cột này
--   không lạc loài giữa hơn 100 cột còn lại vốn đã là CURRENT_TIMESTAMP.
--
-- Hai chỗ `prisma migrate diff` làm SAI, đã vá tay ở đây (sinh lại thì nhớ vá lại):
--   • index partial mất mệnh đề `WHERE` → unique dedupe biến thành unique toàn bảng;
--   • cột kiểu mảng mất `NOT NULL` → CHECK `cardinality(...) >= 1` cho NULL đi lọt.
--
-- ⚠ Bẫy khi chạy `prisma migrate dev` lần sau: file này (và chuỗi cũ trước nó) chứa
--   những thứ `schema.prisma` KHÔNG diễn đạt được — rõ nhất là các khoá ngoại tổ hợp
--   `(id, tenant_id)` chặn một bản ghi trỏ sang xe/gian hàng của tenant khác. Prisma
--   không thấy chúng trong datamodel nên migration nó tự sinh sẽ có lệnh DROP các khoá
--   đó. Đọc kỹ SQL Prisma sinh ra trước khi commit, và giữ lại phần viết tay.
--   (`prisma migrate diff --from-schema ./schema.prisma --to-config-datasource` liệt kê
--    đúng 25 câu chênh lệch cố ý này — con số đó không đổi sau khi gộp.)
--
-- ADR liên quan: 0001 (PostgreSQL 16) · 0005 (status là String, DB canh bằng CHECK)
--                0006 (chống trùng lịch bằng EXCLUDE USING gist) · 0011 (gói thuê dài hạn)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Schema + extension
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Bảng
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "public"."admin_notes" (
    "id" CHAR(26) NOT NULL,
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "note" TEXT NOT NULL,
    "visibility" VARCHAR(50) NOT NULL DEFAULT 'platform_only',
    "created_by" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."approval_logs" (
    "id" CHAR(26) NOT NULL,
    "approval_task_id" CHAR(26) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "from_status" VARCHAR(50),
    "to_status" VARCHAR(50) NOT NULL,
    "note" TEXT,
    "actor_user_id" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."approval_tasks" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "target_type" VARCHAR(50) NOT NULL,
    "target_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "submitted_by" CHAR(26) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" CHAR(26),
    "reviewed_at" TIMESTAMPTZ(3),
    "reason" TEXT,
    "snapshot_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "approval_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "actor_user_id" CHAR(26),
    "actor_scope" VARCHAR(50) NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" CHAR(26),
    "before_json" JSONB,
    "after_json" JSONB,
    "ip_address" VARCHAR(80),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."booking_deposit_settlements" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "deposit_received" DECIMAL(14,2) NOT NULL,
    "surcharge_total" DECIMAL(14,2) NOT NULL,
    "refund_amount" DECIMAL(14,2) NOT NULL,
    "refund_method" VARCHAR(30) NOT NULL,
    "refunded_at" TIMESTAMPTZ(3) NOT NULL,
    "reference" VARCHAR(255),
    "note" TEXT,
    "recorded_by" CHAR(26),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_deposit_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."booking_requests" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending_host_approval',
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(30) NOT NULL,
    "customer_email" VARCHAR(255),
    "pickup_at" TIMESTAMPTZ(3),
    "return_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "reject_reason" TEXT,
    "booking_id" CHAR(26),
    "decided_by" CHAR(26),
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "customer_user_id" CHAR(26),
    "delivery_requested" BOOLEAN NOT NULL DEFAULT false,
    "delivery_address" TEXT,
    "delivery_quote_json" JSONB,
    "service_type" VARCHAR(50) NOT NULL DEFAULT 'self_drive',
    "route_type" VARCHAR(30),
    "pickup_address" TEXT,
    "destination" TEXT,
    "long_term_package_months" SMALLINT,
    "pickup_preference" VARCHAR(30),
    "requested_pickup_date" DATE,
    "pickup_window_start_date" DATE,
    "pickup_window_end_date" DATE,
    "tenant_customer_id" CHAR(26),

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."booking_surcharges" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by" CHAR(26),
    "void_reason" TEXT,
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_surcharges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bookings" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(30),
    "status" VARCHAR(50) NOT NULL DEFAULT 'reserved',
    "service_type" VARCHAR(50) NOT NULL DEFAULT 'self_drive',
    "pickup_at" TIMESTAMPTZ(3) NOT NULL,
    "return_at" TIMESTAMPTZ(3) NOT NULL,
    "actual_pickup_at" TIMESTAMPTZ(3),
    "actual_return_at" TIMESTAMPTZ(3),
    "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "price_snapshot_json" JSONB,
    "driver_id" CHAR(26),
    "route_type" VARCHAR(30),
    "pickup_address" TEXT,
    "destination" TEXT,
    "long_term_package_months" SMALLINT,
    "tenant_customer_id" CHAR(26),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."catalog_items" (
    "id" CHAR(26) NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "icon_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_attachments" (
    "id" CHAR(26) NOT NULL,
    "message_id" CHAR(26) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" VARCHAR(100),
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contracts" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "contract_no" VARCHAR(100) NOT NULL,
    "template_version" VARCHAR(50) NOT NULL DEFAULT 'v1',
    "snapshot_json" JSONB NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "file_url" TEXT,
    "signed_at" TIMESTAMPTZ(3),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_participants" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "user_id" CHAR(26),
    "participant_type" VARCHAR(50) NOT NULL,
    "tenant_id" CHAR(26),
    "last_read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversations" (
    "id" CHAR(26) NOT NULL,
    "firebase_conversation_id" VARCHAR(160),
    "tenant_id" CHAR(26) NOT NULL,
    "customer_user_id" CHAR(26),
    "vehicle_id" CHAR(26),
    "booking_id" CHAR(26),
    "booking_request_id" CHAR(26),
    "status" VARCHAR(50) NOT NULL DEFAULT 'open',
    "last_message_text" TEXT,
    "last_message_at" TIMESTAMPTZ(3),
    "last_sender_type" VARCHAR(50),
    "unread_customer_count" INTEGER NOT NULL DEFAULT 0,
    "unread_tenant_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."drivers" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "driver_type" VARCHAR(30) NOT NULL DEFAULT 'staff',
    "license_no" VARCHAR(50),
    "id_no" VARCHAR(50),
    "note" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "license_expires_at" DATE,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."finance_categories" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "system_key" VARCHAR(50),

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."marketplace_banners" (
    "id" CHAR(26) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "image_url" TEXT NOT NULL,
    "mobile_image_url" TEXT,
    "alt_text" VARCHAR(255) NOT NULL,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "tablet_image_url" TEXT,

    CONSTRAINT "marketplace_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."message_outbox" (
    "id" CHAR(26) NOT NULL,
    "message_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" CHAR(26) NOT NULL,
    "conversation_id" CHAR(26) NOT NULL,
    "firebase_message_id" VARCHAR(160),
    "sender_user_id" CHAR(26),
    "sender_type" VARCHAR(50) NOT NULL,
    "message_type" VARCHAR(50) NOT NULL DEFAULT 'text',
    "text" TEXT,
    "metadata_json" JSONB,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "user_id" CHAR(26),
    "type" VARCHAR(80) NOT NULL,
    "channel" VARCHAR(50) NOT NULL DEFAULT 'in_app',
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "target_type" VARCHAR(50),
    "target_id" CHAR(26),
    "data_json" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_reset_tokens" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "booking_id" CHAR(26),
    "subscription_id" CHAR(26),
    "receipt_id" CHAR(26),
    "payer_user_id" CHAR(26),
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "method" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'succeeded',
    "provider" VARCHAR(50),
    "provider_transaction_id" VARCHAR(255),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'rental',

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" CHAR(26) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."phone_verifications" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26),
    "phone" VARCHAR(30) NOT NULL,
    "purpose" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "otp_hash" VARCHAR(255),
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."plans" (
    "id" CHAR(26) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'VND',
    "duration_days" INTEGER NOT NULL,
    "max_vehicles" INTEGER,
    "limits_json" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."platform_memberships" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "role_key" VARCHAR(50) NOT NULL,
    "role_id" CHAR(26),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."province_aliases" (
    "id" CHAR(26) NOT NULL,
    "province_code" CHAR(2) NOT NULL,
    "alias" VARCHAR(150) NOT NULL,
    "normalized_alias" VARCHAR(150) NOT NULL,
    "alias_type" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "province_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."provinces" (
    "code" CHAR(2) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "administrative_type" VARCHAR(20) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_public_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."public_listings" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "shop_slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "vehicle_type" VARCHAR(50) NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "seat_count" INTEGER,
    "fuel_type" VARCHAR(50),
    "province_name" VARCHAR(100),
    "main_image_url" TEXT,
    "weekday_price" DECIMAL(14,2),
    "weekend_price" DECIMAL(14,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "body_type" VARCHAR(50),
    "hourly_price" DECIMAL(14,2),
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "no_collateral" BOOLEAN NOT NULL DEFAULT false,
    "discount_percent" INTEGER,
    "features" TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    "rating_avg" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "branch_id" CHAR(26),
    "province_code" CHAR(2),
    "service_types" VARCHAR(50)[] DEFAULT ARRAY['self_drive']::VARCHAR(50)[] NOT NULL,
    "monthly_price" DECIMAL(14,2),
    "with_driver_daily_price" DECIMAL(14,2),
    "with_driver_inter_city_price" DECIMAL(14,2),
    "with_driver_one_way_price" DECIMAL(14,2),

    CONSTRAINT "public_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."receipt_attachments" (
    "id" CHAR(26) NOT NULL,
    "receipt_id" CHAR(26) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" VARCHAR(50),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."receipts" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "receipt_no" VARCHAR(100),
    "type" VARCHAR(20) NOT NULL,
    "category_id" CHAR(26),
    "booking_id" CHAR(26),
    "vehicle_id" CHAR(26),
    "tenant_customer_id" CHAR(26),
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL,
    "reference_code" VARCHAR(255),
    "description" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "requested_by" CHAR(26),
    "approved_by" CHAR(26),
    "approved_at" TIMESTAMPTZ(3),
    "cancelled_by" CHAR(26),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "source_ref_id" CHAR(26),

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rental_policies" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26),
    "deposit_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "delivery_max_radius_km" DECIMAL(6,1),
    "delivery_tiers_json" JSONB NOT NULL DEFAULT '[]',
    "overtime_fee_per_hour" DECIMAL(14,2),
    "overtime_grace_minutes" INTEGER,
    "overtime_rounding_minutes" INTEGER,
    "discount_enabled" BOOLEAN NOT NULL DEFAULT false,
    "discount_tiers_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "vehicle_type" VARCHAR(50),
    "collateral_mode" VARCHAR(20) NOT NULL DEFAULT 'cash',
    "collateral_asset_types" VARCHAR(50)[] DEFAULT '{}'::VARCHAR[] NOT NULL,

    CONSTRAINT "rental_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reviews" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26),
    "booking_request_id" CHAR(26),
    "customer_id" CHAR(26) NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "role_id" CHAR(26) NOT NULL,
    "permission_id" CHAR(26) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" CHAR(26) NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "tenant_id" CHAR(26),
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_branches" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "province_code" CHAR(2),
    "address" TEXT,
    "phone" VARCHAR(30),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "needs_location_review" BOOLEAN NOT NULL DEFAULT false,
    "legacy_province_value" VARCHAR(150),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_customer_documents" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "tenant_customer_id" CHAR(26) NOT NULL,
    "document_type" VARCHAR(30) NOT NULL,
    "custom_type_name" VARCHAR(160),
    "object_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "expires_at" DATE,
    "uploaded_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_user_id" CHAR(26),
    "verify_method" VARCHAR(20),
    "verify_note" VARCHAR(255),

    CONSTRAINT "tenant_customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_customer_notes" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "tenant_customer_id" CHAR(26) NOT NULL,
    "note_type" VARCHAR(30) NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_customers" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "customer_user_id" CHAR(26),
    "full_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "normalized_phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "address" TEXT,
    "source" VARCHAR(30) NOT NULL DEFAULT 'manual',
    "risk_level" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "risk_reason" TEXT,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_documents" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "document_type" VARCHAR(50) NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "reject_reason" TEXT,
    "uploaded_by" CHAR(26),
    "reviewed_by" CHAR(26),
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_invites" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "role_key" VARCHAR(50) NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" CHAR(26) NOT NULL,
    "accepted_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_memberships" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "role_key" VARCHAR(50) NOT NULL,
    "role_id" CHAR(26),
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "display_name_in_tenant" VARCHAR(255),
    "invited_by" CHAR(26),
    "joined_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_profiles" (
    "tenant_id" CHAR(26) NOT NULL,
    "display_name" VARCHAR(255),
    "bio" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "address" TEXT,
    "province_code" VARCHAR(50),
    "province_name" VARCHAR(100),
    "tax_code" VARCHAR(50),
    "business_license_no" VARCHAR(100),
    "bank_name" VARCHAR(100),
    "bank_account_no" VARCHAR(100),
    "bank_account_name" VARCHAR(255),
    "qr_url" TEXT,
    "settings_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "owner_full_name" VARCHAR(255),
    "owner_phone" VARCHAR(30),
    "owner_email" VARCHAR(255),

    CONSTRAINT "tenant_profiles_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "public"."tenant_subscriptions" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "plan_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "price" DECIMAL(14,2) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenants" (
    "id" CHAR(26) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "tenant_type" VARCHAR(50) NOT NULL DEFAULT 'individual',
    "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "owner_user_id" CHAR(26) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(255),
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_identities" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(255),
    "provider_phone" VARCHAR(30),
    "raw_profile_json" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" CHAR(26) NOT NULL,
    "firebase_uid" VARCHAR(128),
    "email" VARCHAR(255),
    "email_verified_at" TIMESTAMPTZ(3),
    "phone" VARCHAR(30),
    "phone_verified_at" TIMESTAMPTZ(3),
    "display_name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "password_hash" VARCHAR(255),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_blocks" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_daily_prices" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "date" DATE NOT NULL,
    "daily_price" DECIMAL(14,2),
    "hourly_price" DECIMAL(14,2),
    "note" VARCHAR(255),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_daily_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_document_ocr_jobs" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "document_id" CHAR(26) NOT NULL,
    "document_version_id" CHAR(26) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'processing',
    "provider" VARCHAR(60) NOT NULL,
    "extracted_fields_json" JSONB NOT NULL DEFAULT '{}',
    "confidence" INTEGER,
    "error_code" VARCHAR(60),
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_document_ocr_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_document_versions" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "document_id" CHAR(26) NOT NULL,
    "private_file_id" CHAR(26) NOT NULL,
    "version" INTEGER NOT NULL,
    "uploaded_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_documents" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "custom_type_name" VARCHAR(160),
    "document_number" VARCHAR(120),
    "holder_name" VARCHAR(160),
    "holder_address" VARCHAR(255),
    "plate_number" VARCHAR(50),
    "chassis_number" VARCHAR(80),
    "engine_number" VARCHAR(80),
    "issued_at" DATE,
    "expires_at" DATE,
    "notes" TEXT,
    "active_version_id" CHAR(26),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_features" (
    "id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "feature_key" VARCHAR(80) NOT NULL,

    CONSTRAINT "vehicle_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_handover_photos" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "handover_id" CHAR(26) NOT NULL,
    "private_file_id" CHAR(26) NOT NULL,
    "slot" VARCHAR(20) NOT NULL,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_handover_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_handovers" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "odometer_km" INTEGER,
    "odometer_reading_id" CHAR(26),
    "odometer_missing" BOOLEAN NOT NULL DEFAULT false,
    "suspicious_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "fuel_level" VARCHAR(20),
    "battery_percent" INTEGER,
    "condition_note" TEXT,
    "damage_note" TEXT,
    "notes" TEXT,
    "confirmed_at" TIMESTAMPTZ(3),
    "confirmed_by" CHAR(26),
    "canceled_at" TIMESTAMPTZ(3),
    "canceled_by" CHAR(26),
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3),
    "condition" VARCHAR(20),

    CONSTRAINT "vehicle_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_images" (
    "id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_type" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_maintenance_attachments" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "record_id" CHAR(26) NOT NULL,
    "private_file_id" CHAR(26) NOT NULL,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_maintenance_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_maintenance_profiles" (
    "vehicle_id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "current_odometer_km" INTEGER,
    "current_odometer_source" VARCHAR(30),
    "current_odometer_at" TIMESTAMPTZ(3),
    "current_odometer_reading_id" CHAR(26),
    "oil_change_interval_km" INTEGER,
    "last_service_km" INTEGER,
    "last_service_at" DATE,
    "notes" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_maintenance_profiles_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_maintenance_records" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "custom_type_name" VARCHAR(160),
    "title" VARCHAR(255),
    "status" VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    "planned_start_at" TIMESTAMPTZ(3),
    "planned_end_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "odometer_km" INTEGER,
    "provider_name" VARCHAR(255),
    "cost" DECIMAL(14,2),
    "receipt_code" VARCHAR(100),
    "notes" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_occupancies" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_id" CHAR(26) NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 0,
    "period" tstzrange NOT NULL DEFAULT 'empty'::tstzrange,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_occupancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_odometer_readings" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "odometer_km" INTEGER NOT NULL,
    "previous_km" INTEGER,
    "source" VARCHAR(30) NOT NULL,
    "source_ref_id" CHAR(26),
    "reason_code" VARCHAR(40),
    "reason" TEXT,
    "is_decrease" BOOLEAN NOT NULL DEFAULT false,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_odometer_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_private_files" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "purpose" VARCHAR(40) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_private_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicle_source_details" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "purchase_date" DATE,
    "purchase_price" DECIMAL(14,2),
    "purchase_place" VARCHAR(255),
    "bank_name" VARCHAR(160),
    "contract_number" VARCHAR(120),
    "original_principal" DECIMAL(14,2),
    "monthly_principal" DECIMAL(14,2),
    "monthly_interest" DECIMAL(14,2),
    "interest_rate_percent" DECIMAL(5,2),
    "term_months" INTEGER,
    "interest_method" VARCHAR(30),
    "owner_name" VARCHAR(160),
    "owner_phone" VARCHAR(30),
    "owner_email" VARCHAR(160),
    "monthly_rent" DECIMAL(14,2),
    "commission_percent" DECIMAL(5,2),
    "payment_day" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "contract_files_json" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_source_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vehicles" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "plate_number" VARCHAR(50),
    "vehicle_type" VARCHAR(50) NOT NULL,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "manufacture_year" INTEGER,
    "color" VARCHAR(80),
    "seat_count" INTEGER,
    "fuel_type" VARCHAR(50),
    "operation_status" VARCHAR(50) NOT NULL DEFAULT 'available',
    "public_status" VARCHAR(50) NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "main_image_url" TEXT,
    "weekday_price" DECIMAL(14,2),
    "weekend_price" DECIMAL(14,2),
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "body_type" VARCHAR(50),
    "hourly_price" DECIMAL(14,2),
    "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    "no_collateral" BOOLEAN NOT NULL DEFAULT false,
    "discount_percent" INTEGER,
    "source_type" VARCHAR(30) NOT NULL DEFAULT 'owned',
    "length_mm" INTEGER,
    "width_mm" INTEGER,
    "height_mm" INTEGER,
    "curb_weight_kg" INTEGER,
    "engine_displacement_cc" INTEGER,
    "horsepower_hp" INTEGER,
    "transmission" VARCHAR(30),
    "fuel_consumption_city" DECIMAL(6,2),
    "fuel_consumption_highway" DECIMAL(6,2),
    "fuel_consumption_combined" DECIMAL(6,2),
    "branch_id" CHAR(26),
    "service_types" VARCHAR(50)[] DEFAULT ARRAY['self_drive']::VARCHAR(50)[] NOT NULL,
    "monthly_price" DECIMAL(14,2),
    "with_driver_daily_price" DECIMAL(14,2),
    "with_driver_inter_city_price" DECIMAL(14,2),
    "with_driver_one_way_price" DECIMAL(14,2),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Function nghiệp vụ (Prisma không diễn đạt được)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.xeprime_normalize_province(raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE s text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  s := lower(raw);
  s := translate(s, 'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := btrim(s);
  -- Tiền tố hành chính ở ĐẦU chuỗi; `tp` không cần dấu phân cách để bắt `TPHCM`.
  s := regexp_replace(s, '^(thanh pho|tinh|t p|tp)\s*', '');
  s := regexp_replace(s, '\s+', ' ', 'g');
  RETURN btrim(s);
END; $function$
;

CREATE OR REPLACE FUNCTION public.xeprime_set_occupancy_period()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."period" := tstzrange(
        NEW."start_at",
        NEW."end_at" + make_interval(mins => NEW."buffer_minutes"),
        '[)'
    );
    RETURN NEW;
END;
$function$
;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Trigger — duy trì cột period của vehicle_occupancies (ADR 0006)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER vehicle_occupancies_set_period BEFORE INSERT OR UPDATE OF start_at, end_at, buffer_minutes ON public.vehicle_occupancies FOR EACH ROW EXECUTE FUNCTION xeprime_set_occupancy_period();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Index — 17 trong 199 cái là index partial, mệnh đề WHERE là phần Prisma đánh rơi
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX admin_notes_target_type_target_id_idx ON public.admin_notes USING btree (target_type, target_id);
CREATE INDEX admin_notes_tenant_id_idx ON public.admin_notes USING btree (tenant_id);
CREATE INDEX approval_logs_approval_task_id_idx ON public.approval_logs USING btree (approval_task_id);
CREATE INDEX approval_tasks_status_target_type_idx ON public.approval_tasks USING btree (status, target_type);
CREATE INDEX approval_tasks_target_type_target_id_idx ON public.approval_tasks USING btree (target_type, target_id);
CREATE INDEX approval_tasks_tenant_id_status_idx ON public.approval_tasks USING btree (tenant_id, status);
CREATE INDEX audit_logs_action_created_at_idx ON public.audit_logs USING btree (action, created_at);
CREATE INDEX audit_logs_actor_user_id_created_at_idx ON public.audit_logs USING btree (actor_user_id, created_at);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);
CREATE INDEX audit_logs_target_type_target_id_idx ON public.audit_logs USING btree (target_type, target_id);
CREATE INDEX audit_logs_tenant_id_created_at_idx ON public.audit_logs USING btree (tenant_id, created_at);
CREATE INDEX booking_deposit_settlements_tenant_booking_idx ON public.booking_deposit_settlements USING btree (tenant_id, booking_id);
CREATE UNIQUE INDEX booking_requests_booking_id_key ON public.booking_requests USING btree (booking_id);
CREATE INDEX booking_requests_created_at_idx ON public.booking_requests USING btree (created_at);
CREATE INDEX booking_requests_customer_user_id_idx ON public.booking_requests USING btree (customer_user_id);
CREATE INDEX booking_requests_delivery_quote_pending_idx ON public.booking_requests USING btree (tenant_id, created_at) WHERE ((delivery_requested = true) AND (delivery_quote_json IS NULL));
CREATE UNIQUE INDEX booking_requests_pending_dedupe_idx ON public.booking_requests USING btree (vehicle_id, customer_phone, pickup_at, return_at) WHERE ((status)::text = 'pending_host_approval'::text);
CREATE UNIQUE INDEX booking_requests_pending_long_term_dedupe_idx ON public.booking_requests USING btree (vehicle_id, customer_phone, long_term_package_months, pickup_preference, requested_pickup_date) NULLS NOT DISTINCT WHERE (((status)::text = 'pending_host_approval'::text) AND ((service_type)::text = 'long_term'::text));
CREATE INDEX booking_requests_tenant_id_status_idx ON public.booking_requests USING btree (tenant_id, status);
CREATE INDEX booking_requests_tenant_id_tenant_customer_id_idx ON public.booking_requests USING btree (tenant_id, tenant_customer_id);
CREATE INDEX booking_requests_vehicle_id_idx ON public.booking_requests USING btree (vehicle_id);
CREATE INDEX booking_surcharges_tenant_booking_idx ON public.booking_surcharges USING btree (tenant_id, booking_id);
CREATE INDEX bookings_created_at_idx ON public.bookings USING btree (created_at);
CREATE INDEX bookings_customer_phone_idx ON public.bookings USING btree (customer_phone);
CREATE INDEX bookings_driver_id_idx ON public.bookings USING btree (driver_id);
CREATE UNIQUE INDEX bookings_id_tenant_id_vehicle_id_key ON public.bookings USING btree (id, tenant_id, vehicle_id);
CREATE INDEX bookings_search_trgm_idx ON public.bookings USING gin (code gin_trgm_ops, customer_name gin_trgm_ops);
CREATE INDEX bookings_status_created_at_idx ON public.bookings USING btree (status, created_at);
CREATE UNIQUE INDEX bookings_tenant_id_code_key ON public.bookings USING btree (tenant_id, code);
CREATE INDEX bookings_tenant_id_status_idx ON public.bookings USING btree (tenant_id, status);
CREATE INDEX bookings_tenant_id_tenant_customer_id_idx ON public.bookings USING btree (tenant_id, tenant_customer_id);
CREATE INDEX bookings_vehicle_id_pickup_at_return_at_idx ON public.bookings USING btree (vehicle_id, pickup_at, return_at);
CREATE INDEX catalog_items_type_active_sort_order_idx ON public.catalog_items USING btree (type, active, sort_order);
CREATE UNIQUE INDEX catalog_items_type_key_key ON public.catalog_items USING btree (type, key);
CREATE INDEX chat_attachments_message_id_idx ON public.chat_attachments USING btree (message_id);
CREATE UNIQUE INDEX contracts_booking_id_key ON public.contracts USING btree (booking_id);
CREATE UNIQUE INDEX contracts_tenant_id_contract_no_key ON public.contracts USING btree (tenant_id, contract_no);
CREATE INDEX contracts_tenant_id_created_at_idx ON public.contracts USING btree (tenant_id, created_at);
CREATE UNIQUE INDEX conversation_participants_conversation_id_user_id_key ON public.conversation_participants USING btree (conversation_id, user_id);
CREATE INDEX conversation_participants_user_id_idx ON public.conversation_participants USING btree (user_id);
CREATE INDEX conversations_booking_id_idx ON public.conversations USING btree (booking_id);
CREATE INDEX conversations_customer_user_id_last_message_at_idx ON public.conversations USING btree (customer_user_id, last_message_at);
CREATE UNIQUE INDEX conversations_firebase_conversation_id_key ON public.conversations USING btree (firebase_conversation_id);
CREATE INDEX conversations_tenant_id_last_message_at_idx ON public.conversations USING btree (tenant_id, last_message_at);
CREATE UNIQUE INDEX drivers_id_tenant_id_key ON public.drivers USING btree (id, tenant_id);
CREATE INDEX drivers_tenant_id_deleted_at_idx ON public.drivers USING btree (tenant_id, deleted_at);
CREATE INDEX drivers_tenant_id_status_idx ON public.drivers USING btree (tenant_id, status);
CREATE UNIQUE INDEX finance_categories_system_key_uniq ON public.finance_categories USING btree (system_key) WHERE (system_key IS NOT NULL);
CREATE INDEX finance_categories_tenant_id_type_idx ON public.finance_categories USING btree (tenant_id, type);
CREATE INDEX marketplace_banners_active_sort_order_idx ON public.marketplace_banners USING btree (active, sort_order);
CREATE UNIQUE INDEX message_outbox_message_id_key ON public.message_outbox USING btree (message_id);
CREATE INDEX message_outbox_status_next_attempt_at_idx ON public.message_outbox USING btree (status, next_attempt_at);
CREATE INDEX messages_conversation_id_sent_at_idx ON public.messages USING btree (conversation_id, sent_at);
CREATE INDEX notifications_tenant_id_created_at_idx ON public.notifications USING btree (tenant_id, created_at);
CREATE INDEX notifications_user_id_read_at_created_at_idx ON public.notifications USING btree (user_id, read_at, created_at);
CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);
CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);
CREATE INDEX payments_booking_id_idx ON public.payments USING btree (booking_id);
CREATE INDEX payments_booking_kind_idx ON public.payments USING btree (booking_id, kind);
CREATE INDEX payments_created_at_idx ON public.payments USING btree (created_at);
CREATE INDEX payments_tenant_id_booking_id_idx ON public.payments USING btree (tenant_id, booking_id);
CREATE UNIQUE INDEX permissions_key_key ON public.permissions USING btree (key);
CREATE INDEX permissions_module_idx ON public.permissions USING btree (module);
CREATE INDEX phone_verifications_phone_idx ON public.phone_verifications USING btree (phone);
CREATE INDEX phone_verifications_status_expires_at_idx ON public.phone_verifications USING btree (status, expires_at);
CREATE INDEX phone_verifications_user_id_idx ON public.phone_verifications USING btree (user_id);
CREATE UNIQUE INDEX plans_code_key ON public.plans USING btree (code);
CREATE INDEX plans_status_sort_order_idx ON public.plans USING btree (status, sort_order);
CREATE INDEX platform_memberships_status_idx ON public.platform_memberships USING btree (status);
CREATE UNIQUE INDEX platform_memberships_user_id_role_key_key ON public.platform_memberships USING btree (user_id, role_key);
CREATE UNIQUE INDEX province_aliases_normalized_alias_key ON public.province_aliases USING btree (normalized_alias);
CREATE INDEX province_aliases_province_code_idx ON public.province_aliases USING btree (province_code);
CREATE INDEX provinces_is_enabled_sort_order_idx ON public.provinces USING btree (is_enabled, sort_order);
CREATE INDEX provinces_is_public_visible_sort_order_idx ON public.provinces USING btree (is_public_visible, sort_order);
CREATE UNIQUE INDEX provinces_name_key ON public.provinces USING btree (name);
CREATE UNIQUE INDEX provinces_slug_key ON public.provinces USING btree (slug);
CREATE INDEX public_listings_active_idx ON public.public_listings USING btree (vehicle_type, province_name) WHERE ((status)::text = 'active'::text);
CREATE INDEX public_listings_active_rating_idx ON public.public_listings USING btree (rating_avg DESC NULLS LAST, rating_count DESC, created_at DESC) WHERE ((status)::text = 'active'::text);
CREATE INDEX public_listings_features_idx ON public.public_listings USING gin (features);
CREATE INDEX public_listings_service_types_idx ON public.public_listings USING gin (service_types);
CREATE INDEX public_listings_status_body_type_idx ON public.public_listings USING btree (status, body_type);
CREATE INDEX public_listings_status_fuel_type_idx ON public.public_listings USING btree (status, fuel_type);
CREATE INDEX public_listings_status_province_code_idx ON public.public_listings USING btree (status, province_code);
CREATE INDEX public_listings_status_vehicle_type_idx ON public.public_listings USING btree (status, vehicle_type);
CREATE INDEX public_listings_tenant_id_status_idx ON public.public_listings USING btree (tenant_id, status);
CREATE UNIQUE INDEX public_listings_vehicle_id_key ON public.public_listings USING btree (vehicle_id);
CREATE INDEX public_listings_weekday_price_idx ON public.public_listings USING btree (weekday_price);
CREATE INDEX receipt_attachments_receipt_id_idx ON public.receipt_attachments USING btree (receipt_id);
CREATE INDEX receipts_booking_id_idx ON public.receipts USING btree (booking_id);
CREATE INDEX receipts_category_id_idx ON public.receipts USING btree (category_id);
CREATE INDEX receipts_search_trgm_idx ON public.receipts USING gin (receipt_no gin_trgm_ops, reference_code gin_trgm_ops);
CREATE UNIQUE INDEX receipts_source_ref_uniq ON public.receipts USING btree (tenant_id, source, source_ref_id) WHERE ((source)::text <> 'manual'::text);
CREATE INDEX receipts_tenant_id_created_at_idx ON public.receipts USING btree (tenant_id, created_at);
CREATE INDEX receipts_tenant_id_status_idx ON public.receipts USING btree (tenant_id, status);
CREATE INDEX receipts_tenant_id_tenant_customer_id_idx ON public.receipts USING btree (tenant_id, tenant_customer_id);
CREATE INDEX receipts_tenant_occurred_idx ON public.receipts USING btree (tenant_id, occurred_at);
CREATE UNIQUE INDEX receipts_tenant_receipt_no_uniq ON public.receipts USING btree (tenant_id, receipt_no) WHERE (receipt_no IS NOT NULL);
CREATE INDEX receipts_tenant_vehicle_idx ON public.receipts USING btree (tenant_id, vehicle_id) WHERE (vehicle_id IS NOT NULL);
CREATE UNIQUE INDEX rental_policies_shop_default_key ON public.rental_policies USING btree (tenant_id) WHERE ((vehicle_id IS NULL) AND (vehicle_type IS NULL));
CREATE INDEX rental_policies_tenant_id_idx ON public.rental_policies USING btree (tenant_id);
CREATE UNIQUE INDEX rental_policies_type_default_key ON public.rental_policies USING btree (tenant_id, vehicle_type) WHERE ((vehicle_id IS NULL) AND (vehicle_type IS NOT NULL));
CREATE UNIQUE INDEX rental_policies_vehicle_id_key ON public.rental_policies USING btree (vehicle_id);
CREATE UNIQUE INDEX reviews_booking_id_key ON public.reviews USING btree (booking_id);
CREATE INDEX reviews_customer_id_idx ON public.reviews USING btree (customer_id);
CREATE INDEX reviews_tenant_id_status_idx ON public.reviews USING btree (tenant_id, status);
CREATE INDEX reviews_vehicle_id_status_created_at_idx ON public.reviews USING btree (vehicle_id, status, created_at);
CREATE INDEX role_permissions_permission_id_idx ON public.role_permissions USING btree (permission_id);
CREATE UNIQUE INDEX roles_scope_tenant_id_key_key ON public.roles USING btree (scope, tenant_id, key);
CREATE INDEX roles_tenant_id_idx ON public.roles USING btree (tenant_id);
CREATE UNIQUE INDEX tenant_branches_id_tenant_id_key ON public.tenant_branches USING btree (id, tenant_id);
CREATE UNIQUE INDEX tenant_branches_one_default_per_tenant ON public.tenant_branches USING btree (tenant_id) WHERE ((is_default = true) AND (deleted_at IS NULL));
CREATE INDEX tenant_branches_province_code_idx ON public.tenant_branches USING btree (province_code);
CREATE UNIQUE INDEX tenant_branches_tenant_id_code_key ON public.tenant_branches USING btree (tenant_id, code);
CREATE INDEX tenant_branches_tenant_id_is_default_idx ON public.tenant_branches USING btree (tenant_id, is_default);
CREATE INDEX tenant_branches_tenant_id_status_idx ON public.tenant_branches USING btree (tenant_id, status);
CREATE UNIQUE INDEX tenant_customer_documents_object_key_key ON public.tenant_customer_documents USING btree (object_key);
CREATE INDEX tenant_customer_documents_tenant_customer_status_idx ON public.tenant_customer_documents USING btree (tenant_id, tenant_customer_id, status);
CREATE INDEX tenant_customer_documents_verify_idx ON public.tenant_customer_documents USING btree (tenant_id, tenant_customer_id, document_type) WHERE ((deleted_at IS NULL) AND ((status)::text = 'ready'::text));
CREATE INDEX tenant_customer_notes_tenant_customer_created_idx ON public.tenant_customer_notes USING btree (tenant_id, tenant_customer_id, created_at);
CREATE INDEX tenant_customers_customer_user_id_idx ON public.tenant_customers USING btree (customer_user_id);
CREATE INDEX tenant_customers_full_name_trgm_idx ON public.tenant_customers USING gin (full_name gin_trgm_ops);
CREATE UNIQUE INDEX tenant_customers_id_tenant_id_key ON public.tenant_customers USING btree (id, tenant_id);
CREATE INDEX tenant_customers_tenant_id_archived_at_idx ON public.tenant_customers USING btree (tenant_id, archived_at);
CREATE INDEX tenant_customers_tenant_id_full_name_idx ON public.tenant_customers USING btree (tenant_id, full_name);
CREATE UNIQUE INDEX tenant_customers_tenant_id_normalized_phone_key ON public.tenant_customers USING btree (tenant_id, normalized_phone);
CREATE INDEX tenant_customers_tenant_id_risk_level_idx ON public.tenant_customers USING btree (tenant_id, risk_level);
CREATE INDEX tenant_documents_tenant_id_status_idx ON public.tenant_documents USING btree (tenant_id, status);
CREATE INDEX tenant_invites_tenant_id_status_idx ON public.tenant_invites USING btree (tenant_id, status);
CREATE UNIQUE INDEX tenant_invites_token_hash_key ON public.tenant_invites USING btree (token_hash);
CREATE INDEX tenant_memberships_tenant_id_role_key_idx ON public.tenant_memberships USING btree (tenant_id, role_key);
CREATE UNIQUE INDEX tenant_memberships_tenant_id_user_id_key ON public.tenant_memberships USING btree (tenant_id, user_id);
CREATE INDEX tenant_memberships_user_id_idx ON public.tenant_memberships USING btree (user_id);
CREATE INDEX tenant_profiles_province_code_idx ON public.tenant_profiles USING btree (province_code);
CREATE INDEX tenant_subscriptions_tenant_id_created_at_idx ON public.tenant_subscriptions USING btree (tenant_id, created_at);
CREATE INDEX tenant_subscriptions_tenant_id_ends_at_idx ON public.tenant_subscriptions USING btree (tenant_id, ends_at);
CREATE UNIQUE INDEX tenants_code_key ON public.tenants USING btree (code);
CREATE INDEX tenants_owner_user_id_idx ON public.tenants USING btree (owner_user_id);
CREATE UNIQUE INDEX tenants_slug_key ON public.tenants USING btree (slug);
CREATE INDEX tenants_status_idx ON public.tenants USING btree (status);
CREATE INDEX tenants_tenant_type_idx ON public.tenants USING btree (tenant_type);
CREATE UNIQUE INDEX user_identities_provider_provider_user_id_key ON public.user_identities USING btree (provider, provider_user_id);
CREATE INDEX user_identities_user_id_idx ON public.user_identities USING btree (user_id);
CREATE INDEX users_created_at_idx ON public.users USING btree (created_at);
CREATE INDEX users_display_name_trgm_idx ON public.users USING gin (display_name gin_trgm_ops);
CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);
CREATE UNIQUE INDEX users_firebase_uid_key ON public.users USING btree (firebase_uid);
CREATE UNIQUE INDEX users_phone_key ON public.users USING btree (phone);
CREATE INDEX users_status_idx ON public.users USING btree (status);
CREATE INDEX vehicle_blocks_tenant_id_start_at_idx ON public.vehicle_blocks USING btree (tenant_id, start_at);
CREATE INDEX vehicle_blocks_tenant_id_vehicle_id_start_at_idx ON public.vehicle_blocks USING btree (tenant_id, vehicle_id, start_at);
CREATE INDEX vehicle_daily_prices_tenant_id_vehicle_id_date_idx ON public.vehicle_daily_prices USING btree (tenant_id, vehicle_id, date);
CREATE UNIQUE INDEX vehicle_daily_prices_vehicle_id_date_key ON public.vehicle_daily_prices USING btree (vehicle_id, date);
CREATE UNIQUE INDEX vehicle_document_ocr_jobs_one_processing_key ON public.vehicle_document_ocr_jobs USING btree (document_id) WHERE ((status)::text = 'processing'::text);
CREATE INDEX vehicle_document_ocr_jobs_tenant_id_vehicle_id_document_id_crea ON public.vehicle_document_ocr_jobs USING btree (tenant_id, vehicle_id, document_id, created_at);
CREATE UNIQUE INDEX vehicle_document_versions_document_id_version_key ON public.vehicle_document_versions USING btree (document_id, version);
CREATE UNIQUE INDEX vehicle_document_versions_id_document_id_key ON public.vehicle_document_versions USING btree (id, document_id);
CREATE UNIQUE INDEX vehicle_document_versions_private_file_id_key ON public.vehicle_document_versions USING btree (private_file_id);
CREATE INDEX vehicle_document_versions_tenant_id_vehicle_id_idx ON public.vehicle_document_versions USING btree (tenant_id, vehicle_id);
CREATE UNIQUE INDEX vehicle_documents_active_version_id_key ON public.vehicle_documents USING btree (active_version_id);
CREATE UNIQUE INDEX vehicle_documents_id_vehicle_id_key ON public.vehicle_documents USING btree (id, vehicle_id);
CREATE UNIQUE INDEX vehicle_documents_one_active_per_type_key ON public.vehicle_documents USING btree (vehicle_id, type) WHERE ((archived_at IS NULL) AND ((type)::text <> 'other'::text));
CREATE INDEX vehicle_documents_tenant_id_vehicle_id_type_idx ON public.vehicle_documents USING btree (tenant_id, vehicle_id, type);
CREATE UNIQUE INDEX vehicle_features_vehicle_id_feature_key_key ON public.vehicle_features USING btree (vehicle_id, feature_key);
CREATE UNIQUE INDEX vehicle_handover_photos_handover_id_slot_key ON public.vehicle_handover_photos USING btree (handover_id, slot);
CREATE UNIQUE INDEX vehicle_handover_photos_private_file_id_key ON public.vehicle_handover_photos USING btree (private_file_id);
CREATE INDEX vehicle_handover_photos_tenant_id_handover_id_idx ON public.vehicle_handover_photos USING btree (tenant_id, handover_id);
CREATE UNIQUE INDEX vehicle_handovers_id_tenant_id_vehicle_id_key ON public.vehicle_handovers USING btree (id, tenant_id, vehicle_id);
CREATE INDEX vehicle_handovers_missing_odometer_idx ON public.vehicle_handovers USING btree (tenant_id, confirmed_at) WHERE (odometer_missing = true);
CREATE UNIQUE INDEX vehicle_handovers_one_active_per_type_key ON public.vehicle_handovers USING btree (booking_id, type) WHERE ((status)::text <> 'canceled'::text);
CREATE INDEX vehicle_handovers_tenant_id_booking_id_idx ON public.vehicle_handovers USING btree (tenant_id, booking_id);
CREATE INDEX vehicle_handovers_tenant_id_vehicle_id_confirmed_at_idx ON public.vehicle_handovers USING btree (tenant_id, vehicle_id, confirmed_at);
CREATE INDEX vehicle_images_vehicle_id_sort_order_idx ON public.vehicle_images USING btree (vehicle_id, sort_order);
CREATE UNIQUE INDEX vehicle_maintenance_attachments_private_file_id_key ON public.vehicle_maintenance_attachments USING btree (private_file_id);
CREATE INDEX vehicle_maintenance_attachments_tenant_id_record_id_idx ON public.vehicle_maintenance_attachments USING btree (tenant_id, record_id);
CREATE INDEX vehicle_maintenance_profiles_tenant_id_current_odometer_km_idx ON public.vehicle_maintenance_profiles USING btree (tenant_id, current_odometer_km);
CREATE UNIQUE INDEX vehicle_maintenance_records_id_vehicle_id_key ON public.vehicle_maintenance_records USING btree (id, vehicle_id);
CREATE INDEX vehicle_maintenance_records_tenant_id_status_planned_start_at_i ON public.vehicle_maintenance_records USING btree (tenant_id, status, planned_start_at);
CREATE INDEX vehicle_maintenance_records_tenant_id_vehicle_id_completed_at_i ON public.vehicle_maintenance_records USING btree (tenant_id, vehicle_id, completed_at);
CREATE UNIQUE INDEX vehicle_occupancies_source_type_source_id_key ON public.vehicle_occupancies USING btree (source_type, source_id);
CREATE INDEX vehicle_occupancies_tenant_id_idx ON public.vehicle_occupancies USING btree (tenant_id);
CREATE INDEX vehicle_occupancies_vehicle_id_start_at_end_at_idx ON public.vehicle_occupancies USING btree (vehicle_id, start_at, end_at);
CREATE UNIQUE INDEX vehicle_odometer_readings_id_tenant_id_vehicle_id_key ON public.vehicle_odometer_readings USING btree (id, tenant_id, vehicle_id);
CREATE INDEX vehicle_odometer_readings_tenant_id_vehicle_id_recorded_at_idx ON public.vehicle_odometer_readings USING btree (tenant_id, vehicle_id, recorded_at);
CREATE UNIQUE INDEX vehicle_private_files_id_tenant_id_vehicle_id_key ON public.vehicle_private_files USING btree (id, tenant_id, vehicle_id);
CREATE UNIQUE INDEX vehicle_private_files_object_key_key ON public.vehicle_private_files USING btree (object_key);
CREATE INDEX vehicle_private_files_tenant_id_vehicle_id_purpose_status_idx ON public.vehicle_private_files USING btree (tenant_id, vehicle_id, purpose, status);
CREATE INDEX vehicle_source_details_tenant_id_source_type_idx ON public.vehicle_source_details USING btree (tenant_id, source_type);
CREATE UNIQUE INDEX vehicle_source_details_vehicle_id_key ON public.vehicle_source_details USING btree (vehicle_id);
CREATE INDEX vehicles_brand_model_idx ON public.vehicles USING btree (brand, model);
CREATE INDEX vehicles_created_at_idx ON public.vehicles USING btree (created_at);
CREATE UNIQUE INDEX vehicles_id_tenant_id_key ON public.vehicles USING btree (id, tenant_id);
CREATE INDEX vehicles_public_status_created_at_idx ON public.vehicles USING btree (public_status, created_at);
CREATE INDEX vehicles_search_trgm_idx ON public.vehicles USING gin (name gin_trgm_ops, plate_number gin_trgm_ops, code gin_trgm_ops);
CREATE INDEX vehicles_service_types_idx ON public.vehicles USING gin (service_types);
CREATE UNIQUE INDEX vehicles_tenant_id_code_key ON public.vehicles USING btree (tenant_id, code);
CREATE INDEX vehicles_tenant_id_operation_status_idx ON public.vehicles USING btree (tenant_id, operation_status);
CREATE INDEX vehicles_tenant_id_public_status_idx ON public.vehicles USING btree (tenant_id, public_status);
CREATE INDEX vehicles_tenant_id_source_type_idx ON public.vehicles USING btree (tenant_id, source_type);
CREATE INDEX vehicles_vehicle_type_idx ON public.vehicles USING btree (vehicle_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Unique constraint
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."booking_deposit_settlements" ADD CONSTRAINT "booking_deposit_settlements_booking_id_key" UNIQUE (booking_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Khoá ngoại — gồm cả khoá tổ hợp (id, tenant_id) chặn trỏ chéo gian hàng
-- ═══════════════════════════════════════════════════════════════════════════

-- AddForeignKey
ALTER TABLE "public"."admin_notes" ADD CONSTRAINT "admin_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_notes" ADD CONSTRAINT "admin_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_logs" ADD CONSTRAINT "approval_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_logs" ADD CONSTRAINT "approval_logs_approval_task_id_fkey" FOREIGN KEY ("approval_task_id") REFERENCES "public"."approval_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_tasks" ADD CONSTRAINT "approval_tasks_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_tasks" ADD CONSTRAINT "approval_tasks_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."approval_tasks" ADD CONSTRAINT "approval_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_deposit_settlements" ADD CONSTRAINT "booking_deposit_settlements_booking_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."booking_deposit_settlements" ADD CONSTRAINT "booking_deposit_settlements_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_tenant_customer_fkey" FOREIGN KEY ("tenant_customer_id", "tenant_id") REFERENCES "public"."tenant_customers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."booking_surcharges" ADD CONSTRAINT "booking_surcharges_booking_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."booking_surcharges" ADD CONSTRAINT "booking_surcharges_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_driver_id_tenant_id_fkey" FOREIGN KEY ("driver_id", "tenant_id") REFERENCES "public"."drivers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_tenant_customer_fkey" FOREIGN KEY ("tenant_customer_id", "tenant_id") REFERENCES "public"."tenant_customers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_attachments" ADD CONSTRAINT "chat_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."finance_categories" ADD CONSTRAINT "finance_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."message_outbox" ADD CONSTRAINT "message_outbox_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."phone_verifications" ADD CONSTRAINT "phone_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_memberships" ADD CONSTRAINT "platform_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_memberships" ADD CONSTRAINT "platform_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."province_aliases" ADD CONSTRAINT "province_aliases_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."public_listings" ADD CONSTRAINT "public_listings_branch_id_tenant_id_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "public"."tenant_branches"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."public_listings" ADD CONSTRAINT "public_listings_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."public_listings" ADD CONSTRAINT "public_listings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."public_listings" ADD CONSTRAINT "public_listings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."receipt_attachments" ADD CONSTRAINT "receipt_attachments_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_tenant_customer_fkey" FOREIGN KEY ("tenant_customer_id", "tenant_id") REFERENCES "public"."tenant_customers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_branches" ADD CONSTRAINT "tenant_branches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_branches" ADD CONSTRAINT "tenant_branches_province_code_fkey" FOREIGN KEY ("province_code") REFERENCES "public"."provinces"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_branches" ADD CONSTRAINT "tenant_branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_customer_fkey" FOREIGN KEY ("tenant_customer_id", "tenant_id") REFERENCES "public"."tenant_customers"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_customer_notes" ADD CONSTRAINT "tenant_customer_notes_customer_fkey" FOREIGN KEY ("tenant_customer_id", "tenant_id") REFERENCES "public"."tenant_customers"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_customer_notes" ADD CONSTRAINT "tenant_customer_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_documents" ADD CONSTRAINT "tenant_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_documents" ADD CONSTRAINT "tenant_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_documents" ADD CONSTRAINT "tenant_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_invites" ADD CONSTRAINT "tenant_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_invites" ADD CONSTRAINT "tenant_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_invites" ADD CONSTRAINT "tenant_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_profiles" ADD CONSTRAINT "tenant_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenants" ADD CONSTRAINT "tenants_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_identities" ADD CONSTRAINT "user_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_daily_prices" ADD CONSTRAINT "vehicle_daily_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_daily_prices" ADD CONSTRAINT "vehicle_daily_prices_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vehicle_document_ocr_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."vehicle_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vehicle_document_ocr_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vehicle_document_ocr_jobs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vehicle_document_ocr_jobs_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vehicle_document_ocr_jobs_version_document_fkey" FOREIGN KEY ("document_version_id", "document_id") REFERENCES "public"."vehicle_document_versions"("id", "document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."vehicle_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_document_vehicle_fkey" FOREIGN KEY ("document_id", "vehicle_id") REFERENCES "public"."vehicle_documents"("id", "vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_file_owner_fkey" FOREIGN KEY ("private_file_id", "tenant_id", "vehicle_id") REFERENCES "public"."vehicle_private_files"("id", "tenant_id", "vehicle_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_private_file_id_fkey" FOREIGN KEY ("private_file_id") REFERENCES "public"."vehicle_private_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vehicle_document_versions_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vehicle_documents_active_version_fkey" FOREIGN KEY ("active_version_id", "id") REFERENCES "public"."vehicle_document_versions"("id", "document_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vehicle_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_features" ADD CONSTRAINT "vehicle_features_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vehicle_handover_photos_file_owner_fkey" FOREIGN KEY ("private_file_id", "tenant_id", "vehicle_id") REFERENCES "public"."vehicle_private_files"("id", "tenant_id", "vehicle_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vehicle_handover_photos_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "public"."vehicle_handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vehicle_handover_photos_handover_owner_fkey" FOREIGN KEY ("handover_id", "tenant_id", "vehicle_id") REFERENCES "public"."vehicle_handovers"("id", "tenant_id", "vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vehicle_handover_photos_private_file_id_fkey" FOREIGN KEY ("private_file_id") REFERENCES "public"."vehicle_private_files"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vehicle_handover_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vehicle_handover_photos_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_booking_owner_fkey" FOREIGN KEY ("booking_id", "tenant_id", "vehicle_id") REFERENCES "public"."bookings"("id", "tenant_id", "vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_odometer_reading_fkey" FOREIGN KEY ("odometer_reading_id", "tenant_id", "vehicle_id") REFERENCES "public"."vehicle_odometer_readings"("id", "tenant_id", "vehicle_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_images" ADD CONSTRAINT "vehicle_images_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_attachments" ADD CONSTRAINT "vehicle_maintenance_attachments_file_owner_fkey" FOREIGN KEY ("private_file_id", "tenant_id", "vehicle_id") REFERENCES "public"."vehicle_private_files"("id", "tenant_id", "vehicle_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_attachments" ADD CONSTRAINT "vehicle_maintenance_attachments_private_file_id_fkey" FOREIGN KEY ("private_file_id") REFERENCES "public"."vehicle_private_files"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_attachments" ADD CONSTRAINT "vehicle_maintenance_attachments_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."vehicle_maintenance_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_attachments" ADD CONSTRAINT "vehicle_maintenance_attachments_record_vehicle_fkey" FOREIGN KEY ("record_id", "vehicle_id") REFERENCES "public"."vehicle_maintenance_records"("id", "vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_attachments" ADD CONSTRAINT "vehicle_maintenance_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_attachments" ADD CONSTRAINT "vehicle_maintenance_attachments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vehicle_maintenance_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vehicle_maintenance_profiles_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vehicle_maintenance_profiles_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_occupancies" ADD CONSTRAINT "vehicle_occupancies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_occupancies" ADD CONSTRAINT "vehicle_occupancies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vehicle_odometer_readings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vehicle_odometer_readings_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vehicle_odometer_readings_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vehicle_private_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vehicle_private_files_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vehicle_private_files_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vehicle_source_details_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vehicle_source_details_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vehicle_source_details_vehicle_tenant_fkey" FOREIGN KEY ("vehicle_id", "tenant_id") REFERENCES "public"."vehicles"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_branch_id_tenant_id_fkey" FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "public"."tenant_branches"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. CHECK constraint — ADR 0005: status/enum do DB canh, không chỉ TypeScript
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."booking_deposit_settlements" ADD CONSTRAINT "booking_deposit_settlements_amounts_check" CHECK (((deposit_received >= 0) AND (surcharge_total >= 0) AND (refund_amount >= 0)));
ALTER TABLE "public"."booking_deposit_settlements" ADD CONSTRAINT "booking_deposit_settlements_method_check" CHECK (("refund_method" IN ('bank_transfer', 'cash', 'other')));
ALTER TABLE "public"."booking_deposit_settlements" ADD CONSTRAINT "booking_deposit_settlements_not_over_refund_check" CHECK ((refund_amount <= deposit_received));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_long_term_intent_check" CHECK ((("service_type" <> 'long_term') OR (long_term_package_months IS NOT NULL) OR ((pickup_at IS NOT NULL) AND (return_at IS NOT NULL))));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_long_term_package_check" CHECK (((long_term_package_months IS NULL) OR (("service_type" = 'long_term') AND ("long_term_package_months" IN (1, 2, 3, 6, 9, 12)))));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_period_valid" CHECK ((return_at > pickup_at));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_pickup_intent_check" CHECK ((((pickup_preference IS NULL) AND (requested_pickup_date IS NULL) AND (pickup_window_start_date IS NULL) AND (pickup_window_end_date IS NULL)) OR (("pickup_preference" = 'specific_date') AND (requested_pickup_date IS NOT NULL) AND (pickup_window_start_date IS NULL) AND (pickup_window_end_date IS NULL)) OR (("pickup_preference" = 'within_7_days') AND (requested_pickup_date IS NULL) AND (pickup_window_start_date IS NOT NULL) AND (pickup_window_end_date IS NOT NULL) AND (pickup_window_end_date >= pickup_window_start_date))));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_pickup_preference_check" CHECK (((pickup_preference IS NULL) OR (("service_type" = 'long_term') AND ("pickup_preference" IN ('within_7_days', 'specific_date')))));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_route_type_check" CHECK (((route_type IS NULL) OR ("route_type" IN ('in_city', 'inter_city', 'inter_city_one_way'))));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_route_type_service_check" CHECK (((route_type IS NULL) OR ("service_type" = 'with_driver')));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_schedule_presence_check" CHECK ((("service_type" = 'long_term') OR ((pickup_at IS NOT NULL) AND (return_at IS NOT NULL))));
ALTER TABLE "public"."booking_requests" ADD CONSTRAINT "booking_requests_service_type_check" CHECK (("service_type" IN ('self_drive', 'with_driver', 'long_term')));
ALTER TABLE "public"."booking_surcharges" ADD CONSTRAINT "booking_surcharges_amount_check" CHECK ((amount >= 0));
ALTER TABLE "public"."booking_surcharges" ADD CONSTRAINT "booking_surcharges_category_check" CHECK (("category" IN ('overtime', 'cleaning', 'damage', 'other')));
ALTER TABLE "public"."booking_surcharges" ADD CONSTRAINT "booking_surcharges_void_check" CHECK ((((voided_at IS NULL) AND (voided_by IS NULL)) OR ((voided_at IS NOT NULL) AND (voided_by IS NOT NULL))));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_long_term_package_check" CHECK (((long_term_package_months IS NULL) OR (("service_type" = 'long_term') AND ("long_term_package_months" IN (1, 2, 3, 6, 9, 12)))));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_period_valid" CHECK ((return_at > pickup_at));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_route_context_service_check" CHECK ((((route_type IS NULL) AND (pickup_address IS NULL) AND (destination IS NULL)) OR ("service_type" = 'with_driver')));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_route_type_check" CHECK (((route_type IS NULL) OR ("route_type" IN ('in_city', 'inter_city', 'inter_city_one_way'))));
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_service_type_check" CHECK (("service_type" IN ('self_drive', 'with_driver', 'long_term')));
ALTER TABLE "public"."catalog_items" ADD CONSTRAINT "catalog_items_label_not_blank" CHECK ((btrim((label)::text) <> ''::text));
ALTER TABLE "public"."catalog_items" ADD CONSTRAINT "catalog_items_type_check" CHECK (("type" IN ('vehicle_brand', 'body_type', 'fuel_type', 'vehicle_feature')));
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_driver_type_check" CHECK (("driver_type" IN ('staff', 'collaborator', 'temporary')));
ALTER TABLE "public"."drivers" ADD CONSTRAINT "drivers_status_check" CHECK (("status" IN ('active', 'inactive')));
ALTER TABLE "public"."finance_categories" ADD CONSTRAINT "finance_categories_system_key_check" CHECK (((system_key IS NULL) OR (is_system = true)));
ALTER TABLE "public"."finance_categories" ADD CONSTRAINT "finance_categories_type_check" CHECK (("type" IN ('income', 'expense')));
ALTER TABLE "public"."marketplace_banners" ADD CONSTRAINT "marketplace_banners_alt_not_blank" CHECK ((btrim((alt_text)::text) <> ''::text));
ALTER TABLE "public"."marketplace_banners" ADD CONSTRAINT "marketplace_banners_schedule_check" CHECK (((starts_at IS NULL) OR (ends_at IS NULL) OR (ends_at > starts_at)));
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_amount_check" CHECK ((amount >= 0));
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_kind_check" CHECK (("kind" IN ('rental', 'deposit')));
ALTER TABLE "public"."province_aliases" ADD CONSTRAINT "province_aliases_type_check" CHECK (("alias_type" IN ('canonical_name', 'legacy_name', 'display_variant')));
ALTER TABLE "public"."provinces" ADD CONSTRAINT "provinces_administrative_type_check" CHECK (("administrative_type" IN ('province', 'municipality')));
ALTER TABLE "public"."public_listings" ADD CONSTRAINT "public_listings_service_types_not_empty_check" CHECK ((cardinality(service_types) >= 1));
ALTER TABLE "public"."public_listings" ADD CONSTRAINT "public_listings_service_types_subset_check" CHECK ((service_types <@ ARRAY['self_drive'::character varying(50), 'with_driver'::character varying(50), 'long_term'::character varying(50)]));
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_amount_check" CHECK ((amount >= 0));
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_source_check" CHECK (("source" IN ('manual', 'payment', 'deposit', 'deposit_refund', 'maintenance')));
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_source_ref_check" CHECK (((("source" = 'manual') AND (source_ref_id IS NULL)) OR (("source" <> 'manual') AND (source_ref_id IS NOT NULL))));
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_status_check" CHECK (("status" IN ('draft', 'pending_approval', 'approved', 'cancelled')));
ALTER TABLE "public"."receipts" ADD CONSTRAINT "receipts_type_check" CHECK (("type" IN ('income', 'expense')));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_collateral_asset_types_check" CHECK ((collateral_asset_types <@ ARRAY['vehicle_registration'::character varying(50), 'motorbike'::character varying(50), 'passport'::character varying(50)]));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_collateral_mode_check" CHECK (("collateral_mode" IN ('cash', 'asset', 'none')));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_collateral_scope_check" CHECK (
CASE collateral_mode
    WHEN 'cash'::text THEN ((deposit_amount > 0) AND (cardinality(collateral_asset_types) = 0))
    WHEN 'asset'::text THEN ((deposit_amount = 0) AND (cardinality(collateral_asset_types) > 0))
    WHEN 'none'::text THEN ((deposit_amount = 0) AND (cardinality(collateral_asset_types) = 0))
    ELSE NULL::boolean
END);
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_deposit_nonnegative" CHECK ((deposit_amount >= 0));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_grace_nonnegative" CHECK (((overtime_grace_minutes IS NULL) OR (overtime_grace_minutes >= 0)));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_overtime_fee_nonnegative" CHECK (((overtime_fee_per_hour IS NULL) OR (overtime_fee_per_hour >= 0)));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_radius_positive" CHECK (((delivery_max_radius_km IS NULL) OR (delivery_max_radius_km > 0)));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_rounding_positive" CHECK (((overtime_rounding_minutes IS NULL) OR (overtime_rounding_minutes > 0)));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_vehicle_type_check" CHECK (((vehicle_type IS NULL) OR ("vehicle_type" IN ('car', 'motorbike'))));
ALTER TABLE "public"."rental_policies" ADD CONSTRAINT "rental_policies_vehicle_type_scope_check" CHECK (((vehicle_type IS NULL) OR (vehicle_id IS NULL)));
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_rating_range" CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_status_valid" CHECK (("status" IN ('published', 'hidden')));
ALTER TABLE "public"."tenant_branches" ADD CONSTRAINT "tenant_branches_default_is_active_check" CHECK (((is_default = false) OR ("status" = 'active')));
ALTER TABLE "public"."tenant_branches" ADD CONSTRAINT "tenant_branches_status_check" CHECK (("status" IN ('active', 'inactive')));
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_custom_name_check" CHECK (((custom_type_name IS NULL) OR ("document_type" = 'other')));
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_size_check" CHECK ((size_bytes > 0));
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_status_check" CHECK (("status" IN ('pending', 'ready', 'deleted')));
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_type_check" CHECK (("document_type" IN ('citizen_id', 'driver_licence', 'other')));
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_verify_method_check" CHECK (((verify_method IS NULL) OR ("verify_method" IN ('vneid', 'in_person'))));
ALTER TABLE "public"."tenant_customer_documents" ADD CONSTRAINT "tenant_customer_documents_verify_scope_check" CHECK ((((verified_at IS NULL) AND (verified_by_user_id IS NULL) AND (verify_method IS NULL)) OR ((verified_at IS NOT NULL) AND (verified_by_user_id IS NOT NULL) AND (verify_method IS NOT NULL))));
ALTER TABLE "public"."tenant_customer_notes" ADD CONSTRAINT "tenant_customer_notes_body_not_blank_check" CHECK ((btrim(body) <> ''::text));
ALTER TABLE "public"."tenant_customer_notes" ADD CONSTRAINT "tenant_customer_notes_note_type_check" CHECK (("note_type" IN ('general', 'preference', 'risk')));
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_normalized_phone_check" CHECK (((normalized_phone)::text ~ '^84[0-9]{8,12}$'::text));
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_risk_level_check" CHECK (("risk_level" IN ('normal', 'watchlist', 'blocked')));
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_risk_reason_required_check" CHECK ((("risk_level" = 'normal') OR (btrim(COALESCE(risk_reason, ''::text)) <> ''::text)));
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_source_check" CHECK (("source" IN ('manual', 'booking', 'marketplace')));
ALTER TABLE "public"."tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_ends_after_starts" CHECK ((ends_at > starts_at));
ALTER TABLE "public"."vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_range_positive" CHECK ((end_at > start_at));
ALTER TABLE "public"."vehicle_blocks" ADD CONSTRAINT "vehicle_blocks_reason_check" CHECK (("reason" IN ('unplanned_maintenance', 'repair', 'internal_use', 'not_for_rent', 'other')));
ALTER TABLE "public"."vehicle_daily_prices" ADD CONSTRAINT "vdp_at_least_one_price" CHECK (((daily_price IS NOT NULL) OR (hourly_price IS NOT NULL)));
ALTER TABLE "public"."vehicle_daily_prices" ADD CONSTRAINT "vdp_daily_non_negative" CHECK (((daily_price IS NULL) OR (daily_price >= 0)));
ALTER TABLE "public"."vehicle_daily_prices" ADD CONSTRAINT "vdp_hourly_non_negative" CHECK (((hourly_price IS NULL) OR (hourly_price >= 0)));
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vdocr_confidence_range" CHECK (((confidence IS NULL) OR ((confidence >= 0) AND (confidence <= 100))));
ALTER TABLE "public"."vehicle_document_ocr_jobs" ADD CONSTRAINT "vdocr_status_valid" CHECK (("status" IN ('processing', 'needs_review', 'unreadable', 'failed', 'reviewed')));
ALTER TABLE "public"."vehicle_document_versions" ADD CONSTRAINT "vdocver_version_positive" CHECK ((version > 0));
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vdoc_custom_name_scoped" CHECK ((("type" = 'other') OR (custom_type_name IS NULL)));
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vdoc_date_order" CHECK (((issued_at IS NULL) OR (expires_at IS NULL) OR (expires_at >= issued_at)));
ALTER TABLE "public"."vehicle_documents" ADD CONSTRAINT "vdoc_type_valid" CHECK (("type" IN ('registration', 'inspection', 'insurance', 'other')));
ALTER TABLE "public"."vehicle_handover_photos" ADD CONSTRAINT "vhp_slot_valid" CHECK (("slot" IN ('front', 'rear', 'left', 'right', 'odometer')));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vehicle_handovers_condition_check" CHECK (((condition IS NULL) OR ("condition" IN ('normal', 'attention'))));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_battery_range" CHECK (((battery_percent IS NULL) OR ((battery_percent >= 0) AND (battery_percent <= 100))));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_confirmed_has_actor" CHECK ((("status" <> 'confirmed') OR ((confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL))));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_energy_exclusive" CHECK (((fuel_level IS NULL) OR (battery_percent IS NULL)));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_fuel_level_valid" CHECK (((fuel_level IS NULL) OR ("fuel_level" IN ('full', 'three_quarter', 'half', 'quarter', 'empty'))));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_km_range" CHECK (((odometer_km IS NULL) OR ((odometer_km >= 0) AND (odometer_km <= 2000000))));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_missing_km_consistent" CHECK ((("status" <> 'confirmed') OR (odometer_missing = (odometer_km IS NULL))));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_missing_km_has_no_km" CHECK (((odometer_missing = false) OR (odometer_km IS NULL)));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_reading_requires_confirmed" CHECK (((odometer_reading_id IS NULL) OR ("status" = 'confirmed')));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_status_valid" CHECK (("status" IN ('draft', 'ready', 'confirmed', 'canceled')));
ALTER TABLE "public"."vehicle_handovers" ADD CONSTRAINT "vh_type_valid" CHECK (("type" IN ('pickup', 'return')));
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vmp_current_km_range" CHECK (((current_odometer_km IS NULL) OR ((current_odometer_km >= 0) AND (current_odometer_km <= 2000000))));
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vmp_interval_range" CHECK (((oil_change_interval_km IS NULL) OR ((oil_change_interval_km > 0) AND (oil_change_interval_km <= 1000000))));
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vmp_last_service_km_range" CHECK (((last_service_km IS NULL) OR ((last_service_km >= 0) AND (last_service_km <= 2000000))));
ALTER TABLE "public"."vehicle_maintenance_profiles" ADD CONSTRAINT "vmp_source_valid" CHECK (((current_odometer_source IS NULL) OR ("current_odometer_source" IN ('manual_correction', 'maintenance', 'booking_pickup', 'booking_return', 'import'))));
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vmr_cost_non_negative" CHECK (((cost IS NULL) OR (cost >= 0)));
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vmr_custom_name_scoped" CHECK ((("type" = 'other') OR (custom_type_name IS NULL)));
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vmr_km_range" CHECK (((odometer_km IS NULL) OR ((odometer_km >= 0) AND (odometer_km <= 2000000))));
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vmr_planned_order" CHECK (((planned_start_at IS NULL) OR (planned_end_at IS NULL) OR (planned_end_at > planned_start_at)));
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vmr_status_valid" CHECK (("status" IN ('scheduled', 'in_progress', 'completed', 'canceled')));
ALTER TABLE "public"."vehicle_maintenance_records" ADD CONSTRAINT "vmr_type_valid" CHECK (("type" IN ('oil_change', 'periodic_service', 'repair', 'tire', 'battery', 'other')));
ALTER TABLE "public"."vehicle_occupancies" ADD CONSTRAINT "vehicle_occupancies_period_valid" CHECK ((end_at > start_at));
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vor_km_range" CHECK (((odometer_km >= 0) AND (odometer_km <= 2000000)));
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vor_manual_requires_reason" CHECK ((("source" <> 'manual_correction') OR ((reason IS NOT NULL) AND (length(btrim(reason)) > 0))));
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vor_previous_km_range" CHECK (((previous_km IS NULL) OR ((previous_km >= 0) AND (previous_km <= 2000000))));
ALTER TABLE "public"."vehicle_odometer_readings" ADD CONSTRAINT "vor_source_valid" CHECK (("source" IN ('manual_correction', 'maintenance', 'booking_pickup', 'booking_return', 'import')));
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vpf_mime_valid" CHECK (("mime_type" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')));
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vpf_purpose_valid" CHECK (("purpose" IN ('source_contract', 'vehicle_document', 'maintenance_record', 'handover_photo')));
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vpf_size_range" CHECK (((size_bytes > 0) AND (size_bytes <= 10485760)));
ALTER TABLE "public"."vehicle_private_files" ADD CONSTRAINT "vpf_status_valid" CHECK (("status" IN ('pending', 'ready', 'deleted')));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_commission_percent_range" CHECK (((commission_percent IS NULL) OR ((commission_percent >= 0) AND (commission_percent <= 100))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_contract_dates_scoped" CHECK ((("source_type" <> 'owned') OR ((start_date IS NULL) AND (end_date IS NULL))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_date_order" CHECK (((start_date IS NULL) OR (end_date IS NULL) OR (end_date >= start_date)));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_financed_fields_scoped" CHECK ((("source_type" = 'financed') OR ((bank_name IS NULL) AND (contract_number IS NULL) AND (original_principal IS NULL) AND (monthly_principal IS NULL) AND (monthly_interest IS NULL) AND (interest_rate_percent IS NULL) AND (term_months IS NULL) AND (interest_method IS NULL))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_interest_method_valid" CHECK (((interest_method IS NULL) OR ("interest_method" IN ('reducing_balance', 'flat'))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_interest_rate_range" CHECK (((interest_rate_percent IS NULL) OR ((interest_rate_percent >= 0) AND (interest_rate_percent <= 100))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_money_nonnegative" CHECK ((((purchase_price IS NULL) OR (purchase_price >= 0)) AND ((original_principal IS NULL) OR (original_principal >= 0)) AND ((monthly_principal IS NULL) OR (monthly_principal >= 0)) AND ((monthly_interest IS NULL) OR (monthly_interest >= 0)) AND ((monthly_rent IS NULL) OR (monthly_rent >= 0))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_owned_fields_scoped" CHECK ((("source_type" = 'owned') OR ((purchase_date IS NULL) AND (purchase_price IS NULL) AND (purchase_place IS NULL))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_owner_fields_scoped" CHECK ((("source_type" IN ('rented', 'partnership')) OR ((owner_name IS NULL) AND (owner_phone IS NULL) AND (owner_email IS NULL))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_partnership_fields_scoped" CHECK ((("source_type" = 'partnership') OR (commission_percent IS NULL)));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_payment_day_range" CHECK (((payment_day IS NULL) OR ((payment_day >= 1) AND (payment_day <= 31))));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_payment_day_scoped" CHECK ((("source_type" IN ('financed', 'rented')) OR (payment_day IS NULL)));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_rented_fields_scoped" CHECK ((("source_type" = 'rented') OR (monthly_rent IS NULL)));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_source_type_valid" CHECK (("source_type" IN ('owned', 'financed', 'rented', 'partnership')));
ALTER TABLE "public"."vehicle_source_details" ADD CONSTRAINT "vsd_term_months_positive" CHECK (((term_months IS NULL) OR (term_months > 0)));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_dimensions_positive_check" CHECK ((((length_mm IS NULL) OR (length_mm > 0)) AND ((width_mm IS NULL) OR (width_mm > 0)) AND ((height_mm IS NULL) OR (height_mm > 0)) AND ((curb_weight_kg IS NULL) OR (curb_weight_kg > 0))));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_discount_percent_check" CHECK (((discount_percent IS NULL) OR ((discount_percent >= 0) AND (discount_percent <= 100))));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_engine_specs_positive_check" CHECK ((((engine_displacement_cc IS NULL) OR (engine_displacement_cc > 0)) AND ((horsepower_hp IS NULL) OR (horsepower_hp > 0))));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_fuel_consumption_nonnegative_check" CHECK ((((fuel_consumption_city IS NULL) OR (fuel_consumption_city >= 0)) AND ((fuel_consumption_highway IS NULL) OR (fuel_consumption_highway >= 0)) AND ((fuel_consumption_combined IS NULL) OR (fuel_consumption_combined >= 0))));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_monthly_price_non_negative_check" CHECK (((monthly_price IS NULL) OR (monthly_price >= 0)));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_service_types_not_empty_check" CHECK ((cardinality(service_types) >= 1));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_service_types_subset_check" CHECK ((service_types <@ ARRAY['self_drive'::character varying(50), 'with_driver'::character varying(50), 'long_term'::character varying(50)]));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_source_type_check" CHECK (("source_type" IN ('owned', 'financed', 'rented', 'partnership')));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_transmission_check" CHECK (((transmission IS NULL) OR ("transmission" IN ('automatic', 'manual', 'cvt', 'dct', 'other'))));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_with_driver_daily_price_non_negative_check" CHECK (((with_driver_daily_price IS NULL) OR (with_driver_daily_price >= 0)));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_with_driver_inter_city_price_non_negative_check" CHECK (((with_driver_inter_city_price IS NULL) OR (with_driver_inter_city_price >= 0)));
ALTER TABLE "public"."vehicles" ADD CONSTRAINT "vehicles_with_driver_one_way_price_non_negative_check" CHECK (((with_driver_one_way_price IS NULL) OR (with_driver_one_way_price >= 0)));

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. EXCLUDE constraint — ADR 0006: chống trùng lịch ở tầng DB, không ở tầng app
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_driver_schedule_excl" EXCLUDE USING gist (driver_id WITH =, tstzrange(pickup_at, return_at) WITH &&) WHERE (((driver_id IS NOT NULL) AND ("status" IN ('reserved', 'confirmed', 'active')) AND (deleted_at IS NULL)));
ALTER TABLE "public"."vehicle_occupancies" ADD CONSTRAINT "vehicle_occupancies_no_overlap" EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Dữ liệu danh mục — phần seed KHÔNG sở hữu (seed giữ permission/role/tài khoản demo)
-- ═══════════════════════════════════════════════════════════════════════════

-- 34 đơn vị hành chính cấp tỉnh (QĐ 19/2025/QĐ-TTg, hiệu lực 01/07/2025).
-- ON CONFLICT: migration/seed chạy lại KHÔNG nhân bản và KHÔNG đè cờ hiển thị admin đã đổi.
INSERT INTO "provinces" ("code", "name", "administrative_type", "slug", "sort_order") VALUES
  ('01', 'Hà Nội', 'municipality', 'ha-noi', 1),
  ('04', 'Cao Bằng', 'province', 'cao-bang', 2),
  ('08', 'Tuyên Quang', 'province', 'tuyen-quang', 3),
  ('11', 'Điện Biên', 'province', 'dien-bien', 4),
  ('12', 'Lai Châu', 'province', 'lai-chau', 5),
  ('14', 'Sơn La', 'province', 'son-la', 6),
  ('15', 'Lào Cai', 'province', 'lao-cai', 7),
  ('19', 'Thái Nguyên', 'province', 'thai-nguyen', 8),
  ('20', 'Lạng Sơn', 'province', 'lang-son', 9),
  ('22', 'Quảng Ninh', 'province', 'quang-ninh', 10),
  ('24', 'Bắc Ninh', 'province', 'bac-ninh', 11),
  ('25', 'Phú Thọ', 'province', 'phu-tho', 12),
  ('31', 'Hải Phòng', 'municipality', 'hai-phong', 13),
  ('33', 'Hưng Yên', 'province', 'hung-yen', 14),
  ('37', 'Ninh Bình', 'province', 'ninh-binh', 15),
  ('38', 'Thanh Hóa', 'province', 'thanh-hoa', 16),
  ('40', 'Nghệ An', 'province', 'nghe-an', 17),
  ('42', 'Hà Tĩnh', 'province', 'ha-tinh', 18),
  ('44', 'Quảng Trị', 'province', 'quang-tri', 19),
  ('46', 'Huế', 'municipality', 'hue', 20),
  ('48', 'Đà Nẵng', 'municipality', 'da-nang', 21),
  ('51', 'Quảng Ngãi', 'province', 'quang-ngai', 22),
  ('52', 'Gia Lai', 'province', 'gia-lai', 23),
  ('56', 'Khánh Hòa', 'province', 'khanh-hoa', 24),
  ('66', 'Đắk Lắk', 'province', 'dak-lak', 25),
  ('68', 'Lâm Đồng', 'province', 'lam-dong', 26),
  ('75', 'Đồng Nai', 'province', 'dong-nai', 27),
  ('79', 'Hồ Chí Minh', 'municipality', 'ho-chi-minh', 28),
  ('80', 'Tây Ninh', 'province', 'tay-ninh', 29),
  ('82', 'Đồng Tháp', 'province', 'dong-thap', 30),
  ('86', 'Vĩnh Long', 'province', 'vinh-long', 31),
  ('91', 'An Giang', 'province', 'an-giang', 32),
  ('92', 'Cần Thơ', 'municipality', 'can-tho', 33),
  ('96', 'Cà Mau', 'province', 'ca-mau', 34)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "administrative_type" = EXCLUDED."administrative_type",
  "slug" = EXCLUDED."slug",
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = now();

-- Bí danh: tên tỉnh CŨ trước sáp nhập + các cách viết khác. `normalized_alias` là khoá tra cứu.
INSERT INTO "province_aliases" ("id", "province_code", "alias", "normalized_alias", "alias_type") VALUES
  ('01PROVALIAS000000000000001', '01', 'Hà Nội', 'ha noi', 'canonical_name'),
  ('01PROVALIAS000000000000002', '04', 'Cao Bằng', 'cao bang', 'canonical_name'),
  ('01PROVALIAS000000000000003', '08', 'Hà Giang', 'ha giang', 'legacy_name'),
  ('01PROVALIAS000000000000004', '08', 'Tuyên Quang', 'tuyen quang', 'canonical_name'),
  ('01PROVALIAS000000000000005', '11', 'Điện Biên', 'dien bien', 'canonical_name'),
  ('01PROVALIAS000000000000006', '12', 'Lai Châu', 'lai chau', 'canonical_name'),
  ('01PROVALIAS000000000000007', '14', 'Sơn La', 'son la', 'canonical_name'),
  ('01PROVALIAS000000000000008', '15', 'Lào Cai', 'lao cai', 'canonical_name'),
  ('01PROVALIAS000000000000009', '15', 'Yên Bái', 'yen bai', 'legacy_name'),
  ('01PROVALIAS000000000000010', '19', 'Bắc Cạn', 'bac can', 'legacy_name'),
  ('01PROVALIAS000000000000011', '19', 'Bắc Kạn', 'bac kan', 'legacy_name'),
  ('01PROVALIAS000000000000012', '19', 'Thái Nguyên', 'thai nguyen', 'canonical_name'),
  ('01PROVALIAS000000000000013', '20', 'Lạng Sơn', 'lang son', 'canonical_name'),
  ('01PROVALIAS000000000000014', '22', 'Quảng Ninh', 'quang ninh', 'canonical_name'),
  ('01PROVALIAS000000000000015', '24', 'Bắc Giang', 'bac giang', 'legacy_name'),
  ('01PROVALIAS000000000000016', '24', 'Bắc Ninh', 'bac ninh', 'canonical_name'),
  ('01PROVALIAS000000000000017', '25', 'Hòa Bình', 'hoa binh', 'legacy_name'),
  ('01PROVALIAS000000000000018', '25', 'Phú Thọ', 'phu tho', 'canonical_name'),
  ('01PROVALIAS000000000000019', '25', 'Vĩnh Phúc', 'vinh phuc', 'legacy_name'),
  ('01PROVALIAS000000000000020', '31', 'Hải Dương', 'hai duong', 'legacy_name'),
  ('01PROVALIAS000000000000021', '31', 'Hải Phòng', 'hai phong', 'canonical_name'),
  ('01PROVALIAS000000000000022', '33', 'Hưng Yên', 'hung yen', 'canonical_name'),
  ('01PROVALIAS000000000000023', '33', 'Thái Bình', 'thai binh', 'legacy_name'),
  ('01PROVALIAS000000000000024', '37', 'Hà Nam', 'ha nam', 'legacy_name'),
  ('01PROVALIAS000000000000025', '37', 'Nam Định', 'nam dinh', 'legacy_name'),
  ('01PROVALIAS000000000000026', '37', 'Ninh Bình', 'ninh binh', 'canonical_name'),
  ('01PROVALIAS000000000000027', '38', 'Thanh Hóa', 'thanh hoa', 'canonical_name'),
  ('01PROVALIAS000000000000028', '40', 'Nghệ An', 'nghe an', 'canonical_name'),
  ('01PROVALIAS000000000000029', '42', 'Hà Tĩnh', 'ha tinh', 'canonical_name'),
  ('01PROVALIAS000000000000030', '44', 'Quảng Bình', 'quang binh', 'legacy_name'),
  ('01PROVALIAS000000000000031', '44', 'Quảng Trị', 'quang tri', 'canonical_name'),
  ('01PROVALIAS000000000000032', '46', 'Huế', 'hue', 'canonical_name'),
  ('01PROVALIAS000000000000033', '46', 'Thừa Thiên Huế', 'thua thien hue', 'legacy_name'),
  ('01PROVALIAS000000000000034', '48', 'Đà Nẵng', 'da nang', 'canonical_name'),
  ('01PROVALIAS000000000000035', '48', 'Quảng Nam', 'quang nam', 'legacy_name'),
  ('01PROVALIAS000000000000036', '51', 'Kon Tum', 'kon tum', 'legacy_name'),
  ('01PROVALIAS000000000000037', '51', 'Quảng Ngãi', 'quang ngai', 'canonical_name'),
  ('01PROVALIAS000000000000038', '52', 'Bình Định', 'binh dinh', 'legacy_name'),
  ('01PROVALIAS000000000000039', '52', 'Gia Lai', 'gia lai', 'canonical_name'),
  ('01PROVALIAS000000000000040', '56', 'Khánh Hòa', 'khanh hoa', 'canonical_name'),
  ('01PROVALIAS000000000000041', '56', 'Ninh Thuận', 'ninh thuan', 'legacy_name'),
  ('01PROVALIAS000000000000042', '66', 'Đắk Lắk', 'dak lak', 'canonical_name'),
  ('01PROVALIAS000000000000043', '66', 'Phú Yên', 'phu yen', 'legacy_name'),
  ('01PROVALIAS000000000000044', '68', 'Bình Thuận', 'binh thuan', 'legacy_name'),
  ('01PROVALIAS000000000000045', '68', 'Đắk Nông', 'dak nong', 'legacy_name'),
  ('01PROVALIAS000000000000046', '68', 'Lâm Đồng', 'lam dong', 'canonical_name'),
  ('01PROVALIAS000000000000047', '75', 'Bình Phước', 'binh phuoc', 'legacy_name'),
  ('01PROVALIAS000000000000048', '75', 'Đồng Nai', 'dong nai', 'canonical_name'),
  ('01PROVALIAS000000000000049', '79', 'Bà Rịa - Vũng Tàu', 'ba ria vung tau', 'legacy_name'),
  ('01PROVALIAS000000000000050', '79', 'Bình Dương', 'binh duong', 'legacy_name'),
  ('01PROVALIAS000000000000051', '79', 'TP HCM', 'hcm', 'display_variant'),
  ('01PROVALIAS000000000000052', '79', 'Hồ Chí Minh', 'ho chi minh', 'canonical_name'),
  ('01PROVALIAS000000000000053', '79', 'Sài Gòn', 'sai gon', 'display_variant'),
  ('01PROVALIAS000000000000054', '80', 'Long An', 'long an', 'legacy_name'),
  ('01PROVALIAS000000000000055', '80', 'Tây Ninh', 'tay ninh', 'canonical_name'),
  ('01PROVALIAS000000000000056', '82', 'Đồng Tháp', 'dong thap', 'canonical_name'),
  ('01PROVALIAS000000000000057', '82', 'Tiền Giang', 'tien giang', 'legacy_name'),
  ('01PROVALIAS000000000000058', '86', 'Bến Tre', 'ben tre', 'legacy_name'),
  ('01PROVALIAS000000000000059', '86', 'Trà Vinh', 'tra vinh', 'legacy_name'),
  ('01PROVALIAS000000000000060', '86', 'Vĩnh Long', 'vinh long', 'canonical_name'),
  ('01PROVALIAS000000000000061', '91', 'An Giang', 'an giang', 'canonical_name'),
  ('01PROVALIAS000000000000062', '91', 'Kiên Giang', 'kien giang', 'legacy_name'),
  ('01PROVALIAS000000000000063', '92', 'Cần Thơ', 'can tho', 'canonical_name'),
  ('01PROVALIAS000000000000064', '92', 'Hậu Giang', 'hau giang', 'legacy_name'),
  ('01PROVALIAS000000000000065', '92', 'Sóc Trăng', 'soc trang', 'legacy_name'),
  ('01PROVALIAS000000000000066', '96', 'Bạc Liêu', 'bac lieu', 'legacy_name'),
  ('01PROVALIAS000000000000067', '96', 'Cà Mau', 'ca mau', 'canonical_name')
ON CONFLICT ("normalized_alias") DO NOTHING;


INSERT INTO "catalog_items" ("id", "type", "key", "label", "description", "icon_url", "sort_order", "updated_at") VALUES
    ('01KZMFG500Y4H4BEK3RMZNWJ81', 'vehicle_brand', 'vinfast', 'VinFast', NULL, '/brands/vinfast.svg', 0, CURRENT_TIMESTAMP),
    ('01KZMFG500G3QZDS0VVTZ2574D', 'vehicle_brand', 'toyota', 'Toyota', NULL, '/brands/toyota.svg', 1, CURRENT_TIMESTAMP),
    ('01KZMFG500YZVE15GWXZ4TV1C3', 'vehicle_brand', 'hyundai', 'Hyundai', NULL, '/brands/hyundai.svg', 2, CURRENT_TIMESTAMP),
    ('01KZMFG50082G0TK0ZKB4GPPXM', 'vehicle_brand', 'kia', 'Kia', NULL, '/brands/kia.svg', 3, CURRENT_TIMESTAMP),
    ('01KZMFG5005T550JG27C8F6M8Z', 'vehicle_brand', 'mazda', 'Mazda', NULL, '/brands/mazda.svg', 4, CURRENT_TIMESTAMP),
    ('01KZMFG500N60QM3KVRJ7AJJ9Z', 'vehicle_brand', 'honda', 'Honda', NULL, '/brands/honda.svg', 5, CURRENT_TIMESTAMP),
    ('01KZMFG5003E9GRFAYEG7CD4AH', 'vehicle_brand', 'ford', 'Ford', NULL, '/brands/ford.svg', 6, CURRENT_TIMESTAMP),
    ('01KZMFG500D49RRA508XAR9B2F', 'vehicle_brand', 'mitsubishi', 'Mitsubishi', NULL, '/brands/mitsubishi.svg', 7, CURRENT_TIMESTAMP),
    ('01KZMFG500JWNPFVVFRNWPT56D', 'vehicle_brand', 'suzuki', 'Suzuki', NULL, NULL, 8, CURRENT_TIMESTAMP),
    ('01KZMFG500E782DBR5DEM8SDJ5', 'vehicle_brand', 'nissan', 'Nissan', NULL, '/brands/nissan.svg', 9, CURRENT_TIMESTAMP),
    ('01KZMFG500VPYE6EXBCZYXGRX3', 'vehicle_brand', 'peugeot', 'Peugeot', NULL, NULL, 10, CURRENT_TIMESTAMP),
    ('01KZMFG500APXVA1SCVARJ5813', 'vehicle_brand', 'mercedes', 'Mercedes-Benz', NULL, '/brands/mercedes.svg', 11, CURRENT_TIMESTAMP),
    ('01KZMFG500HB5KN41TC4NFBY2K', 'vehicle_brand', 'bmw', 'BMW', NULL, '/brands/bmw.svg', 12, CURRENT_TIMESTAMP),
    ('01KZMFG500K3RZDTR97RS1T5XF', 'vehicle_brand', 'volkswagen', 'Volkswagen', NULL, '/brands/volkswagen.svg', 13, CURRENT_TIMESTAMP),
    ('01KZMFG500YGHW0GQPHWNREE6Q', 'vehicle_brand', 'mini', 'MINI', NULL, '/brands/mini.svg', 14, CURRENT_TIMESTAMP),
    ('01KZMFG5000C3C8GRK8CFTBZWN', 'vehicle_brand', 'chevrolet', 'Chevrolet', NULL, '/brands/chevrolet.svg', 15, CURRENT_TIMESTAMP),
    ('01KZMFG500P45677Q2ZH2NP5HY', 'vehicle_brand', 'yamaha', 'Yamaha', NULL, NULL, 16, CURRENT_TIMESTAMP),
    ('01KZMFG5003YKQZC3XNA7ZFA0C', 'body_type', 'mini', 'Mini car', '4 chỗ', '/body-types/mini.png', 0, CURRENT_TIMESTAMP),
    ('01KZMFG500CPCKAXSTA619QNH0', 'body_type', 'sedan', 'Sedan', '4 chỗ', '/body-types/sedan.png', 1, CURRENT_TIMESTAMP),
    ('01KZMFG50028J03KNZMYED7ZXJ', 'body_type', 'cuv', 'CUV', '5 chỗ · gầm cao', '/body-types/cuv.png', 2, CURRENT_TIMESTAMP),
    ('01KZMFG500B9W88B1R7BGT3R9F', 'body_type', 'suv', 'SUV', '7 chỗ · gầm cao', '/body-types/suv.png', 3, CURRENT_TIMESTAMP),
    ('01KZMFG500NT7JTCJYMQZA2GGM', 'body_type', 'mpv', 'MPV (7 chỗ)', '7 chỗ · gầm thấp', '/body-types/mpv.png', 4, CURRENT_TIMESTAMP),
    ('01KZMFG500F84QD618HJFKKC0Q', 'body_type', 'pickup', 'Bán tải', 'Bán tải', '/body-types/pickup.png', 5, CURRENT_TIMESTAMP),
    ('01KZMFG500C1NB2RFY6S80ZK9A', 'body_type', 'van', 'Van', '7 chỗ · minivan', '/body-types/van.png', 6, CURRENT_TIMESTAMP),
    ('01KZMFG500TWJ6J10J9JAN4RRS', 'body_type', 'minibus', 'Xe 16 chỗ', '16 chỗ', NULL, 7, CURRENT_TIMESTAMP),
    ('01KZMFG500NA3WYRKXN1W0RHWD', 'body_type', 'cargo', 'Xe tải – Cargo', 'Xe tải', NULL, 8, CURRENT_TIMESTAMP),
    ('01KZMFG50019T4NYHQNXFC8W8P', 'fuel_type', 'gasoline', 'Xăng', NULL, NULL, 0, CURRENT_TIMESTAMP),
    ('01KZMFG500247156738GRHDZQ1', 'fuel_type', 'diesel', 'Dầu (Diesel)', NULL, NULL, 1, CURRENT_TIMESTAMP),
    ('01KZMFG5003QB086QAZPD2Q690', 'fuel_type', 'electric', 'Điện', NULL, NULL, 2, CURRENT_TIMESTAMP),
    ('01KZMFG500J113NAF3XHAFRGAB', 'fuel_type', 'hybrid', 'Hybrid', NULL, NULL, 3, CURRENT_TIMESTAMP),
    ('01KZMFG500EQP21A3ANZ963KJ4', 'vehicle_feature', 'bluetooth', 'Bluetooth', NULL, NULL, 0, CURRENT_TIMESTAMP),
    ('01KZMFG500T8AF4M9C5ZY44KFJ', 'vehicle_feature', 'gps', 'Định vị GPS', NULL, NULL, 1, CURRENT_TIMESTAMP),
    ('01KZMFG5003J4WHAAA21DRBQ8G', 'vehicle_feature', 'backup_camera', 'Camera lùi', NULL, NULL, 2, CURRENT_TIMESTAMP),
    ('01KZMFG500V9VDDDQK9KCY0DZE', 'vehicle_feature', 'camera_360', 'Camera 360', NULL, NULL, 3, CURRENT_TIMESTAMP),
    ('01KZMFG500Z1TSC82466HJHST7', 'vehicle_feature', 'dash_camera', 'Camera hành trình', NULL, NULL, 4, CURRENT_TIMESTAMP),
    ('01KZMFG500E3XZ5T8NGZXN6EJH', 'vehicle_feature', 'reverse_sensor', 'Cảm biến lùi', NULL, NULL, 5, CURRENT_TIMESTAMP),
    ('01KZMFG500T30AE5R4J56D21YX', 'vehicle_feature', 'sunroof', 'Cửa sổ trời', NULL, NULL, 6, CURRENT_TIMESTAMP),
    ('01KZMFG500QE3CVK5SYMDY2F25', 'vehicle_feature', 'etc', 'ETC thu phí', NULL, NULL, 7, CURRENT_TIMESTAMP),
    ('01KZMFG500T0KZGPN8DFT2ECPV', 'vehicle_feature', 'spare_tire', 'Lốp dự phòng', NULL, NULL, 8, CURRENT_TIMESTAMP),
    ('01KZMFG500B4KP10CGRVAT0Y3F', 'vehicle_feature', 'airbag', 'Túi khí an toàn', NULL, NULL, 9, CURRENT_TIMESTAMP),
    ('01KZMFG500Y81YWA242BN8SBS7', 'vehicle_feature', 'usb', 'Cổng USB', NULL, NULL, 10, CURRENT_TIMESTAMP),
    ('01KZMFG5001FTWE0E6HARHSEZ5', 'vehicle_feature', 'screen', 'Màn hình giải trí', NULL, NULL, 11, CURRENT_TIMESTAMP),
    ('01KZMFG500KK9WK8W1BPQBERFB', 'vehicle_feature', 'map', 'Bản đồ', NULL, NULL, 12, CURRENT_TIMESTAMP),
    ('01KZMFG500GRXWQWXVWKA4063W', 'vehicle_feature', 'child_seat', 'Ghế trẻ em', NULL, NULL, 13, CURRENT_TIMESTAMP)
ON CONFLICT ("type", "key") DO NOTHING;
