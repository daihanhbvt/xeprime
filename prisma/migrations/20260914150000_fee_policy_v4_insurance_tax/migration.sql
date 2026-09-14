-- ═══════════════════════════════════════════════════════════════════════════
-- Chính sách phí v4 — BẬT bảo hiểm `IV`/`IP` và thuế `T`
-- (14/09/2026 — quyết định của chủ sản phẩm, Phase 7 + Phase 8)
--
-- ## ⚠️ QUYẾT ĐỊNH CÓ RỦI RO ĐÃ ĐƯỢC NÊU VÀ CHẤP NHẬN
--
-- ADR 0028 điều 4–5 yêu cầu **không bật bảo hiểm khi chưa có đối tác/biểu phí/chứng nhận/claims
-- flow**, và **không điền tỷ lệ thuế khi chưa có tư vấn thuế**. Cả hai điều kiện đó CHƯA đạt vào
-- ngày viết migration này. Chủ sản phẩm đã được trình bày rủi ro và quyết định bật. Ghi ra đây để
-- người đọc sau không tưởng rằng nó lọt qua vì bị bỏ sót:
--
--   1. **Bảo hiểm thu tiền nhưng KHÔNG ai phát hành.** Chưa có adapter đối tác, nên mọi hợp đồng
--      dừng ở `failed` với `partner_not_configured`. Khách đã trả `IV`/`IP` mà không có chứng
--      nhận nào. Tiền đó nằm ở vế GIỮ HỘ của đối soát ba vế — kế toán đúng, nhưng **khách không
--      thực sự có bảo hiểm**. Có tai nạn là không có ai bồi thường.
--      → Trước khi mở cho khách thật: cắm `InsurancePartner` thật, hoặc tắt hai cờ này.
--
--   2. **Thuế 10% = 5% VAT + 5% TNCN** — mức phổ biến cho CÁ NHÂN cho thuê tài sản có doanh thu
--      trên 100 triệu/năm (TT 40/2021). Nó KHÔNG đúng cho hộ kinh doanh hay doanh nghiệp, và
--      `fee_policies` hiện chưa phân biệt loại chủ thể. Khấu trừ sai là khấu trừ bằng tiền của
--      CHỦ XE, và họ là người bị truy thu.
--      → Cần tư vấn thuế xác nhận phân loại; khi có, tách tỷ lệ theo `seller_profiles.entity_type`.
--
-- ## Ràng buộc kỹ thuật đã kiểm
--
-- `feePolicyActivationBlockers` đòi: thuế bật phải có `tax_percent` + `tax_label`; bảo hiểm bật
-- phải có `insurance_partner_name` và tỷ lệ; và **`deposit_percent >= tax_percent`** (nếu không
-- `ownerPayableAmount` âm — nền tảng nhận nghĩa vụ nộp thay lớn hơn số nó giữ). Cọc 20% ≥ thuế
-- 10% ⇒ qua.
--
-- `insurance_partner_name` để TRUNG LẬP. Điền tên một hãng chưa ký hợp đồng là mạo danh họ
-- (ADR 0028 điều 5) — tên thật chỉ được điền cùng ngày có hợp đồng.
--
-- ## Bản `active` là BẤT BIẾN
--
-- Không `UPDATE` v3. Lưu trữ nó rồi chèn v4 — đơn đã tạo vẫn đọc lại được đúng chính sách đã áp
-- cho chúng (ADR 0024). Đây là lý do `fee_policies` có phiên bản ngay từ đầu.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "public"."fee_policies"
   SET "status"       = 'archived',
       "effective_to" = now(),
       "updated_at"   = now()
 WHERE "status" = 'active'
   AND "version" = 3
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 4);

INSERT INTO "public"."fee_policies" (
    "id", "version", "status", "name", "note",
    "service_fee_percent", "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
    "deposit_percent", "deposit_min_amount", "deposit_max_percent",
    "tax_enabled", "tax_percent", "tax_label",
    "vehicle_protection_enabled", "vehicle_protection_percent",
    "trip_insurance_enabled", "trip_insurance_percent", "insurance_partner_name",
    "effective_from", "activated_at", "created_at", "updated_at"
)
SELECT
    '01FEEPOLICYINSTAX0000004', 4, 'active',
    'Pilot — cọc 20%, bảo hiểm và thuế đã bật',
    'Bật IV 2% (bảo hiểm xe, bắt buộc) + IP 1% (tai nạn người, tuỳ chọn) + thuế 10% (5% VAT + 5% TNCN). '
    || 'CẢNH BÁO: chưa cắm đối tác bảo hiểm nên hợp đồng dừng ở failed/partner_not_configured — '
    || 'phí đã thu được giữ hộ, khách CHƯA có chứng nhận. Tỷ lệ thuế theo TT 40/2021 cho cá nhân '
    || 'cho thuê tài sản, chưa qua tư vấn thuế và chưa tách theo loại chủ thể.',
    10, 20000, 120, 4,
    20, 50000, 30,
    -- Thuế: 5% VAT + 5% TNCN. Nhãn đi vào bảng kê của chủ xe, nên nó phải nói ra hai phần.
    true, 10, 'VAT 5% + TNCN 5%',
    -- `IV` bảo hiểm xe — BẮT BUỘC, khách trả (ADR 0032 điều 4).
    true, 2,
    -- `IP` tai nạn người — TUỲ CHỌN, chỉ tính khi khách giữ lựa chọn.
    true, 1,
    'Đối tác bảo hiểm (chưa cấu hình)',
    now(), now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 4);
