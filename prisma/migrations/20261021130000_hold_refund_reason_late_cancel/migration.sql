-- ═══════════════════════════════════════════════════════════════════════════
-- Hai lý do hoàn mới cho kết cục TỰ ĐỘNG `split_late_cancel` (ADR 0064, 21/10/2026).
--
-- Trước bản này, phần BẢO HIỂM (`IV + IP`) hoàn cho khách ở một lượt huỷ muộn / không đến nhận xe
-- được ghi với lý do `admin_decision` — trong khi chẳng có admin nào quyết gì: đó là luật tự động.
-- Sổ hoàn đọc lại vì thế nói sai chuyện đã xảy ra, và hàng đợi "quyết định của XePrime" lẫn các
-- khoản không cần ai xem.
--
--   • `late_cancel` — khách huỷ SAU mốc huỷ miễn phí.
--   • `no_show`     — khách không đến nhận xe (xử lý như huỷ muộn — ADR 0033 điều 3).
--
-- Chỉ NỚI CHECK: mọi dòng đang hợp lệ vẫn hợp lệ. KHÔNG viết lại lý do của các khoản hoàn cũ —
-- chúng là lịch sử đã ghi, và `admin_decision` vẫn là một lý do hợp lệ cho lượt chốt tay.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."hold_refunds" DROP CONSTRAINT IF EXISTS "hold_refunds_reason_check";
ALTER TABLE "public"."hold_refunds"
    ADD CONSTRAINT "hold_refunds_reason_check"
    CHECK ("reason" IN (
        'early_cancel', 'owner_cancel', 'overpaid', 'hold_expired',
        'late_cancel', 'no_show', 'admin_decision'
    ));
