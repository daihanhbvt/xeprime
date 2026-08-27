-- ═══════════════════════════════════════════════════════════════════════════
-- Khoá xe theo LÔ — mã lô cho thao tác "khoá toàn bộ xe trong ngày" (26/08/2026)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — lý do đầy đủ ở header của
-- `20260821000000_init/migration.sql`: baseline chứa 25 thứ `schema.prisma` không diễn đạt
-- được, nên migration Prisma tự sinh sẽ kèm lệnh DROP chúng. File này chỉ THÊM một cột nullable
-- và một index; không chạm dữ liệu đang có.
--
-- Vì sao cần cột này: công tắc "Khoá toàn bộ xe trong ngày" trên lịch phải TẮT lại được. Tắt
-- nghĩa là gỡ đúng những dòng mà lần bật đã tạo ra — không hơn. Không có mã lô thì cách duy
-- nhất là suy từ (ngày + lý do), và suy sai đồng nghĩa với việc gỡ nhầm một lịch khoá do người
-- vận hành đặt tay vì một lý do thật (xe đang sửa, xe cho mượn nội bộ).
--
-- NULL = khoá lẻ từng xe như trước. Cột nullable nên mọi dòng cũ giữ nguyên ý nghĩa.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."vehicle_blocks" ADD COLUMN "bulk_batch_id" CHAR(26);

-- Gỡ trọn một lô là truy vấn DUY NHẤT dùng cột này: WHERE tenant_id = ? AND bulk_batch_id = ?.
--
-- CỐ Ý KHÔNG dùng index một phần (`WHERE bulk_batch_id IS NOT NULL`) dù đại đa số dòng là khoá
-- lẻ và mang NULL: `schema.prisma` không diễn đạt được mệnh đề WHERE, nên bản partial sẽ thành
-- câu chênh lệch thứ 26 trong `migrate diff` — làm hỏng chính con số dùng để kiểm rằng không có
-- drift ngoài ý muốn (xem header của `20260821000000_init`). Bảng khoá xe nhỏ; đổi một chút
-- dung lượng index lấy một cuộc kiểm tra còn tin được là đáng.
CREATE INDEX "vehicle_blocks_tenant_id_bulk_batch_id_idx"
    ON "public"."vehicle_blocks"("tenant_id", "bulk_batch_id");
