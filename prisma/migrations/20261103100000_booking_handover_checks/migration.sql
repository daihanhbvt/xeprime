-- ═══════════════════════════════════════════════════════════════════════════
-- Chi tiết đơn — "Chuẩn bị bàn giao": việc đánh dấu TAY (03/11/2026).
--
-- Mỗi việc vẫn SUY tự động từ dữ liệu thật; bảng này chỉ giữ lượt người vận hành xác nhận một
-- việc diễn ra NGOÀI hệ thống (soi bản gốc giấy tờ, ký hợp đồng giấy, chụp ảnh bằng máy khác, tài
-- xế nhận qua điện thoại). Việc tiền KHÔNG có ở đây — "đã thu" phải là phiếu thu thật.
--
-- Viết tay vì Prisma không diễn đạt được FK tổ hợp và CHECK. Áp bằng `db:deploy`.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."booking_handover_checks" (
    "id"                 CHAR(26)       NOT NULL,
    "tenant_id"          CHAR(26)       NOT NULL,
    "booking_id"         CHAR(26)       NOT NULL,
    "vehicle_id"         CHAR(26)       NOT NULL,
    "item"               VARCHAR(20)    NOT NULL,
    "checked_by_user_id" CHAR(26),
    "checked_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_handover_checks_pkey" PRIMARY KEY ("id")
);

-- MỘT dấu cho mỗi (đơn, việc): hai người bấm cùng lúc thì DB giữ một hàng, không phải SELECT rồi INSERT.
CREATE UNIQUE INDEX "booking_handover_checks_booking_id_item_key"
    ON "public"."booking_handover_checks" ("booking_id", "item");

ALTER TABLE "public"."booking_handover_checks" ADD CONSTRAINT "booking_handover_checks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_handover_checks" ADD CONSTRAINT "booking_handover_checks_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."booking_handover_checks" ADD CONSTRAINT "booking_handover_checks_checked_by_user_id_fkey"
    FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Dấu phải thuộc ĐÚNG đơn của CÙNG gian hàng — cùng khuôn `booking_extensions`.
ALTER TABLE "public"."booking_handover_checks" ADD CONSTRAINT "booking_handover_checks_booking_owner_fkey"
    FOREIGN KEY ("booking_id", "tenant_id", "vehicle_id")
    REFERENCES "public"."bookings"("id", "tenant_id", "vehicle_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."booking_handover_checks" ADD CONSTRAINT "booking_handover_checks_item_check"
    CHECK ("item" IN ('documents', 'contract', 'photos', 'driver'));
