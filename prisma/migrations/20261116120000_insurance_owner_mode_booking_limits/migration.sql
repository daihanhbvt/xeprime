-- ADR 0091 (16/11/2026) — bảo hiểm MIC theo SRS v1.3: chủ xe chọn Bắt buộc/Tuỳ chọn, chặn đặt trước
-- và độ dài chuyến tự lái, GCN lưu R2, báo khẩn / tra lại khi chưa cấp được.
--
-- Mọi cột đều có DEFAULT nên dữ liệu cũ giữ nguyên nghĩa: xe cũ về Tuỳ chọn (gian hàng phải chủ động
-- chọn Bắt buộc), yêu cầu cũ không mang cờ Bắt buộc, snapshot chợ không chặn xe nào cho tới lượt
-- `ListingsService.syncFromVehicle` kế tiếp.

-- ── 1. Chế độ bảo hiểm của chủ xe (điều 1) ─────────────────────────────────────────────────────
ALTER TABLE "public"."rental_policies"
    ADD COLUMN "insurance_mode" VARCHAR(20) NOT NULL DEFAULT 'optional';
ALTER TABLE "public"."rental_policies"
    ADD CONSTRAINT "rental_policies_insurance_mode_check"
        CHECK ("insurance_mode" IN ('required', 'optional'));

-- Chế độ LÚC GỬI — lượt duyệt đọc cột này, không đọc chế độ hôm nay (ADR 0024).
ALTER TABLE "public"."booking_requests"
    ADD COLUMN "vehicle_protection_required" BOOLEAN NOT NULL DEFAULT false;
-- Bắt buộc ⇒ server đã tự đặt "khách mua": một yêu cầu Bắt buộc mà không mua là dữ liệu hỏng.
ALTER TABLE "public"."booking_requests"
    ADD CONSTRAINT "booking_requests_vehicle_protection_required_check"
        CHECK (NOT "vehicle_protection_required" OR "vehicle_protection_selected");

-- Snapshot chợ: xe Bắt buộc mà chưa đủ điều kiện bảo hiểm không nhận đặt tự lái.
ALTER TABLE "public"."public_listings"
    ADD COLUMN "self_drive_insurance_blocked" BOOLEAN NOT NULL DEFAULT false;
-- Tìm xe tự lái chỉ cần loại số ít dòng bị chặn — partial index giữ đường nóng nhỏ.
CREATE INDEX "public_listings_self_drive_insurance_blocked_idx"
    ON "public"."public_listings" ("vehicle_id")
    WHERE "self_drive_insurance_blocked";

-- ── 2. Chặn thời gian đặt xe của khách trên chợ (điều 4) ─────────────────────────────────────────
ALTER TABLE "public"."fee_policies"
    ADD COLUMN "max_advance_booking_days" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "self_drive_max_days"      INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_max_advance_booking_days_check"
        CHECK ("max_advance_booking_days" BETWEEN 1 AND 365),
    ADD CONSTRAINT "fee_policies_self_drive_max_days_check"
        CHECK ("self_drive_max_days" BETWEEN 1 AND 90);

-- ── 3. Hợp đồng bảo hiểm: GCN lưu R2, tra lại khi chờ ảnh, báo khẩn (điều 6, 7) ────────────────────
ALTER TABLE "public"."booking_insurance_policies"
    ADD COLUMN "certificate_object_key" VARCHAR(255),
    ADD COLUMN "partner_pending_checks" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "escalated_at"           TIMESTAMPTZ(3);
ALTER TABLE "public"."booking_insurance_policies"
    ADD CONSTRAINT "booking_insurance_policies_partner_pending_checks_check"
        CHECK ("partner_pending_checks" >= 0),
    -- Chỉ GCN đã cấp mới có bản lưu.
    ADD CONSTRAINT "booking_insurance_policies_certificate_object_key_check"
        CHECK ("certificate_object_key" IS NULL OR "certificate_number" IS NOT NULL);

-- Worker báo khẩn quét hợp đồng còn chờ cấp chưa báo — partial index theo đúng điều kiện quét.
CREATE INDEX "booking_insurance_policies_escalation_idx"
    ON "public"."booking_insurance_policies" ("created_at")
    WHERE "escalated_at" IS NULL AND "status" IN ('reserved', 'issuing', 'failed');
