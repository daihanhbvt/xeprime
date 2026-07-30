-- ---------------------------------------------------------------------------
-- Guest OTP booking + passwordless phone login (Phase 4 mở rộng)
--
-- 1) phone_verifications.attempt_count — đếm số lần nhập SAI mã; chạm OTP_MAX_ATTEMPTS thì
--    service set status='failed' (khoá mã). Chống brute-force ngoài @Throttle + TTL ngắn.
-- 2) Chống double-submit yêu cầu thuê ở tầng DB (không chỉ tầng app): một (xe, SĐT, giờ nhận,
--    giờ trả) chỉ có ĐÚNG MỘT yêu cầu đang chờ duyệt. Partial unique index — Prisma không mô tả
--    được `WHERE`, giữ ở SQL (như exclusion constraint occupancy ADR 0006).
-- ---------------------------------------------------------------------------

ALTER TABLE "phone_verifications"
    ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "booking_requests_pending_dedupe_idx"
    ON "booking_requests" ("vehicle_id", "customer_phone", "pickup_at", "return_at")
    WHERE "status" = 'pending_host_approval';
