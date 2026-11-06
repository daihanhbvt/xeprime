-- ═══════════════════════════════════════════════════════════════════════════
-- Chuyến không treo ở mốc giao/trả xe (05/11/2026) — ADR 0081.
--
-- 1. Ba cột CLAIM của worker nhắc chuyến (`booking-trip-reminders`): nhắc trước giờ nhận 60′, nhắc
--    trước giờ trả 60′, báo quá giờ trả 30′. Mỗi lượt quét lật đúng một cột từ NULL trong cùng
--    transaction với thông báo (`UPDATE … WHERE <cột> IS NULL`) ⇒ mỗi mốc gửi tối đa MỘT lần, kể cả
--    khi hai instance worker chạy chồng. Không backfill: worker có cửa sổ nhìn lại giới hạn, đơn lịch
--    sử không nhận tin muộn.
-- 2. Khách báo "Đã trả xe" ở trang chuyến (ADR 0081): `customer_returned_at` là lời khách (ghi MỘT
--    lần), `return_auto_complete_at` là hạn chủ xe xác nhận — server tính lúc khách bấm rồi LƯU, không
--    tính lại lúc đọc. Hai cột đi CÙNG nhau (CHECK). Chủ xe báo "khách chưa trả xe" thì cả hai về NULL.
-- 3. `vehicle_handovers.confirm_source` — biên bản do AI xác nhận: `host` (nhân sự gian hàng, mọi
--    biên bản cũ), `customer` (khách bấm "Đã nhận xe"), `auto` (biên bản trả xe tự lập khi chủ xe im
--    lặng quá hạn sau lời báo của khách). `confirmed_by` vẫn bắt buộc (CHECK `vh_confirmed_has_actor`)
--    và là TÀI KHOẢN KHÁCH ở hai nguồn sau — cột này nói người đó không phải nhân viên gian hàng.
-- 4. Partial index cho bốn câu quét — đa số đơn không bao giờ khớp, index một phần giữ đường nóng nhỏ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột claim nhắc chuyến ─────────────────────────────────────────────────
ALTER TABLE "public"."bookings" ADD COLUMN "pickup_reminded_at" TIMESTAMPTZ(3);
ALTER TABLE "public"."bookings" ADD COLUMN "return_reminded_at" TIMESTAMPTZ(3);
ALTER TABLE "public"."bookings" ADD COLUMN "return_overdue_notified_at" TIMESTAMPTZ(3);

-- ── 2. Lời báo trả xe của khách ──────────────────────────────────────────────
ALTER TABLE "public"."bookings" ADD COLUMN "customer_returned_at" TIMESTAMPTZ(3);
ALTER TABLE "public"."bookings" ADD COLUMN "return_auto_complete_at" TIMESTAMPTZ(3);

ALTER TABLE "public"."bookings"
    ADD CONSTRAINT "bookings_customer_return_pair_check"
    CHECK (("customer_returned_at" IS NULL) = ("return_auto_complete_at" IS NULL));

-- ── 3. Nguồn xác nhận biên bản ───────────────────────────────────────────────
ALTER TABLE "public"."vehicle_handovers"
    ADD COLUMN "confirm_source" VARCHAR(20) NOT NULL DEFAULT 'host';

ALTER TABLE "public"."vehicle_handovers"
    ADD CONSTRAINT "vehicle_handovers_confirm_source_check"
    CHECK ("confirm_source" IN ('host', 'customer', 'auto'));

-- ── 4. Index cho các lượt quét ───────────────────────────────────────────────
CREATE INDEX "bookings_pickup_reminder_sweep_idx"
    ON "public"."bookings" ("pickup_at")
    WHERE "status" IN ('reserved', 'confirmed') AND "pickup_reminded_at" IS NULL AND "deleted_at" IS NULL;

CREATE INDEX "bookings_return_reminder_sweep_idx"
    ON "public"."bookings" ("return_at")
    WHERE "status" = 'active' AND "return_reminded_at" IS NULL AND "deleted_at" IS NULL;

CREATE INDEX "bookings_return_overdue_sweep_idx"
    ON "public"."bookings" ("return_at")
    WHERE "status" = 'active' AND "return_overdue_notified_at" IS NULL AND "deleted_at" IS NULL;

CREATE INDEX "bookings_return_auto_complete_sweep_idx"
    ON "public"."bookings" ("return_auto_complete_at")
    WHERE "status" = 'active' AND "return_auto_complete_at" IS NOT NULL AND "deleted_at" IS NULL;
