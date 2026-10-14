-- ═══════════════════════════════════════════════════════════════════════════
-- HỖ TRỢ XUẤT HOÁ ĐƠN VAT — cờ theo TỪNG XE (14/10/2026, ADR 0059)
--
-- Chủ xe (cả tuyến hoa hồng lẫn tuyến gói) bật/tắt "Có hỗ trợ xuất hoá đơn VAT" cho từng xe;
-- khách lọc được kết quả chợ theo cờ đó và thấy dấu hiệu trên thẻ/trang xe.
--
-- Đây là THÔNG TIN công bố, không phải một chức năng hoá đơn: hai bên tự thoả thuận và xác nhận
-- trực tiếp. XePrime không tạo, phát hành, lưu trữ hay xử lý hoá đơn nào, và cờ này không đi
-- vào giá, phí, thuế khấu trừ (ADR 0028 §4), luồng duyệt xe hay luồng đặt xe.
--
-- ───────────────────────────────────────────────────────────────────────────
-- BACKFILL — mọi xe hiện có thành `false`
--
-- Không có dữ liệu nào cho phép suy ra một chủ xe ĐÃ cam kết xuất hoá đơn, nên giá trị đúng cho
-- dữ liệu cũ là "chưa cam kết". Ở đây `NOT NULL DEFAULT false` CHÍNH LÀ phép backfill, và nó
-- trùng nghĩa với mặc định cho xe tạo mới — khác migration `marketplace_enabled` (ADR 0048),
-- nơi giá trị backfill (`true`) khác hẳn ý nghĩa "chưa có lựa chọn" nên phải tách ba bước.
-- Postgres 11+ thêm cột có DEFAULT hằng số mà không viết lại bảng.
--
-- `public_listings` mang bản sao để bộ lọc chợ chỉ đọc một bảng (ADR 0008). Cột mới ở đó cũng
-- `false`, khớp với nguồn ngay sau migration — không cần đồng bộ lại snapshot nào.
--
-- ⚠️ CHẠY LẠI ĐƯỢC: `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nguồn: lựa chọn của chủ xe trên chính chiếc xe.
ALTER TABLE "vehicles"
  ADD COLUMN IF NOT EXISTS "vat_invoice_supported" BOOLEAN NOT NULL DEFAULT false;

-- 2. Bản sao trên snapshot công khai — writer duy nhất là `ListingsService` (ADR 0008 §1).
ALTER TABLE "public_listings"
  ADD COLUMN IF NOT EXISTS "vat_invoice_supported" BOOLEAN NOT NULL DEFAULT false;

-- 3. Bộ lọc "chỉ xe hỗ trợ xuất hoá đơn VAT" theo sort mặc định (`rank_score`). Phần lớn xe là
--    `false`, nên thiếu index này thì một tập kết quả nhỏ vẫn phải đi theo `rank_score` của cả
--    chợ rồi bỏ dần từng dòng. Tên theo quy ước Prisma để `schema.prisma` mô tả được nó.
CREATE INDEX IF NOT EXISTS "public_listings_status_vat_invoice_supported_rank_score_idx"
  ON "public_listings" ("status", "vat_invoice_supported", "rank_score");
