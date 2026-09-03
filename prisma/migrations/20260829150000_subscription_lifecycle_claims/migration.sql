-- ═══════════════════════════════════════════════════════════════════════════
-- Cột CLAIM cho job vòng đời gói (29/08/2026, ADR 0015 điều 10 · ADR 0020 điều 5 · ADR 0026 điều 4)
--
-- VIẾT TAY — cùng lý do đã ghi ở header `20260821000000_init/migration.sql`. Chỉ THÊM cột + index.
--
-- Cùng khuôn với `booking_requests.first_reminded_at`: mỗi hành động một-lần của job có MỘT cột
-- claim, và job claim bằng chính câu `UPDATE … WHERE <cột> IS NULL` — chạy lại/chạy song song
-- ra 0 dòng, không có tin nhắc thứ hai.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tenant_subscriptions"
    -- Đã nhắc "sắp hết hạn" (trước N ngày).
    ADD COLUMN "renewal_reminded_at" TIMESTAMPTZ(3),
    -- Đã báo "hết hạn, đang trong ân hạn".
    ADD COLUMN "expiry_notified_at" TIMESTAMPTZ(3),
    -- Đã xử lý hết-ân-hạn: chuyển tenant về tuyến hoa hồng (ADR 0020 điều 5 — KHÔNG gỡ xe).
    ADD COLUMN "lapse_handled_at" TIMESTAMPTZ(3);

-- Đường quét của job: dòng active sắp/đã hết hạn. Index thường (không partial) để
-- `schema.prisma` mô tả được và `migrate diff` không sinh chênh lệch mới.
CREATE INDEX "tenant_subscriptions_status_ends_at_idx"
    ON "public"."tenant_subscriptions"("status", "ends_at");

-- Đã sinh hoá đơn chào gói + nhắc khi tiêu hết lượt miễn phí (ADR 0026 điều 4) — một lần duy
-- nhất cho mỗi tenant.
ALTER TABLE "public"."tenants"
    ADD COLUMN "free_trips_offered_at" TIMESTAMPTZ(3);
