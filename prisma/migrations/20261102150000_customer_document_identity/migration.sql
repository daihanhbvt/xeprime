-- Thẻ giấy tờ của hồ sơ khách (Figma Partner `23797:62633`, 02/11/2026): "Chủ thẻ" và "Số giấy tờ".
-- Gian hàng gõ khi tải/đối chiếu — không có bộ đọc ảnh nào điền hộ (khác GPLX tài khoản, ADR 0057).
ALTER TABLE "public"."tenant_customer_documents" ADD COLUMN "holder_name" VARCHAR(160);
ALTER TABLE "public"."tenant_customer_documents" ADD COLUMN "document_number" VARCHAR(60);
