-- ═══════════════════════════════════════════════════════════════════════════
-- Quãng đường mỗi lần sạc đầy của xe ĐIỆN (09/09/2026)
--
-- Xe xăng/dầu khai "mức tiêu thụ" (lít/100km, cột `fuel_consumption_*`); xe điện không có đại
-- lượng đó — thứ khách hỏi là "sạc một lần đi được bao xa". Hai đại lượng khác đơn vị và khác
-- ý nghĩa nên KHÔNG dồn chung một cột: gộp lại thì mọi báo cáo sau này phải đoán đơn vị theo
-- loại nhiên liệu, và đoán sai một lần là số liệu sai vĩnh viễn.
--
-- NULL = chưa khai (mặc định cho toàn bộ xe cũ). Trần 2000 km chặn số vô nghĩa mà vẫn thoải mái
-- so với mọi mẫu xe đang bán.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."vehicles" ADD COLUMN "electric_range_km" INTEGER;

ALTER TABLE "public"."vehicles"
    ADD CONSTRAINT "vehicles_electric_range_check"
    CHECK ("electric_range_km" IS NULL OR ("electric_range_km" > 0 AND "electric_range_km" <= 2000));
