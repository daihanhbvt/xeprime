-- ═══════════════════════════════════════════════════════════════════════════
-- ĐƠN GIẢN HOÁ TRẠNG THÁI ĐƠN THUÊ (ADR 0047, 23/09/2026)
--
-- `bookings.status` rút gọn còn ĐÚNG NĂM giá trị nghiệp vụ thật: reserved · active ·
-- completed · cancelled · no_show. `confirmed` chưa từng được bất kỳ luồng sản phẩm THẬT nào
-- để lại ở trạng thái nghỉ — nó chỉ là một bước kỹ thuật thoáng qua trong CÙNG một transaction
-- xác nhận bàn giao (`reserved → confirmed → active`, ghi rồi ghi đè ngay trong cùng tx, không
-- ai đọc thấy chặng giữa). Nguồn `confirmed` DUY NHẤT còn lại trong DB hôm nay là dữ liệu demo
-- (`prisma/src/seed/shop-operations.ts` ghi thẳng qua Prisma, bỏ qua service) và khả năng một
-- hàng dữ liệu cũ bị ai đó gọi endpoint transition đặt tay (trước khi DTO bị khoá cùng đợt này).
--
-- `confirmed` VẪN còn trong enum `@xeprime/types` (đánh dấu @deprecated) — chỉ để `apps/mobile`
-- (phụ thuộc workspace, không sửa trong đợt này) còn biên dịch được. Migration này không đụng gì
-- tới enum đó; nó chỉ dọn DỮ LIỆU và THÊM RÀNG BUỘC để DB không còn nhận `confirmed` nữa.
--
-- ───────────────────────────────────────────────────────────────────────────
-- QUY TẮC CHUYỂN DỮ LIỆU — không đoán khi mâu thuẫn, dừng hẳn và nêu rõ id
--
--   (a) chưa có `actual_pickup_at` VÀ chưa có biên bản GIAO đã xác nhận  → `reserved`
--       (đơn chưa từng thực sự giao xe — đây là toàn bộ dữ liệu demo hiện có).
--   (b) có `actual_pickup_at` HOẶC có biên bản GIAO đã xác nhận         → `active`
--       (bàn giao đã xảy ra thật, chỉ là cột status bị bỏ sót một bước cập nhật cũ).
--   (c) CẢ HAI đều có NHƯNG lệch nhau quá 5 phút                        → RAISE EXCEPTION,
--       dừng toàn bộ migration. Hai nguồn sự thật nói hai câu chuyện khác nhau về CÙNG một
--       chuyến — không có quy tắc nào đoán đúng hộ, và đoán sai ở đây là viết lại lịch sử vận
--       hành của một chuyến xe thật.
--
-- Nhánh (b) còn bổ sung `actual_pickup_at` từ mốc biên bản khi cột đó đang trống, theo đúng quy
-- tắc `occurred_at ?? confirmed_at` đã dùng ở `handoverOccurredAt()` (`packages/types`).
--
-- ⚠️ Migration này CHẠY LẠI ĐƯỢC: sau lượt đầu không còn hàng nào ở `confirmed`, nên khối DO $$
-- không tìm thấy ứng viên nào và các bước ALTER TABLE dùng `DROP CONSTRAINT IF EXISTS` trước khi
-- thêm lại.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    ambiguous_count INT;
    ambiguous_ids   TEXT;
    reserved_count  INT;
    active_count    INT;
BEGIN
    -- ── Bước 0: phát hiện MÂU THUẪN trước khi đụng bất cứ hàng nào ──────────
    SELECT COUNT(*), STRING_AGG(x.id, ', ')
    INTO ambiguous_count, ambiguous_ids
    FROM (
        SELECT b."id"
        FROM "public"."bookings" b
        LEFT JOIN LATERAL (
            SELECT COALESCE(vh."occurred_at", vh."confirmed_at") AS handover_at
            FROM "public"."vehicle_handovers" vh
            WHERE vh."booking_id" = b."id"
              AND vh."type" = 'pickup'
              AND vh."status" = 'confirmed'
            ORDER BY vh."confirmed_at" DESC
            LIMIT 1
        ) ph ON true
        WHERE b."status" = 'confirmed'
          AND b."actual_pickup_at" IS NOT NULL
          AND ph.handover_at IS NOT NULL
          AND ABS(EXTRACT(EPOCH FROM (b."actual_pickup_at" - ph.handover_at))) > 300
    ) x;

    IF ambiguous_count > 0 THEN
        RAISE EXCEPTION
            'MÂU THUẪN DỮ LIỆU (ADR 0047): % đơn confirmed có actual_pickup_at VÀ biên bản giao xe '
            'đã xác nhận, nhưng hai mốc lệch nhau quá 5 phút — dừng migration, KHÔNG đoán. Id: %',
            ambiguous_count, ambiguous_ids;
    END IF;

    -- ── Nhánh (a): chưa giao xe thật → reserved ─────────────────────────────
    WITH moved AS (
        UPDATE "public"."bookings" b
        SET "status" = 'reserved'
        WHERE b."status" = 'confirmed'
          AND b."actual_pickup_at" IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM "public"."vehicle_handovers" vh
              WHERE vh."booking_id" = b."id"
                AND vh."type" = 'pickup'
                AND vh."status" = 'confirmed'
          )
        RETURNING 1
    )
    SELECT COUNT(*) INTO reserved_count FROM moved;

    -- ── Nhánh (b): đã giao xe thật (theo MỘT trong hai nguồn) → active ──────
    -- Nhánh (a) đã chuyển hết phần không đủ bằng chứng, nên WHERE status='confirmed' còn lại ở
    -- đây đúng là phần bằng chứng đã có.
    WITH moved AS (
        UPDATE "public"."bookings" b
        SET "status" = 'active',
            "actual_pickup_at" = COALESCE(
                b."actual_pickup_at",
                (
                    SELECT COALESCE(vh."occurred_at", vh."confirmed_at")
                    FROM "public"."vehicle_handovers" vh
                    WHERE vh."booking_id" = b."id"
                      AND vh."type" = 'pickup'
                      AND vh."status" = 'confirmed'
                    ORDER BY vh."confirmed_at" DESC
                    LIMIT 1
                )
            )
        WHERE b."status" = 'confirmed'
        RETURNING 1
    )
    SELECT COUNT(*) INTO active_count FROM moved;

    -- ── Bất biến bắt buộc trước khi thêm CHECK: không còn hàng nào ở confirmed ──
    IF EXISTS (SELECT 1 FROM "public"."bookings" WHERE "status" = 'confirmed') THEN
        RAISE EXCEPTION
            'Vẫn còn đơn ở confirmed sau khi chuyển — bất biến ADR 0047 chưa đạt, dừng trước khi '
            'thêm CHECK constraint.';
    END IF;

    RAISE NOTICE
        'ADR 0047: % đơn confirmed → reserved, % đơn confirmed → active. Không còn đơn nào ở confirmed.',
        reserved_count, active_count;
END $$;

-- ── Đơn giản hoá exclusion lịch tài xế: bỏ 'confirmed' khỏi danh sách chiếm lịch ────────────
-- An toàn vì khối DO $$ ở trên đã đảm bảo không còn hàng nào ở confirmed.
ALTER TABLE "public"."bookings" DROP CONSTRAINT IF EXISTS "bookings_driver_schedule_excl";
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_driver_schedule_excl"
    EXCLUDE USING gist (driver_id WITH =, tstzrange(pickup_at, return_at) WITH &&)
    WHERE (((driver_id IS NOT NULL) AND ("status" IN ('reserved', 'active')) AND (deleted_at IS NULL)));

-- ── CHECK constraint ĐẦU TIÊN cho bookings.status (ADR 0005 hứa "DB canh bằng CHECK", chưa
-- từng thực hiện cho bảng này — ADR 0047 đóng khoảng trống) ─────────────────────────────────
ALTER TABLE "public"."bookings" DROP CONSTRAINT IF EXISTS "bookings_status_check";
ALTER TABLE "public"."bookings" ADD CONSTRAINT "bookings_status_check"
    CHECK (("status" IN ('reserved', 'active', 'completed', 'cancelled', 'no_show')));
