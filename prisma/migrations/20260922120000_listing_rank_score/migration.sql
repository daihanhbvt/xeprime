-- ============================================================================
-- ĐIỂM XẾP HẠNG "PHÙ HỢP VỚI BẠN" CHO CHỢ XE (22/09/2026)
--
-- Trước thay đổi này, thứ tự gợi ý của marketplace là `rating_avg DESC, rating_count DESC,
-- created_at DESC`. Ba vấn đề, và cả ba đều nhìn thấy được trên dữ liệu thật:
--
--   1. Một xe 5,0 sao với ĐÚNG MỘT đánh giá đứng trên một xe 4,8 sao với hai trăm đánh giá.
--      Trung bình trần không phân biệt "tốt" với "chưa ai chấm".
--   2. Không có yếu tố ĐỊA LÝ nào. Khách đứng ở Hà Nội và khách đứng ở Cà Mau thấy đúng một
--      danh sách — trong khi thứ họ sắp làm là ra tận nơi nhận xe.
--   3. Một xe thiếu ảnh, thiếu giá vẫn xếp ngang một xe khai đủ hồ sơ.
--
-- Cột này giữ phần điểm KHÔNG phụ thuộc truy vấn (chất lượng, số chuyến, độ đầy hồ sơ, độ mới)
-- trong [0,1]. Phần phụ thuộc truy vấn — khách đang ở tỉnh nào — không lưu được ở đây vì nó
-- khác nhau theo từng người xem, nên nó cộng vào lúc đọc dưới dạng BẬC ưu tiên
-- (đúng tỉnh → cùng vùng → còn lại).
--
-- Vì sao denormalize thay vì tính trong ORDER BY: công thức cần đếm chuyến đã hoàn thành và
-- đếm ảnh của từng xe. Tính live nghĩa là hai phép gộp cho MỖI dòng của MỖI lượt mở trang chủ.
--
-- Nguồn ghi: `refreshListingRankScore` ở `@xeprime/prisma` (ADR 0008 §1 — cột dẫn xuất của
-- `public_listings` chỉ có một đường ghi). ListingsService gọi khi xe/đánh giá đổi; worker gọi
-- mỗi ngày để thành phần ĐỘ MỚI kịp phai.
-- ============================================================================

ALTER TABLE "public_listings"
  ADD COLUMN IF NOT EXISTS "rank_score" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Hai index cho hai bậc địa lý của cùng một truy vấn: "xe ở tỉnh của khách" và "xe ở bất kỳ
-- đâu" (bậc bù khi tỉnh đó chưa đủ xe). Không có chúng thì mỗi lượt mở trang chủ là một lần
-- sắp xếp toàn bảng.
CREATE INDEX IF NOT EXISTS "public_listings_status_province_code_rank_score_idx"
  ON "public_listings" ("status", "province_code", "rank_score");
CREATE INDEX IF NOT EXISTS "public_listings_status_rank_score_idx"
  ON "public_listings" ("status", "rank_score");

-- ----------------------------------------------------------------------------
-- Nạp giá trị ban đầu.
--
-- BẢN SAO ĐÔNG LẠNH của công thức trong `refreshListingRankScore` tại thời điểm migration này
-- — giống mọi migration, nó là lịch sử và KHÔNG được sửa theo công thức tương lai. Sau lần
-- worker chạy đầu tiên, giá trị ở đây bị ghi đè bằng công thức đang sống.
--
-- Có mặt để một database vừa `migrate deploy` xong đã xếp hạng đúng ngay, thay vì mọi xe cùng
-- điểm 0 (tức là rơi về "mới nhất") cho tới nhịp worker kế tiếp.
-- ----------------------------------------------------------------------------
UPDATE "public_listings" pl
   SET "rank_score" = s."score"
  FROM (
    SELECT p."id",
           ROUND(
               -- Chất lượng, trung bình BAYES: điểm của một xe được kéo về mặt bằng chung của
               -- sàn (C) theo số đánh giá nó có (v). Ít đánh giá ⇒ gần C; nhiều đánh giá ⇒ gần
               -- điểm thật của nó. Đây là vế sửa vấn đề (1) ở đầu file.
               0.45 * GREATEST(0, LEAST(1,
                 ((p."rating_count" * COALESCE(p."rating_avg", 0) + 5 * 4.6)
                   / (p."rating_count" + 5) - 1) / 4
               ))
             -- Số chuyến đã chạy, thang log: chuyến thứ 2 nói nhiều hơn chuyến thứ 40.
             + 0.25 * LEAST(1, LN(1 + tr."trips"::numeric) / LN(51::numeric))
             -- Độ đầy hồ sơ: bốn điều kiện đếm được, không có điều kiện nào là lời hứa.
             + 0.18 * ((
                   (p."main_image_url" IS NOT NULL)::int
                 + (p."weekday_price" IS NOT NULL)::int
                 + (img."images" >= 4)::int
                 + (COALESCE(array_length(p."features", 1), 0) >= 3)::int
               )::numeric / 4)
             -- Độ mới, phai theo nửa đời ~30 ngày: xe vừa lên sàn cần một cơ hội để có đánh
             -- giá đầu tiên, nếu không nó vĩnh viễn nằm dưới vì chưa ai từng thuê.
             + 0.12 * EXP(-(EXTRACT(EPOCH FROM (now() - p."created_at")) / 86400 / 30)::numeric)
           , 6) AS "score"
      FROM "public_listings" p
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS "trips"
          FROM "bookings" b
         WHERE b."vehicle_id" = p."vehicle_id"
           AND b."status" = 'completed'
           AND b."deleted_at" IS NULL
      ) tr ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS "images"
          FROM "vehicle_images" vi
         WHERE vi."vehicle_id" = p."vehicle_id"
      ) img ON true
  ) s
 WHERE pl."id" = s."id";
