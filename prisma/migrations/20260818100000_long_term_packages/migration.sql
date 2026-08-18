-- ---------------------------------------------------------------------------
-- Thuê dài hạn: GÓI CỐ ĐỊNH theo tháng lịch + nguyện vọng ngày nhận (ADR 0011)
--
-- Mô hình cũ: khách tự chọn khoảng ngày nhận–trả (sàn 7 ngày), giá = giá tháng ÷ 30, mốc ưu
-- đãi cấu hình theo NGÀY. Mô hình mới:
--   * khách chọn MỘT gói trong (1,2,3,6,9,12) tháng và chỉ nêu NGUYỆN VỌNG ngày nhận;
--   * gian hàng chốt ngày/giờ nhận chính xác lúc duyệt, server tính ngày trả = nhận + N
--     THÁNG LỊCH (kẹp cuối tháng) — không còn phép nhân 30 ngày ở bất cứ đâu;
--   * mốc ưu đãi lưu canonical theo THÁNG (`minMonths`).
--
-- Chiến lược dữ liệu cũ (KHÔNG làm tròn ngầm, KHÔNG sửa snapshot giá lịch sử):
--   * yêu cầu/đơn dài hạn cũ chỉ được gán gói khi thời lượng khớp CHÍNH XÁC một gói hợp lệ
--     tính theo tháng lịch giờ Việt Nam; không khớp thì giữ package NULL + nguyên ngày cũ;
--   * yêu cầu pending không khớp => "legacy": CHECK dưới vẫn cho tồn tại nhờ còn đủ
--     pickup_at/return_at, và luồng duyệt bắt gian hàng chọn gói khi xử lý;
--   * mốc ưu đãi theo ngày quy đổi được (30/60/90/180/270/360) đổi sang `minMonths`; mốc
--     không khớp gói nào giữ nguyên và bị đánh dấu `legacy: true` — không tham gia tính giá,
--     biến mất khi chủ xe lưu lại chính sách.
-- ---------------------------------------------------------------------------

-- 1) booking_requests --------------------------------------------------------

ALTER TABLE "booking_requests"
    ADD COLUMN "long_term_package_months" SMALLINT,
    ADD COLUMN "pickup_preference" VARCHAR(30),
    ADD COLUMN "requested_pickup_date" DATE,
    ADD COLUMN "pickup_window_start_date" DATE,
    ADD COLUMN "pickup_window_end_date" DATE;

-- Yêu cầu dài hạn mới CHƯA có lịch chính xác (gian hàng chốt khi duyệt) → hai cột lịch phải
-- cho NULL. Dịch vụ khác vẫn bắt buộc, cưỡng chế bằng CHECK bên dưới.
ALTER TABLE "booking_requests"
    ALTER COLUMN "pickup_at" DROP NOT NULL,
    ALTER COLUMN "return_at" DROP NOT NULL;

-- Backfill gói: chỉ khi return_at = pickup_at + N tháng lịch ĐÚNG theo giờ Việt Nam.
UPDATE "booking_requests" AS br
SET "long_term_package_months" = m.months
FROM (VALUES (1),(2),(3),(6),(9),(12)) AS m(months)
WHERE br."service_type" = 'long_term'
  AND br."pickup_at" IS NOT NULL
  AND br."return_at" IS NOT NULL
  AND br."return_at" = (
        ((br."pickup_at" AT TIME ZONE 'Asia/Ho_Chi_Minh') + (m.months || ' months')::interval)
        AT TIME ZONE 'Asia/Ho_Chi_Minh');

ALTER TABLE "booking_requests"
    ADD CONSTRAINT "booking_requests_schedule_presence_check"
        CHECK ("service_type" = 'long_term'
               OR ("pickup_at" IS NOT NULL AND "return_at" IS NOT NULL)),
    -- Yêu cầu dài hạn hợp lệ theo MỘT trong hai đời: có gói (mô hình mới) hoặc có lịch đầy đủ
    -- (bản ghi legacy). Cấm bản ghi dài hạn vừa không gói vừa không lịch.
    ADD CONSTRAINT "booking_requests_long_term_intent_check"
        CHECK ("service_type" <> 'long_term'
               OR "long_term_package_months" IS NOT NULL
               OR ("pickup_at" IS NOT NULL AND "return_at" IS NOT NULL)),
    ADD CONSTRAINT "booking_requests_long_term_package_check"
        CHECK ("long_term_package_months" IS NULL
               OR ("service_type" = 'long_term'
                   AND "long_term_package_months" IN (1,2,3,6,9,12))),
    ADD CONSTRAINT "booking_requests_pickup_preference_check"
        CHECK ("pickup_preference" IS NULL
               OR ("service_type" = 'long_term'
                   AND "pickup_preference" IN ('within_7_days','specific_date'))),
    -- Ngày cụ thể và khoảng linh hoạt LOẠI TRỪ nhau — không có bản ghi mang cả hai.
    ADD CONSTRAINT "booking_requests_pickup_intent_check"
        CHECK (
            ("pickup_preference" IS NULL
                AND "requested_pickup_date" IS NULL
                AND "pickup_window_start_date" IS NULL
                AND "pickup_window_end_date" IS NULL)
            OR ("pickup_preference" = 'specific_date'
                AND "requested_pickup_date" IS NOT NULL
                AND "pickup_window_start_date" IS NULL
                AND "pickup_window_end_date" IS NULL)
            OR ("pickup_preference" = 'within_7_days'
                AND "requested_pickup_date" IS NULL
                AND "pickup_window_start_date" IS NOT NULL
                AND "pickup_window_end_date" IS NOT NULL
                AND "pickup_window_end_date" >= "pickup_window_start_date"));

-- Chống double-submit cho yêu cầu dài hạn: index cũ khoá trên (xe, SĐT, pickup_at, return_at)
-- mà hai cột đó nay NULL với dài hạn — NULL là "khác nhau" nên index cũ không còn chặn được.
-- NULLS NOT DISTINCT (PG15+) để hai lần gửi cùng gói + cùng nguyện vọng bị chặn.
CREATE UNIQUE INDEX "booking_requests_pending_long_term_dedupe_idx"
    ON "booking_requests" ("vehicle_id", "customer_phone", "long_term_package_months",
                           "pickup_preference", "requested_pickup_date")
    NULLS NOT DISTINCT
    WHERE "status" = 'pending_host_approval' AND "service_type" = 'long_term';

-- 2) bookings ---------------------------------------------------------------

ALTER TABLE "bookings"
    ADD COLUMN "long_term_package_months" SMALLINT;

UPDATE "bookings" AS b
SET "long_term_package_months" = m.months
FROM (VALUES (1),(2),(3),(6),(9),(12)) AS m(months)
WHERE b."service_type" = 'long_term'
  AND b."return_at" = (
        ((b."pickup_at" AT TIME ZONE 'Asia/Ho_Chi_Minh') + (m.months || ' months')::interval)
        AT TIME ZONE 'Asia/Ho_Chi_Minh');

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_long_term_package_check"
        CHECK ("long_term_package_months" IS NULL
               OR ("service_type" = 'long_term'
                   AND "long_term_package_months" IN (1,2,3,6,9,12)));

-- 3) rental_policies.discount_tiers_json: minDays -> minMonths ---------------

UPDATE "rental_policies"
SET "discount_tiers_json" = COALESCE((
        SELECT jsonb_agg(
                   CASE
                       -- Đã canonical (không xảy ra ở lần chạy đầu, nhưng migration phải idempotent).
                       WHEN jsonb_exists(e.tier, 'minMonths') THEN e.tier
                       WHEN (e.tier->>'minDays')::int IN (30,60,90,180,270,360)
                           THEN jsonb_strip_nulls(jsonb_build_object(
                                    'minMonths', (e.tier->>'minDays')::int / 30,
                                    'percent', (e.tier->>'percent')::int,
                                    'note', e.tier->'note'))
                       -- Mốc ngày không khớp gói nào: GIỮ NGUYÊN, đánh dấu legacy để máy giá
                       -- bỏ qua và màn cấu hình nhắc chủ xe chọn lại theo tháng.
                       ELSE e.tier || jsonb_build_object('legacy', true)
                   END
                   ORDER BY e.ord)
        FROM jsonb_array_elements("discount_tiers_json") WITH ORDINALITY AS e(tier, ord)
    ), '[]'::jsonb)
WHERE jsonb_typeof("discount_tiers_json") = 'array'
  AND jsonb_array_length("discount_tiers_json") > 0;
