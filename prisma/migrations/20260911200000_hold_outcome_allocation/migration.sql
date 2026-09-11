-- ═══════════════════════════════════════════════════════════════════════════
-- Kết cục khoản giữ chỗ là một PHÂN BỔ, không phải một giá trị
-- (11/09/2026 — ADR 0032 điều 5 · ADR 0033 điều 3)
--
-- Hai giá trị mới:
--
--   settled             chuyến hoàn thành — mỗi dòng tiền về đúng người hưởng
--   split_late_cancel   khách huỷ muộn / không đến — `D + S` chia đôi, `IV + IP` hoàn 100%
--
-- Vì sao không dùng lại `kept` và `forfeited`: cả hai mang nghĩa "một phía lấy tất", điều đúng
-- khi khoản giữ chỗ ĐÚNG BẰNG phí dịch vụ (ADR 0021) nhưng sai từ ADR 0032 — hold nay chứa `D`,
-- một phần GIÁ THUÊ, tức tiền của chủ xe. Giữ hai giá trị cũ là chỉ-đọc cho đơn đã chốt: không
-- diễn giải lại kết cục của một chuyến đã xong theo luật ra đời sau nó.
--
-- CHECK theo `purpose` (ADR 0025 điều 4) nới cho hai giá trị mới: chúng hợp lệ với CẢ HAI mục
-- đích, vì từ ADR 0032 hold của cả hai tuyến đều chứa tiền của nhiều người — phân bổ mới là thứ
-- quyết định tiền đi đâu, không phải `purpose` (ADR 0033 điều 4).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_outcome_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_outcome_check"
    CHECK (
        "outcome" IS NULL
        OR "outcome" IN ('kept', 'refunded', 'forfeited', 'released_to_shop',
                         'settled', 'split_late_cancel')
    );

-- Ràng buộc kết cục ↔ mục đích: `kept` vẫn chỉ dành cho `commission`, `released_to_shop` chỉ
-- dành cho `escrow`. Hai giá trị mới không bị chặn ở cả hai phía.
ALTER TABLE "public"."booking_holds" DROP CONSTRAINT IF EXISTS "booking_holds_outcome_by_purpose_check";
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_outcome_by_purpose_check"
    CHECK (
        "outcome" IS NULL
        OR "outcome" IN ('refunded', 'settled', 'split_late_cancel')
        OR ("purpose" = 'commission' AND "outcome" = 'kept')
        OR ("purpose" = 'escrow' AND "outcome" = 'released_to_shop')
    );
