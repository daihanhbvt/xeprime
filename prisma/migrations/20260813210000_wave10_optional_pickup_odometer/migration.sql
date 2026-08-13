-- Wave 10 — Odo là TUỲ CHỌN ở cả hai chiều bàn giao (docs/design/14 §2).
--
-- Wave 7.1 khoá hai luật ở DB:
--   * `vh_confirmed_pickup_has_km`  — biên bản GIAO đã xác nhận bắt buộc có KM;
--   * `vh_missing_km_return_only`   — cờ "thiếu KM" chỉ được bật ở chiều TRẢ.
--
-- Cả hai đều là hệ quả của luật "KM lúc giao là bắt buộc", và luật đó đã bị bỏ: bắt nhập KM cho
-- MỌI chuyến biến một việc 10 giây ở quầy thành biểu mẫu, và thực tế nhân viên bịa số cho qua —
-- một con số bịa còn tệ hơn không có số.
--
-- Những gì KHÔNG đổi: thiếu KM vẫn không bao giờ hoá thành `0 km` (cột vẫn NULL), KM của xe chỉ
-- đổi khi có số thật, và KM trả nhỏ hơn KM giao vẫn bị chặn ở tầng service khi có đủ hai số.

ALTER TABLE "vehicle_handovers" DROP CONSTRAINT IF EXISTS "vh_confirmed_pickup_has_km";
ALTER TABLE "vehicle_handovers" DROP CONSTRAINT IF EXISTS "vh_missing_km_return_only";

-- Thay bằng luật còn đúng: cờ `odometer_missing` phải NHẤT QUÁN với việc có số hay không.
-- Đây mới là bất biến thật — không tồn tại bản ghi vừa "thiếu KM" vừa có KM, và ngược lại.
ALTER TABLE "vehicle_handovers"
  ADD CONSTRAINT "vh_missing_km_consistent"
  CHECK (
    "status" <> 'confirmed'
    OR ("odometer_missing" = ("odometer_km" IS NULL))
  );
