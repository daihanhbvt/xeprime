-- ═══════════════════════════════════════════════════════════════════════════
-- ADR 0078 (03/11/2026) — gỡ khung giờ giao/nhận xe và phí giao xe THEO KM.
--
-- 1. `vehicle_handover_windows` bị xoá hẳn: xe nhận và trả mọi giờ. Không đường nào còn đọc/ghi
--    bảng này; API giữ hình dạng cũ (`pickupWindows`/`returnWindows` luôn rỗng) cho app cũ.
--    Snapshot điều kiện thuê đã đóng băng trên yêu cầu/đơn cũ GIỮ NGUYÊN khung của nó (lịch sử).
--
-- 2. Bậc giao xe theo km `{toKm, perKm}` trên chính sách ĐANG DÙNG (`rental_policies`, cả gian
--    hàng lẫn riêng xe) đổi thành bậc trọn gói `{toKm, fee}` với
--    `fee = perKm × toKm` làm tròn tới 1.000đ (số cấu hình là bội 1.000đ — ADR 0069). Đó là mức phí
--    cao nhất bậc đó từng thu, nên không bậc nào bị hạ giá ngầm. Thứ tự bậc giữ nguyên.
--    Snapshot đã đóng băng (phiếu duyệt xe, báo giá trên yêu cầu/đơn) KHÔNG đổi.
--
-- Viết tay. Áp bằng `db:deploy`.
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS "public"."vehicle_handover_windows";

UPDATE "public"."rental_policies" AS p
SET "delivery_tiers_json" = (
    SELECT jsonb_agg(
        CASE
            WHEN COALESCE(e.tier ->> 'perKm', '') <> '' THEN jsonb_build_object(
                'toKm', e.tier -> 'toKm',
                'fee', (ROUND(((e.tier ->> 'perKm')::numeric * (e.tier ->> 'toKm')::numeric) / 1000) * 1000)::bigint::text
            )
            ELSE e.tier
        END
        ORDER BY e.ord
    )
    FROM jsonb_array_elements(p."delivery_tiers_json") WITH ORDINALITY AS e(tier, ord)
)
WHERE jsonb_typeof(p."delivery_tiers_json") = 'array'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p."delivery_tiers_json") AS t(tier)
      WHERE COALESCE(t.tier ->> 'perKm', '') <> ''
  );
