-- ═══════════════════════════════════════════════════════════════════════════
-- Gán GÓI MẶC ĐỊNH cho mọi gian hàng chưa có gói hiện hành
-- (30/08/2026, ADR 0015 điều 9 · điều kiện tiên quyết của ADR 0027)
--
-- VIẾT TAY — cùng lý do đã ghi ở header `20260821000000_init/migration.sql`. Không đụng lược đồ,
-- chỉ chèn dữ liệu.
--
-- Vì sao nó là một MIGRATION chứ không phải một script chạy tay: đây là điều kiện AN TOÀN của
-- đợt bật cổng chặn năng lực. Từ ADR 0027, cờ tính năng đọc từ **gói hiện hành**; một tenant
-- không có gói nào có tập cờ RỖNG, nên ngày `PLAN_FEATURE_ENFORCEMENT=on` họ mất sạch tính năng
-- nâng cao — kể cả quyền ĐỌC sổ sách của chính mình. Trạng thái "không có gói" phải biến mất
-- khỏi dữ liệu trước ngày đó, ở MỌI môi trường, không phụ thuộc ai nhớ chạy script nào.
--
-- Đường sinh mới đã được bịt cùng đợt: `registerShop` gọi
-- `BillingService.assignDefaultPlanWithinTx` trong cùng transaction mở gian hàng. Migration này
-- chỉ lo phần dữ liệu CŨ.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    plan_row  RECORD;
    tenant_row RECORD;
    inserted  INT := 0;
BEGIN
    -- Gói mặc định = bậc `commission` đang bán có `sort_order` nhỏ nhất (tuyến hoa hồng —
    -- ADR 0020: vào miễn phí, chỉ trả khi có doanh thu). Cùng phép chọn với
    -- `BillingService.assignDefaultPlanWithinTx` và job vòng đời.
    SELECT id, commission_percent INTO plan_row
    FROM "public"."plans"
    WHERE "status" = 'active' AND "billing_mode" = 'commission'
    ORDER BY "sort_order" ASC
    LIMIT 1;

    IF plan_row IS NULL THEN
        -- KHÔNG ném: một database chưa chạy seed nền (`SEED_MODE=system`) là chuyện bình thường
        -- ở môi trường mới dựng, và làm đỏ `migrate deploy` vì thiếu dữ liệu danh mục là chặn cả
        -- lần triển khai đầu tiên. Seed sẽ tạo gói, rồi lần deploy sau migration này đã chạy —
        -- nên cảnh báo phải nêu rõ việc cần làm tay.
        RAISE WARNING 'Chưa có gói tuyến hoa hồng nào đang bán — BỎ QUA backfill. Chạy `SEED_MODE=system` rồi gán gói cho tenant cũ trước khi bật PLAN_FEATURE_ENFORCEMENT=on.';
        RETURN;
    END IF;

    FOR tenant_row IN
        SELECT t."id"
        FROM "public"."tenants" t
        WHERE t."deleted_at" IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM "public"."tenant_subscriptions" ts
              WHERE ts."tenant_id" = t."id"
                AND ts."status" = 'active'
                AND ts."starts_at" <= now()
                AND ts."ends_at" > now()
          )
    LOOP
        -- ID sinh trong SQL: `gen_random_uuid()` cho ra 32 ký tự hex — vừa khít `char(26)` sau
        -- khi cắt, và KHÔNG phải ULID thật. Chấp nhận được vì đây là hàng dữ liệu một lần, không
        -- phải đường ghi lúc chạy: `id` chỉ cần duy nhất, không cần sắp theo thời gian.
        INSERT INTO "public"."tenant_subscriptions"
            ("id", "tenant_id", "plan_id", "status", "price", "term_months",
             "billing_mode", "commission_percent", "starts_at", "ends_at", "note", "created_at")
        VALUES (
            upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 26)),
            tenant_row."id",
            plan_row."id",
            'active',
            0,
            -- Khớp `COMMISSION_TRACK_TERM_MONTHS` ở @xeprime/types. `interval '12 months'` của
            -- Postgres cộng theo THÁNG LỊCH, cùng ngữ nghĩa `addCalendarMonthsVn` (ADR 0015 điều 2).
            12,
            'commission',
            plan_row."commission_percent",
            now(),
            now() + interval '12 months',
            'Gói mặc định backfill cho gian hàng chưa có gói (ADR 0015 điều 9).',
            now()
        );
        inserted := inserted + 1;
    END LOOP;

    RAISE NOTICE 'backfill gói mặc định: % gian hàng', inserted;
END $$;
