-- ═══════════════════════════════════════════════════════════════════════════
-- MỌI CỘT SĐT VỀ DẠNG NỘI ĐỊA `0xxxxxxxxx` (06/11/2026, ADR 0082 — thay dạng lưu `84…` của
-- migration 20261014180000 / ADR 0060)
--
-- Trước bản này `users.phone` lưu `84xxxxxxxxx`, còn SĐT trên booking/sổ khách/chi nhánh… lưu
-- nguyên như người dùng gõ ⇒ cùng một người hiện `84855553344` ở màn này, `0855553344` ở màn kia.
-- Từ nay server quy mọi đầu vào (`0…`, `84…`, `+84…`, có dấu cách/chấm/gạch/ngoặc) về `0…` ở mép
-- DTO (`@PhoneInput()`); bản này đưa dữ liệu cũ về cùng dạng.
--
-- Chỉ đổi giá trị có hình dạng một SĐT di động VN (`0`/`84`/`+84` + 9 số sau khi bỏ dấu phân tách).
-- Giá trị khác (số bàn, số nước ngoài, rác) để NGUYÊN.
--
-- KHÔNG ép khi đụng hàng — với ba ràng buộc unique có chứa SĐT:
--   · `users_realm_phone_key` (realm, phone)
--   · `tenant_customers_tenant_id_normalized_phone_key` (tenant_id, normalized_phone)
--   · `booking_requests_pending_dedupe_idx` / `_long_term_dedupe_idx` (yêu cầu đang chờ)
-- hàng nào chuẩn hoá xong trùng một hàng khác thì để nguyên: gộp hai tài khoản / hai khách là
-- quyết định của người vận hành. Truy vấn kiểm tra ở cuối file liệt kê chúng. Tra cứu vẫn khớp
-- được nhờ `phoneLookupVariants`.
--
-- ⚠️ CHẠY LẠI ĐƯỢC: hàng đã ở dạng `0…` không khớp điều kiện nào.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION pg_temp.xp_local_vn_phone(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN c ~ '^\+84[0-9]{9}$' THEN '0' || substring(c FROM 4)
        WHEN c ~ '^84[0-9]{9}$'   THEN '0' || substring(c FROM 3)
        WHEN c ~ '^0[0-9]{9}$'    THEN c
        ELSE raw
    END
    FROM (SELECT regexp_replace(raw, '[[:space:].()-]', '', 'g') AS c) AS t
$$;

-- ── Hai CHECK đang ép dạng `84…` — gỡ trước, dựng lại ở cuối file với dạng `0…` ─────
ALTER TABLE "public"."tenant_customers" DROP CONSTRAINT "tenant_customers_normalized_phone_check";
ALTER TABLE "public"."bookings" DROP CONSTRAINT "bookings_external_driver_pair_check";

-- ── Cột không có ràng buộc unique: đổi thẳng ─────────────────────────────────
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
-- `tenant_customers.phone` là số HIỂN THỊ, không unique; định danh là `normalized_phone` (dưới).
UPDATE "public"."tenant_customers" SET "phone" = pg_temp.xp_local_vn_phone("phone")
 WHERE "phone" <> pg_temp.xp_local_vn_phone("phone");

-- ── users.phone — unique (realm, phone) ─────────────────────────────────────
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

-- ── tenant_customers.normalized_phone — unique (tenant_id, normalized_phone) ─
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

-- ── booking_requests.customer_phone — unique một phần trên yêu cầu ĐANG CHỜ ──
-- Hàng đã đóng: đổi thẳng. Hàng đang chờ: bỏ qua nếu sẽ trùng một yêu cầu chờ khác cùng xe.
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

-- ── Dựng lại hai CHECK ──────────────────────────────────────────────────────
-- Sổ khách: app chỉ còn ghi `0…`; `84…` còn được nhận CHỈ để hàng đụng số ở trên (và hàng cũ dài
-- bất thường mà CHECK cũ `84` + 8–12 số từng cho qua) không chặn migration. Gộp xong thì siết lại.
ALTER TABLE "public"."tenant_customers" ADD CONSTRAINT "tenant_customers_normalized_phone_check"
    CHECK ("normalized_phone" ~ '^(0|84)[0-9]{8,12}$');

-- Tài xế ngoài hệ thống (chỉ còn đọc/gỡ — ADR 0074): mọi hàng `84` + 9 số đã đổi ở trên.
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_external_driver_pair_check"
    CHECK (
        ("external_driver_name" IS NULL) = ("external_driver_phone" IS NULL)
        AND ("external_driver_name" IS NULL OR length(btrim("external_driver_name")) > 0)
        AND ("external_driver_phone" IS NULL OR "external_driver_phone" ~ '^0[0-9]{9}$')
    );

-- Kiểm tra sau khi chạy (không đổi dữ liệu) — hàng còn lại là hàng đụng số, cần người xử lý:
--   SELECT "realm", "id", "phone" FROM "public"."users"
--   WHERE "phone" ~ '^\+?84[0-9]{9}$' AND "deleted_at" IS NULL;
--   SELECT "tenant_id", "id", "normalized_phone" FROM "public"."tenant_customers"
--   WHERE "normalized_phone" ~ '^\+?84[0-9]{9}$';
