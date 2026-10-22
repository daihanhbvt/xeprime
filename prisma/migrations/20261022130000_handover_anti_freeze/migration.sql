-- ═══════════════════════════════════════════════════════════════════════════
-- Chống treo đơn ở mốc bàn giao — ADR 0066 (22/10/2026), đặc tả 02 §3.2.
--
-- Không thêm trạng thái đơn nào. Ba lớp đi qua hạ tầng ĐÃ CÓ:
--   • Lớp 1 — khách báo "Chưa nhận được xe" ⇒ một case `dispute` khẩn gắn đơn. Case `dispute` mở
--     đã giữ quyết toán khoản giữ chỗ (`HoldSettlementService`) — không cần cột nào mới.
--   • Lớp 2 — chủ xe xác nhận biên bản giao xe là đơn sang `active` ngay (hành vi hiện có).
--   • Lớp 3 — quá `pickup_at + 120′` mà đơn còn `reserved` ⇒ worker mở case
--     `handover_unconfirmed` cho vận hành gọi xác minh. Đó là phần migration này phục vụ:
--
-- 1. `bookings.handover_overdue_at` — cột CLAIM của worker. Lượt quét lật nó từ NULL trong cùng
--    transaction với việc mở case (`UPDATE … WHERE handover_overdue_at IS NULL`), nên hai instance
--    worker chạy chồng, hay một lượt chạy lại, không bao giờ mở hai case cho cùng một đơn. Không
--    backfill: NULL ở đơn cũ nghĩa là "chưa ai đánh dấu", và worker có cửa sổ nhìn lại giới hạn
--    để lượt deploy đầu không mở case cho những đơn lịch sử đã nguội.
-- 2. Partial index phục vụ đúng câu quét đó — đa số đơn không bao giờ khớp điều kiện, index một
--    phần giữ đường nóng nhỏ.
-- 3. Loại case `handover_unconfirmed` vào CHECK.
-- 4. `support_cases.opened_by_user_id` NULLABLE — case do HỆ THỐNG mở không có người bấm nút, và
--    gán bừa một user (chủ gian hàng, admin) vào ô "người mở" là vu oan cho người thật (cùng luật
--    với `audit_logs.actor_user_id` của worker). Ràng buộc kèm theo: chỉ `opened_by_scope =
--    'platform'` mới được để trống — khách/gian hàng mở case thì luôn biết là ai.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột claim ─────────────────────────────────────────────────────────────
ALTER TABLE "public"."bookings" ADD COLUMN "handover_overdue_at" TIMESTAMPTZ(3);

-- ── 2. Index cho lượt quét ───────────────────────────────────────────────────
CREATE INDEX "bookings_handover_overdue_sweep_idx"
    ON "public"."bookings" ("pickup_at")
    WHERE "status" = 'reserved' AND "handover_overdue_at" IS NULL AND "deleted_at" IS NULL;

-- ── 3. Loại case mới ─────────────────────────────────────────────────────────
ALTER TABLE "public"."support_cases"
    DROP CONSTRAINT IF EXISTS "support_cases_category_check";

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_category_check"
    CHECK ("category" IN ('dispute', 'incident', 'payment', 'account', 'account_deletion', 'plan_consultation', 'handover_unconfirmed', 'other'));

-- ── 4. Case do hệ thống mở ───────────────────────────────────────────────────
ALTER TABLE "public"."support_cases" ALTER COLUMN "opened_by_user_id" DROP NOT NULL;

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_system_opener_check"
    CHECK ("opened_by_user_id" IS NOT NULL OR "opened_by_scope" = 'platform');
