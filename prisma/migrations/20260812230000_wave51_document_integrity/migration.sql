-- Wave 5.1 — đóng bất biến an ninh/toàn vẹn cho giấy tờ xe (forward-only).
--
-- Bất biến DB giữ thêm sau migration này:
--   1. `active_version_id` KHÔNG còn ON DELETE SET NULL: FK composite
--      (active_version_id, id) mà SET NULL sẽ null cả cột `id` (PK, NOT NULL) — hành vi
--      không hợp lệ. Chuyển sang NO ACTION: xoá thẳng một version đang active bị DB chặn;
--      đường cascade hợp lệ (xoá document/vehicle/tenant) vẫn đi qua vì NO ACTION kiểm
--      cuối câu lệnh, lúc đó dòng document cũng đã biến mất.
--   2. Một file riêng tư chỉ thuộc MỘT phiên bản giấy tờ (unique private_file_id).
--   3. Phiên bản giấy tờ chỉ trỏ được tới file CÙNG tenant + CÙNG xe (composite FK —
--      cùng cơ chế Wave 4.1, service check chỉ là lớp lịch sự).
--   4. Mỗi giấy tờ tối đa MỘT job OCR đang `processing` (partial unique).
--
-- Tiền kiểm: dữ liệu vi phạm làm migration DỪNG với thông báo rõ — KHÔNG âm thầm xoá
-- hay sửa bản ghi nào (migration chạy trong transaction, fail là rollback sạch).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "vehicle_document_versions"
    GROUP BY "private_file_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'wave51: co private file dang gan vao nhieu phien ban giay to - xu ly du lieu truoc khi them unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "vehicle_document_versions" v
    JOIN "vehicle_private_files" f ON f."id" = v."private_file_id"
    WHERE f."tenant_id" <> v."tenant_id" OR f."vehicle_id" <> v."vehicle_id"
  ) THEN
    RAISE EXCEPTION 'wave51: co phien ban giay to tro toi file cua tenant/xe khac - xu ly du lieu truoc khi them FK';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "vehicle_document_ocr_jobs"
    WHERE "status" = 'processing'
    GROUP BY "document_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'wave51: co nhieu job OCR processing tren cung mot giay to - xu ly du lieu truoc khi them partial unique';
  END IF;
END $$;

-- 1. Sửa hành vi xoá của FK bản active.
ALTER TABLE "vehicle_documents"
    DROP CONSTRAINT "vehicle_documents_active_version_fkey";
ALTER TABLE "vehicle_documents"
    ADD CONSTRAINT "vehicle_documents_active_version_fkey"
        FOREIGN KEY ("active_version_id", "id")
        REFERENCES "vehicle_document_versions"("id", "document_id")
        ON DELETE NO ACTION ON UPDATE CASCADE;

-- 2. Một file — một phiên bản.
CREATE UNIQUE INDEX "vehicle_document_versions_private_file_id_key"
    ON "vehicle_document_versions"("private_file_id");

-- 3. Sở hữu file theo tenant + xe do DB giữ (mục tiêu composite FK, như vehicles(id, tenant_id)).
CREATE UNIQUE INDEX "vehicle_private_files_id_tenant_id_vehicle_id_key"
    ON "vehicle_private_files"("id", "tenant_id", "vehicle_id");
ALTER TABLE "vehicle_document_versions"
    ADD CONSTRAINT "vehicle_document_versions_file_owner_fkey"
        FOREIGN KEY ("private_file_id", "tenant_id", "vehicle_id")
        REFERENCES "vehicle_private_files"("id", "tenant_id", "vehicle_id")
        ON DELETE NO ACTION ON UPDATE CASCADE;

-- 4. Tối đa một job OCR đang chạy trên một giấy tờ — race hai người bấm cùng lúc do DB chặn.
CREATE UNIQUE INDEX "vehicle_document_ocr_jobs_one_processing_key"
    ON "vehicle_document_ocr_jobs"("document_id")
    WHERE "status" = 'processing';
