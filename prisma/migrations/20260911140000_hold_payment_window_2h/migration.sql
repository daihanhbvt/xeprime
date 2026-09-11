-- ═══════════════════════════════════════════════════════════════════════════
-- Cửa sổ trả cọc 2 giờ, huỷ miễn phí 4 giờ — cả hai đếm xuôi từ `accepted_at`
-- (11/09/2026 — ADR 0032 điều 2 và 5)
--
-- Đây là một **implementation gap**, không phải yêu cầu mới: ADR 0032 nói thẳng rằng code khác
-- 2 giờ / 4 giờ hoặc khác cách tính hold phải được sửa, chứ không được coi là sản phẩm đã đổi ý.
--
-- Ba thay đổi, mỗi cái một lý do:
--
--   1. `hold_payment_window_minutes` DEFAULT 1440 → 120. Chỉ đổi DEFAULT cho hàng TƯƠNG LAI;
--      bản chính sách đang chạy giữ nguyên số của nó vì bản `active` là BẤT BIẾN
--      (ADR 0028 điều 2). Bản v3 bên dưới mới là nơi con số mới có hiệu lực thật.
--
--   2. `payment_reminded_at` — cột CLAIM cho lần nhắc giữa chừng. Rút cửa sổ từ 24 giờ xuống 2
--      giờ mà không nhắc là đổi một luồng "khách quay lại lúc rảnh" thành một cái bẫy: phần lớn
--      người nhận thông báo duyệt xong sẽ không mở lại app trong vòng hai tiếng nếu không có gì
--      gọi họ. Worker chỉ nhắc khi cột còn NULL nên chạy lại bao nhiêu lần vẫn đúng một lần.
--
--   3. Chính sách phí v3 — v2 (migration 20260911093000) ra đời với cửa sổ 1440 kế thừa từ v1.
--      Cùng lý do với v2: không `UPDATE` bản đang chạy, mà lưu trữ nó và kích hoạt bản mới, để
--      đơn đã tạo vẫn đọc lại được đúng mốc đã áp cho chúng (ADR 0024).
--
-- KHÔNG đụng `expires_at` / `free_cancel_until` của hold đang mở. Rút ngắn hạn của một hold đang
-- chờ tiền có thể cho nó hết hạn đúng lúc tiền khách đang trên đường về — webhook sẽ từ chối với
-- `hold_closed` và khoản tiền đó thành mồ côi trong `bank_transactions`, phải gỡ bằng tay.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Mặc định cho hàng tương lai ──────────────────────────────────────────

ALTER TABLE "public"."fee_policies"
    ALTER COLUMN "hold_payment_window_minutes" SET DEFAULT 120;

-- ── 2. Cột claim cho nhắc hạn giữa chừng ────────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "payment_reminded_at" TIMESTAMPTZ(3);

-- Worker quét "hold còn chờ tiền, đã qua mốc nhắc, chưa nhắc lần nào". Partial index giữ cho
-- phép quét đó chỉ chạm đúng số hold đang mở thay vì cả lịch sử.
CREATE INDEX "booking_holds_pending_reminder_idx"
    ON "public"."booking_holds" ("expires_at")
    WHERE "payment_reminded_at" IS NULL
      AND "status" IN ('pending', 'underpaid');

-- ── 3. Chính sách phí v3: cửa sổ 2 giờ ──────────────────────────────────────

UPDATE "public"."fee_policies"
   SET "status"       = 'archived',
       "effective_to" = now(),
       "updated_at"   = now()
 WHERE "status" = 'active'
   AND "version" = 2
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 3);

INSERT INTO "public"."fee_policies" (
    "id", "version", "status", "name", "note", "service_fee_percent",
    "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
    "deposit_percent", "deposit_min_amount", "deposit_max_percent",
    "effective_from", "activated_at", "created_at", "updated_at"
)
SELECT
    '01FEEPOLICYWINDOW2H00003', 3, 'active', 'Pilot — cọc 20%, cửa sổ trả cọc 2 giờ',
    'ADR 0032 điều 2: khách có 2 giờ để quét QR kể từ khi chủ xe duyệt, và 4 giờ huỷ miễn phí tính từ cùng mốc đó. Cọc 20% giá thuê (sàn 50.000đ), phí dịch vụ XePrime 10% phía khách. Thuế và bảo hiểm chưa bật.',
    10, 20000, 120, 4,
    20, 50000, 30,
    now(), now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 3);
