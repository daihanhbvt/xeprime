-- Khách được chỉnh sửa đánh giá MỘT lần: edited_at khác null = đã dùng lượt sửa.
ALTER TABLE "reviews" ADD COLUMN "edited_at" TIMESTAMPTZ(3);
