-- Dấu "admin đã sửa" của mẫu xe (06/10/2026).
--
-- Seed chỉ điền vào ô TRỐNG của mẫu đã có (`catalog-sync.ts`), nhưng "trống" không phân biệt được
-- "chưa ai khai" với "admin cố ý xoá một giá trị sai". Mốc này do `CatalogModelService` ghi ở mọi
-- lượt thêm/sửa/khôi phục; có mốc thì seed không đụng tới thông số của dòng đó nữa.
ALTER TABLE "public"."vehicle_catalog_models" ADD COLUMN "admin_edited_at" TIMESTAMPTZ(3);
