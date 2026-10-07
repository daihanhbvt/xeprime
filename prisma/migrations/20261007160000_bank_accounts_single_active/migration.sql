-- ═══════════════════════════════════════════════════════════════════════════
-- MỖI CHỦ MỘT TÀI KHOẢN NHẬN TIỀN (07/10/2026)
--
-- Trước migration này `bank_accounts` là một SỔ nhiều tài khoản có một cái "mặc định", và lệnh rút
-- bắt chọn trong sổ. Từ nay một chủ (tài khoản người dùng hoặc gian hàng) có đúng MỘT tài khoản
-- nhận tiền đang dùng: khai cái mới là THAY cái cũ — `BankAccountsService.create` lưu trữ cái cũ
-- và tạo cái mới trong cùng một transaction.
--
--   1. Gom dữ liệu cũ: chủ nào đang có nhiều dòng `active` thì GIỮ cái mặc định (không có mặc định
--      thì cái mới nhất), các dòng còn lại chuyển `archived`. KHÔNG xoá: lệnh rút cũ còn trỏ về
--      chúng (`withdrawal_requests.bank_account_id`), còn lệnh đang chờ đã chụp số tài khoản vào
--      chính nó nên không đổi đích.
--   2. Dòng `active` còn lại là mặc định — `is_default` giữ cho client cũ (app native) đọc.
--   3. Ràng buộc: tối đa một dòng `active` mỗi chủ (partial unique) và dòng `active` luôn là mặc
--      định (CHECK). Database, không phải service, là thứ bảo đảm "một".
--   4. Gỡ bốn partial unique cũ — "không trùng số trong danh sách đang dùng" và "một mặc định mỗi
--      chủ" đều là hệ quả của (3), giữ lại chỉ thêm chi phí ghi và làm người đọc tưởng sổ còn
--      nhiều dòng.
--
-- Viết TAY: chỉ các lệnh dưới, không kéo theo drift của `prisma migrate diff` (xem header baseline
-- `20260821000000_init`). Partial index và CHECK không mô tả được trong `schema.prisma`.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Một dòng `active` mỗi chủ — giữ mặc định, rồi mới nhất.
WITH ranked AS (
    SELECT "id",
           ROW_NUMBER() OVER (
               PARTITION BY "owner_type", COALESCE("owner_user_id", "owner_tenant_id")
               ORDER BY "is_default" DESC, "created_at" DESC, "id" DESC
           ) AS rn
    FROM "public"."bank_accounts"
    WHERE "status" = 'active'
)
UPDATE "public"."bank_accounts" b
SET "status" = 'archived',
    "is_default" = false,
    "updated_at" = now()
FROM ranked r
WHERE b."id" = r."id"
  AND r.rn > 1;

-- 2. Dòng đang dùng là mặc định; dòng đã lưu trữ thì không.
UPDATE "public"."bank_accounts"
SET "is_default" = true,
    "updated_at" = now()
WHERE "status" = 'active'
  AND NOT "is_default";

UPDATE "public"."bank_accounts"
SET "is_default" = false,
    "updated_at" = now()
WHERE "status" <> 'active'
  AND "is_default";

-- 3. Ràng buộc.
CREATE UNIQUE INDEX "bank_accounts_user_active_key"
    ON "public"."bank_accounts" ("owner_user_id")
    WHERE "owner_type" = 'user' AND "status" = 'active';

CREATE UNIQUE INDEX "bank_accounts_tenant_active_key"
    ON "public"."bank_accounts" ("owner_tenant_id")
    WHERE "owner_type" = 'tenant' AND "status" = 'active';

ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_default_iff_active_check"
    CHECK ("is_default" = ("status" = 'active'));

-- 4. Bốn partial unique cũ — hệ quả của (3).
DROP INDEX "public"."bank_accounts_user_number_key";
DROP INDEX "public"."bank_accounts_tenant_number_key";
DROP INDEX "public"."bank_accounts_user_default_key";
DROP INDEX "public"."bank_accounts_tenant_default_key";
