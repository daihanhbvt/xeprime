-- ═══════════════════════════════════════════════════════════════════════════
-- MỘT cổng duyệt cho tuyến hoa hồng: duyệt XE (ADR 0036) — 14/09/2026
--
-- Trước migration này, chủ xe cá nhân phải đi qua HAI cổng để chiếc xe đầu tiên lên chợ:
--
--   1. `POST /tenants` tạo gian hàng ở `draft`;
--   2. `submitForPublicReview` từ chối khi gian hàng chưa `active`, nên phải có một phiếu
--      duyệt GIAN HÀNG được duyệt trước;
--   3. rồi mới tới phiếu duyệt XE.
--
-- Cổng (2) không hỏi thêm được gì mà cổng (3) không hỏi — họ tên, số điện thoại, địa chỉ và
-- toàn bộ ảnh xe đều nằm trong chính phiếu duyệt xe. Nó chỉ tạo ra một trạng thái kẹt: phiếu
-- gian hàng rời hàng đợi `pending` còn chiếc xe vẫn `draft`, và chủ xe không có gì để bấm.
--
-- Từ ADR 0036, `tenants.status` chỉ còn là trạng thái VẬN HÀNH (`active` ↔ `suspended`), còn
-- "nền tảng đã xem xét pháp nhân chưa" là trục THỨ HAI đọc từ phiếu duyệt `tenant` mới nhất
-- (`SHOP_VERIFICATION` ở `@xeprime/types`) và chỉ là điều kiện để MUA GÓI thuê bao.
--
-- Migration này làm đúng hai việc, và cả hai CHẠY LẠI ĐƯỢC (idempotent):
--   A. Một unique index MỘT PHẦN chặn hai phiếu CHỜ cho cùng một đối tượng.
--   B. Backfill: mở khoá những gian hàng đang kẹt ở cổng đã bị gỡ.
--
-- Nó KHÔNG công khai bất kỳ chiếc xe nào: `vehicles.public_status` không bị đụng tới ở đây.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── A. Một phiếu CHỜ cho mỗi đối tượng ─────────────────────────────────────
--
-- Cái chặn THẬT của việc bấm "Gửi duyệt" hai lần, mở hai tab, hay bấm lại sau khi lần đầu lỗi
-- mạng. Tầng app đã đổi `public_status` sang `pending_public_review` trước khi tạo phiếu, nhưng
-- hai request song song đều đọc trạng thái CŨ và cùng đi qua — chỉ constraint mới đóng được cửa
-- sổ đó (CLAUDE.md mục 6, lằn ranh 2).
--
-- MỘT PHẦN (`WHERE status = 'pending'`) là điểm mấu chốt: một chiếc xe bị từ chối rồi gửi lại
-- phải có phiếu thứ hai, và lịch sử duyệt phải giữ nguyên. Chỉ "đang chờ" mới là duy nhất.

-- Dọn trước khi tạo: dữ liệu cũ có thể đã có phiếu chờ trùng (chính lỗi mà index này chặn).
-- Giữ phiếu MỚI NHẤT — nó mang snapshot gần đúng nhất với thứ reviewer sắp nhìn; các phiếu cũ
-- hơn chuyển sang `cancelled` (không XOÁ: `approval_logs` trỏ vào chúng, và dấu vết duyệt là
-- thứ không được phép biến mất).
UPDATE "public"."approval_tasks" AS t
SET "status" = 'cancelled', "updated_at" = CURRENT_TIMESTAMP
WHERE t."status" = 'pending'
  AND EXISTS (
    SELECT 1
    FROM "public"."approval_tasks" AS newer
    WHERE newer."target_type" = t."target_type"
      AND newer."target_id" = t."target_id"
      AND newer."status" = 'pending'
      AND (newer."submitted_at", newer."id") > (t."submitted_at", t."id")
  );

CREATE UNIQUE INDEX IF NOT EXISTS "approval_tasks_pending_target_uq"
  ON "public"."approval_tasks" ("target_type", "target_id")
  WHERE "status" = 'pending';


-- ── B. Gỡ những gian hàng đang kẹt ở cổng đã bị bỏ ─────────────────────────
--
-- `draft` / `pending_review` / `needs_revision` đều có nghĩa "chưa từng được mở", và từ nay
-- không trạng thái nào trong ba cái đó còn được sinh ra nữa. Để nguyên thì những gian hàng này
-- vĩnh viễn không gửi duyệt xe được, vì `submitForPublicReview` vẫn đòi `active`.
--
-- Ba trạng thái KHÔNG nằm trong danh sách, có chủ đích:
--   · `rejected`  — một người thật đã xem hồ sơ và nói không. Tự mở lại là xoá quyết định đó.
--   · `suspended` — nền tảng đang khoá gian hàng.
--   · `expired`   — thuộc vòng đời gói, job gói xử lý.
-- Gian hàng ở hai trạng thái đầu vẫn có đường ra: gửi lại hồ sơ và được reviewer duyệt sẽ mở
-- `active` (nhánh chữa dữ liệu cũ ở `PlatformApprovalService.applyTenantDecision`).
--
-- Idempotent nhờ chính mệnh đề `WHERE`: chạy lần hai không còn dòng nào khớp.
UPDATE "public"."tenants"
SET "status" = 'active', "updated_at" = CURRENT_TIMESTAMP
WHERE "deleted_at" IS NULL
  AND "status" IN ('draft', 'pending_review', 'needs_revision');

-- Phiếu duyệt GIAN HÀNG cũ đang chờ thì GIỮ NGUYÊN `pending`, không tự chốt hộ.
--
-- Chúng vẫn là những yêu cầu xác minh hợp lệ dưới mô hình mới, và duyệt một phiếu như vậy bây
-- giờ chỉ có nghĩa "gian hàng đã được xác minh" — không còn tác dụng phụ nào lên xe hay lên
-- marketplace. Tự chốt hộ thì hoặc là cấp `verified` cho hồ sơ chưa ai đọc, hoặc là vứt một
-- việc mà chủ gian hàng đang chờ câu trả lời. Cả hai đều tệ hơn là để reviewer bấm.
