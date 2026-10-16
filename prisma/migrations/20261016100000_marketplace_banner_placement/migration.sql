-- Banner khuyến mãi giữa trang chủ do admin quản lý (trước đây gán cứng trong mã).
--
-- Dùng CHUNG bảng marketplace_banners với dải banner đầu trang, phân biệt bằng `placement`:
-- cùng đường upload R2, lịch hiển thị, bật/tắt, sắp thứ tự, audit — chỉ khác khổ ảnh. Mọi banner có
-- sẵn là banner đầu trang (`hero`). Trần banner hiển thị cùng lúc, thứ tự và lịch tính riêng
-- từng vị trí, nên index đi theo (placement, active, sort_order).

ALTER TABLE "marketplace_banners"
  ADD COLUMN "placement" VARCHAR(20) NOT NULL DEFAULT 'hero';

ALTER TABLE "marketplace_banners"
  ADD CONSTRAINT "marketplace_banners_placement_check" CHECK ("placement" IN ('hero', 'promo'));

DROP INDEX "marketplace_banners_active_sort_order_idx";

CREATE INDEX "marketplace_banners_placement_active_sort_order_idx"
  ON "marketplace_banners" ("placement", "active", "sort_order");
