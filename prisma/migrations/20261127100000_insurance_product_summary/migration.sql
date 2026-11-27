-- Ô chọn bảo hiểm theo design MIC 27/11/2026: một dòng mô tả ngắn dưới tên sản phẩm + phạm vi bảo
-- vệ dạng danh sách tích (mỗi dòng của `coverage_*` là một mục).
--
-- 1. Hai cột mô tả ngắn, admin sửa ở màn "Bảo hiểm". NULL = web ghép từ các mục phạm vi.
ALTER TABLE "insurance_products"
    ADD COLUMN "summary_vi" VARCHAR(255),
    ADD COLUMN "summary_en" VARCHAR(255);

-- 2. Nội dung mặc định cho VCX của MIC - CHỈ khi admin chưa sửa (còn đúng câu seed cũ): cùng các
--    rủi ro đã công bố, tách thành 3 mục, chờ MIC gửi nội dung chính thức. Dòng admin đã sửa giữ nguyên.
UPDATE "insurance_products"
SET "coverage_vi" = E'Đâm va, lật đổ, chìm, rơi trong thời gian thuê\nHoả hoạn, cháy nổ & ngập nước (thuỷ kích)\nMất cắp bộ phận xe trong thời gian thuê'
WHERE "provider" = 'mic'
  AND "kind" = 'vehicle_trip'
  AND "coverage_vi" = 'Đâm va, lật đổ, chìm, rơi, hoả hoạn, ngập nước (thuỷ kích), mất cắp bộ phận trong thời gian thuê.';

UPDATE "insurance_products"
SET "coverage_en" = E'Collision, overturning, sinking or falling during the rental\nFire, explosion & flooding (hydrolock)\nTheft of vehicle parts during the rental'
WHERE "provider" = 'mic'
  AND "kind" = 'vehicle_trip'
  AND "coverage_en" = 'Collision, overturning, sinking, falling, fire, flooding (hydrolock) and theft of parts during the rental.';

UPDATE "insurance_products"
SET "summary_vi" = 'Đâm va, ngập nước (thuỷ kích), mất cắp bộ phận',
    "summary_en" = 'Collision, flooding (hydrolock), theft of parts'
WHERE "provider" = 'mic'
  AND "kind" = 'vehicle_trip'
  AND "summary_vi" IS NULL
  AND "summary_en" IS NULL;
