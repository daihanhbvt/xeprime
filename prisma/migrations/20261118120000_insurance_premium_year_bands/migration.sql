-- ADR 0106 — biểu phí bảo hiểm vật chất xe theo NĂM SẢN XUẤT, đồng bộ từ hãng.
--
-- % bậc của MIC đổi theo năm sản xuất (đo sandbox 18/11/2026), nên một bộ % cho mọi xe chỉ đúng
-- một nhóm năm. `premium_year_bands_json` giữ các nhóm năm; `premium_sync_*` giữ trạng thái biểu phí
-- so với hãng: `synced` ⇒ khoá; `failed` (đồng bộ hỏng) / `drifted` (lượt duyệt thấy hãng báo khác)
-- ⇒ admin được sửa tay.
--
-- Chỉ THÊM cột (NULL được) — dòng cũ giữ nguyên nghĩa "một biểu phí cho mọi năm, sửa tay được".

ALTER TABLE "insurance_products"
  ADD COLUMN "premium_year_bands_json" JSONB,
  ADD COLUMN "premium_sync_status" VARCHAR(20),
  ADD COLUMN "premium_synced_at" TIMESTAMPTZ(3),
  ADD COLUMN "premium_sync_status_at" TIMESTAMPTZ(3),
  ADD COLUMN "premium_sync_error" VARCHAR(500);

ALTER TABLE "insurance_products"
  ADD CONSTRAINT "insurance_products_premium_sync_status_check"
    CHECK (
      "premium_sync_status" IS NULL
      OR "premium_sync_status" IN ('synced', 'failed', 'drifted')
    ),
  -- Có trạng thái thì có mốc ghi trạng thái đó, và ngược lại.
  ADD CONSTRAINT "insurance_products_premium_sync_status_at_check"
    CHECK (("premium_sync_status" IS NULL) = ("premium_sync_status_at" IS NULL)),
  -- Lý do chỉ đi cùng trạng thái hỏng/lệch; đã đồng bộ được thì có mốc thành công.
  ADD CONSTRAINT "insurance_products_premium_sync_error_check"
    CHECK ("premium_sync_error" IS NULL OR "premium_sync_status" IN ('failed', 'drifted')),
  ADD CONSTRAINT "insurance_products_premium_synced_at_check"
    CHECK ("premium_sync_status" IS DISTINCT FROM 'synced' OR "premium_synced_at" IS NOT NULL),
  -- Nhóm năm chỉ có nghĩa với sản phẩm tính theo bậc, và là một mảng.
  ADD CONSTRAINT "insurance_products_premium_year_bands_check"
    CHECK (
      "premium_year_bands_json" IS NULL
      OR ("premium_basis" = 'value_tier' AND jsonb_typeof("premium_year_bands_json") = 'array')
    );
