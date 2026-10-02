-- Phạm vi chi nhánh đi kèm LỜI MỜI (ADR 0052).
--
-- Người được mời chưa có `tenant_memberships` để gắn chi nhánh vào, nên phạm vi phải sống trên
-- chính lời mời cho tới lúc họ bấm "Đồng ý". Lúc đó `InvitesService.accept` chép sang
-- `membership_branches` — và CHỈ chép những chi nhánh còn tồn tại trong gian hàng.
--
-- `branch_ids` là mảng chứ không phải bảng nối, cố ý: lời mời là bản ghi TẠM (hết hạn, bị huỷ,
-- được nhận rồi thôi), nên không đáng một bảng + hai khoá ngoại. Cái giá phải trả là không có
-- toàn vẹn tham chiếu, và nó được trả ở đường nhận: chi nhánh đã bị xoá thì bị bỏ qua, chứ không
-- làm hỏng lượt nhận lời mời.
ALTER TABLE "public"."tenant_invites"
  ADD COLUMN "branch_scope" VARCHAR(20) NOT NULL DEFAULT 'all',
  ADD COLUMN "branch_ids" CHAR(26)[] NOT NULL DEFAULT '{}';

ALTER TABLE "public"."tenant_invites"
  ADD CONSTRAINT "ti_branch_scope_valid" CHECK ("branch_scope" IN ('all', 'limited'));

-- Phạm vi hẹp mà không nêu chi nhánh nào là một lời mời không mở được cửa nào — chặn ngay ở DB.
--
-- `cardinality` chứ KHÔNG `array_length(..., 1)`: với mảng RỖNG `array_length` trả NULL, và
-- `NULL >= 1` là NULL — mà CHECK coi NULL là ĐẠT. Đúng ca cần chặn thì nó lọt qua.
ALTER TABLE "public"."tenant_invites"
  ADD CONSTRAINT "ti_branch_scope_needs_ids"
  CHECK ("branch_scope" = 'all' OR cardinality("branch_ids") >= 1);
