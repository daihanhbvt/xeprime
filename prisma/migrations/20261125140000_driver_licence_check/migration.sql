-- "Đã đối chiếu" bằng lái của một liên kết tài xế (25/11/2026): bên thuê xác nhận đã xem giấy tờ khi
-- tên in trên bằng lệch tên họ đặt cho tài xế. Ghi ĐÚNG hồ sơ bằng đã được đối chiếu — tài xế nộp bằng
-- mới thì id khác và nhãn "Cần đối chiếu" tự hiện lại; hồ sơ bằng bị xoá thì mốc đối chiếu rơi theo.
ALTER TABLE "drivers"
  ADD COLUMN "licence_checked_licence_id" CHAR(26),
  ADD COLUMN "licence_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN "licence_checked_by" CHAR(26);

ALTER TABLE "drivers"
  ADD CONSTRAINT "drivers_licence_checked_licence_id_fkey"
  FOREIGN KEY ("licence_checked_licence_id") REFERENCES "customer_driver_licences"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "drivers"
  ADD CONSTRAINT "drivers_licence_checked_by_fkey"
  FOREIGN KEY ("licence_checked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ba cột đi cùng nhau: có hồ sơ được đối chiếu thì có mốc; gỡ đánh dấu xoá cả ba.
ALTER TABLE "drivers"
  ADD CONSTRAINT "drivers_licence_checked_pair_check"
  CHECK (("licence_checked_licence_id" IS NULL) = ("licence_checked_at" IS NULL));
