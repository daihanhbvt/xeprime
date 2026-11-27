-- ADR 0110 — NGUỒN ĐƠN: mọi chủ xe tự lập đơn ngoài sàn, mỗi đơn mang nguồn.
--
-- 1. `bookings.source` (+ `source_label` tự nhập): `xeprime` = đơn qua sàn, giá trị khác = đơn chủ xe tự
--    lập (ngoài sàn — không phí, không thuế, không bảo hiểm).
-- 2. Luật `source = 'xeprime'` ⇔ đơn sinh ra từ một yêu cầu đặt xe, giữ ở DB bằng hai trigger:
--    - yêu cầu trỏ vào đơn (`booking_requests.booking_id`) ⇒ đơn TỰ thành `xeprime`;
--    - một lượt ghi `source` lệch khỏi luật bị từ chối lúc COMMIT.
--
-- Chỉ THÊM cột. Đơn đang có: sinh từ yêu cầu ⇒ `xeprime`; còn lại ⇒ `other` (đơn tự lập trước ADR
-- này, chưa ai khai nguồn) — không đổi tiền, lịch hay trạng thái của đơn nào.

ALTER TABLE "bookings" ADD COLUMN "source" VARCHAR(30) NOT NULL DEFAULT 'other';
ALTER TABLE "bookings" ADD COLUMN "source_label" VARCHAR(50);

UPDATE "bookings" b
   SET "source" = 'xeprime'
 WHERE EXISTS (SELECT 1 FROM "booking_requests" r WHERE r."booking_id" = b."id");

-- @xeprime/types → BOOKING_SOURCE
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_source_check"
    CHECK ("source" IN ('xeprime', 'walk_in', 'repeat_customer', 'referral', 'social', 'other_platform', 'other'));

-- Nhãn tự nhập chỉ có ở hai nguồn nhận nhãn, và không rỗng. KHÔNG bắt buộc ở DB: đơn tự lập cũ và
-- app chưa cập nhật mang `other` không nhãn; form web và DTO mới là nơi đòi nhãn.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_source_label_check"
    CHECK ("source_label" IS NULL
        OR ("source" IN ('other_platform', 'other') AND char_length(btrim("source_label")) BETWEEN 1 AND 50));

-- Bộ lọc "Nguồn đơn" của danh sách đơn + thống kê theo nguồn của một gian hàng.
CREATE INDEX "bookings_tenant_id_source_pickup_at_idx" ON "bookings"("tenant_id", "source", "pickup_at");
-- Số liệu giao dịch của sàn (admin) chỉ đếm đơn qua sàn, theo ngày tạo.
CREATE INDEX "bookings_marketplace_created_at_idx" ON "bookings"("created_at")
    WHERE "source" = 'xeprime' AND "deleted_at" IS NULL;

-- ── Yêu cầu trỏ vào đơn ⇒ đơn là đơn qua sàn ─────────────────────────────────────────────────────
-- Mọi đường gắn yêu cầu vào đơn (duyệt tay, tiền về đủ, seed, dữ liệu test) đi qua đây, nên không
-- có đường nào tạo ra đơn qua sàn mang nhãn ngoài sàn.
CREATE FUNCTION "xeprime_booking_source_from_request"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."booking_id" IS NOT NULL THEN
    UPDATE "bookings"
       SET "source" = 'xeprime', "source_label" = NULL
     WHERE "id" = NEW."booking_id" AND "source" <> 'xeprime';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "booking_requests_mark_booking_source"
  AFTER INSERT OR UPDATE OF "booking_id" ON "booking_requests"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_booking_source_from_request"();

-- ── `source` phải khớp việc đơn có yêu cầu hay không ─────────────────────────────────────────────
-- DEFERRED: đơn được tạo TRƯỚC, yêu cầu trỏ vào nó SAU trong cùng transaction. Hàm đọc lại dòng
-- HIỆN TẠI chứ không dùng NEW — NEW của sự kiện INSERT đã cũ khi trigger ở trên vừa đổi `source`.
CREATE FUNCTION "xeprime_assert_booking_source"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_source text;
  has_request boolean;
BEGIN
  SELECT "source" INTO current_source FROM "bookings" WHERE "id" = NEW."id";
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT EXISTS (SELECT 1 FROM "booking_requests" WHERE "booking_id" = NEW."id") INTO has_request;
  IF (current_source = 'xeprime') IS DISTINCT FROM has_request THEN
    RAISE EXCEPTION 'bookings.source = % không khớp: đơn % yêu cầu đặt xe',
      current_source, CASE WHEN has_request THEN 'có' ELSE 'không có' END
      USING ERRCODE = '23514', CONSTRAINT = 'bookings_source_matches_request';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "bookings_source_matches_request"
  AFTER INSERT OR UPDATE OF "source" ON "bookings"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "xeprime_assert_booking_source"();
