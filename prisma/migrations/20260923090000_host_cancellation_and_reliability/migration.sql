-- ═══════════════════════════════════════════════════════════════════════════
-- QUYỀN HUỶ CỦA GIAN HÀNG + CHỈ SỐ UY TÍN CÔNG KHAI (23/09/2026, ADR 0045)
--
-- Ba thay đổi, và chúng phục vụ cùng một câu hỏi: *"gian hàng này có giữ lời không"* — thứ mà
-- trước đợt này hệ thống không trả lời được vì nó không ghi lại ai huỷ và vì sao.
--
--   1. `booking_cancellations` — MỘT dòng cho mỗi lượt huỷ, mang PHÍA CHỊU TRÁCH NHIỆM, nhóm lý
--      do, chặng lúc huỷ và người bấm. Bảng riêng chứ không phải mấy cột trên `bookings` vì một
--      lượt huỷ có thể xảy ra TRƯỚC khi đơn tồn tại (chặng `awaiting_hold`), và đó lại đúng là
--      nhóm mà chỉ số uy tín cần nhất.
--
--   2. `booking_requests.slot_reopened_notified_at` — cột CLAIM của lời mời "xe đã trống lại".
--      Một chiếc xe có thể hết hạn nhiều lượt giữ chỗ trong một ngày; không có cột này thì một
--      khách nhận cùng một lời mời bốn lần và học cách tắt thông báo.
--
--   3. Trạng thái mới `cancelled_by_host` cho `booking_requests` — KHÔNG cần đổi cấu trúc
--      (`booking_requests.status` không có CHECK, xem migration init), ghi ra đây để lần sau đọc
--      lịch sử không phải đi tìm.
--
-- ⚠️ KHÔNG backfill `booking_cancellations` từ dữ liệu cũ. Lịch sử trước hôm nay không ghi lại ai
-- huỷ: một đơn `cancelled` có thể do khách, do gian hàng, hoặc do worker dọn hạn, và ba thứ đó
-- không phân biệt được từ `bookings.status`. Đoán ra một phía chịu trách nhiệm rồi đem nó tính
-- vào chỉ số công khai là bịa số về người thật. Cửa sổ chỉ số là 90 ngày nên bảng tự đầy lên
-- bằng dữ liệu THẬT trong vòng một quý.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cột claim lời mời đặt lại ────────────────────────────────────────────

ALTER TABLE "public"."booking_requests"
    ADD COLUMN "slot_reopened_notified_at" TIMESTAMPTZ(3);

-- ── 2. Bảng huỷ chuyến ──────────────────────────────────────────────────────

CREATE TABLE "public"."booking_cancellations" (
    "id"                  CHAR(26)     NOT NULL,
    "tenant_id"           CHAR(26)     NOT NULL,
    "booking_request_id"  CHAR(26),
    "booking_id"          CHAR(26),
    "responsible_party"   VARCHAR(20)  NOT NULL,
    "reason_category"     VARCHAR(40)  NOT NULL,
    "reason"              TEXT,
    "stage"               VARCHAR(30)  NOT NULL,
    "actor_user_id"       CHAR(26),
    "actor_scope"         VARCHAR(20)  NOT NULL,
    "counts_against_host" BOOLEAN      NOT NULL,
    "cancelled_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

    CONSTRAINT "booking_cancellations_pkey" PRIMARY KEY ("id")
);

/*
 * Một yêu cầu/đơn chỉ huỷ được MỘT lần, và ràng buộc đó nằm ở DB chứ không ở một câu `if`:
 * hai lượt bấm huỷ song song, hoặc một lượt huỷ đua với webhook tiền về, chỉ có đúng một bên
 * ghi được. Đây là chốt chống hoàn tiền hai lần.
 */
CREATE UNIQUE INDEX "booking_cancellations_booking_request_id_key"
    ON "public"."booking_cancellations"("booking_request_id");
CREATE UNIQUE INDEX "booking_cancellations_booking_id_key"
    ON "public"."booking_cancellations"("booking_id");

-- Chiều đọc DUY NHẤT của chỉ số uy tín: một gian hàng, 90 ngày, mấy lượt huỷ do chính họ.
CREATE INDEX "booking_cancellations_tenant_id_counts_against_host_cancell_idx"
    ON "public"."booking_cancellations"("tenant_id", "counts_against_host", "cancelled_at");

ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_booking_request_id_fkey"
    FOREIGN KEY ("booking_request_id") REFERENCES "public"."booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Bộ giá trị hợp lệ canh ở DB — `@xeprime/types` là nguồn, CHECK là lớp không bỏ qua được.
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_responsible_party_check"
    CHECK ("responsible_party" IN ('host', 'customer', 'platform', 'force_majeure'));
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_reason_category_check"
    CHECK ("reason_category" IN (
        'vehicle_unavailable', 'schedule_conflict', 'customer_requirements',
        'customer_unreachable', 'customer_changed_plan', 'other'
    ));
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_stage_check"
    CHECK ("stage" IN ('awaiting_hold', 'hold_paid', 'booking_before_pickup', 'booking_active'));
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_actor_scope_check"
    CHECK ("actor_scope" IN ('tenant', 'platform', 'customer', 'system'));

/*
 * Một dòng huỷ phải bám vào ÍT NHẤT một thứ. Cả hai NULL là một bản ghi không nói về chuyến nào
 * — nó sẽ lặng lẽ làm hỏng mẫu số của chỉ số uy tín mà không ai truy được về đâu.
 */
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_target_check"
    CHECK ("booking_request_id" IS NOT NULL OR "booking_id" IS NOT NULL);

/*
 * `counts_against_host` phải KHỚP `responsible_party` — cột dẫn xuất, nhưng đông lạnh (đổi luật
 * về sau không viết lại lịch sử của một gian hàng). CHECK giữ cho hai cột không trôi khỏi nhau
 * khi ai đó chèn dữ liệu bằng tay.
 */
ALTER TABLE "public"."booking_cancellations"
    ADD CONSTRAINT "booking_cancellations_counts_matches_party_check"
    CHECK ("counts_against_host" = ("responsible_party" = 'host'));
