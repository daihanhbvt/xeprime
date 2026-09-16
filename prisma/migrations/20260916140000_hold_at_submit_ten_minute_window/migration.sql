-- ═══════════════════════════════════════════════════════════════════════════
-- CỌC TRƯỚC, DUYỆT SAU — cửa sổ 10 phút + hai lần tự gia hạn (16/09/2026, ADR 0039)
--
-- Đổi thứ tự vòng đời: khoản giữ chỗ nay sinh ra lúc khách GỬI YÊU CẦU, không phải lúc chủ xe
-- duyệt. Hệ quả trực tiếp là chiếc xe bị khoá trước cả khi chủ xe kịp nhìn thấy yêu cầu — nên
-- cửa sổ hai giờ của ADR 0032 không còn dùng được: đó là hai giờ khách khác không đặt được,
-- đổi lấy một người có thể đã đóng trình duyệt ngay sau khi bấm.
--
-- Ba thay đổi:
--
--   1. `extension_count` — bộ đếm số lần cửa sổ đã được tự cộng thêm. BỘ ĐẾM chứ không phải cờ,
--      vì worker tăng nó trong cùng một `UPDATE … WHERE extension_count < N` với lượt dời
--      `expires_at`: hai worker chạy song song vì thế không thể gia hạn quá số lần cho phép, và
--      không cần khoá nào ở tầng app.
--
--   2. DEFAULT của `hold_payment_window_minutes` 120 → 10, chỉ cho hàng TƯƠNG LAI.
--
--   3. Chính sách phí v5. KHÔNG `UPDATE` bản v4 đang chạy: bản `active` là BẤT BIẾN (ADR 0028
--      điều 2), và đơn đã tạo phải đọc lại được đúng mốc đã áp cho chúng (ADR 0024). v4 được
--      lưu trữ, v5 kích hoạt — mọi con số khác giữ nguyên y hệt v4, chỉ cửa sổ đổi.
--
-- KHÔNG đụng `expires_at` của hold đang mở — cùng lý do đã ghi ở migration 20260911140000: rút
-- hạn của một hold đang chờ tiền có thể cho nó hết hạn đúng lúc tiền khách đang trên đường về,
-- và khoản đó thành mồ côi trong `bank_transactions`. Hold cũ sống hết cửa sổ hai giờ của nó.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Bộ đếm gia hạn ───────────────────────────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "extension_count" INTEGER NOT NULL DEFAULT 0;

-- Trần số lần gia hạn là luật, nên DB canh chứ không chỉ worker. `HOLD_MAX_EXTENSIONS = 2`.
ALTER TABLE "public"."booking_holds"
    ADD CONSTRAINT "booking_holds_extension_count_check"
    CHECK ("extension_count" >= 0 AND "extension_count" <= 2);

-- ── 2. Mặc định cho hàng tương lai ──────────────────────────────────────────

ALTER TABLE "public"."fee_policies"
    ALTER COLUMN "hold_payment_window_minutes" SET DEFAULT 10;

-- ── 3. Chính sách phí v5: cửa sổ 10 phút ────────────────────────────────────

UPDATE "public"."fee_policies"
   SET "status"       = 'archived',
       "effective_to" = now(),
       "updated_at"   = now()
 WHERE "status" = 'active'
   AND "version" = 4
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 5);

-- Sao nguyên v4 rồi chỉ đổi cửa sổ: chép tay từng cột ở đây là cách chắc chắn để một con số
-- bảo hiểm hay thuế bị bỏ quên và cả sàn lặng lẽ ngừng thu nó.
INSERT INTO "public"."fee_policies" (
    "id", "version", "status", "name", "note",
    "service_fee_percent", "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
    "deposit_percent", "deposit_min_amount", "deposit_max_percent",
    "tax_enabled", "tax_percent", "tax_label",
    "trip_insurance_enabled", "trip_insurance_percent",
    "vehicle_protection_enabled", "vehicle_protection_percent", "insurance_partner_name",
    "effective_from", "activated_at", "created_at", "updated_at"
)
SELECT
    '01FEEPOLICYHOLD10MIN0005', 5, 'active',
    'Pilot — cọc trước khi duyệt, cửa sổ 10 phút',
    'ADR 0039: khoản giữ chỗ sinh ra lúc khách gửi yêu cầu (không chờ chủ xe duyệt). Khách có 10 phút để quét QR, tự gia hạn tối đa 2 lần ⇒ xe bị giữ nhiều nhất 30 phút. Huỷ miễn phí 4 giờ và mọi con số phí/thuế/bảo hiểm giữ nguyên như v4.',
    p."service_fee_percent", p."hold_min_amount", 10, p."free_cancel_hours",
    p."deposit_percent", p."deposit_min_amount", p."deposit_max_percent",
    p."tax_enabled", p."tax_percent", p."tax_label",
    p."trip_insurance_enabled", p."trip_insurance_percent",
    p."vehicle_protection_enabled", p."vehicle_protection_percent", p."insurance_partner_name",
    now(), now(), now(), now()
  FROM "public"."fee_policies" p
 WHERE p."version" = 4
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 5);
