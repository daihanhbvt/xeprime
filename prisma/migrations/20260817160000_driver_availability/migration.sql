-- Tài xế vận hành được (đợt hoàn thiện 17/08): lịch bận + hạn GPLX.
--
-- 1. `license_expires_at`: GPLX hết hạn thì không gán vào đơn mới (service chặn với thông điệp
--    rõ; UI cảnh báo sắp hết hạn).
-- 2. Chống MỘT tài xế nhận hai đơn giao nhau bằng EXCLUDE USING gist — cùng cơ chế ADR 0006
--    của lịch xe: không code path, không interleaving transaction nào tạo được trùng lịch.
--    Constraint là PARTIAL: chỉ các đơn còn "sống" (reserved/confirmed/active, chưa xoá) và
--    có tài xế mới tham gia; đơn khép lại rời khỏi phạm vi, tài xế rảnh cho khung giờ đó.
--    Range nửa hở [pickup, return) — trả 10:00 và nhận chuyến sau 10:00 KHÔNG tính trùng.

ALTER TABLE "drivers" ADD COLUMN "license_expires_at" DATE;

-- Dữ liệu dev có thể đã lỡ gán một tài xế vào hai đơn giao nhau (trước khi có ràng buộc):
-- giữ phân công SỚM NHẤT, gỡ tài xế khỏi các đơn sau — không sửa gì khác của đơn.
UPDATE "bookings" b
SET "driver_id" = NULL
WHERE b."driver_id" IS NOT NULL
  AND b."status" IN ('reserved', 'confirmed', 'active')
  AND b."deleted_at" IS NULL
  AND EXISTS (
      SELECT 1
      FROM "bookings" o
      WHERE o."driver_id" = b."driver_id"
        AND o."id" <> b."id"
        AND o."status" IN ('reserved', 'confirmed', 'active')
        AND o."deleted_at" IS NULL
        AND tstzrange(o."pickup_at", o."return_at") && tstzrange(b."pickup_at", b."return_at")
        AND o."created_at" < b."created_at"
  );

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_driver_schedule_excl"
    EXCLUDE USING gist (
        "driver_id" WITH =,
        tstzrange("pickup_at", "return_at") WITH &&
    )
    WHERE (
        "driver_id" IS NOT NULL
        AND "status" IN ('reserved', 'confirmed', 'active')
        AND "deleted_at" IS NULL
    );
