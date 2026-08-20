-- Thông tin CHỦ gian hàng trên hồ sơ (`/manage/shop`).
--
-- Vì sao không dùng lại `users` của chủ shop: tài khoản đăng nhập và người chịu trách nhiệm là
-- hai vai khác nhau — shop thường do nhân viên vận hành, còn người ký hợp đồng/nhận tiền là chủ.
-- Và vì sao không dùng `tenants.phone/email`: hai cột đó là liên hệ CÔNG KHAI hiện cho khách,
-- còn ba cột dưới đây là dữ liệu nội bộ chỉ đội ngũ nền tảng đọc khi duyệt hồ sơ.
--
-- Toàn bộ migration là THÊM + backfill có vị từ "chưa có giá trị" → chạy lại lần hai ra 0 dòng.

ALTER TABLE "tenant_profiles"
  ADD COLUMN "owner_full_name" VARCHAR(255),
  ADD COLUMN "owner_phone"     VARCHAR(30),
  ADD COLUMN "owner_email"     VARCHAR(255);

-- Backfill từ tài khoản đã mở gian hàng: đó là phỏng đoán ĐÚNG cho hồ sơ đang có (người mở shop
-- gần như luôn là chủ), và nó tránh việc mọi shop cũ mở form ra thấy ba ô trống bắt buộc.
-- Chủ shop sửa lại được ngay trên `/manage/shop` nếu thực tế khác.
UPDATE "tenant_profiles" p
SET "owner_full_name" = u."display_name",
    "owner_phone"     = u."phone",
    "owner_email"     = u."email"
FROM "tenants" t
     JOIN "users" u ON u."id" = t."owner_user_id"
WHERE p."tenant_id" = t."id"
  AND p."owner_full_name" IS NULL
  AND p."owner_phone" IS NULL
  AND p."owner_email" IS NULL;
