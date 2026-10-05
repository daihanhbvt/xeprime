-- ADR 0053 — Ba không gian tài khoản tách biệt: customer · partner · platform.
--
-- Viết TAY từ `prisma migrate diff`. Đã BỎ mọi lệnh drift có sẵn mà diff kéo theo (DROP các FK tổ
-- hợp `(id, tenant_id)`, đổi tên index/FK, xoá `vehicle_catalog_models.brand_catalog_type`) — xem
-- header của baseline `20260821000000_init` và mục 6 của `docs/completion-roadmap.md`.
--
-- Những gì migration này dựng:
--   1. `users.realm` + CHECK; email/SĐT unique TRONG realm; `(id, realm)` unique làm đích FK tổ hợp.
--   2. Gán realm cho dữ liệu có sẵn và tách tài khoản trộn vai (chi tiết ngay dưới).
--   3. `user_identities.realm` + FK tổ hợp `(user_id, realm)` + unique `(realm, provider, provider_user_id)`.
--   4. realm trên `phone_verifications`, `email_verifications`, `oauth_states`.
--   5. Trigger: realm của tài khoản không đổi được; membership gian hàng và chủ tenant chỉ là
--      tài khoản `partner`; membership nền tảng chỉ là tài khoản `platform`.
--   6. Một tài khoản partner có tối đa MỘT membership `active` (unique index một phần).
--
-- Dữ liệu cũ (dev, staging — production chưa có dữ liệu, ADR 0053 điều 10) được TÁCH TỰ ĐỘNG: không
-- dừng deploy, không xoá dòng nào, và không để lại hàng lệch realm.
--   • Mỗi tài khoản giữ realm theo vai cao nhất còn hiệu lực: platform > partner > customer.
--     "Vai gian hàng còn hiệu lực" = membership active/invited/locked, hoặc đứng tên chủ một gian
--     hàng (kể cả đã xoá mềm — FK chủ gian hàng phải là partner).
--   • Vai còn lại chuyển sang một tài khoản SONG SINH (cùng tên, email, SĐT, mật khẩu) ở realm của
--     vai đó — đúng mô hình "một người hai tài khoản" của ADR, giống tài khoản đôi trong seed:
--       - mọi membership/gian hàng của người không ở lại realm partner (nhân sự nền tảng kiêm gian
--         hàng, nhân viên đã rời gian hàng) ⇒ song sinh partner;
--       - tài khoản partner/platform từng đi thuê xe ⇒ song sinh customer nhận yêu cầu thuê, giữ
--         chỗ, hoàn tiền, mã khuyến mãi, hội thoại phía khách, ví và tài khoản ngân hàng cá nhân.
--   • Ai đang ở nhiều gian hàng cùng lúc giữ MỘT membership active (vai chủ trước, rồi mới nhất);
--     các membership kia chuyển `removed`.
--   • Phiên app native lệch realm của app bị THU HỒI (`revoked_at`) — thiết bị đó đăng nhập lại.
-- Cuối mục là một lượt tự kiểm: còn hàng lệch nào là migration DỪNG (lỗi của chính migration này,
-- không phải của dữ liệu), và cả file rollback: Prisma gửi cả file trong một lượt, Postgres chạy
-- nó như một transaction ngầm.

-- ── 1. users.realm ──────────────────────────────────────────────────────────────────────────
-- DEFAULT chỉ để điền hàng có sẵn; gỡ ở cuối mục 2 — realm bất biến, nên một đường tạo tài khoản
-- quên truyền realm phải lỗi ngay chứ không lặng lẽ thành tài khoản khách vĩnh viễn.
ALTER TABLE "users" ADD COLUMN "realm" VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE "users" ADD CONSTRAINT "users_realm_check"
  CHECK ("realm" IN ('customer', 'partner', 'platform'));

-- Unique TRONG realm dựng TRƯỚC khi tách: tài khoản song sinh mang đúng email/SĐT của bản gốc.
DROP INDEX "users_email_key";
DROP INDEX "users_phone_key";
CREATE UNIQUE INDEX "users_realm_email_key" ON "users"("realm", "email");
CREATE UNIQUE INDEX "users_realm_phone_key" ON "users"("realm", "phone");
CREATE UNIQUE INDEX "users_id_realm_key" ON "users"("id", "realm");

-- ── 2. Tách dữ liệu trộn vai ───────────────────────────────────────────────────────────────
CREATE TEMP TABLE "realm_roles" AS
SELECT
  u."id",
  EXISTS (SELECT 1 FROM "platform_memberships" pm WHERE pm."user_id" = u."id") AS "is_platform",
  (
    EXISTS (SELECT 1 FROM "tenant_memberships" tm
            WHERE tm."user_id" = u."id" AND tm."status" IN ('active', 'invited', 'locked'))
    OR EXISTS (SELECT 1 FROM "tenants" t WHERE t."owner_user_id" = u."id")
  ) AS "is_partner",
  EXISTS (SELECT 1 FROM "tenant_memberships" tm WHERE tm."user_id" = u."id") AS "has_membership",
  (
    EXISTS (SELECT 1 FROM "booking_requests" x WHERE x."customer_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "booking_holds" x WHERE x."customer_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "hold_refunds" x WHERE x."customer_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "promo_redemptions" x WHERE x."customer_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "conversations" x WHERE x."customer_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "tenant_customers" x WHERE x."customer_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "wallets" w WHERE w."owner_type" = 'user' AND w."owner_user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "bank_accounts" b WHERE b."owner_type" = 'user' AND b."owner_user_id" = u."id")
  ) AS "is_customer"
FROM "users" u;

UPDATE "users" u SET "realm" = CASE WHEN r."is_platform" THEN 'platform' ELSE 'partner' END
FROM "realm_roles" r
WHERE r."id" = u."id" AND (r."is_platform" OR r."is_partner");

-- ULID cho tài khoản song sinh: 10 ký tự thời gian (ms) + 16 ký tự ngẫu nhiên, bảng chữ Crockford.
CREATE FUNCTION "xeprime_tmp_ulid"() RETURNS char(26)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ts bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
  out text := '';
BEGIN
  FOR i IN 1..10 LOOP
    out := substr(alphabet, (ts % 32)::int + 1, 1) || out;
    ts := ts / 32;
  END LOOP;
  FOR i IN 1..16 LOOP
    out := out || substr(alphabet, floor(random() * 32)::int + 1, 1);
  END LOOP;
  RETURN out;
END $$;

CREATE TEMP TABLE "realm_twins" AS
SELECT u."id" AS "source_id", 'partner'::varchar(20) AS "realm", "xeprime_tmp_ulid"() AS "twin_id"
FROM "realm_roles" r JOIN "users" u ON u."id" = r."id"
WHERE u."realm" <> 'partner' AND (r."is_partner" OR r."has_membership")
UNION ALL
SELECT u."id", 'customer', "xeprime_tmp_ulid"()
FROM "realm_roles" r JOIN "users" u ON u."id" = r."id"
WHERE u."realm" <> 'customer' AND r."is_customer";

INSERT INTO "users" (
  "id", "realm", "email", "email_verified_at", "phone", "phone_verified_at", "display_name",
  "avatar_url", "status", "password_hash", "created_at", "updated_at", "deleted_at"
)
SELECT
  tw."twin_id", tw."realm", u."email", u."email_verified_at", u."phone", u."phone_verified_at",
  u."display_name", u."avatar_url", u."status", u."password_hash", u."created_at", now(), u."deleted_at"
FROM "realm_twins" tw JOIN "users" u ON u."id" = tw."source_id";

-- Vai gian hàng → song sinh partner.
UPDATE "tenant_memberships" x SET "user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'partner' AND x."user_id" = tw."source_id";
UPDATE "tenants" x SET "owner_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'partner' AND x."owner_user_id" = tw."source_id";
UPDATE "conversation_participants" x SET "user_id" = tw."twin_id"
FROM "realm_twins" tw
WHERE tw."realm" = 'partner' AND x."user_id" = tw."source_id" AND x."participant_type" = 'shop_member';
UPDATE "messages" x SET "sender_user_id" = tw."twin_id"
FROM "realm_twins" tw
WHERE tw."realm" = 'partner' AND x."sender_user_id" = tw."source_id" AND x."sender_type" = 'shop_member';

-- Vai khách → song sinh customer.
UPDATE "booking_requests" x SET "customer_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'customer' AND x."customer_user_id" = tw."source_id";
UPDATE "booking_holds" x SET "customer_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'customer' AND x."customer_user_id" = tw."source_id";
UPDATE "hold_refunds" x SET "customer_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'customer' AND x."customer_user_id" = tw."source_id";
UPDATE "promo_redemptions" x SET "customer_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'customer' AND x."customer_user_id" = tw."source_id";
UPDATE "conversations" x SET "customer_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'customer' AND x."customer_user_id" = tw."source_id";
UPDATE "tenant_customers" x SET "customer_user_id" = tw."twin_id"
FROM "realm_twins" tw WHERE tw."realm" = 'customer' AND x."customer_user_id" = tw."source_id";
UPDATE "wallets" x SET "owner_user_id" = tw."twin_id"
FROM "realm_twins" tw
WHERE tw."realm" = 'customer' AND x."owner_type" = 'user' AND x."owner_user_id" = tw."source_id";
UPDATE "bank_accounts" x SET "owner_user_id" = tw."twin_id"
FROM "realm_twins" tw
WHERE tw."realm" = 'customer' AND x."owner_type" = 'user' AND x."owner_user_id" = tw."source_id";
UPDATE "conversation_participants" x SET "user_id" = tw."twin_id"
FROM "realm_twins" tw
WHERE tw."realm" = 'customer' AND x."user_id" = tw."source_id" AND x."participant_type" = 'customer';
UPDATE "messages" x SET "sender_user_id" = tw."twin_id"
FROM "realm_twins" tw
WHERE tw."realm" = 'customer' AND x."sender_user_id" = tw."source_id" AND x."sender_type" = 'customer';

-- Một người một gian hàng: giữ membership active có vai chủ, rồi mới nhất.
UPDATE "tenant_memberships" tm SET "status" = 'removed', "updated_at" = now()
FROM (
  SELECT "id", row_number() OVER (
    PARTITION BY "user_id"
    ORDER BY ("role_key" = 'shop_owner') DESC, "joined_at" DESC NULLS LAST, "created_at" DESC
  ) AS "rank"
  FROM "tenant_memberships" WHERE "status" = 'active'
) ranked
WHERE ranked."id" = tm."id" AND ranked."rank" > 1;

-- Phiên/mã đăng nhập app native lệch realm của app: thu hồi, thiết bị đăng nhập lại. Lý do thu hồi
-- mới `realm_split` để lịch sử phiên đọc được vì sao thiết bị bị đăng xuất.
ALTER TABLE "native_auth_sessions" DROP CONSTRAINT "native_auth_sessions_revoked_reason_check";
ALTER TABLE "native_auth_sessions" ADD CONSTRAINT "native_auth_sessions_revoked_reason_check"
  CHECK ("revoked_reason" IS NULL
    OR "revoked_reason" IN ('logout', 'refresh_reuse', 'user_disabled', 'realm_split'));
UPDATE "native_auth_sessions" s SET "revoked_at" = now(), "revoked_reason" = 'realm_split'
FROM "users" u
WHERE u."id" = s."user_id" AND s."revoked_at" IS NULL
  AND u."realm" <> CASE WHEN s."client_app" = 'partner' THEN 'partner' ELSE 'customer' END;
UPDATE "native_auth_codes" c SET "consumed_at" = now()
FROM "users" u
WHERE u."id" = c."user_id" AND c."consumed_at" IS NULL
  AND u."realm" <> CASE WHEN c."client_app" = 'partner' THEN 'partner' ELSE 'customer' END;

DROP FUNCTION "xeprime_tmp_ulid"();
ALTER TABLE "users" ALTER COLUMN "realm" DROP DEFAULT;

-- Tự kiểm: sau bước tách KHÔNG còn hàng nào lệch realm.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tenant_memberships" tm JOIN "users" u ON u."id" = tm."user_id"
             WHERE u."realm" <> 'partner')
     OR EXISTS (SELECT 1 FROM "tenants" t JOIN "users" u ON u."id" = t."owner_user_id"
                WHERE u."realm" <> 'partner')
     OR EXISTS (SELECT 1 FROM "platform_memberships" pm JOIN "users" u ON u."id" = pm."user_id"
                WHERE u."realm" <> 'platform')
     OR EXISTS (SELECT 1 FROM "tenant_memberships" WHERE "status" = 'active'
                GROUP BY "user_id" HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM "booking_requests" x JOIN "users" u ON u."id" = x."customer_user_id"
                WHERE u."realm" <> 'customer')
     OR EXISTS (SELECT 1 FROM "wallets" w JOIN "users" u ON u."id" = w."owner_user_id"
                WHERE w."owner_type" = 'user' AND u."realm" <> 'customer')
  THEN
    RAISE EXCEPTION 'ADR 0053: bước tách realm còn để lại hàng lệch — lỗi của migration, xem mục 2';
  END IF;
END $$;

-- ── 3. user_identities ─────────────────────────────────────────────────────────────────────
ALTER TABLE "user_identities" ADD COLUMN "realm" VARCHAR(20);
UPDATE "user_identities" ui SET "realm" = u."realm" FROM "users" u WHERE u."id" = ui."user_id";
ALTER TABLE "user_identities" ALTER COLUMN "realm" SET NOT NULL;

ALTER TABLE "user_identities" DROP CONSTRAINT "user_identities_user_id_fkey";
DROP INDEX "user_identities_provider_provider_user_id_key";
CREATE UNIQUE INDEX "user_identities_realm_provider_key"
  ON "user_identities"("realm", "provider", "provider_user_id");
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_realm_fkey"
  FOREIGN KEY ("user_id", "realm") REFERENCES "users"("id", "realm")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- ── 4. realm của các luồng xác thực ────────────────────────────────────────────────────────
ALTER TABLE "phone_verifications" ADD COLUMN "realm" VARCHAR(20);
UPDATE "phone_verifications" pv
SET "realm" = COALESCE((SELECT u."realm" FROM "users" u WHERE u."id" = pv."user_id"), 'customer');
ALTER TABLE "phone_verifications" ALTER COLUMN "realm" SET NOT NULL;
ALTER TABLE "phone_verifications" ADD CONSTRAINT "phone_verifications_realm_check"
  CHECK ("realm" IN ('customer', 'partner', 'platform'));
-- Index theo SĐT trước (không theo realm): cooldown/trần gửi đếm theo SĐT trên mọi realm.
DROP INDEX "phone_verifications_phone_idx";
CREATE INDEX "phone_verifications_phone_created_at_idx" ON "phone_verifications"("phone", "created_at");

ALTER TABLE "email_verifications" ADD COLUMN "realm" VARCHAR(20);
UPDATE "email_verifications" ev
SET "realm" = COALESCE((SELECT u."realm" FROM "users" u WHERE u."id" = ev."user_id"), 'customer');
ALTER TABLE "email_verifications" ALTER COLUMN "realm" SET NOT NULL;
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_realm_check"
  CHECK ("realm" IN ('customer', 'partner', 'platform'));
DROP INDEX "email_verifications_email_idx";
CREATE INDEX "email_verifications_email_created_at_idx" ON "email_verifications"("email", "created_at");

-- Trạng thái OAuth sống 10 phút; luồng đang dở lúc deploy coi là của site khách.
ALTER TABLE "oauth_states" ADD COLUMN "realm" VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE "oauth_states" ALTER COLUMN "realm" DROP DEFAULT;
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_realm_check"
  CHECK ("realm" IN ('customer', 'partner', 'platform'));

-- ── 5. Trigger giữ ranh giới realm ─────────────────────────────────────────────────────────
-- Realm là danh tính của tài khoản, không phải một thuộc tính sửa được: đổi realm là lặng lẽ
-- chuyển một tài khoản khách thành tài khoản chủ xe cùng toàn bộ lịch sử tiền của nó.
CREATE FUNCTION "xeprime_users_realm_immutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."realm" IS DISTINCT FROM OLD."realm" THEN
    RAISE EXCEPTION 'ADR 0053: users.realm không đổi được sau khi tạo (user %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "users_realm_immutable"
  BEFORE UPDATE OF "realm" ON "users"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_users_realm_immutable"();

-- Một hàm cho mọi cột "người này phải thuộc realm X": TG_ARGV[0] = tên cột user, TG_ARGV[1] = realm.
CREATE FUNCTION "xeprime_assert_user_realm"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  uid text;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', TG_ARGV[0]) INTO uid USING NEW;
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "users" WHERE "id" = uid AND "realm" = TG_ARGV[1]) THEN
    RAISE EXCEPTION 'ADR 0053: %.% phải là tài khoản realm % (user %)',
      TG_TABLE_NAME, TG_ARGV[0], TG_ARGV[1], uid
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "tenant_memberships_user_realm_check"
  BEFORE INSERT OR UPDATE OF "user_id" ON "tenant_memberships"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_assert_user_realm"('user_id', 'partner');

CREATE TRIGGER "tenants_owner_realm_check"
  BEFORE INSERT OR UPDATE OF "owner_user_id" ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_assert_user_realm"('owner_user_id', 'partner');

CREATE TRIGGER "platform_memberships_user_realm_check"
  BEFORE INSERT OR UPDATE OF "user_id" ON "platform_memberships"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_assert_user_realm"('user_id', 'platform');

-- ── 6. Một nhân viên một gian hàng ─────────────────────────────────────────────────────────
-- Unique index một phần — Prisma không mô tả được, nên `schema.prisma` chỉ ghi chú ở model.
CREATE UNIQUE INDEX "tenant_memberships_one_active_per_user"
  ON "tenant_memberships"("user_id") WHERE "status" = 'active';
