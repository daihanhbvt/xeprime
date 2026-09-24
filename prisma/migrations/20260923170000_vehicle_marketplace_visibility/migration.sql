-- ═══════════════════════════════════════════════════════════════════════════
-- CÔNG TẮC HIỂN THỊ TRÊN CHỢ CỦA CHỦ XE (ADR 0048, 23/09/2026)
--
-- Thêm TRỤC THỨ BA cho việc một chiếc xe có nằm ngoài chợ hay không:
--
--   1. `operation_status`   — trạng thái VẬN HÀNH (rảnh / đang thuê / bảo dưỡng);
--   2. `public_status`      — trạng thái KIỂM DUYỆT của nền tảng (`hidden` = NỀN TẢNG gỡ xuống);
--   3. `marketplace_enabled`— LỰA CHỌN của chủ xe: tạm cất xe khỏi chợ, bật lại được ngay.
--
-- Trước đợt này chỉ có hai trục, và cách duy nhất để chủ xe "tạm ẩn" là mượn `public_status =
-- hidden`. Mượn cột đó nghĩa là chủ xe tự gỡ được án ẩn của nền tảng, và nền tảng bỏ ẩn thì kéo
-- luôn một chiếc xe chủ xe đang cố ý cất đi trở lại chợ. Hai việc khác hẳn nhau phải có hai cột.
--
-- ───────────────────────────────────────────────────────────────────────────
-- BACKFILL — dữ liệu hiện có thành `true`, giữ nguyên hành vi hôm nay
--
-- Trước ADR 0048 không tồn tại khái niệm "chủ xe tạm ẩn", nên MỌI xe đang có đều ngầm ở trạng
-- thái "chủ xe cho phép hiện". Backfill `false` (hoặc thêm cột NOT NULL DEFAULT false) sẽ gỡ
-- toàn bộ chợ xuống trong một lần deploy.
--
-- Cột thêm ở bước 1 là NULLABLE rồi mới `UPDATE` rồi mới `SET NOT NULL`: viết thẳng
-- `ADD COLUMN ... NOT NULL DEFAULT true` cho ra cùng kết quả (Postgres 11+ không rewrite bảng),
-- nhưng khi đó phép backfill là một tác dụng phụ không đọc được trong file này. Ba bước tường
-- minh thì `UPDATE` đếm được ở log, và lần chạy lại nào cũng thấy rõ nó đã làm gì.
--
-- ⚠️ Xe đang `public_status = 'hidden'` VẪN bị ẩn sau migration: hai trục nhân với nhau, và
-- `ListingsService.syncFromVehicle` chỉ cho `active` khi CẢ HAI cùng thuận. Backfill `true` chỉ
-- nói "chủ xe không phản đối", không ghi đè quyết định kiểm duyệt.
--
-- ⚠️ Migration này CHẠY LẠI ĐƯỢC: `ADD COLUMN IF NOT EXISTS` + `UPDATE ... WHERE IS NULL` (lần
-- hai không còn hàng nào) + `SET NOT NULL`/`SET DEFAULT` là các lệnh idempotent.
--
-- KHÔNG có index mới: không truy vấn nào lọc theo cột này một mình. Marketplace đọc
-- `public_listings.status` (đã có index), còn màn quản lý xe luôn lọc theo `tenant_id` trước.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Cột mới, tạm cho phép NULL để bước backfill nhìn thấy được phần dữ liệu cũ.
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "marketplace_enabled" BOOLEAN;

-- 2. Backfill: mọi xe đã tồn tại đều giữ đúng hành vi hôm nay.
UPDATE "vehicles" SET "marketplace_enabled" = true WHERE "marketplace_enabled" IS NULL;

-- 3. Chốt lại thành cột bắt buộc có giá trị, mặc định `true` cho xe tạo mới.
ALTER TABLE "vehicles" ALTER COLUMN "marketplace_enabled" SET DEFAULT true;
ALTER TABLE "vehicles" ALTER COLUMN "marketplace_enabled" SET NOT NULL;
