-- ═══════════════════════════════════════════════════════════════════════════
-- Ngày lễ Việt Nam — đồng bộ từ Google Calendar (26/08/2026)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`: baseline chứa 25 thứ mà `schema.prisma` không diễn đạt
-- được (rõ nhất là các khoá ngoại tổ hợp `(id, tenant_id)`), nên migration Prisma tự sinh sẽ
-- kèm lệnh DROP các khoá đó. Migration này chỉ THÊM hai bảng và không chạm gì đang có.
--
-- Đối chiếu với datamodel sau khi áp:
--   prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
--   → vẫn đúng 25 câu chênh lệch cố ý như trước, không thêm câu nào.
--
-- Hai bảng, KHÔNG bảng nào có `tenant_id`: ngày lễ là dữ kiện của quốc gia, không phải dữ liệu
-- của gian hàng nào. Và cả hai đều KHÔNG có hiệu lực nghiệp vụ: ngày lễ chỉ tô lên lưới lịch
-- điều phối. Nó không khoá xe, không đổi giá, không đụng `vehicle_occupancies` — đường duy nhất
-- giữ chỗ lịch vẫn là exclusion constraint của ADR 0006.
--
--   public_holidays   — MỘT DÒNG MỖI EVENT (Tết = một dòng 7 ngày, không phải 7 dòng)
--   holiday_sync_runs — sổ chạy, và cũng là TRẠNG THÁI: cổng "mỗi ngày một lần" của worker
--                       đọc chính bảng này để biết hôm nay đã đồng bộ xong chưa
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Lịch nghỉ lễ ──────────────────────────────────────────────────────────
CREATE TABLE "public"."public_holidays" (
    "id" CHAR(26) NOT NULL,
    -- Mỏ neo để đồng bộ nhận ra "vẫn là ngày lễ đó" sau khi Google đổi tên nó.
    -- NULL cho dòng source='manual': dòng người vận hành khai tay không có event Google nào,
    -- và Postgres cho phép nhiều NULL trong một unique index nên chúng không đụng nhau.
    "google_event_id" VARCHAR(255),
    "start_date" DATE NOT NULL,
    -- ⚠ INCLUSIVE — ngày CUỐI CÙNG của kỳ nghỉ, đã trừ 1 khỏi `end.date` END-EXCLUSIVE của
    -- Google (30/04 về với end.date=2026-05-01). Truy vấn overlap vì thế không có `- 1` nào:
    --   WHERE start_date <= :to AND end_date >= :from
    "end_date" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    -- Mã, không phải nhãn: `HolidayEventType` ở @xeprime/types (ADR 0005).
    "event_type" VARCHAR(30) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "google_updated_at" TIMESTAMPTZ(3),
    "synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_holidays_google_event_id_key"
    ON "public"."public_holidays"("google_event_id");

-- Truy vấn DUY NHẤT của API là overlap theo khoảng ngày.
CREATE INDEX "public_holidays_start_date_end_date_idx"
    ON "public"."public_holidays"("start_date", "end_date");

CREATE INDEX "public_holidays_synced_at_idx" ON "public"."public_holidays"("synced_at");

-- Kỳ nghỉ kết thúc trước khi bắt đầu là dữ liệu hỏng. Chặn ở DB vì `end_date` là cột dễ lệch
-- một ngày nhất trong hệ thống (bẫy end-exclusive ở trên) — một dòng ngược sẽ tô sai lưới của
-- mọi gian hàng cùng lúc, và không ai nghi ngờ một cột "ngày lễ".
ALTER TABLE "public"."public_holidays"
    ADD CONSTRAINT "public_holidays_date_order_check"
    CHECK ("end_date" >= "start_date");

-- Mã hợp lệ theo `HOLIDAY_EVENT_TYPE` / `HOLIDAY_SOURCE` (@xeprime/types). ADR 0005: status
-- lưu String, DB canh bằng CHECK — thêm giá trị mới thì sửa CẢ HAI nơi.
ALTER TABLE "public"."public_holidays"
    ADD CONSTRAINT "public_holidays_event_type_check"
    CHECK ("event_type" IN ('public_holiday', 'observance', 'season', 'other'));

ALTER TABLE "public"."public_holidays"
    ADD CONSTRAINT "public_holidays_source_check"
    CHECK ("source" IN ('google_calendar', 'manual'));

-- Dòng từ Google PHẢI có id của Google (nếu không, đồng bộ không bao giờ nhận ra nó và sẽ tạo
-- một bản trùng ở lượt sau); dòng manual thì KHÔNG được mang id giả.
ALTER TABLE "public"."public_holidays"
    ADD CONSTRAINT "public_holidays_source_event_id_check"
    CHECK (("source" = 'google_calendar' AND "google_event_id" IS NOT NULL)
        OR ("source" = 'manual' AND "google_event_id" IS NULL));

-- ── Sổ chạy đồng bộ ───────────────────────────────────────────────────────
CREATE TABLE "public"."holiday_sync_runs" (
    "id" CHAR(26) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    -- NULL = lượt chạy chưa đóng sổ (tiến trình bị giết giữa chừng). Đọc được điều đó là có
    -- ích: một dòng started_at cũ mà finished_at rỗng nghĩa là worker chết trong lúc đồng bộ.
    "finished_at" TIMESTAMPTZ(3),
    "status" VARCHAR(20) NOT NULL,
    "trigger" VARCHAR(20) NOT NULL,
    "events_found" INTEGER NOT NULL DEFAULT 0,
    "events_created" INTEGER NOT NULL DEFAULT 0,
    "events_updated" INTEGER NOT NULL DEFAULT 0,
    "events_deleted" INTEGER NOT NULL DEFAULT 0,
    -- Lý do thất bại, ĐÃ che bí mật trước khi ghi. Key API không bao giờ được rơi vào đây.
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_sync_runs_pkey" PRIMARY KEY ("id")
);

-- "Hôm nay đã có lượt success nào chưa" — câu hỏi worker hỏi mỗi 15 phút.
CREATE INDEX "holiday_sync_runs_started_at_idx" ON "public"."holiday_sync_runs"("started_at");

ALTER TABLE "public"."holiday_sync_runs"
    ADD CONSTRAINT "holiday_sync_runs_status_check"
    CHECK ("status" IN ('success', 'failed'));

ALTER TABLE "public"."holiday_sync_runs"
    ADD CONSTRAINT "holiday_sync_runs_trigger_check"
    CHECK ("trigger" IN ('scheduled', 'manual'));

-- Bốn con số là phép đếm, không bao giờ âm.
ALTER TABLE "public"."holiday_sync_runs"
    ADD CONSTRAINT "holiday_sync_runs_counts_check"
    CHECK ("events_found" >= 0 AND "events_created" >= 0
       AND "events_updated" >= 0 AND "events_deleted" >= 0);
