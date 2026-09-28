-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CAPABILITY GHI ĐỢT 2B CỦA PHIÊN HỖ TRỢ — ADR 0050 §13
--
-- Mở thêm chín capability ghi HẸP (không có capability "toàn quyền" nào): tạo xe nháp, giấy tờ xe,
-- chuyển chi nhánh, cấu hình vận hành, khoá lịch, mặt tiền công khai, chi nhánh cơ bản, gửi duyệt
-- thay chủ xe, sửa snapshot công khai. Migration này:
--
--   1. Viết lại CHECK tập giá trị của `capabilities`.
--   2. Viết lại CHECK "chế độ xem không bao giờ mang capability ghi" với ĐỦ tập ghi mới — thiếu một
--      cái ở đây là để DB chấp nhận một phiên chỉ-xem có quyền ghi nếu code có lỗi.
--   3. `audit_logs.support_reason` — LÝ DO RIÊNG của một thao tác mức trung bình/cao (khác lý do
--      mở phiên). Chỉ có nghĩa khi dòng audit thuộc một phiên.
--   4. `vehicle_blocks.support_context_id` — khoá lịch do phiên nào tạo. Phiên chỉ sửa/gỡ được khoá
--      của CHÍNH nó, và chủ xe thấy khoá nào do nền tảng đặt hộ. `RESTRICT` như `audit_logs`: phiên
--      không bao giờ bị xoá.
--
-- Không đụng dữ liệu phiên đang có: capability mới chỉ có ở phiên mở sau migration.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── 1 + 2. Tập capability ──────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."tenant_support_contexts"
    DROP CONSTRAINT "tenant_support_contexts_capabilities_check";

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_capabilities_check"
    CHECK ("capabilities" <@ ARRAY[
        -- Đọc (Đợt 2A)
        'vehicle.view', 'branch.view', 'calendar.view', 'booking_request.view', 'booking.view',
        'handover.view', 'customer.view_masked', 'driver.view', 'member.view',
        'tenant_profile.view', 'rental_policy.view', 'subscription_status.view',
        'support_case.view', 'maintenance.view',
        -- Ghi (Đợt 1)
        'vehicle.info.edit', 'vehicle.media.manage', 'maintenance.manage',
        -- Ghi (Đợt 2B)
        'vehicle.create_draft', 'vehicle.document.manage', 'vehicle.branch.reassign',
        'vehicle.operations.update', 'vehicle.schedule_block.manage',
        'tenant.public_profile.update', 'branch.basic_manage', 'vehicle.submit_review',
        'listing.repair'
    ]::TEXT[]);

ALTER TABLE "public"."tenant_support_contexts"
    DROP CONSTRAINT "tenant_support_contexts_view_readonly_check";

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_view_readonly_check"
    CHECK ("mode" <> 'view' OR NOT ("capabilities" && ARRAY[
        'vehicle.info.edit', 'vehicle.media.manage', 'maintenance.manage',
        'vehicle.create_draft', 'vehicle.document.manage', 'vehicle.branch.reassign',
        'vehicle.operations.update', 'vehicle.schedule_block.manage',
        'tenant.public_profile.update', 'branch.basic_manage', 'vehicle.submit_review',
        'listing.repair'
    ]::TEXT[]));

-- ── 3. Lý do riêng của một thao tác ────────────────────────────────────────────────────────────

ALTER TABLE "public"."audit_logs"
    ADD COLUMN "support_reason" VARCHAR(500);

ALTER TABLE "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_support_reason_check"
    CHECK ("support_reason" IS NULL OR "support_context_id" IS NOT NULL);

-- ── 4. Khoá lịch do phiên nào tạo ──────────────────────────────────────────────────────────────

ALTER TABLE "public"."vehicle_blocks"
    ADD COLUMN "support_context_id" CHAR(26);

ALTER TABLE "public"."vehicle_blocks"
    ADD CONSTRAINT "vehicle_blocks_support_context_id_fkey"
    FOREIGN KEY ("support_context_id") REFERENCES "public"."tenant_support_contexts" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Đọc "khoá lịch của phiên này" khi sửa/gỡ, và cho FK RESTRICT không quét cả bảng.
CREATE INDEX "vehicle_blocks_support_context_id_idx"
    ON "public"."vehicle_blocks" ("support_context_id");
