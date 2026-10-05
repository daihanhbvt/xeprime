-- ADR 0053 — Ba không gian tài khoản tách biệt: customer · partner · platform.
--
-- Viết TAY từ `prisma migrate diff`. Đã BỎ mọi lệnh drift có sẵn mà diff kéo theo (DROP các FK tổ
-- hợp `(id, tenant_id)`, đổi tên index/FK, xoá `vehicle_catalog_models.brand_catalog_type`) — xem
-- header của baseline `20260821000000_init` và mục 6 của `docs/completion-roadmap.md`.
--
-- Những gì migration này dựng:
--   1. `users.realm` + CHECK, gán realm cho dữ liệu có sẵn (platform > partner > customer).
--   2. Email/SĐT unique TRONG realm; `(id, realm)` unique làm đích FK tổ hợp.
--   3. `user_identities.realm` + FK tổ hợp `(user_id, realm)` + unique `(realm, provider, provider_user_id)`.
--   4. realm trên `phone_verifications`, `email_verifications`, `oauth_states`.
--   5. Trigger: realm của tài khoản không đổi được; membership gian hàng và chủ tenant chỉ là
--      tài khoản `partner`; membership nền tảng chỉ là tài khoản `platform`.
--   6. Một tài khoản partner có tối đa MỘT membership `active` (unique index một phần).
--
-- Dữ liệu trộn vai (một tài khoản vừa là nhân sự nền tảng vừa là thành viên gian hàng, hoặc thuộc
-- hai gian hàng cùng lúc) KHÔNG tách tự động được: migration dừng với thông báo rõ. Chỉ DB dev cũ
-- rơi vào ca này — production chưa có dữ liệu (ADR 0053 điều 10). Cách xử lý: `prisma migrate
-- reset` (người dùng tự gõ) rồi seed lại.

-- ── 1. users.realm ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN "realm" VARCHAR(20) NOT NULL DEFAULT 'customer';
ALTER TABLE "users" ADD CONSTRAINT "users_realm_check"
  CHECK ("realm" IN ('customer', 'partner', 'platform'));

UPDATE "users" u SET "realm" = 'platform'
WHERE EXISTS (SELECT 1 FROM "platform_memberships" pm WHERE pm."user_id" = u."id");

UPDATE "users" u SET "realm" = 'partner'
WHERE u."realm" = 'customer'
  AND (
    EXISTS (SELECT 1 FROM "tenant_memberships" tm WHERE tm."user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "tenants" t WHERE t."owner_user_id" = u."id")
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "tenant_memberships" tm JOIN "users" u ON u."id" = tm."user_id"
    WHERE u."realm" <> 'partner'
  ) OR EXISTS (
    SELECT 1 FROM "tenants" t JOIN "users" u ON u."id" = t."owner_user_id"
    WHERE u."realm" <> 'partner'
  ) THEN
    RAISE EXCEPTION 'ADR 0053: có tài khoản vừa là nhân sự nền tảng vừa thuộc một gian hàng. '
      'Dữ liệu trộn vai không tách tự động được — DB dev: chạy `prisma migrate reset` rồi seed lại.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "tenant_memberships" WHERE "status" = 'active'
    GROUP BY "user_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'ADR 0053: có tài khoản đang thuộc nhiều gian hàng cùng lúc (một nhân viên chỉ '
      'thuộc một gian hàng). DB dev: chạy `prisma migrate reset` rồi seed lại.';
  END IF;
END $$;

-- ── 2. Định danh đăng nhập unique TRONG realm ──────────────────────────────────────────────
DROP INDEX "users_email_key";
DROP INDEX "users_phone_key";
CREATE UNIQUE INDEX "users_realm_email_key" ON "users"("realm", "email");
CREATE UNIQUE INDEX "users_realm_phone_key" ON "users"("realm", "phone");
CREATE UNIQUE INDEX "users_id_realm_key" ON "users"("id", "realm");

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
DROP INDEX "phone_verifications_phone_idx";
CREATE INDEX "phone_verifications_realm_phone_idx" ON "phone_verifications"("realm", "phone");

ALTER TABLE "email_verifications" ADD COLUMN "realm" VARCHAR(20);
UPDATE "email_verifications" ev
SET "realm" = COALESCE((SELECT u."realm" FROM "users" u WHERE u."id" = ev."user_id"), 'customer');
ALTER TABLE "email_verifications" ALTER COLUMN "realm" SET NOT NULL;
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_realm_check"
  CHECK ("realm" IN ('customer', 'partner', 'platform'));
DROP INDEX "email_verifications_email_idx";
CREATE INDEX "email_verifications_realm_email_idx" ON "email_verifications"("realm", "email");

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
