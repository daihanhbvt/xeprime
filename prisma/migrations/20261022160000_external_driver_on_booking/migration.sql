-- ═══════════════════════════════════════════════════════════════════════════
-- Tài xế NGOÀI HỆ THỐNG ghi trên đơn + nhắc khẩn chuyến sắp nhận chưa có tài xế — ADR 0067
--
-- 1. `bookings.external_driver_name` / `external_driver_phone`: tên + SĐT tài xế thuê ngoài mà bên
--    thuê ghi trên ĐÚNG đơn này (không hồ sơ, không bảng). Coi là "đã nhận" ngay khi lưu — không
--    có lượt chờ. SĐT lưu dạng `84xxxxxxxxx` (`normalizeVnPhone`, cùng dạng `drivers.phone`).
-- 2. `bookings.driver_missing_alerted_at`: cột CLAIM của lượt báo khẩn "còn dưới 2 giờ chưa có tài
--    xế" — worker lật từ NULL cùng transaction phát tin, nên mỗi đơn được báo tối đa một lần.
--    KHÔNG huỷ đơn, không đổi tiền (ghi đè gạch "tự huỷ khi sát giờ" của đặc tả 02 §2.4).
-- 3. `driver_assigned_at` nay mang mốc gán của CẢ HAI nguồn (liên kết hoặc ngoài hệ thống) — CHECK
--    nhất quán được viết lại; ba cột còn lại của lượt gán liên kết giữ nguyên luật cũ.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): mọi CHECK dưới đây,
--   `bookings_driver_assignment_consistency_check` (thay bản của 20261016120000) và index một phần
--   `bookings_driver_missing_sweep_idx`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "bookings"
    ADD COLUMN "external_driver_name" VARCHAR(120),
    ADD COLUMN "external_driver_phone" VARCHAR(20),
    ADD COLUMN "driver_missing_alerted_at" TIMESTAMPTZ(3);

-- Tên và SĐT đi cùng nhau; tên không rỗng sau khi cắt khoảng trắng; SĐT đã chuẩn hoá `84` + 9 số.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_external_driver_pair_check"
    CHECK (
        ("external_driver_name" IS NULL) = ("external_driver_phone" IS NULL)
        AND ("external_driver_name" IS NULL OR length(btrim("external_driver_name")) > 0)
        AND ("external_driver_phone" IS NULL OR "external_driver_phone" ~ '^84[0-9]{9}$')
    );

-- Chỉ đơn CÓ TÀI XẾ mới mang tài xế ngoài hệ thống (cùng luật `bookings_driver_service_check`).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_external_driver_service_check"
    CHECK ("external_driver_name" IS NULL OR "service_type" = 'with_driver');

-- Hai cách phủ một chuyến loại trừ nhau: tài xế liên kết HOẶC tài xế ngoài hệ thống.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_external_driver_exclusive_check"
    CHECK ("external_driver_name" IS NULL OR "driver_id" IS NULL);

-- Có tài xế liên kết ⇔ có tài khoản ⇔ có trạng thái lượt gán (như cũ); có mốc gán ⇔ có tài xế
-- liên kết HOẶC tài xế ngoài hệ thống (mới — mốc lưu tên + SĐT).
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_driver_assignment_consistency_check";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_assignment_consistency_check"
    CHECK (
        ("driver_id" IS NULL) = ("driver_user_id" IS NULL)
        AND ("driver_id" IS NULL) = ("driver_assignment_status" IS NULL)
        AND (("driver_id" IS NULL) AND ("external_driver_name" IS NULL)) = ("driver_assigned_at" IS NULL)
    );

-- Phép quét nhắc khẩn của worker: đơn có tài xế đang `reserved`, chưa ai phủ, chưa báo — theo giờ
-- nhận. Một phần: gần như mọi đơn đều đã có người hoặc không phải chuyến có tài xế.
CREATE INDEX "bookings_driver_missing_sweep_idx"
    ON "bookings" ("pickup_at")
    WHERE "service_type" = 'with_driver'
      AND "status" = 'reserved'
      AND "driver_id" IS NULL
      AND "external_driver_name" IS NULL
      AND "driver_missing_alerted_at" IS NULL
      AND "deleted_at" IS NULL;
