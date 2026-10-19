-- ═══════════════════════════════════════════════════════════════════════════
-- Tài xế liên kết — ADR 0063
--
-- `drivers` thôi là hồ sơ do gian hàng tự nhập: mỗi dòng là một LIÊN KẾT giữa một bên thuê
-- (gian hàng hoặc chủ xe tuyến hoa hồng) và một TÀI KHOẢN KHÁCH. Tài xế chấp nhận lời mời, xem
-- chuyến được gán và nhận/từ chối từng chuyến ở app/web khách.
--
-- Dữ liệu cũ bị XOÁ có chủ đích (quyết định sản phẩm 16/10/2026: bỏ hồ sơ không tài khoản, chưa có
-- production): mọi đơn gỡ tài xế, mọi dòng `drivers` bị xoá trước khi đổi hình bảng.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP):
--   • FK tổ hợp `bookings (driver_id, driver_user_id) → drivers (id, user_id)`;
--   • unique partial `drivers_one_open_link_key`;
--   • EXCLUDE `bookings_driver_user_schedule_excl` và các CHECK bên dưới.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Xoá dữ liệu tài xế cũ ────────────────────────────────────────────────
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_driver_schedule_excl";
UPDATE "bookings" SET "driver_id" = NULL WHERE "driver_id" IS NOT NULL;
DELETE FROM "drivers";

-- ── 2. Đổi hình bảng drivers ────────────────────────────────────────────────
ALTER TABLE "drivers" DROP CONSTRAINT IF EXISTS "drivers_status_check";
DROP INDEX IF EXISTS "drivers_tenant_id_status_idx";
DROP INDEX IF EXISTS "drivers_tenant_id_deleted_at_idx";

ALTER TABLE "drivers"
    DROP COLUMN "license_no",
    DROP COLUMN "license_expires_at",
    DROP COLUMN "id_no",
    DROP COLUMN "status",
    DROP COLUMN "deleted_at",
    ADD COLUMN "user_id" CHAR(26) NOT NULL,
    ADD COLUMN "user_realm" VARCHAR(20) NOT NULL DEFAULT 'customer',
    ADD COLUMN "link_status" VARCHAR(20) NOT NULL DEFAULT 'invited',
    ADD COLUMN "invited_by" CHAR(26),
    ADD COLUMN "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "responded_at" TIMESTAMPTZ(3),
    ADD COLUMN "ended_at" TIMESTAMPTZ(3),
    ADD COLUMN "ended_by_party" VARCHAR(20);

ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_realm_check" CHECK ("user_realm" = 'customer');
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_link_status_check"
    CHECK ("link_status" IN ('invited', 'active', 'suspended', 'declined', 'ended'));
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_ended_by_party_check"
    CHECK ("ended_by_party" IS NULL OR "ended_by_party" IN ('employer', 'driver'));
-- Mốc kết thúc đi cùng trạng thái kết thúc — không có dòng `ended` mà thiếu mốc, hay ngược lại.
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_ended_consistency_check"
    CHECK (("link_status" = 'ended') = ("ended_at" IS NOT NULL));

-- Tài khoản đối tác/quản trị KHÔNG thể là tài xế: FK trỏ đúng cặp (id, realm='customer').
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_realm_fkey"
    FOREIGN KEY ("user_id", "user_realm") REFERENCES "users"("id", "realm")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_invited_by_fkey"
    FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "drivers_id_user_id_key" ON "drivers"("id", "user_id");
CREATE INDEX "drivers_tenant_id_link_status_idx" ON "drivers"("tenant_id", "link_status");
CREATE INDEX "drivers_user_id_link_status_idx" ON "drivers"("user_id", "link_status");

-- Một liên kết MỞ cho mỗi (bên thuê, tài khoản): hai lượt mời đua nhau thì DB từ chối kẻ sau.
CREATE UNIQUE INDEX "drivers_one_open_link_key" ON "drivers"("tenant_id", "user_id")
    WHERE "link_status" IN ('invited', 'active', 'suspended');

-- ── 3. Lượt gán trên bookings ───────────────────────────────────────────────
ALTER TABLE "bookings"
    ADD COLUMN "driver_user_id" CHAR(26),
    ADD COLUMN "driver_assignment_status" VARCHAR(20),
    ADD COLUMN "driver_assigned_at" TIMESTAMPTZ(3),
    ADD COLUMN "driver_responded_at" TIMESTAMPTZ(3);

-- Người lái trên đơn không thể lệch khỏi tài khoản của liên kết.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_user_fkey"
    FOREIGN KEY ("driver_id", "driver_user_id") REFERENCES "drivers"("id", "user_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_assignment_status_check"
    CHECK ("driver_assignment_status" IS NULL OR "driver_assignment_status" IN ('pending', 'accepted'));
-- Ba cột đi cùng nhau: có tài xế ⇔ có tài khoản ⇔ có trạng thái lượt gán ⇔ có mốc gán.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_assignment_consistency_check"
    CHECK (
        ("driver_id" IS NULL) = ("driver_user_id" IS NULL)
        AND ("driver_id" IS NULL) = ("driver_assignment_status" IS NULL)
        AND ("driver_id" IS NULL) = ("driver_assigned_at" IS NULL)
    );
-- Chỉ đơn CÓ TÀI XẾ mới mang tài xế.
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_service_check"
    CHECK ("driver_id" IS NULL OR "service_type" = 'with_driver');

-- Chống trùng lịch theo NGƯỜI, xuyên mọi bên thuê. Lượt CHỜ nhận vẫn giữ chỗ (quyết định sản phẩm).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_user_schedule_excl"
    EXCLUDE USING gist ("driver_user_id" WITH =, tstzrange("pickup_at", "return_at") WITH &&)
    WHERE ("driver_user_id" IS NOT NULL AND "status" IN ('reserved', 'active') AND "deleted_at" IS NULL);

CREATE INDEX "bookings_driver_user_id_pickup_at_idx" ON "bookings"("driver_user_id", "pickup_at");
