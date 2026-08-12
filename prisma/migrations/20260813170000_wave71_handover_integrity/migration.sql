-- Wave 7.1 — Đóng các lỗ toàn vẹn của bàn giao (docs/design/12 §9.1).
--
-- Ba bất biến chuyển từ "service nhớ kiểm" sang "DB không cho tồn tại":
--   1. KM lúc GIAO là bắt buộc — chỉ biên bản TRẢ mới được đóng khi thiếu KM
--      (task `Thiếu KM trả`). Giao xe thiếu KM làm cả chuyến mất mốc đối soát.
--   2. `odometer_missing` chỉ có nghĩa ở chiều trả.
--   3. `odometer_reading_id` phải trỏ tới một lần đọc CÓ THẬT, thuộc đúng tenant + đúng xe
--      của biên bản — trước đây nó chỉ là một chuỗi 26 ký tự không ai kiểm.
--
-- Forward-only: không sửa migration Wave 6/7 đã áp. Kiểm dữ liệu cũ TRƯỚC khi thêm ràng buộc
-- và BÁO LỖI nếu có dòng không tương thích — tuyệt đối không tự xoá/sửa dữ liệu.

-- ── Kiểm điều kiện tiên quyết ───────────────────────────────────────────────
DO $$
DECLARE
    bad_reading   integer;
    bad_pickup    integer;
    bad_missing   integer;
BEGIN
    SELECT count(*) INTO bad_reading
    FROM "vehicle_handovers" h
    WHERE h."odometer_reading_id" IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM "vehicle_odometer_readings" r
          WHERE r."id" = h."odometer_reading_id"
            AND r."tenant_id" = h."tenant_id"
            AND r."vehicle_id" = h."vehicle_id");
    IF bad_reading > 0 THEN
        RAISE EXCEPTION
            'Wave 7.1: % biên bản trỏ tới lần đọc KM không tồn tại hoặc của xe/gian hàng khác. Đối soát thủ công trước khi chạy lại migration.',
            bad_reading;
    END IF;

    SELECT count(*) INTO bad_pickup
    FROM "vehicle_handovers"
    WHERE "status" = 'confirmed' AND "type" = 'pickup' AND "odometer_km" IS NULL;
    IF bad_pickup > 0 THEN
        RAISE EXCEPTION
            'Wave 7.1: % biên bản giao xe đã xác nhận nhưng thiếu KM. Bổ sung KM trước khi chạy lại migration.',
            bad_pickup;
    END IF;

    SELECT count(*) INTO bad_missing
    FROM "vehicle_handovers"
    WHERE "odometer_missing" = true AND "type" <> 'return';
    IF bad_missing > 0 THEN
        RAISE EXCEPTION
            'Wave 7.1: % biên bản KHÔNG phải chiều trả nhưng đang gắn cờ thiếu KM. Đối soát thủ công trước khi chạy lại migration.',
            bad_missing;
    END IF;
END $$;

-- ── KM giao xe là bắt buộc ─────────────────────────────────────────────────
ALTER TABLE "vehicle_handovers"
    -- Task "Thiếu KM trả" đúng như tên gọi: chỉ chiều TRẢ mới có trạng thái này.
    ADD CONSTRAINT "vh_missing_km_return_only"
        CHECK ("odometer_missing" = false OR "type" = 'return'),
    -- Không tồn tại biên bản giao xe đã xác nhận mà không biết xe rời bãi ở số KM nào.
    ADD CONSTRAINT "vh_confirmed_pickup_has_km"
        CHECK ("status" <> 'confirmed' OR "type" <> 'pickup' OR "odometer_km" IS NOT NULL);

-- ── Toàn vẹn tham chiếu tới lịch sử KM ─────────────────────────────────────
-- Mục tiêu cho composite FK: khoá cả tenant lẫn xe, không chỉ id.
CREATE UNIQUE INDEX "vehicle_odometer_readings_id_tenant_id_vehicle_id_key"
    ON "vehicle_odometer_readings"("id", "tenant_id", "vehicle_id");

ALTER TABLE "vehicle_handovers"
    -- NO ACTION (không phải RESTRICT): lịch sử KM là chỉ-thêm nên xoá thẳng một lần đọc đang
    -- được biên bản viện dẫn phải bị chặn; nhưng NO ACTION kiểm ở CUỐI câu lệnh, nhờ vậy
    -- cascade xoá xe/gian hàng (xoá cả biên bản lẫn lần đọc trong cùng câu lệnh) vẫn chạy được.
    ADD CONSTRAINT "vehicle_handovers_odometer_reading_fkey"
        FOREIGN KEY ("odometer_reading_id", "tenant_id", "vehicle_id")
        REFERENCES "vehicle_odometer_readings"("id", "tenant_id", "vehicle_id")
        ON DELETE NO ACTION ON UPDATE CASCADE;
