-- ═══════════════════════════════════════════════════════════════════════════
-- Chính sách phí phiên bản 2 — BẬT CỌC 20% (11/09/2026 — ADR 0032 điều 2 · ADR 0033 điều 7)
--
-- Vì sao là một VERSION MỚI chứ không phải `UPDATE` bản đang chạy:
-- bản `active` là BẤT BIẾN theo thiết kế (ADR 0028 điều 2). Mọi đơn đã tạo đều snapshot
-- `fee_policy_id` của nó để đọc lại đúng con số đã áp (ADR 0024); sửa tại chỗ là viết lại lịch
-- sử tiền của những đơn đó. Cách đúng là lưu trữ bản cũ và kích hoạt bản mới — đơn cũ vẫn trỏ
-- về v1 và giải thích được, đơn mới ăn v2.
--
-- v1 (`01R3FEEPOLICYPILOT0000001`, migration R3) có `deposit_percent = 0` vì nó ra đời trước
-- ADR 0032, khi khoản giữ chỗ đúng bằng phí dịch vụ. Nó không sai — nó là lịch sử.
--
-- Số của v2: phí dịch vụ 10% (ADR 0028 điều 2), cọc 20% (ví dụ ADR 0032), sàn cọc 50.000đ.
-- Thuế và bảo hiểm vẫn TẮT: ADR 0028 điều 4–5 cấm thu khi chưa có tư vấn thuế và hợp đồng
-- đối tác thật. Cửa sổ thanh toán giữ 1440 phút ở đây — mốc 2h/4h tính từ `accepted_at` là
-- một thay đổi hành vi riêng, đi cùng code đọc nó (Phase 2), không nhét lẫn vào đây.
--
-- Idempotent: chỉ chèn khi chưa có version 2, và chỉ lưu trữ v1 khi v2 thực sự ra đời.
-- ═══════════════════════════════════════════════════════════════════════════

-- Lưu trữ bản đang hiệu lực TRƯỚC khi chèn bản mới: unique một phần trên `status = 'active'`
-- chỉ cho phép đúng một bản hiệu lực, nên thứ tự này là bắt buộc chứ không phải sở thích.
UPDATE "public"."fee_policies"
   SET "status"       = 'archived',
       "effective_to" = now(),
       "updated_at"   = now()
 WHERE "status" = 'active'
   AND "version" = 1
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 2);

INSERT INTO "public"."fee_policies" (
    "id", "version", "status", "name", "note", "service_fee_percent",
    "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
    "deposit_percent", "deposit_min_amount", "deposit_max_percent",
    "effective_from", "activated_at", "created_at", "updated_at"
)
SELECT
    '01FEEPOLICYDEPOSIT000002', 2, 'active', 'Pilot — cọc 20% + phí dịch vụ 10%',
    'ADR 0032/0033: khách trả online D + S + IV + IP. Cọc 20% giá thuê (sàn 50.000đ), phí dịch vụ XePrime 10% phía khách. Thuế và bảo hiểm chưa bật — chờ tư vấn thuế và hợp đồng đối tác.',
    10, 20000, 1440, 4,
    20, 50000, 30,
    now(), now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 2);
