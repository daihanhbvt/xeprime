-- Wave lịch: khoá xe thủ công + giá riêng theo ngày.
--
-- `vehicle_blocks` là bản ghi NGHIỆP VỤ của nguồn `blocked_range` trong `vehicle_occupancies`
-- (ADR 0006): block và occupancy của nó sống/chết cùng một transaction ở tầng service; bảng này
-- chỉ giữ lý do/ghi chú/vết người tạo. CHECK khoảng thời gian dương để một block "âm" không thể
-- tồn tại kể cả khi code bỏ sót validate.
--
-- `vehicle_daily_prices` ghi đè giá theo NGÀY LOCAL Asia/Ho_Chi_Minh (`date`, không giờ).
-- Unique (vehicle_id, date) làm mô hình tất định — không có hai bản ghi đè chồng nhau.
-- CHECK "ít nhất một giá" vì một bản ghi đè không mang giá nào là rác không có nghĩa.

-- CreateTable
CREATE TABLE "vehicle_blocks" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "created_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vehicle_blocks_range_positive" CHECK ("end_at" > "start_at"),
    -- ADR 0005: status/enum là VARCHAR, CHECK giữ bộ giá trị thật cho bảng ổn định.
    CONSTRAINT "vehicle_blocks_reason_check"
        CHECK ("reason" IN ('unplanned_maintenance', 'repair', 'internal_use', 'not_for_rent', 'other'))
);

-- CreateTable
CREATE TABLE "vehicle_daily_prices" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "vehicle_id" CHAR(26) NOT NULL,
    "date" DATE NOT NULL,
    "daily_price" DECIMAL(14,2),
    "hourly_price" DECIMAL(14,2),
    "note" VARCHAR(255),
    "created_by" CHAR(26),
    "updated_by" CHAR(26),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_daily_prices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vdp_daily_non_negative" CHECK ("daily_price" IS NULL OR "daily_price" >= 0),
    CONSTRAINT "vdp_hourly_non_negative" CHECK ("hourly_price" IS NULL OR "hourly_price" >= 0),
    CONSTRAINT "vdp_at_least_one_price" CHECK ("daily_price" IS NOT NULL OR "hourly_price" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "vehicle_blocks_tenant_id_vehicle_id_start_at_idx"
    ON "vehicle_blocks"("tenant_id", "vehicle_id", "start_at");

-- CreateIndex
CREATE INDEX "vehicle_blocks_tenant_id_start_at_idx" ON "vehicle_blocks"("tenant_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_daily_prices_vehicle_id_date_key"
    ON "vehicle_daily_prices"("vehicle_id", "date");

-- CreateIndex
CREATE INDEX "vehicle_daily_prices_tenant_id_vehicle_id_date_idx"
    ON "vehicle_daily_prices"("tenant_id", "vehicle_id", "date");

-- AddForeignKey
ALTER TABLE "vehicle_blocks"
    ADD CONSTRAINT "vehicle_blocks_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks"
    ADD CONSTRAINT "vehicle_blocks_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_blocks"
    ADD CONSTRAINT "vehicle_blocks_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_daily_prices"
    ADD CONSTRAINT "vehicle_daily_prices_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_daily_prices"
    ADD CONSTRAINT "vehicle_daily_prices_vehicle_id_fkey"
        FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
