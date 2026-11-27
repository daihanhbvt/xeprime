-- Ảnh đại diện TUỲ CHỌN của tài xế nội bộ (ADR 0108, design Partner-XePrime 24612:140670).
-- URL công khai của ảnh đã tải lên kho R2 dưới tiền tố `tenants/<tenant_id>/drivers/` — server kiểm
-- đúng tiền tố của bên thuê trước khi ghi, nên không có CHECK hình dạng ở đây (URL gốc kho là cấu hình).
ALTER TABLE "tenant_internal_drivers" ADD COLUMN "photo_url" TEXT;
