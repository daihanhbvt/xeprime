-- XePrime — migration khởi tạo (Phase 0)
--
-- Viết tay thay vì để `prisma migrate dev` sinh, vì phần cuối file (trigger + exclusion
-- constraint của ADR 0006) Prisma không mô tả được. Tách thành migration riêng thì thứ tự
-- áp dụng phụ thuộc timestamp sinh lúc chạy — không kiểm soát được. Gộp vào đây để ràng
-- buộc chống trùng lịch CHẮC CHẮN tồn tại ngay từ lần migrate đầu tiên.
--
-- Kiểm tra khớp với schema.prisma bằng:
--   pnpm --filter @xeprime/prisma exec prisma migrate diff \
--     --from-migrations ./migrations --to-schema-datamodel ./schema.prisma --shadow-database-url ...

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- btree_gist: cần để đưa cột bằng-nhau (vehicle_id) vào cùng GiST index với range.
CREATE EXTENSION IF NOT EXISTS "btree_gist";
-- pg_trgm + unaccent: tìm kiếm marketplace tiếng Việt không dấu (Phase 3).
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE "users" (
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
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_status_idx" ON "users"("status");

-- ---------------------------------------------------------------------------
-- user_identities
-- ---------------------------------------------------------------------------
CREATE TABLE "user_identities" (
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
CREATE UNIQUE INDEX "user_identities_provider_provider_user_id_key"
    ON "user_identities"("provider", "provider_user_id");
CREATE INDEX "user_identities_user_id_idx" ON "user_identities"("user_id");

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE "tenants" (
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
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE INDEX "tenants_status_idx" ON "tenants"("status");
CREATE INDEX "tenants_owner_user_id_idx" ON "tenants"("owner_user_id");
CREATE INDEX "tenants_tenant_type_idx" ON "tenants"("tenant_type");

-- ---------------------------------------------------------------------------
-- roles / permissions / role_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE "roles" (
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
CREATE UNIQUE INDEX "roles_scope_tenant_id_key_key" ON "roles"("scope", "tenant_id", "key");
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

CREATE TABLE "permissions" (
    "id" CHAR(26) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "module" VARCHAR(80) NOT NULL,
    "scope" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

CREATE TABLE "role_permissions" (
    "role_id" CHAR(26) NOT NULL,
    "permission_id" CHAR(26) NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- ---------------------------------------------------------------------------
-- memberships
-- ---------------------------------------------------------------------------
CREATE TABLE "tenant_memberships" (
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
CREATE UNIQUE INDEX "tenant_memberships_tenant_id_user_id_key"
    ON "tenant_memberships"("tenant_id", "user_id");
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");
CREATE INDEX "tenant_memberships_tenant_id_role_key_idx"
    ON "tenant_memberships"("tenant_id", "role_key");

CREATE TABLE "platform_memberships" (
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
CREATE UNIQUE INDEX "platform_memberships_user_id_role_key_key"
    ON "platform_memberships"("user_id", "role_key");
CREATE INDEX "platform_memberships_status_idx" ON "platform_memberships"("status");

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
CREATE TABLE "vehicles" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "plate_number" VARCHAR(50),
    "vehicle_type" VARCHAR(50) NOT NULL,
    "service_type" VARCHAR(50) NOT NULL DEFAULT 'self_drive',
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
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vehicles_tenant_id_code_key" ON "vehicles"("tenant_id", "code");
CREATE INDEX "vehicles_tenant_id_public_status_idx" ON "vehicles"("tenant_id", "public_status");
CREATE INDEX "vehicles_tenant_id_operation_status_idx"
    ON "vehicles"("tenant_id", "operation_status");
CREATE INDEX "vehicles_vehicle_type_service_type_idx" ON "vehicles"("vehicle_type", "service_type");
CREATE INDEX "vehicles_brand_model_idx" ON "vehicles"("brand", "model");

-- ---------------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------------
CREATE TABLE "bookings" (
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
    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bookings_tenant_id_code_key" ON "bookings"("tenant_id", "code");
CREATE INDEX "bookings_tenant_id_status_idx" ON "bookings"("tenant_id", "status");
CREATE INDEX "bookings_vehicle_id_pickup_at_return_at_idx"
    ON "bookings"("vehicle_id", "pickup_at", "return_at");
CREATE INDEX "bookings_created_at_idx" ON "bookings"("created_at");

-- Đơn thuê phải trả sau khi nhận. Ràng buộc ở DB vì đây là bất biến nghiệp vụ, không
-- phải quy tắc hiển thị — một bug ở app không được phép tạo ra đơn có thời gian âm.
ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_period_valid" CHECK ("return_at" > "pickup_at");

-- ---------------------------------------------------------------------------
-- vehicle_occupancies — ADR 0006
-- ---------------------------------------------------------------------------
CREATE TABLE "vehicle_occupancies" (
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
CREATE UNIQUE INDEX "vehicle_occupancies_source_type_source_id_key"
    ON "vehicle_occupancies"("source_type", "source_id");
CREATE INDEX "vehicle_occupancies_vehicle_id_start_at_end_at_idx"
    ON "vehicle_occupancies"("vehicle_id", "start_at", "end_at");
CREATE INDEX "vehicle_occupancies_tenant_id_idx" ON "vehicle_occupancies"("tenant_id");

ALTER TABLE "vehicle_occupancies"
    ADD CONSTRAINT "vehicle_occupancies_period_valid" CHECK ("end_at" > "start_at");

-- `period` là cột dẫn xuất: khoảng thật cộng buffer chuẩn bị ở đuôi.
--
-- Dùng trigger chứ không dùng GENERATED ALWAYS AS: biểu thức generated column bắt buộc
-- IMMUTABLE, mà phép cộng interval từ một cột integer không thoả điều kiện đó.
--
-- Nửa mở '[)': trả xe 10:00 và nhận xe 10:00 KHÔNG tính là đụng nhau.
CREATE OR REPLACE FUNCTION xeprime_set_occupancy_period()
RETURNS TRIGGER AS $$
BEGIN
    NEW."period" := tstzrange(
        NEW."start_at",
        NEW."end_at" + make_interval(mins => NEW."buffer_minutes"),
        '[)'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "vehicle_occupancies_set_period"
    BEFORE INSERT OR UPDATE OF "start_at", "end_at", "buffer_minutes"
    ON "vehicle_occupancies"
    FOR EACH ROW
    EXECUTE FUNCTION xeprime_set_occupancy_period();

-- ===========================================================================
-- ĐÂY LÀ RÀNG BUỘC CHỐNG TRÙNG LỊCH (ADR 0006)
--
-- Từ dòng này trở đi, hai khoảng thời gian chồng nhau trên cùng một xe là BẤT KHẢ THI ở
-- tầng database — không phụ thuộc code ứng dụng có nhớ kiểm tra hay không, không phụ
-- thuộc isolation level, không có khe hở giữa SELECT và INSERT.
--
-- Hai request đồng thời: một thành công, một nhận lỗi 23P01 → API trả
-- BOOKING_SCHEDULE_CONFLICT (409).
-- ===========================================================================
ALTER TABLE "vehicle_occupancies"
    ADD CONSTRAINT "vehicle_occupancies_no_overlap"
    EXCLUDE USING gist ("vehicle_id" WITH =, "period" WITH &&);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE "audit_logs" (
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
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx"
    ON "audit_logs"("actor_user_id", "created_at");

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_invited_by_fkey"
    FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_memberships" ADD CONSTRAINT "platform_memberships_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_occupancies" ADD CONSTRAINT "vehicle_occupancies_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_occupancies" ADD CONSTRAINT "vehicle_occupancies_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
