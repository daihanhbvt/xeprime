-- Ảnh tablet cho banner — mỗi breakpoint một ảnh ĐÚNG tỉ lệ khung của breakpoint đó
-- (PC 1440x300, tablet 1024x320, mobile 780x390) thì trình duyệt chỉ scale, không bao giờ crop.
-- NULL = fallback về ảnh desktop (chuỗi fallback: mobile -> tablet -> desktop).
ALTER TABLE "marketplace_banners" ADD COLUMN "tablet_image_url" TEXT;
