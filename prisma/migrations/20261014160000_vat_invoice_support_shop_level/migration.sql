-- ═══════════════════════════════════════════════════════════════════════════
-- HỖ TRỢ XUẤT HOÁ ĐƠN VAT — chuyển từ cờ THEO XE sang cờ CẤP GIAN HÀNG (14/10/2026, ADR 0059)
--
-- Migration `20261014120000_vehicle_vat_invoice_support` (cùng ngày, cùng nhánh tính năng) đặt cờ
-- trên từng xe và chép sang `public_listings`. Chủ sản phẩm chốt lại: đây là MỘT thiết lập chung
-- của gian hàng / chủ xe — bật một lần là áp cho mọi xe — nên cờ dời về `tenants`.
--
-- Chợ đọc cờ bằng cách JOIN `tenants`, KHÔNG chép sang `public_listings`: cùng lý do ADR 0008 §3
-- từ chối denormalize `tenants.status` — bật/tắt phải là một UPDATE một dòng, có hiệu lực cho cả
-- đội xe ngay, không phải N dòng snapshot có thể lệch nhau.
--
-- ───────────────────────────────────────────────────────────────────────────
-- KHÔNG backfill từ cờ theo xe
--
-- Cờ theo xe chưa từng lên staging/production (nhánh chưa merge), nên không có cam kết thật nào
-- để mang sang. Mọi tenant bắt đầu ở `false`: không suy ra một cam kết chủ xe chưa đưa ra.
--
-- ⚠️ CHẠY LẠI ĐƯỢC: `IF NOT EXISTS` / `IF EXISTS` ở mọi lệnh.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Nguồn mới: thiết lập của gian hàng / chủ xe.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "vat_invoice_supported" BOOLEAN NOT NULL DEFAULT false;

-- 2. Gỡ cờ theo xe và bản sao trên snapshot công khai.
DROP INDEX IF EXISTS "public_listings_status_vat_invoice_supported_rank_score_idx";
ALTER TABLE "public_listings" DROP COLUMN IF EXISTS "vat_invoice_supported";
ALTER TABLE "vehicles" DROP COLUMN IF EXISTS "vat_invoice_supported";
