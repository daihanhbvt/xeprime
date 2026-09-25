-- ════════════════════════════════════════════════════════════════════════════════════════════
-- CAPABILITY ĐỌC THEO LĨNH VỰC CỦA PHIÊN HỖ TRỢ — ADR 0050 §10 (Đợt 2A)
--
-- Đợt 1 có một capability đọc chung `workspace.view` (xe + chi nhánh). Đợt 2A mở thêm các màn đọc
-- của gian hàng, và không được có capability "xem mọi thứ" — mỗi lĩnh vực một capability, mỗi
-- endpoint đòi đúng một cái. Migration này:
--
--   1. Tách `workspace.view` trong các phiên ĐANG CÓ thành `vehicle.view` + `branch.view` (đúng hai
--      quyền nó từng mở) — phiên đang mở không mất quyền đọc cũ, cũng không được thêm quyền mới:
--      capability MỚI chỉ có ở phiên mở sau migration.
--   2. Viết lại CHECK tập giá trị với bộ capability mới. CHECK "chế độ xem không mang capability
--      ghi" giữ nguyên — tập capability GHI không đổi.
-- ════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tenant_support_contexts"
    DROP CONSTRAINT "tenant_support_contexts_capabilities_check";

UPDATE "public"."tenant_support_contexts"
SET "capabilities" = array_cat(
        array_remove("capabilities", 'workspace.view'),
        ARRAY['vehicle.view', 'branch.view']::TEXT[]
    )
WHERE 'workspace.view' = ANY ("capabilities");

ALTER TABLE "public"."tenant_support_contexts"
    ADD CONSTRAINT "tenant_support_contexts_capabilities_check"
    CHECK ("capabilities" <@ ARRAY[
        -- Đọc (Đợt 2A)
        'vehicle.view', 'branch.view', 'calendar.view', 'booking_request.view', 'booking.view',
        'handover.view', 'customer.view_masked', 'driver.view', 'member.view',
        'tenant_profile.view', 'rental_policy.view', 'subscription_status.view',
        'support_case.view', 'maintenance.view',
        -- Ghi (Đợt 1)
        'vehicle.info.edit', 'vehicle.media.manage', 'maintenance.manage'
    ]::TEXT[]);
