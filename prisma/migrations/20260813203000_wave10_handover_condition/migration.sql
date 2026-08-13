-- Wave 10 — Tình trạng xe ghi ở phần nâng cao (`Bình thường` / `Có điểm cần lưu ý`).
--
-- Cột riêng chứ không suy từ việc `condition_note` có rỗng hay không: "xe bình thường, có ghi
-- chú" và "xe có điểm cần lưu ý" là hai chuyện khác nhau, và cái sau là thứ cần lọc/cảnh báo.
-- NULL = chưa ghi nhận (mọi bản ghi trước Wave 10).
ALTER TABLE "vehicle_handovers" ADD COLUMN "condition" VARCHAR(20);

ALTER TABLE "vehicle_handovers"
  ADD CONSTRAINT "vehicle_handovers_condition_check"
  CHECK ("condition" IS NULL OR "condition" IN ('normal', 'attention'));
