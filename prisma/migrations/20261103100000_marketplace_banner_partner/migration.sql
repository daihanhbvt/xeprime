-- Ảnh nền dải "Đăng ký trở thành ĐỐI TÁC ĐỘC QUYỀN" trên trang chủ do admin quản lý (trước đây là
-- ảnh tĩnh trong mã). Thêm vị trí `partner` vào bảng banner dùng chung — cùng đường upload, lịch
-- hiển thị, bật/tắt, thứ tự, audit như `hero`/`promo`. Chỉ đổi tập giá trị của CHECK; index
-- (placement, active, sort_order) đã phục vụ sẵn truy vấn theo vị trí.

ALTER TABLE "marketplace_banners" DROP CONSTRAINT "marketplace_banners_placement_check";

ALTER TABLE "marketplace_banners"
  ADD CONSTRAINT "marketplace_banners_placement_check"
  CHECK ("placement" IN ('hero', 'promo', 'partner'));
