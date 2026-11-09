-- ═══════════════════════════════════════════════════════════════════════════
-- SĐT 11 CHỮ SỐ (số bàn `02x…`, số cũ chưa chuyển) — nối tiếp 20261106090000 (ADR 0082)
--
-- Bản trước chỉ đổi dạng di động 10 số (`84` + 9 số). Từ bản này app nhận tiền tố `0`/`84`/`+84`
-- rồi 9 HOẶC 10 chữ số (chữ số đầu khác 0), nên:
--   1. đổi nốt các giá trị `84` / `+84` + 10 số và dạng gõ thừa số 0 (`+84 0…`) về `0…`;
--   2. nới CHECK của `bookings.external_driver_phone` cho `0` + 10 số.
-- Cùng luật "đụng unique thì để nguyên" với bản trước.
--
-- ⚠️ CHẠY LẠI ĐƯỢC.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.xp_local_vn_phone(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN c ~ '^\+?840[1-9][0-9]{8,9}$' THEN '0' || substring(c FROM '840([0-9]+)$')
        WHEN c ~ '^\+84[1-9][0-9]{8,9}$'   THEN '0' || substring(c FROM 4)
        WHEN c ~ '^84[1-9][0-9]{8,9}$'     THEN '0' || substring(c FROM 3)
        ELSE raw
    END
    FROM (SELECT regexp_replace(raw, '[[:space:].()-]', '', 'g') AS c) AS t
$$;

ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_external_driver_pair_check";

UPDATE "public"."user_identities" SET "provider_phone" = pg_temp.xp_local_vn_phone("provider_phone")
 WHERE "provider_phone" IS NOT NULL AND "provider_phone" <> pg_temp.xp_local_vn_phone("provider_phone");
UPDATE "public"."tenants" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" IS NOT NULL AND "phone" <> pg_temp.xp_local_vn_phone("phone");
UPDATE "public"."phone_verifications" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" <> pg_temp.xp_local_vn_phone("phone");
UPDATE "public"."tenant_branches" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" IS NOT NULL AND "phone" <> pg_temp.xp_local_vn_phone("phone");
UPDATE "public"."tenant_invites" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" IS NOT NULL AND "phone" <> pg_temp.xp_local_vn_phone("phone");
UPDATE "public"."bookings" SET "customer_phone" = pg_temp.xp_local_vn_phone("customer_phone")
 WHERE "customer_phone" IS NOT NULL AND "customer_phone" <> pg_temp.xp_local_vn_phone("customer_phone");
UPDATE "public"."bookings" SET "external_driver_phone" = pg_temp.xp_local_vn_phone("external_driver_phone")
 WHERE "external_driver_phone" IS NOT NULL AND "external_driver_phone" <> pg_temp.xp_local_vn_phone("external_driver_phone");
UPDATE "public"."drivers" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" <> pg_temp.xp_local_vn_phone("phone");
UPDATE "public"."vehicle_source_details" SET "owner_phone" = pg_temp.xp_local_vn_phone("owner_phone")
 WHERE "owner_phone" IS NOT NULL AND "owner_phone" <> pg_temp.xp_local_vn_phone("owner_phone");
UPDATE "public"."tenant_customers" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" <> pg_temp.xp_local_vn_phone("phone");

WITH c AS (
    SELECT "id", "realm", "phone", pg_temp.xp_local_vn_phone("phone") AS n
    FROM "public"."users" WHERE "phone" IS NOT NULL
)
UPDATE "public"."users" AS u SET "phone" = c.n
FROM c
WHERE u."id" = c."id" AND c.n <> c."phone"
  AND NOT EXISTS (SELECT 1 FROM "public"."users" o
                  WHERE o."realm" = c."realm" AND o."phone" = c.n AND o."id" <> c."id")
  AND NOT EXISTS (SELECT 1 FROM c d
                  WHERE d."realm" = c."realm" AND d.n = c.n AND d."id" <> c."id");

WITH c AS (
    SELECT "id", "tenant_id", "normalized_phone" AS p, pg_temp.xp_local_vn_phone("normalized_phone") AS n
    FROM "public"."tenant_customers"
)
UPDATE "public"."tenant_customers" AS t SET "normalized_phone" = c.n
FROM c
WHERE t."id" = c."id" AND c.n <> c.p
  AND NOT EXISTS (SELECT 1 FROM "public"."tenant_customers" o
                  WHERE o."tenant_id" = c."tenant_id" AND o."normalized_phone" = c.n AND o."id" <> c."id")
  AND NOT EXISTS (SELECT 1 FROM c d
                  WHERE d."tenant_id" = c."tenant_id" AND d.n = c.n AND d."id" <> c."id");

UPDATE "public"."booking_requests" AS r SET "customer_phone" = pg_temp.xp_local_vn_phone(r."customer_phone")
WHERE r."customer_phone" <> pg_temp.xp_local_vn_phone(r."customer_phone")
  AND (
      r."status" <> 'pending_host_approval'
      OR NOT EXISTS (
          SELECT 1 FROM "public"."booking_requests" o
          WHERE o."id" <> r."id" AND o."status" = 'pending_host_approval'
            AND o."vehicle_id" = r."vehicle_id"
            AND pg_temp.xp_local_vn_phone(o."customer_phone") = pg_temp.xp_local_vn_phone(r."customer_phone")
      )
  );

ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_external_driver_pair_check"
    CHECK (
        ("external_driver_name" IS NULL) = ("external_driver_phone" IS NULL)
        AND ("external_driver_name" IS NULL OR length(btrim("external_driver_name")) > 0)
        AND ("external_driver_phone" IS NULL OR "external_driver_phone" ~ '^0[0-9]{9,10}$')
    );
