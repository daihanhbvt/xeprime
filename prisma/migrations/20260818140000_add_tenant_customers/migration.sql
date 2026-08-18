-- Sổ khách của GIAN HÀNG (gap S-01, database_design §10.2–10.4).
--
-- Trước migration này "khách" chỉ tồn tại dưới dạng snapshot rời rạc trên từng đơn
-- (`bookings.customer_name/customer_phone`) và từng yêu cầu thuê. Shop không có nơi nào trả lời
-- được "khách này thuê 6 lần, còn nợ 2tr, từng trả xe muộn".
--
-- Ba việc, theo đúng thứ tự:
--   1. ba bảng mới (`tenant_customers`, `_notes`, `_documents`) + ràng buộc;
--   2. cột liên kết trên `bookings` / `booking_requests` (+ FK cho `receipts.tenant_customer_id`
--      vốn có từ Phase 6 nhưng chưa có bảng để trỏ tới);
--   3. BACKFILL dữ liệu cũ: gom theo `(tenant_id, SĐT đã chuẩn hoá)`, KHÔNG gộp theo tên.
--
-- Backfill an toàn với database đã có dữ liệu và chạy lại được nhiều lần:
--   - `ON CONFLICT DO NOTHING` trên `(tenant_id, normalized_phone)`;
--   - các UPDATE chỉ chạm hàng còn `tenant_customer_id IS NULL`;
--   - snapshot `customer_name`/`customer_phone`/`customer_email` của đơn cũ KHÔNG bị sửa một
--     ký tự nào — chúng là sự thật của giao dịch tại thời điểm đó.

-- ===== 0. Hai hàm TẠM cho backfill (drop ở cuối migration) =====

-- Bản SQL của `normalizeVnPhone` (packages/types/src/phone.ts). Hai bản cài đặt phải cho cùng
-- kết quả, nếu không backfill sẽ dựng ra một tập khách khác với tập mà runtime tra ra sau này.
CREATE OR REPLACE FUNCTION xp_tmp_normalize_vn_phone(raw TEXT) RETURNS TEXT AS $$
DECLARE
    t TEXT;
BEGIN
    IF raw IS NULL THEN RETURN NULL; END IF;
    t := regexp_replace(btrim(raw), '[[:space:].-]', '', 'g');
    IF t = '' THEN RETURN NULL; END IF;
    IF t LIKE '+84%' THEN RETURN '84' || substr(t, 4); END IF;
    IF t LIKE '84%'  THEN RETURN t; END IF;
    IF t LIKE '0%'   THEN RETURN '84' || substr(t, 2); END IF;
    RETURN t;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ULID (Crockford base32, 26 ký tự: 10 thời gian + 16 ngẫu nhiên). Id sinh ở tầng app bằng gói
-- `ulid`, nhưng backfill chạy trong SQL nên cần một bản tương đương ở đây. Cùng thứ tự sắp xếp
-- theo thời gian, cùng bảng chữ cái, cùng độ dài — `char(26)` không phân biệt được hai nguồn.
CREATE OR REPLACE FUNCTION xp_tmp_ulid() RETURNS CHAR(26) AS $$
DECLARE
    alphabet CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    ts       BIGINT := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT;
    out_text TEXT := '';
    i        INT;
BEGIN
    FOR i IN 1..10 LOOP
        out_text := substr(alphabet, (ts % 32)::INT + 1, 1) || out_text;
        ts := ts / 32;
    END LOOP;
    FOR i IN 1..16 LOOP
        out_text := out_text || substr(alphabet, floor(random() * 32)::INT + 1, 1);
    END LOOP;
    RETURN out_text;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ===== 1. Bảng sổ khách =====

CREATE TABLE "tenant_customers" (
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

    CONSTRAINT "tenant_customers_pkey" PRIMARY KEY ("id"),
    -- ADR 0005: bộ giá trị thật của status giữ bằng CHECK, không bằng Postgres enum.
    CONSTRAINT "tenant_customers_source_check"
        CHECK ("source" IN ('manual', 'booking', 'marketplace')),
    CONSTRAINT "tenant_customers_risk_level_check"
        CHECK ("risk_level" IN ('normal', 'watchlist', 'blocked')),
    -- Đánh dấu rủi ro mà không nêu lý do là để lại một quyết định không ai giải thích được về
    -- sau. DB bắt buộc luôn, không chỉ DTO.
    CONSTRAINT "tenant_customers_risk_reason_required_check"
        CHECK ("risk_level" = 'normal' OR btrim(coalesce("risk_reason", '')) <> ''),
    -- Cột định danh phải THỰC SỰ ở dạng chuẩn hoá; ghi lệch một lần là hồ sơ đó vĩnh viễn
    -- không tra ra được nữa.
    CONSTRAINT "tenant_customers_normalized_phone_check"
        CHECK ("normalized_phone" ~ '^84[0-9]{8,12}$')
);

-- Một SĐT = một khách trong một gian hàng. Cùng SĐT ở gian hàng khác là hồ sơ khác — hoàn toàn
-- hợp lệ và có chủ đích.
CREATE UNIQUE INDEX "tenant_customers_tenant_id_normalized_phone_key"
    ON "tenant_customers"("tenant_id", "normalized_phone");
-- Mục tiêu cho composite FK (tenant_customer_id, tenant_id) từ 3 bảng nghiệp vụ.
CREATE UNIQUE INDEX "tenant_customers_id_tenant_id_key"
    ON "tenant_customers"("id", "tenant_id");
CREATE INDEX "tenant_customers_tenant_id_risk_level_idx"
    ON "tenant_customers"("tenant_id", "risk_level");
CREATE INDEX "tenant_customers_tenant_id_archived_at_idx"
    ON "tenant_customers"("tenant_id", "archived_at");
CREATE INDEX "tenant_customers_tenant_id_full_name_idx"
    ON "tenant_customers"("tenant_id", "full_name");
CREATE INDEX "tenant_customers_customer_user_id_idx"
    ON "tenant_customers"("customer_user_id");
-- Ô tìm kiếm của danh sách chạy `ILIKE '%q%'` trên tên → btree vô dụng, cần trigram.
CREATE INDEX "tenant_customers_full_name_trgm_idx"
    ON "tenant_customers" USING GIN ("full_name" gin_trgm_ops);

ALTER TABLE "tenant_customers"
    ADD CONSTRAINT "tenant_customers_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "tenant_customers_customer_user_id_fkey"
        FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== 2. Ghi chú nội bộ (bản ghi bất biến, không phải một ô note bị ghi đè) =====

CREATE TABLE "tenant_customer_notes" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "tenant_customer_id" CHAR(26) NOT NULL,
    "note_type" VARCHAR(30) NOT NULL DEFAULT 'general',
    "body" TEXT NOT NULL,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenant_customer_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_customer_notes_note_type_check"
        CHECK ("note_type" IN ('general', 'preference', 'risk')),
    CONSTRAINT "tenant_customer_notes_body_not_blank_check"
        CHECK (btrim("body") <> '')
);

CREATE INDEX "tenant_customer_notes_tenant_customer_created_idx"
    ON "tenant_customer_notes"("tenant_id", "tenant_customer_id", "created_at");

ALTER TABLE "tenant_customer_notes"
    ADD CONSTRAINT "tenant_customer_notes_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Composite FK: ghi chú của gian hàng A không thể trỏ vào khách của gian hàng B.
    ADD CONSTRAINT "tenant_customer_notes_customer_fkey"
        FOREIGN KEY ("tenant_customer_id", "tenant_id")
        REFERENCES "tenant_customers"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== 3. Giấy tờ khách (metadata; nhị phân ở bucket R2 riêng tư) =====

CREATE TABLE "tenant_customer_documents" (
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

    CONSTRAINT "tenant_customer_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_customer_documents_type_check"
        CHECK ("document_type" IN ('citizen_id', 'driver_licence', 'other')),
    CONSTRAINT "tenant_customer_documents_status_check"
        CHECK ("status" IN ('pending', 'ready', 'deleted')),
    -- Nhãn tự đặt chỉ có nghĩa với loại `other` (cùng luật với `vehicle_documents`).
    CONSTRAINT "tenant_customer_documents_custom_name_check"
        CHECK ("custom_type_name" IS NULL OR "document_type" = 'other'),
    CONSTRAINT "tenant_customer_documents_size_check"
        CHECK ("size_bytes" > 0)
);

CREATE UNIQUE INDEX "tenant_customer_documents_object_key_key"
    ON "tenant_customer_documents"("object_key");
CREATE INDEX "tenant_customer_documents_tenant_customer_status_idx"
    ON "tenant_customer_documents"("tenant_id", "tenant_customer_id", "status");

ALTER TABLE "tenant_customer_documents"
    ADD CONSTRAINT "tenant_customer_documents_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "tenant_customer_documents_customer_fkey"
        FOREIGN KEY ("tenant_customer_id", "tenant_id")
        REFERENCES "tenant_customers"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== 4. Liên kết từ dữ liệu nghiệp vụ =====

ALTER TABLE "bookings" ADD COLUMN "tenant_customer_id" CHAR(26);
ALTER TABLE "booking_requests" ADD COLUMN "tenant_customer_id" CHAR(26);
-- `receipts.tenant_customer_id` đã tồn tại từ Phase 6 nhưng chưa bao giờ có bảng đích, nên
-- cũng chưa bao giờ có FK. Giờ mới siết được.

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_tenant_customer_fkey"
        FOREIGN KEY ("tenant_customer_id", "tenant_id")
        REFERENCES "tenant_customers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "booking_requests"
    ADD CONSTRAINT "booking_requests_tenant_customer_fkey"
        FOREIGN KEY ("tenant_customer_id", "tenant_id")
        REFERENCES "tenant_customers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "receipts"
    ADD CONSTRAINT "receipts_tenant_customer_fkey"
        FOREIGN KEY ("tenant_customer_id", "tenant_id")
        REFERENCES "tenant_customers"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "bookings_tenant_id_tenant_customer_id_idx"
    ON "bookings"("tenant_id", "tenant_customer_id");
CREATE INDEX "booking_requests_tenant_id_tenant_customer_id_idx"
    ON "booking_requests"("tenant_id", "tenant_customer_id");
CREATE INDEX "receipts_tenant_id_tenant_customer_id_idx"
    ON "receipts"("tenant_id", "tenant_customer_id");

-- ===== 5. Backfill từ đơn thuê + yêu cầu thuê đã có =====
--
-- Gom theo `(tenant_id, SĐT chuẩn hoá)`: hai đơn cũ ghi `0901234567` và `+84901234567` về CÙNG
-- một hồ sơ khách. Hàng nào không rút được SĐT hợp lệ thì giữ nguyên, `tenant_customer_id` để
-- NULL — thà thiếu liên kết còn hơn đoán sai người.
WITH activity AS (
    SELECT b."tenant_id",
           xp_tmp_normalize_vn_phone(b."customer_phone") AS normalized_phone,
           b."customer_name"                             AS customer_name,
           NULL::VARCHAR(255)                            AS customer_email,
           NULL::CHAR(26)                                AS customer_user_id,
           b."created_at"                                AS created_at,
           b."id"                                        AS source_row_id,
           FALSE                                         AS from_marketplace
    FROM "bookings" b
    WHERE b."customer_phone" IS NOT NULL
    UNION ALL
    SELECT r."tenant_id",
           xp_tmp_normalize_vn_phone(r."customer_phone"),
           r."customer_name",
           r."customer_email",
           r."customer_user_id",
           r."created_at",
           r."id",
           TRUE
    FROM "booking_requests" r
),
usable AS (
    SELECT * FROM activity WHERE normalized_phone ~ '^84[0-9]{8,12}$'
),
grouped AS (
    SELECT tenant_id,
           normalized_phone,
           MIN(created_at) AS first_seen_at,
           -- Tên hiển thị lấy từ lần xuất hiện GẦN NHẤT (tie-break theo id để chạy lại cho ra
           -- cùng kết quả). Không "trộn" tên, không đoán tên chuẩn.
           (array_agg(customer_name ORDER BY created_at DESC, source_row_id DESC))[1] AS full_name,
           (array_agg(customer_email ORDER BY (customer_email IS NULL), created_at DESC, source_row_id DESC))[1] AS email,
           (array_agg(customer_user_id ORDER BY (customer_user_id IS NULL), created_at DESC, source_row_id DESC))[1] AS customer_user_id,
           bool_or(from_marketplace) AS from_marketplace
    FROM usable
    GROUP BY tenant_id, normalized_phone
)
INSERT INTO "tenant_customers" (
    "id", "tenant_id", "customer_user_id", "full_name", "phone", "normalized_phone",
    "email", "source", "risk_level", "created_at", "updated_at"
)
SELECT xp_tmp_ulid(),
       g.tenant_id,
       g.customer_user_id,
       g.full_name,
       -- Dạng hiển thị nội địa suy từ dạng chuẩn hoá (`84…` → `0…`).
       '0' || substr(g.normalized_phone, 3),
       g.normalized_phone,
       g.email,
       CASE WHEN g.from_marketplace THEN 'marketplace' ELSE 'booking' END,
       'normal',
       g.first_seen_at,
       CURRENT_TIMESTAMP
FROM grouped g
ON CONFLICT ("tenant_id", "normalized_phone") DO NOTHING;

UPDATE "bookings" b
SET "tenant_customer_id" = tc."id"
FROM "tenant_customers" tc
WHERE b."tenant_customer_id" IS NULL
  AND b."customer_phone" IS NOT NULL
  AND tc."tenant_id" = b."tenant_id"
  AND tc."normalized_phone" = xp_tmp_normalize_vn_phone(b."customer_phone");

UPDATE "booking_requests" r
SET "tenant_customer_id" = tc."id"
FROM "tenant_customers" tc
WHERE r."tenant_customer_id" IS NULL
  AND tc."tenant_id" = r."tenant_id"
  AND tc."normalized_phone" = xp_tmp_normalize_vn_phone(r."customer_phone");

-- Phiếu thu/chi đi theo đơn của nó — không tự suy ra khách từ mô tả phiếu.
UPDATE "receipts" rc
SET "tenant_customer_id" = b."tenant_customer_id"
FROM "bookings" b
WHERE rc."tenant_customer_id" IS NULL
  AND rc."booking_id" = b."id"
  AND rc."tenant_id" = b."tenant_id"
  AND b."tenant_customer_id" IS NOT NULL;

DROP FUNCTION xp_tmp_ulid();
DROP FUNCTION xp_tmp_normalize_vn_phone(TEXT);
