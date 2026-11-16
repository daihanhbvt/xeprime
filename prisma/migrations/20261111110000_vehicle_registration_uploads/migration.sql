-- ADR 0089 — ảnh cà vẹt tải lên trước khi ô tô tồn tại; lượt tạo xe gắn nó vào giấy tờ
-- `registration` trong cùng transaction. Writer duy nhất: `VehicleRegistrationUploadsService`.
CREATE TABLE "public"."vehicle_registration_uploads" (
    "id"           CHAR(26)       NOT NULL,
    "tenant_id"    CHAR(26)       NOT NULL,
    "created_by"   CHAR(26)       NOT NULL,
    "status"       VARCHAR(20)    NOT NULL DEFAULT 'uploading',
    "object_key"   VARCHAR(500)   NOT NULL,
    "mime_type"    VARCHAR(100)   NOT NULL,
    "size_bytes"   INTEGER        NOT NULL,
    "reading_json" JSONB,
    "reader_name"  VARCHAR(120),
    "vehicle_id"   CHAR(26),
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    "read_at"      TIMESTAMPTZ(3),
    "consumed_at"  TIMESTAMPTZ(3),
    CONSTRAINT "vehicle_registration_uploads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicle_registration_uploads_status_check"
        CHECK ("status" IN ('uploading', 'read', 'consumed')),
    CONSTRAINT "vehicle_registration_uploads_size_check" CHECK ("size_bytes" > 0),
    -- Đã đọc ⇒ có mốc đọc; đã gắn ⇒ có xe + mốc gắn (và ngược lại).
    CONSTRAINT "vehicle_registration_uploads_read_check"
        CHECK ("status" = 'uploading' OR "read_at" IS NOT NULL),
    CONSTRAINT "vehicle_registration_uploads_consumed_check"
        CHECK (("status" = 'consumed') = ("vehicle_id" IS NOT NULL AND "consumed_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "vehicle_registration_uploads_object_key_key"
    ON "public"."vehicle_registration_uploads" ("object_key");
CREATE INDEX "vehicle_registration_uploads_created_by_created_at_idx"
    ON "public"."vehicle_registration_uploads" ("created_by", "created_at");
CREATE INDEX "vehicle_registration_uploads_status_created_at_idx"
    ON "public"."vehicle_registration_uploads" ("status", "created_at");

ALTER TABLE "public"."vehicle_registration_uploads"
    ADD CONSTRAINT "vehicle_registration_uploads_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
