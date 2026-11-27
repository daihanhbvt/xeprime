-- ADR 0112 điều 3: điều khoản thuê chuyển từ (xe × dịch vụ) lên GIAN HÀNG theo nhóm dịch vụ.
-- `self_drive` = Tự lái & Dài hạn, `with_driver` = Có tài xế. Cột cũ ở `vehicle_service_settings`
-- giữ lại (không mất dữ liệu) nhưng thôi được đọc/ghi.

CREATE TABLE "tenant_rental_terms" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "service_type" VARCHAR(50) NOT NULL,
    "terms_text" TEXT,
    "require_terms_acceptance" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_rental_terms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_rental_terms_service_type_check"
        CHECK ("service_type" IN ('self_drive', 'with_driver'))
);

CREATE UNIQUE INDEX "tenant_rental_terms_tenant_id_service_type_key"
    ON "tenant_rental_terms"("tenant_id", "service_type");

ALTER TABLE "tenant_rental_terms"
    ADD CONSTRAINT "tenant_rental_terms_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Chép từ dòng xe CẬP NHẬT GẦN NHẤT có điều khoản không rỗng của mỗi (gian hàng, nhóm).
-- id: 26 ký tự tất định từ md5 (Crockford không bắt buộc ở đây - chỉ cần duy nhất, đúng độ dài).
INSERT INTO "tenant_rental_terms"
    ("id", "tenant_id", "service_type", "terms_text", "require_terms_acceptance", "updated_by",
     "created_at", "updated_at")
SELECT
    UPPER(SUBSTRING(md5('tenant_rental_terms:' || src.tenant_id || ':' || src.service_type), 1, 26)),
    src.tenant_id,
    src.service_type,
    src.terms_text,
    src.require_terms_acceptance,
    src.updated_by,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (vss.tenant_id, vss.service_type)
        vss.tenant_id,
        vss.service_type,
        BTRIM(vss.terms_text) AS terms_text,
        vss.require_terms_acceptance,
        vss.updated_by
    FROM "vehicle_service_settings" vss
    WHERE vss.service_type IN ('self_drive', 'with_driver')
      AND vss.terms_text IS NOT NULL
      AND BTRIM(vss.terms_text) <> ''
    ORDER BY vss.tenant_id, vss.service_type, vss.updated_at DESC, vss.id DESC
) src;
