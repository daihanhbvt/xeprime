-- ════════════════════════════════════════════════════════════════════════════════════════════
-- RÚT `tenant.public_profile.update` KHỎI PHIÊN HỖ TRỢ — ADR 0050 §13 (sửa 28/09/2026)
--
-- Quyết định mới: phiên hỗ trợ chỉ được XEM hồ sơ gian hàng (`tenant_profile.view`), không bao giờ
-- sửa mặt tiền công khai — tên hiển thị, giới thiệu, logo, ảnh bìa, địa chỉ là lời gian hàng tự nói
-- với khách. Migration này:
--
--   1. Gỡ capability khỏi các phiên ĐÃ LƯU (kể cả phiên còn hạn) — code mới đã không còn endpoint
--      nào nhận nó, nhưng để nó nằm lại trong dữ liệu là để một bản code cũ/rollback đọc ra quyền.
--   2. Viết lại CHECK tập giá trị của `capabilities` KHÔNG còn nó — không phiên nào ghi lại được.
--   3. Viết lại CHECK "chế độ xem không mang capability ghi" với tập ghi mới.
--
-- `audit_logs.support_capability` giữ nguyên: đó là LỊCH SỬ những lần đã sửa, append-only.
-- Không sửa migration 20260927090000 — nó có thể đã được apply ở môi trường nào đó.
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tenant_support_contexts"
    DROP CONSTRAINT "tenant_support_contexts_capabilities_check";

ALTER TABLE "public"."tenant_support_contexts"
    DROP CONSTRAINT "tenant_support_contexts_view_readonly_check";

-- ── 1. Phiên đã lưu ────────────────────────────────────────────────────────────────────────────

UPDATE "public"."tenant_support_contexts"
SET "capabilities" = array_remove("capabilities", 'tenant.public_profile.update')
WHERE 'tenant.public_profile.update' = ANY ("capabilities");

-- ── 2. Tập capability ──────────────────────────────────────────────────────────────────────────

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
        'branch.basic_manage', 'vehicle.submit_review', 'listing.repair'
    ]::TEXT[]);

-- ── 3. Chế độ xem không mang capability ghi ───────────────────────────────────────────────────

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_view_readonly_check"
    CHECK ("mode" <> 'view' OR NOT ("capabilities" && ARRAY[
        'vehicle.info.edit', 'vehicle.media.manage', 'maintenance.manage',
        'vehicle.create_draft', 'vehicle.document.manage', 'vehicle.branch.reassign',
        'vehicle.operations.update', 'vehicle.schedule_block.manage',
        'branch.basic_manage', 'vehicle.submit_review', 'listing.repair'
    ]::TEXT[]));
