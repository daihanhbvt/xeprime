-- ADR 0079: lịch bảo dưỡng chỉ còn MỘT ngày dự kiến để nhắc — không giữ chỗ trên lịch xe nữa.

-- 1. Nhả mọi chỗ lịch bảo dưỡng đang giữ: xe nhận đặt lại được ngay những ngày đó.
DELETE FROM "public"."vehicle_occupancies" WHERE "source_type" = 'maintenance';

-- 2. Phiếu còn mở bỏ mốc kết thúc (không còn ý nghĩa). Phiếu đã đóng giữ nguyên làm lịch sử.
UPDATE "public"."vehicle_maintenance_records"
SET "planned_end_at" = NULL
WHERE "status" IN ('scheduled', 'in_progress') AND "planned_end_at" IS NOT NULL;
