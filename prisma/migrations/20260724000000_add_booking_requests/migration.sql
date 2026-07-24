-- ---------------------------------------------------------------------------
-- booking_requests — Yêu cầu đặt xe từ Marketplace (Phase 4)
--
-- Không giữ chỗ lịch khi còn pending: nhiều khách được hỏi cùng xe cùng giờ. Chỉ khi shop
-- duyệt mới tạo bookings + vehicle_occupancies (ADR 0006) và set converted_to_booking.
-- ---------------------------------------------------------------------------
CREATE TABLE "booking_requests" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending_host_approval',
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_phone" VARCHAR(30) NOT NULL,
    "customer_email" VARCHAR(255),
    "pickup_at" TIMESTAMPTZ(3) NOT NULL,
    "return_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "reject_reason" TEXT,
    "booking_id" CHAR(26),
    "decided_by" CHAR(26),
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "booking_requests_tenant_id_status_idx"
    ON "booking_requests"("tenant_id", "status");
CREATE INDEX "booking_requests_vehicle_id_idx" ON "booking_requests"("vehicle_id");
CREATE INDEX "booking_requests_created_at_idx" ON "booking_requests"("created_at");
-- 1-1 với bookings: mỗi yêu cầu duyệt tạo đúng một đơn. NULL (chưa duyệt) không bị ràng buộc.
CREATE UNIQUE INDEX "booking_requests_booking_id_key" ON "booking_requests"("booking_id");

-- Trả phải sau nhận — bất biến nghiệp vụ, chặn ở DB như bookings.
ALTER TABLE "booking_requests"
    ADD CONSTRAINT "booking_requests_period_valid" CHECK ("return_at" > "pickup_at");

ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
