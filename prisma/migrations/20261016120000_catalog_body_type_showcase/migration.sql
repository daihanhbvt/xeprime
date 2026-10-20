-- Khối "Loại xe" trang chủ đọc từ DANH MỤC KIỂU DÁNG (trước đây gán cứng trong mã: danh sách,
-- ảnh lớn và dòng ví dụ). Ba cột mới chỉ có nghĩa với `type = 'body_type'`:
--   · show_on_home       — công tắc "Hiện ở trang chủ";
--   · showcase_image_url — ảnh LỚN của thẻ trang chủ (xe tách nền), khác icon nhỏ của bộ lọc;
--   · showcase_examples  — dòng mẫu xe ví dụ dưới tên.
-- Thứ tự trên trang chủ = `sort_order` của danh mục (một thứ tự cho mọi nơi); tên = `label`.

ALTER TABLE "catalog_items"
  ADD COLUMN "show_on_home" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showcase_image_url" TEXT,
  ADD COLUMN "showcase_examples" VARCHAR(255);

-- Ba cột trang chủ chỉ thuộc kiểu dáng — hãng xe/nhiên liệu/tiện nghi không có khối trang chủ.
ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_showcase_body_type_only" CHECK (
    "type" = 'body_type'
    OR ("show_on_home" = false AND "showcase_image_url" IS NULL AND "showcase_examples" IS NULL)
  );

-- Bật hiện trang chủ thì phải có ảnh lớn: trang chủ không dựng thẻ thiếu ảnh.
ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_showcase_needs_image" CHECK (
    "show_on_home" = false OR "showcase_image_url" IS NOT NULL
  );

-- Chuyển nội dung đang gán cứng sang dữ liệu. Bốn kiểu dáng có sẵn ảnh lớn (file tĩnh của bản vẽ
-- design v2) thì bật hiện trang chủ; ba kiểu còn lại giữ dòng ví dụ, chờ admin tải ảnh rồi bật.
UPDATE "catalog_items" SET "show_on_home" = true,
  "showcase_image_url" = '/home/type-economy.webp', "showcase_examples" = 'VF3, Toyota'
  WHERE "type" = 'body_type' AND "key" = 'mini';
UPDATE "catalog_items" SET "show_on_home" = true,
  "showcase_image_url" = '/home/type-suv.webp', "showcase_examples" = 'Mazda CX-5, Ford Territory'
  WHERE "type" = 'body_type' AND "key" = 'suv';
UPDATE "catalog_items" SET "show_on_home" = true,
  "showcase_image_url" = '/home/type-crossover.webp',
  "showcase_examples" = 'Mazda CX-3, Kia Seltos, Honda HR-V'
  WHERE "type" = 'body_type' AND "key" = 'cuv';
UPDATE "catalog_items" SET "show_on_home" = true,
  "showcase_image_url" = '/home/type-pickup.webp', "showcase_examples" = 'Ford Ranger, Toyota Hilux'
  WHERE "type" = 'body_type' AND "key" = 'pickup';
UPDATE "catalog_items" SET "showcase_examples" = 'Toyota Vios, Honda City, Hyundai Accent'
  WHERE "type" = 'body_type' AND "key" = 'sedan';
UPDATE "catalog_items" SET "showcase_examples" = 'Mitsubishi Xpander, Toyota Innova'
  WHERE "type" = 'body_type' AND "key" = 'mpv';
UPDATE "catalog_items" SET "showcase_examples" = 'Ford Transit, Hyundai Solati'
  WHERE "type" = 'body_type' AND "key" = 'van';
