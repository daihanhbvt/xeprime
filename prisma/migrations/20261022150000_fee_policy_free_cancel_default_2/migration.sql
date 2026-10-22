-- ═══════════════════════════════════════════════════════════════════════════
-- Mặc định `fee_policies.free_cancel_hours` 4 → 2 — ADR 0066 điều 3
--
-- Cột nay là TRẦN của cửa sổ huỷ miễn phí động `clamp(round(ΔT × 20%), 15′, free_cancel_hours)`,
-- khớp hằng `HOLD_FREE_CANCEL_HOURS = 2` của @xeprime/types và chính sách v8. Chỉ đổi MẶC ĐỊNH cho
-- dòng tạo sau này; KHÔNG `UPDATE` dòng nào — bản `active`/`archived` là bất biến (ADR 0024 ·
-- ADR 0028 điều 2), bản nháp giữ con số admin đã gõ.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "fee_policies" ALTER COLUMN "free_cancel_hours" SET DEFAULT 2;
