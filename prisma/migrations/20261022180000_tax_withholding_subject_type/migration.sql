-- ═══════════════════════════════════════════════════════════════════════════
-- Sổ thuế: tách loại chủ thể NGƯỜI BÁN KHAI khỏi chủ thể ÁP THUẾ — ADR 0068 điều 2 + 4
-- (22/10/2026)
--
-- `tax_withholdings.seller_entity_type` (thêm ở `20261022170000_tax_withholding_nd117_v9`) là loại
-- chủ thể NGƯỜI BÁN KHAI trong hồ sơ lúc ghi sổ — NULL khi gian hàng chưa có hồ sơ người bán. Tờ
-- khai chia theo nó, và nhóm "chưa khai hồ sơ" (`unknown`) phải hiện ra chứ không bị gộp vào cá
-- nhân. Bản đầu của writer lại ghi vào đó chủ thể ÁP THUẾ (`taxSellerEntityOf`: không hồ sơ /
-- doanh nghiệp chưa xác minh ⇒ `individual`) — xoá mất đúng khoảng trống mà tờ khai cần thấy.
--
-- Cột mới `tax_subject_type` giữ riêng sự kiện thứ hai: chủ thể ÁP THUẾ đã đóng băng trên snapshot
-- của đơn lúc nhận chuyến (`bookings.price_snapshot_json → fees.sellerEntityType`, ADR 0024). Dòng sổ
-- chỉ tồn tại khi có khấu trừ, nên trên thực tế nó là `individual` hoặc `household_business`;
-- NULL ở dòng một-mức trước ADR 0068 (khi đó mọi chủ thể đều bị khấu trừ, không có phép phân loại).
--
-- Backfill (chỉ có dữ liệu ở DB dev/test — migration v9 chưa lên môi trường nào):
--   1. `tax_subject_type` đọc lại từ snapshot của đơn — đúng nguồn writer dùng.
--   2. `seller_entity_type` của các dòng v9 (có GTGT/TNCN tách) ghi lại bằng loại chủ thể KHAI của
--      hồ sơ đang trỏ tới; không có hồ sơ ⇒ NULL. Đây là giá trị tốt nhất còn đọc được — hồ sơ có
--      thể đã đổi từ lúc ghi sổ, nhưng các dòng này chỉ là dữ liệu thử ở dev/test.
--   Dòng một-mức cũ không đụng: `seller_entity_type` của chúng vốn NULL và phía đọc rơi về hồ sơ.
--
-- ⚠ Prisma KHÔNG diễn đạt được CHECK — giữ khi `migrate dev` sinh lệnh DROP.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tax_withholdings"
    ADD COLUMN "tax_subject_type" VARCHAR(30);

ALTER TABLE "public"."tax_withholdings"
    ADD CONSTRAINT "tax_withholdings_tax_subject_type_check"
    CHECK (
        "tax_subject_type" IS NULL
        OR "tax_subject_type" IN ('individual', 'household_business', 'company')
    );

-- ── Backfill 1: chủ thể ÁP THUẾ từ snapshot của đơn ─────────────────────────

UPDATE "public"."tax_withholdings" AS tw
   SET "tax_subject_type" = b."price_snapshot_json" #>> '{fees,sellerEntityType}'
  FROM "public"."bookings" AS b
 WHERE b."id" = tw."booking_id"
   AND tw."tax_subject_type" IS NULL
   AND (b."price_snapshot_json" #>> '{fees,sellerEntityType}') IN ('individual', 'household_business', 'company');

-- ── Backfill 2: dòng v9 — loại chủ thể KHAI, NULL khi không có hồ sơ ────────

UPDATE "public"."tax_withholdings" AS tw
   SET "seller_entity_type" = sp."entity_type"
  FROM "public"."seller_profiles" AS sp
 WHERE sp."id" = tw."seller_profile_id"
   AND tw."vat_amount" IS NOT NULL
   AND tw."seller_entity_type" IS DISTINCT FROM sp."entity_type";

UPDATE "public"."tax_withholdings"
   SET "seller_entity_type" = NULL
 WHERE "seller_profile_id" IS NULL
   AND "vat_amount" IS NOT NULL
   AND "seller_entity_type" IS NOT NULL;
