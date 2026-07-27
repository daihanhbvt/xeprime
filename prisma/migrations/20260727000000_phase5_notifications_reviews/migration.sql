-- ---------------------------------------------------------------------------
-- Phase 5 — notifications + reviews (+ booking_requests.customer_user_id)
--
-- notifications: thông báo in-app fan-out per-user (read_at riêng từng người).
-- reviews: đánh giá sau chuyến COMPLETED, một đơn một review (booking_id unique),
--          rating 1..5 và status chặn bằng CHECK ở DB (skill database-change).
-- booking_requests.customer_user_id: gắn yêu cầu vào tài khoản khách nếu đang đăng nhập,
--          để gửi thông báo duyệt/từ chối và cho khách đánh giá sau chuyến.
-- ---------------------------------------------------------------------------

-- notifications ------------------------------------------------------------
CREATE TABLE "notifications" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26),
    "user_id" CHAR(26),
    "type" VARCHAR(80) NOT NULL,
    "channel" VARCHAR(50) NOT NULL DEFAULT 'in_app',
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT,
    "target_type" VARCHAR(50),
    "target_id" CHAR(26),
    "data_json" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
-- List "thông báo của tôi" (order created_at desc) + đếm chưa đọc (read_at null).
CREATE INDEX "notifications_user_id_read_at_created_at_idx"
    ON "notifications"("user_id", "read_at", "created_at");
CREATE INDEX "notifications_tenant_id_created_at_idx"
    ON "notifications"("tenant_id", "created_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- reviews ------------------------------------------------------------------
CREATE TABLE "reviews" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26),
    "booking_request_id" CHAR(26),
    "customer_id" CHAR(26) NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);
-- Một đơn thuê chỉ một review. NULL (nguồn review khác) không bị ràng buộc.
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");
CREATE INDEX "reviews_vehicle_id_status_created_at_idx"
    ON "reviews"("vehicle_id", "status", "created_at");
CREATE INDEX "reviews_tenant_id_status_idx" ON "reviews"("tenant_id", "status");
CREATE INDEX "reviews_customer_id_idx" ON "reviews"("customer_id");

-- Bất biến nghiệp vụ chặn ở DB, không dựa vào tầng app.
ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_status_valid" CHECK ("status" IN ('published', 'hidden'));

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- booking_requests.customer_user_id ---------------------------------------
ALTER TABLE "booking_requests" ADD COLUMN "customer_user_id" CHAR(26);
CREATE INDEX "booking_requests_customer_user_id_idx"
    ON "booking_requests"("customer_user_id");
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_customer_user_id_fkey"
    FOREIGN KEY ("customer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
