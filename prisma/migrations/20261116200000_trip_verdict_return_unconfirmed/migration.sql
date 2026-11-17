-- ═══════════════════════════════════════════════════════════════════════════
-- Kết luận chuyến của nền tảng + lưới chống treo ở mốc TRẢ XE — ADR 0094 (16/11/2026).
--
-- 1. `bookings.return_unconfirmed_at` — cột CLAIM của worker `return-overdue`: quá `return_at + 24h`
--    mà đơn vẫn `active`, chưa biên bản trả xe nào được xác nhận và khách chưa báo "Đã trả xe" ⇒
--    mở MỘT case `return_unconfirmed`. Lật từ NULL cùng transaction mở case (`UPDATE … WHERE
--    return_unconfirmed_at IS NULL`) ⇒ một đơn có tối đa một case loại này kể cả khi hai worker
--    chạy chồng. Không backfill: worker có cửa sổ nhìn lại giới hạn.
-- 2. Partial index cho đúng câu quét đó.
-- 3. Loại case `return_unconfirmed` vào CHECK.
-- 4. `vehicle_handovers.confirm_source` nhận thêm `platform`: biên bản do nhân sự nền tảng lập khi
--    kết luận chuyến ("xe đã giao" / "xe đã trả"). `confirmed_by` = tài khoản nhân sự đó — CHECK
--    `vh_confirmed_has_actor` vẫn đòi một người, và người đó là bên đã xác minh.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột claim ─────────────────────────────────────────────────────────────
ALTER TABLE "public"."bookings" ADD COLUMN "return_unconfirmed_at" TIMESTAMPTZ(3);

-- ── 2. Index cho lượt quét ───────────────────────────────────────────────────
CREATE INDEX "bookings_return_unconfirmed_sweep_idx"
    ON "public"."bookings" ("return_at")
    WHERE "status" = 'active' AND "return_unconfirmed_at" IS NULL AND "deleted_at" IS NULL;

-- ── 3. Loại case mới ─────────────────────────────────────────────────────────
ALTER TABLE "public"."support_cases"
    DROP CONSTRAINT IF EXISTS "support_cases_category_check";

ALTER TABLE "public"."support_cases"
    ADD CONSTRAINT "support_cases_category_check"
    CHECK ("category" IN ('dispute', 'incident', 'payment', 'account', 'account_deletion', 'plan_consultation', 'handover_unconfirmed', 'return_unconfirmed', 'other'));

-- ── 4. Nguồn xác nhận biên bản ───────────────────────────────────────────────
ALTER TABLE "public"."vehicle_handovers"
    DROP CONSTRAINT IF EXISTS "vehicle_handovers_confirm_source_check";

ALTER TABLE "public"."vehicle_handovers"
    ADD CONSTRAINT "vehicle_handovers_confirm_source_check"
    CHECK ("confirm_source" IN ('host', 'customer', 'auto', 'platform'));
