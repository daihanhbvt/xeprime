-- ═══════════════════════════════════════════════════════════════════════════
-- Tài xế rút khỏi chuyến đã nhận + bảo vệ khách — ADR 0074 (đặc tả BA SPEC-BUS-06)
--
-- 1. `booking_driver_assignments`: kết cục MỚI `dropped` + ba cột lý do/vùng chỉ có ở lượt đó.
-- 2. `bookings.driver_dropped_at` / `driver_reassign_by`: sự cố tài xế đang mở trên đơn — khách
--    huỷ được hoàn 100% khi quá hạn điều phối hoặc còn dưới 2 giờ (luật ở `driverIncidentState`).
-- 3. `drivers.auto_assign_cooldown_until`: liên kết bị loại khỏi tự gán "Đặt ngay" tới mốc này.
-- 4. Nới CHECK: lý do hoàn `driver_incident`, nhóm lý do huỷ `driver_unavailable`.
--
-- Chỉ THÊM cột / NỚI CHECK — mọi dòng đang hợp lệ vẫn hợp lệ. Cột tài xế ngoài hệ thống (ADR 0067)
-- GIỮ cho đơn cũ; việc chặn ghi mới nằm ở API (ADR 0074 điều 4).
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): mọi CHECK dưới đây và index
--   một phần `booking_driver_assignments_dropped_idx`.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "booking_driver_assignments"
    ADD COLUMN "drop_reason_category" VARCHAR(30),
    ADD COLUMN "drop_reason" TEXT,
    ADD COLUMN "drop_zone" VARCHAR(20);

ALTER TABLE "booking_driver_assignments" DROP CONSTRAINT "booking_driver_assignments_outcome_check";
ALTER TABLE "booking_driver_assignments" ADD CONSTRAINT "booking_driver_assignments_outcome_check"
    CHECK ("outcome" IN (
        'open', 'declined', 'unassigned', 'cancelled', 'no_show', 'completed', 'expired', 'dropped'
    ));

-- Lượt `dropped` ⇔ có nhóm lý do ⇔ có vùng; ghi chú chỉ đi cùng lượt rút.
ALTER TABLE "booking_driver_assignments" ADD CONSTRAINT "booking_driver_assignments_drop_check"
    CHECK (
        ("outcome" = 'dropped') = ("drop_reason_category" IS NOT NULL)
        AND ("drop_reason_category" IS NULL) = ("drop_zone" IS NULL)
        AND ("drop_reason" IS NULL OR "drop_reason_category" IS NOT NULL)
        AND ("drop_reason_category" IS NULL OR "drop_reason_category" IN (
            'health_issue', 'vehicle_accident', 'family_emergency', 'route_blocked', 'other'
        ))
        AND ("drop_zone" IS NULL OR "drop_zone" IN ('grace', 'far', 'same_day', 'critical'))
    );

-- Danh sách tài xế của bên thuê đếm số lần rút 90 ngày theo liên kết — một phần: rất ít lượt rút.
CREATE INDEX "booking_driver_assignments_dropped_idx"
    ON "booking_driver_assignments" ("driver_id", "ended_at")
    WHERE "outcome" = 'dropped';

ALTER TABLE "bookings"
    ADD COLUMN "driver_dropped_at" TIMESTAMPTZ(3),
    ADD COLUMN "driver_reassign_by" TIMESTAMPTZ(3);

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_incident_pair_check"
    CHECK (("driver_dropped_at" IS NULL) = ("driver_reassign_by" IS NULL));

ALTER TABLE "drivers" ADD COLUMN "auto_assign_cooldown_until" TIMESTAMPTZ(3);

ALTER TABLE "hold_refunds" DROP CONSTRAINT IF EXISTS "hold_refunds_reason_check";
ALTER TABLE "hold_refunds"
    ADD CONSTRAINT "hold_refunds_reason_check"
    CHECK ("reason" IN (
        'early_cancel', 'owner_cancel', 'overpaid', 'hold_expired',
        'late_cancel', 'no_show', 'driver_incident', 'admin_decision'
    ));

ALTER TABLE "booking_cancellations" DROP CONSTRAINT "booking_cancellations_reason_category_check";
ALTER TABLE "booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_reason_category_check"
    CHECK ("reason_category" IN (
        'vehicle_unavailable', 'schedule_conflict', 'customer_requirements',
        'customer_unreachable', 'customer_changed_plan', 'driver_unavailable', 'other'
    ));
