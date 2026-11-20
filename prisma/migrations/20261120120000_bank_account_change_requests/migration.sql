-- Khoá tài khoản nhận tiền + yêu cầu đổi có xác minh (biên bản họp 19/11/2026, việc #19).
--
-- Tài khoản ngân hàng nhận tiền bị KHOÁ từ lần khai đầu: chủ ví không tự đổi / gỡ được nữa. Muốn đổi
-- thì gửi yêu cầu; admin/CSKH gọi điện xác minh chính chủ rồi mới duyệt — chỉ lượt duyệt thay tài khoản.
-- Chỉ THÊM bảng — tài khoản đang có giữ nguyên.

CREATE TABLE "bank_account_change_requests" (
    "id" CHAR(26) NOT NULL,
    "owner_type" VARCHAR(20) NOT NULL,
    "owner_id" CHAR(26) NOT NULL,
    "requested_by" CHAR(26) NOT NULL,
    "bank_code" VARCHAR(20) NOT NULL,
    "account_number" VARCHAR(40) NOT NULL,
    "account_name" VARCHAR(160) NOT NULL,
    "label" VARCHAR(60),
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "reviewed_by" CHAR(26),
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_account_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bank_account_change_requests_owner_type_check" CHECK ("owner_type" IN ('user', 'tenant')),
    CONSTRAINT "bank_account_change_requests_status_check"
      CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
    -- Đã duyệt / từ chối ⇒ có người duyệt và mốc duyệt.
    CONSTRAINT "bank_account_change_requests_reviewed_check"
      CHECK ("status" NOT IN ('approved', 'rejected') OR ("reviewed_by" IS NOT NULL AND "reviewed_at" IS NOT NULL))
);

CREATE INDEX "bank_account_change_requests_status_created_at_idx"
  ON "bank_account_change_requests"("status", "created_at");
CREATE INDEX "bank_account_change_requests_owner_type_owner_id_created_at_idx"
  ON "bank_account_change_requests"("owner_type", "owner_id", "created_at");

-- Mỗi chủ tối đa MỘT yêu cầu đang chờ — hai yêu cầu song song là hai đích tiền cạnh tranh nhau.
CREATE UNIQUE INDEX "bank_account_change_requests_one_pending_per_owner"
  ON "bank_account_change_requests"("owner_type", "owner_id") WHERE "status" = 'pending';

ALTER TABLE "bank_account_change_requests"
  ADD CONSTRAINT "bank_account_change_requests_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
