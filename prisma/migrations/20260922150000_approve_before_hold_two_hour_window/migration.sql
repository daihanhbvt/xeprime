-- ═══════════════════════════════════════════════════════════════════════════
-- DUYỆT TRƯỚC, THU TIỀN GIỮ CHỖ SAU — cửa sổ 120 phút, hai mốc nhắc (22/09/2026, ADR 0044)
--
-- ADR 0044 ghi đè ADR 0039 và trả thứ tự về đúng ADR 0032 điều 2: khách gửi yêu cầu → chủ xe
-- duyệt (hoặc xe tự nhận) → hệ thống chốt lịch/giá, giữ xe và phát QR → khách chuyển tiền →
-- backend đối soát đủ tiền thì ĐƠN THUÊ ra đời.
--
-- Hệ quả trực tiếp lên dữ liệu:
--
--   1. Cửa sổ trả tiền quay về **120 phút**. Mười phút của ADR 0039 chỉ hợp lý khi hold sinh ra
--      lúc khách bấm đặt — khi đó xe bị khoá trước cả khi chủ xe kịp nhìn thấy yêu cầu. Nay hold
--      chỉ sinh SAU khi chuyến đã được nhận: chỗ đó là của đúng một người, và hai giờ là thời
--      gian thật để mở app ngân hàng, chuyển tiền và chờ ngân hàng xử lý.
--
--   2. Không còn tự gia hạn. `extension_count` ở lại như một cột LỊCH SỬ (không đường nào ghi
--      nữa) để các hold sinh trong thời gian ADR 0039 còn hiệu lực đọc được đúng chuyện đã xảy
--      ra với chúng. CHECK 0..2 giữ nguyên.
--
--   3. Thêm `final_payment_reminded_at` — cột CLAIM của mốc nhắc thứ hai (còn 15 phút).
--      `payment_reminded_at` nhận mốc thứ nhất (còn 60 phút). Hai cột chứ không một bộ đếm: hai
--      mốc có câu chữ khác nhau, và một bộ đếm không nói được mốc nào đã bắn khi worker bỏ lỡ
--      mốc đầu (máy dừng, hoặc cửa sổ bị kẹp ngắn hơn 60 phút vì giờ nhận xe quá gần).
--
--   4. Chính sách phí v6. KHÔNG `UPDATE` bản v5 đang chạy: bản `active` là BẤT BIẾN (ADR 0028
--      điều 2) và mọi hold đã tạo phải đọc lại được đúng cửa sổ đã áp cho chúng (ADR 0024).
--
-- ⚠️ KHÔNG đụng `expires_at` của hold đang mở — cùng lý do đã ghi ở 20260911140000 và
-- 20260916140000: NỚI hạn của một hold đang chờ tiền sẽ giữ xe lâu hơn lời hứa mà khách và chủ
-- xe đang nhìn thấy trên đồng hồ, còn RÚT hạn thì cho nó chết đúng lúc tiền đang trên đường về.
-- Hold cũ sống hết cửa sổ của chính nó và hết hạn ở đúng mốc đã hiển thị.
--
-- ⚠️ `booking_requests.status` KHÔNG có CHECK trong schema này (xem migration init), nên giá trị
-- mới `slot_taken` (ADR 0044 điều 6) không cần thay đổi cấu trúc nào. `awaiting_hold` và
-- `hold_paid` giữ nguyên tên nhưng `awaiting_hold` ĐỔI NGHĨA: từ "khách chưa trả, chưa ai duyệt"
-- thành "đã được nhận, chờ khách trả". Bản ghi cũ phân biệt được bằng `decided_at IS NULL`, và
-- đường xử lý tiền về đọc đúng cột đó — không có bản ghi nào bị đổi nghĩa ngầm.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột claim cho mốc nhắc thứ hai ───────────────────────────────────────

ALTER TABLE "public"."booking_holds"
    ADD COLUMN "final_payment_reminded_at" TIMESTAMPTZ(3);

-- ── 2. Mặc định cho hàng tương lai ──────────────────────────────────────────

ALTER TABLE "public"."fee_policies"
    ALTER COLUMN "hold_payment_window_minutes" SET DEFAULT 120;

-- ── 3. Chính sách phí v6: cửa sổ 120 phút ───────────────────────────────────

UPDATE "public"."fee_policies"
   SET "status"       = 'archived',
       "effective_to" = now(),
       "updated_at"   = now()
 WHERE "status" = 'active'
   AND "version" = 5
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 6);

-- Sao nguyên v5 rồi chỉ đổi cửa sổ: chép tay từng con số ở đây là cách chắc chắn để một mức
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
    '01FEEPOLICYHOLD120MIN006', 6, 'active',
    'Pilot — duyệt trước, thanh toán giữ chỗ trong 120 phút',
    'ADR 0044: tiền giữ chỗ chỉ được thu SAU khi chuyến đã được chủ xe duyệt hoặc xe tự nhận. Khách có 120 phút (hai chặng 60 phút, nhắc ở mốc còn 60 và 15 phút), không còn tự gia hạn. Huỷ miễn phí 4 giờ và mọi con số phí/thuế/bảo hiểm giữ nguyên như v5.',
    p."service_fee_percent", p."hold_min_amount", 120, p."free_cancel_hours",
    p."deposit_percent", p."deposit_min_amount", p."deposit_max_percent",
    p."tax_enabled", p."tax_percent", p."tax_label",
    p."trip_insurance_enabled", p."trip_insurance_percent",
    p."vehicle_protection_enabled", p."vehicle_protection_percent", p."insurance_partner_name",
    now(), now(), now(), now()
  FROM "public"."fee_policies" p
 WHERE p."version" = 5
   AND NOT EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "version" = 6);
