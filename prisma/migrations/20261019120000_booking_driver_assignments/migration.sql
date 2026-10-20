-- ═══════════════════════════════════════════════════════════════════════════
-- Lịch sử gán tài xế — ADR 0063
--
-- MỖI LƯỢT GÁN một dòng: gán → (nhận) → kết thúc bằng một `outcome`. Writer duy nhất là
-- `DriversService`. Nguồn của dòng thời gian trên chi tiết đơn (bên thuê) và của tab "Đã qua" ở
-- "Chuyến tôi lái" (tài xế) — tab đó cần cả chuyến tài xế bị gỡ / tự từ chối, thứ mà các cột
-- tài xế trên `bookings` (chỉ giữ người HIỆN TẠI) không còn nhớ.
--
-- "Mỗi đơn một lần cho mỗi người": lượt mới của CÙNG người trên CÙNG đơn đánh dấu lượt cũ
-- `superseded = true`; unique partial bên dưới bảo đảm mỗi (đơn, người) chỉ có MỘT lượt hiện hành.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): CHECK `outcome`, hai unique
--   partial `booking_driver_assignments_one_open_key` và `..._one_current_per_user_key`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "booking_driver_assignments" (
    "id" CHAR(26) NOT NULL,
    "tenant_id" CHAR(26) NOT NULL,
    "booking_id" CHAR(26) NOT NULL,
    "driver_id" CHAR(26) NOT NULL,
    "driver_user_id" CHAR(26) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL DEFAULT 'open',
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" CHAR(26),
    "accepted_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "ended_by" CHAR(26),
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "booking_driver_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "booking_driver_assignments_outcome_check" CHECK (
        "outcome" IN ('open', 'declined', 'unassigned', 'cancelled', 'no_show', 'completed')
    ),
    -- Lượt còn mở thì chưa có mốc kết thúc; lượt đã kết thúc thì phải có.
    CONSTRAINT "booking_driver_assignments_ended_check" CHECK (
        ("outcome" = 'open') = ("ended_at" IS NULL)
    )
);

CREATE INDEX "booking_driver_assignments_booking_id_assigned_at_idx"
    ON "booking_driver_assignments" ("booking_id", "assigned_at");
CREATE INDEX "booking_driver_assignments_driver_past_idx"
    ON "booking_driver_assignments" ("driver_user_id", "superseded", "ended_at" DESC);

-- Một đơn chỉ có MỘT lượt gán đang mở (khớp `bookings.driver_id`).
CREATE UNIQUE INDEX "booking_driver_assignments_one_open_key"
    ON "booking_driver_assignments" ("booking_id") WHERE "outcome" = 'open';
-- Mỗi (đơn, người) chỉ một lượt hiện hành — nền của "đơn hiện MỘT lần" ở tab "Đã qua".
CREATE UNIQUE INDEX "booking_driver_assignments_one_current_per_user_key"
    ON "booking_driver_assignments" ("booking_id", "driver_user_id") WHERE NOT "superseded";

ALTER TABLE "booking_driver_assignments"
    ADD CONSTRAINT "booking_driver_assignments_tenant_id_fkey"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "booking_driver_assignments_booking_id_fkey"
        FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "booking_driver_assignments_driver_id_fkey"
        FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Nạp lại từ các đơn ĐANG mang tài xế ─────────────────────────────────────
-- Lượt đã qua trước migration (bị gỡ / từ chối) không còn dấu vết trên `bookings` — chỉ người hiện
-- tại được chép. Đơn đã khép mang kết quả theo trạng thái đơn.
INSERT INTO "booking_driver_assignments" (
    "id", "tenant_id", "booking_id", "driver_id", "driver_user_id", "outcome",
    "assigned_at", "accepted_at", "ended_at", "updated_at"
)
SELECT
    -- ULID-dạng-ổn-định cho dữ liệu nạp lại: 26 ký tự từ md5 của id đơn (không đụng id thật).
    upper(substr(md5('bda:' || b."id"), 1, 26)),
    b."tenant_id",
    b."id",
    b."driver_id",
    b."driver_user_id",
    CASE b."status"
        WHEN 'completed' THEN 'completed'
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'no_show' THEN 'no_show'
        ELSE 'open'
    END,
    COALESCE(b."driver_assigned_at", b."created_at"),
    CASE WHEN b."driver_assignment_status" = 'accepted' THEN b."driver_responded_at" END,
    CASE WHEN b."status" IN ('completed', 'cancelled', 'no_show') THEN b."updated_at" END,
    CURRENT_TIMESTAMP
FROM "bookings" b
WHERE b."driver_id" IS NOT NULL AND b."driver_user_id" IS NOT NULL AND b."deleted_at" IS NULL;
