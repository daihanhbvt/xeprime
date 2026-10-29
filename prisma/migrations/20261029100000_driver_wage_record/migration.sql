-- ═══════════════════════════════════════════════════════════════════════════
-- Tiền công tài xế — XePrime chỉ GHI NHẬN số thoả thuận, không giữ hộ — ADR 0075 (SPEC-BUS-07)
--
-- 1. `tenants.driver_daily_wage`: MỘT mức tiền công/ngày mặc định của gian hàng.
-- 2. `booking_driver_assignments.wage_amount` / `wage_days`: tiền công của lượt gán + số ngày lúc gán.
-- 3. `booking_driver_wage_changes`: lịch sử SỬA tiền công, chỉ thêm.
-- 4. `fee_policies.with_driver_limits`: giới hạn chặn số vô lý (giá có tài/ngày, tiền công/ngày).
--
-- Chỉ THÊM cột / bảng — mọi dòng đang hợp lệ vẫn hợp lệ (lượt gán cũ để NULL: không suy ra số).
-- Tiền công KHÔNG đi vào hold, quyết toán, ví, thuế hay hoa hồng.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): mọi CHECK dưới đây.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "tenants" ADD COLUMN "driver_daily_wage" DECIMAL(14,2);
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_driver_daily_wage_check"
    CHECK ("driver_daily_wage" IS NULL OR "driver_daily_wage" > 0);

ALTER TABLE "booking_driver_assignments"
    ADD COLUMN "wage_amount" DECIMAL(14,2),
    ADD COLUMN "wage_days" INTEGER;

-- Có tiền công ⇔ có số ngày; không âm; số ngày dương.
ALTER TABLE "booking_driver_assignments" ADD CONSTRAINT "booking_driver_assignments_wage_check"
    CHECK (
        ("wage_amount" IS NULL) = ("wage_days" IS NULL)
        AND ("wage_amount" IS NULL OR "wage_amount" >= 0)
        AND ("wage_days" IS NULL OR "wage_days" > 0)
    );

-- Mục tiêu cho composite FK của lịch sử sửa — DB chặn ghi lịch sử chéo gian hàng.
CREATE UNIQUE INDEX "booking_driver_assignments_id_tenant_id_key"
    ON "booking_driver_assignments" ("id", "tenant_id");

-- Thống kê tiền công theo tài xế theo tháng (trang Tài xế).
CREATE INDEX "booking_driver_assignments_wage_stats_idx"
    ON "booking_driver_assignments" ("tenant_id", "driver_id", "ended_at");

CREATE TABLE "booking_driver_wage_changes" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "assignment_id" CHAR(26) NOT NULL,
    "old_amount" DECIMAL(14,2) NOT NULL,
    "new_amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(255),
    "changed_by" CHAR(26),
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_driver_wage_changes_pkey" PRIMARY KEY ("id"),
    -- Một dòng là một lần ĐỔI thật: không âm, và khác số cũ.
    CONSTRAINT "booking_driver_wage_changes_amount_check" CHECK (
        "old_amount" >= 0 AND "new_amount" >= 0 AND "old_amount" <> "new_amount"
    )
);

CREATE INDEX "booking_driver_wage_changes_assignment_id_changed_at_idx"
    ON "booking_driver_wage_changes" ("assignment_id", "changed_at" DESC);

ALTER TABLE "booking_driver_wage_changes"
    ADD CONSTRAINT "booking_driver_wage_changes_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "booking_driver_wage_changes_assignment_id_tenant_id_fkey"
        FOREIGN KEY ("assignment_id", "tenant_id")
        REFERENCES "booking_driver_assignments"("id", "tenant_id") ON DELETE CASCADE ON UPDATE NO ACTION,
    ADD CONSTRAINT "booking_driver_wage_changes_changed_by_fkey"
        FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fee_policies" ADD COLUMN "with_driver_limits" JSONB;
-- Hình dạng do `parseWithDriverLimits` + cổng kích hoạt canh; DB chỉ canh "là một object".
ALTER TABLE "fee_policies" ADD CONSTRAINT "fee_policies_with_driver_limits_check"
    CHECK ("with_driver_limits" IS NULL OR jsonb_typeof("with_driver_limits") = 'object');
