-- Rút gọn link trang gian hàng (biên bản họp 19/11/2026, việc #24): `xeprime.vn/<slug>` thay cho
-- `/shops/<tên>-<6 ký tự id>`. "Hạnh Huế" ⇒ `hanh-hue`.
--
-- 1. `tenant_slug_aliases` giữ slug CŨ: link đã chia sẻ vẫn mở được và được trang web chuyển hẳn
--    (301) sang slug hiện tại.
-- 2. Gian hàng có slug dạng cũ `<tên>-<6 ký tự cuối id>` được đổi sang `<tên>` khi tên gọn còn
--    trống: không trùng slug gian hàng khác, không thuộc danh sách đường dẫn hệ thống
--    (`RESERVED_SHOP_SLUGS` ở `packages/types/src/shop-slug.ts` — chép nguyên ở đây), và khi nhiều
--    gian hàng cùng tên thì chỉ gian hàng tạo SỚM NHẤT nhận tên gọn; các gian hàng còn lại giữ nguyên.

CREATE TABLE "tenant_slug_aliases" (
  "slug" VARCHAR(120) NOT NULL,
  "tenant_id" CHAR(26) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_slug_aliases_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "tenant_slug_aliases_tenant_id_idx" ON "tenant_slug_aliases"("tenant_id");

ALTER TABLE "tenant_slug_aliases"
  ADD CONSTRAINT "tenant_slug_aliases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TEMP TABLE "_reserved_shop_slugs" ("slug" VARCHAR(120) PRIMARY KEY);
INSERT INTO "_reserved_shop_slugs" ("slug") VALUES
    ('about'),
    ('account'),
    ('api'),
    ('app'),
    ('app-return'),
    ('chat'),
    ('delete-account'),
    ('insurance'),
    ('legal'),
    ('list-your-vehicle'),
    ('listings'),
    ('payment'),
    ('reset-password'),
    ('search'),
    ('shops'),
    ('support'),
    ('trips'),
    ('admin'),
    ('manage'),
    ('auth'),
    ('body-types'),
    ('booking'),
    ('brand'),
    ('brands'),
    ('email'),
    ('home'),
    ('icons'),
    ('illustrations'),
    ('images'),
    ('owner-resources'),
    ('partner'),
    ('payment-methods'),
    ('states'),
    ('login'),
    ('register'),
    ('forgot-password'),
    ('administrators'),
    ('balance'),
    ('bookings'),
    ('calendar'),
    ('contracts-documents'),
    ('data-protection'),
    ('host-guide'),
    ('managed'),
    ('registration'),
    ('subscription'),
    ('tax'),
    ('vehicles'),
    ('blog'),
    ('checkout'),
    ('contact'),
    ('en'),
    ('faq'),
    ('guide'),
    ('help'),
    ('logout'),
    ('news'),
    ('partners'),
    ('pricing'),
    ('privacy'),
    ('settings'),
    ('shop'),
    ('signup'),
    ('sitemap'),
    ('static'),
    ('terms'),
    ('tin-tuc'),
    ('vi'),
    ('www'),
    ('xeprime');

CREATE TEMP TABLE "_short_shop_slugs" AS
SELECT "id", "slug" AS "old_slug", "base" AS "new_slug"
FROM (
  SELECT c.*, row_number() OVER (PARTITION BY c."base" ORDER BY c."created_at", c."id") AS "rn"
  FROM (
    SELECT t."id", t."slug", t."created_at", left(t."slug", length(t."slug") - 7) AS "base"
    FROM "tenants" t
    WHERE t."slug" ~ '-[a-z0-9]{6}$'
      AND right(t."slug", 6) = lower(right(t."id", 6))
  ) c
  WHERE c."base" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND NOT EXISTS (SELECT 1 FROM "_reserved_shop_slugs" r WHERE r."slug" = c."base")
    AND NOT EXISTS (SELECT 1 FROM "tenants" o WHERE o."slug" = c."base")
) ranked
WHERE "rn" = 1;

INSERT INTO "tenant_slug_aliases" ("slug", "tenant_id")
SELECT "old_slug", "id" FROM "_short_shop_slugs";

UPDATE "tenants" t
SET "slug" = s."new_slug"
FROM "_short_shop_slugs" s
WHERE t."id" = s."id";

DROP TABLE "_short_shop_slugs";
DROP TABLE "_reserved_shop_slugs";
