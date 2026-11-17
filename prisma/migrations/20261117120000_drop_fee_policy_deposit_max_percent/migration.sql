-- Đợt rà Admin 16/11/2026 (prompt 8): gỡ `fee_policies.deposit_max_percent`.
--
-- Cột này chỉ để kiểm `deposit_percent ≤ deposit_max_percent` — không vào phép tính tiền nào, và
-- trần THẬT của phần giữ chỗ là hằng `DEPOSIT_PERCENT_MAX` = 50% (ADR 0025 điều 3: trên mức đó
-- "giữ chỗ" thành thu tiền thuê trước). Hai lớp chặn cùng một điều làm admin phải sửa hai ô cho
-- một quyết định. Ràng buộc giữ nguyên ý: `deposit_percent` trong [0, 50].
--
-- Snapshot JSON đã đóng băng trên đơn/hold cũ có thể còn khoá `depositMaxPercent`: không đường đọc
-- nào dùng nó nữa, khoá thừa bị bỏ qua.

ALTER TABLE "public"."fee_policies"
    DROP CONSTRAINT IF EXISTS "fee_policies_deposit_percent_check",
    DROP CONSTRAINT IF EXISTS "fee_policies_deposit_max_percent_check";

ALTER TABLE "public"."fee_policies"
    ADD CONSTRAINT "fee_policies_deposit_percent_check"
    CHECK ("deposit_percent" >= 0 AND "deposit_percent" <= 50);

ALTER TABLE "public"."fee_policies" DROP COLUMN "deposit_max_percent";
