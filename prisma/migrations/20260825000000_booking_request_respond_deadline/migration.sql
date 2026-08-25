-- ═══════════════════════════════════════════════════════════════════════════
-- Hạn phản hồi 60 phút cho yêu cầu thuê (25/08/2026)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`: baseline chứa những thứ `schema.prisma` không diễn đạt
-- được (rõ nhất là các khoá ngoại tổ hợp `(id, tenant_id)`), nên migration Prisma tự sinh sẽ
-- kèm lệnh DROP các khoá đó. Migration này chỉ THÊM ba cột và một index.
--
-- VÌ SAO: một yêu cầu chờ duyệt KHÔNG chiếm lịch xe (ADR 0006 — nhiều khách được phép cùng hỏi
-- một xe), nên nó không khoá gì của gian hàng. Thứ nó khoá là KHÁCH: người đang chờ một câu trả
-- lời để còn đi tìm xe khác. `respond_by` biến sự im lặng thành một câu trả lời có thời hạn.
--
--   respond_by         hạn trả lời = created_at + 60' (SERVER tính, client không gửi)
--   first_reminded_at  đã nhắc mốc 20' chưa
--   final_reminded_at  đã nhắc mốc 45' chưa (còn 15 phút)
--
-- Hai cột nhắc là mốc IDEMPOTENT, không phải cột kiểm toán: worker claim từng mốc bằng
-- `UPDATE … WHERE first_reminded_at IS NULL`, nên dù chạy bao nhiêu instance hay bao nhiêu lượt
-- lặp thì mỗi mốc cũng chỉ phát đúng một lần.
--
-- ⚠️ BACKFILL: hàng cũ nhận `respond_by = created_at + 60'`, tức là mọi yêu cầu chờ duyệt gửi
-- trước hôm nay đều ĐÃ quá hạn và sẽ được worker chuyển sang `expired` ở nhịp chạy đầu tiên.
-- Đó là cách đọc trung thực của chính luật vừa đặt ra ("gian hàng có 60 phút và đã không trả
-- lời"), và thà nói thẳng với khách còn hơn để yêu cầu của họ treo thêm vài tuần nữa.
--
-- Đối chiếu với datamodel sau khi áp:
--   prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
--   → vẫn đúng bộ chênh lệch cố ý như trước, không thêm câu nào.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Ba cột mới ────────────────────────────────────────────────────────────
-- Thêm dạng NULL trước để không phải khoá bảng viết giá trị cho từng hàng, backfill, rồi mới
-- siết NOT NULL. Trên bảng lớn đây là khác biệt giữa vài mili-giây và một lần khoá ghi.
ALTER TABLE "public"."booking_requests"
  ADD COLUMN "respond_by" TIMESTAMPTZ(3),
  ADD COLUMN "first_reminded_at" TIMESTAMPTZ(3),
  ADD COLUMN "final_reminded_at" TIMESTAMPTZ(3);

UPDATE "public"."booking_requests"
   SET "respond_by" = "created_at" + INTERVAL '60 minutes'
 WHERE "respond_by" IS NULL;

ALTER TABLE "public"."booking_requests"
  ALTER COLUMN "respond_by" SET NOT NULL;

-- ── Index của worker ──────────────────────────────────────────────────────
-- MỘT PHẦN theo `status`: bảng này chỉ mọc thêm hàng ĐÃ xử lý (converted/rejected/expired), và
-- worker không bao giờ hỏi tới chúng. Index toàn bảng sẽ bắt mọi lần ghi phải bảo trì phần vô
-- ích đó, còn bản một phần thì gần như không lớn lên.
--
-- Tên trùng ĐÚNG tên Prisma sinh cho `@@index([respondBy])` trong `schema.prisma` (Prisma không
-- mô tả được mệnh đề `WHERE`, nên nó nhìn thấy một index trên cùng cột và coi là khớp).
CREATE INDEX "booking_requests_respond_by_idx"
    ON "public"."booking_requests" ("respond_by")
 WHERE "status" = 'pending_host_approval';
