-- ═══════════════════════════════════════════════════════════════════════════
-- Bậc CƠ BẢN cho tuyến hoa hồng: gỡ cờ tính năng nâng cao khỏi gói commission
-- (07/09/2026, ADR 0027 điều 1 · ADR 0028 điều 1)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`. Không đụng lược đồ, chỉ sửa DỮ LIỆU của bảng `plans`.
--
-- ── Vì sao cần ────────────────────────────────────────────────────────────
-- Seed đợt trước cấp ĐỦ CẢ BẢY cờ cho cả gói `commission` lẫn gói `package` (ghi chú trong
-- source: "thà rộng còn siết sau"). Hệ quả trên mọi database đã triển khai: gói hoa hồng — nơi
-- MỌI gian hàng mới hạ cánh qua `BillingService.assignDefaultPlanWithinTx`, và nơi
-- `20260830120000_backfill_default_plan` đã đặt toàn bộ tenant cũ — mở đúng bằng gói thuê bao.
-- Nghĩa là hai bậc năng lực của ADR 0027 **chưa hề tồn tại trên dữ liệu**, dù guard, hook và menu
-- đều đã đúng từ lâu. Sửa seed KHÔNG đủ: seed chỉ chạm database mới hoặc lần chạy seed kế tiếp.
--
-- ── Vì sao AN TOÀN ────────────────────────────────────────────────────────
-- 1. `tenants.used_features` (migration 20260830000000) đã backfill xong. Tenant từng dùng một
--    tính năng rơi vào `read_only`, KHÔNG phải `hidden`: menu còn, dữ liệu cũ xem được hết, chỉ
--    thao tác GHI bị khoá (ADR 0027 điều 3). Không ai mất quyền xem sổ sách của chính mình.
-- 2. `PLAN_FEATURE_ENFORCEMENT` mặc định là `warn` ⇒ hôm nay **chưa chặn ai**. Migration này làm
--    log cảnh báo bắt đầu nói thật; trước đó không gói nào thiếu cờ nên đường dốc `warn` không
--    thể sinh ra bằng chứng nào. Quyết định bật `on` vẫn thuộc `docs/deployment.md` §9.4b, và
--    truy vấn kiểm chứng ở đó sẽ CHẶN việc bật khi còn tenant đang ở `read_only`.
-- 3. KHÔNG chạm `tenant_subscriptions`, `bookings` hay bất kỳ snapshot nào. Năng lực đọc từ gói
--    HIỆN HÀNH và cố ý không đóng băng (ADR 0027 điều 5) — khác hẳn chế độ thu phí của ADR 0024.
--    Gia hạn/nâng cấp gói là cờ mở lại ngay ở lượt đọc kế tiếp.
--
-- ── Phạm vi ───────────────────────────────────────────────────────────────
-- Vị từ là `billing_mode = 'commission'`, không phải `code = 'free'`: ADR 0028 điều 1 định nghĩa
-- hai bậc theo TUYẾN (hoa hồng = Owner Lite, thuê bao = Full Manage), nên một bậc gói hoa hồng
-- thứ hai do admin tạo sau này cũng phải theo cùng luật. Gói `package` KHÔNG bị đụng, kể cả gói
-- đã `archived` — subscription lịch sử trỏ vào chúng là những người đã mua Full Manage thật.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    touched INT;
BEGIN
    UPDATE "public"."plans"
    SET "limits_json" = jsonb_set(
            COALESCE("limits_json", '{}'::jsonb),
            '{features}',
            '[]'::jsonb,
            true
        ),
        "updated_at" = now()
    WHERE "billing_mode" = 'commission'
      -- Idempotent: bỏ qua bậc gói đã rỗng cờ, để chạy lại không dời `updated_at` vô cớ.
      AND COALESCE("limits_json" -> 'features', '[]'::jsonb) <> '[]'::jsonb;

    GET DIAGNOSTICS touched = ROW_COUNT;
    RAISE NOTICE 'Owner Lite: % bậc gói tuyến hoa hồng đã gỡ cờ nâng cao', touched;
END $$;
