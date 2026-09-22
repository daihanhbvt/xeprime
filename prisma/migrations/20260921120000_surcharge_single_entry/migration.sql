-- ============================================================================
-- MỘT CHUYẾN, MỘT KHOẢN VƯỢT KM (21/09/2026)
--
-- Phí vượt km suy ra từ đúng MỘT cặp chỉ số đồng hồ (lúc giao và lúc nhận lại xe), nên nó là
-- một con số duy nhất của chuyến. Ghi khoản thứ hai không phải là một khoản mới — nó là trừ
-- tiền khách hai lần cho cùng một quãng đường.
--
-- Và đây đúng là danh mục dễ bấm nhầm hai lần nhất: màn quyết toán có nút "dùng số đề xuất",
-- nên hai cú click, một lần retry mạng, hay hai tab mở song song đều dẫn tới cùng một chỗ.
--
-- `SettlementService.requireNoDuplicateCategory` đã kiểm trước khi ghi, nhưng phép kiểm đó là
-- một `SELECT` NGOÀI transaction rồi mới `INSERT` bên trong: hai request chạy song song cùng
-- đọc "chưa có" và cùng ghi. Kiểm ở tầng app chỉ dùng để có câu báo lỗi tử tế (nó biết `id` của
-- khoản đang tồn tại để giao diện chỉ thẳng vào); thứ khiến bất biến THÀNH THẬT là ràng buộc
-- này — cùng kỷ luật với `vehicle_handovers` và với CLAUDE.md §5 ("chống ghi đôi tiền bằng
-- constraint DB, không bằng check ở tầng app").
--
-- Phạm vi hẹp có chủ đích:
--   · `voided_at IS NULL` — gỡ khoản cũ rồi ghi lại là đường SỬA hợp lệ, không được chặn;
--   · `category = 'excess_mileage'` — vệ sinh, hư hại, chờ đợi… thì ngược lại, một chuyến có
--     thể có nhiều khoản thật với nhiều lý do riêng. Mở rộng danh sách này phải là một quyết
--     định nghiệp vụ, không phải một lần "cho gọn".
--
-- Danh sách danh mục chỉ-một-khoản sống ở `@xeprime/types` →
-- `SINGLE_ENTRY_SURCHARGE_CATEGORIES`. Thêm danh mục ở đó thì phải thêm migration ở đây.
-- ============================================================================

-- Dọn dữ liệu cũ trước khi dựng ràng buộc: giữ khoản GHI ĐẦU TIÊN của mỗi đơn, huỷ MỀM phần
-- còn lại (không xoá cứng — mất dấu vết "đã từng trừ tiền khách" là mất đúng thứ cần nhất khi
-- có khiếu nại). Trên dữ liệu hiện có thường là 0 dòng; câu lệnh này để migration chạy được cả
-- trên database đã lỡ có bản trùng.
UPDATE "public"."booking_surcharges" AS s
SET "voided_at"   = NOW(),
    "void_reason" = 'Gỡ tự động khi dựng ràng buộc một-khoản-vượt-km (migration 20260921120000)',
    "updated_at"  = NOW()
WHERE s."category" = 'excess_mileage'
  AND s."voided_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "public"."booking_surcharges" AS keep
    WHERE keep."booking_id" = s."booking_id"
      AND keep."category" = 'excess_mileage'
      AND keep."voided_at" IS NULL
      AND (keep."created_at", keep."id") < (s."created_at", s."id")
  );

CREATE UNIQUE INDEX "booking_surcharges_single_entry_uq"
  ON "public"."booking_surcharges" USING btree ("booking_id", "category")
  WHERE ("voided_at" IS NULL AND ("category")::text = 'excess_mileage'::text);
