-- ═══════════════════════════════════════════════════════════════════════════
-- Tài khoản ngân hàng NHẬN TIỀN — dùng chung cho khách và gian hàng
-- (11/09/2026 — ADR 0033 · ADR 0023 điều 7 và 8)
--
-- Vì sao cần bảng này ngay bây giờ: luồng hoàn tiền đang TẮC. `HoldSettlementService`
-- có sẵn `provideRefundAccount()` nhưng không controller nào gọi, trong khi `markRefundPaid()`
-- từ chối chuyển nếu thiếu số tài khoản — nên mọi khoản hoàn nằm mãi ở `pending` và admin
-- không có nút nào bấm được. Khách cần một chỗ để khai tài khoản, và chỗ đó phải dùng lại được
-- cho lần rút tiền sau chứ không phải khai lại mỗi lần.
--
-- Gom đúng HAI trong bốn chỗ đang giữ số tài khoản (xem docblock của model): tài khoản NHẬN của
-- gian hàng và của khách. Tài khoản THU của shop (`tenant_profiles`) đi chiều ngược lại và có
-- quyền xem khác, nên ở nguyên chỗ cũ.
--
-- Ba ràng buộc Prisma không diễn đạt được, và cả ba đều là chống lỗi TIỀN chứ không phải dọn
-- dẹp hình thức:
--
--   1. CHECK owner XOR — một tài khoản thuộc về đúng một chủ. Thiếu nó thì một hàng có cả hai
--      cột NULL sẽ nằm lơ lửng không ai đọc được, còn hàng có cả hai cột lại xuất hiện trong
--      danh sách của hai người.
--   2. Partial unique (chủ, bank_code, account_number) WHERE active — cùng một số tài khoản
--      khai hai lần tạo hai lựa chọn giống hệt nhau trong ô chọn lúc rút tiền, và người dùng
--      không có cách nào biết mình vừa chọn cái nào.
--   3. Partial unique một `is_default` mỗi chủ — "tài khoản mặc định" phải là một, nếu không
--      thì câu hỏi "chuyển vào đâu" có hai câu trả lời đúng.
--
-- KHÔNG backfill từ `seller_profiles` / `hold_refunds`: hai cột cũ vẫn là nguồn hợp lệ của
-- chúng, và `hold_refunds.bank_*` còn là BẰNG CHỨNG của lệnh chuyển đã thực hiện. Chép sang đây
-- sẽ tạo ra hai bản của cùng một sự thật mà không có bên nào là chuẩn.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."bank_accounts" (
    "id"              CHAR(26)       NOT NULL,
    "owner_type"      VARCHAR(20)    NOT NULL,
    "owner_user_id"   CHAR(26),
    "owner_tenant_id" CHAR(26),
    "bank_code"       VARCHAR(20)    NOT NULL,
    "account_number"  VARCHAR(40)    NOT NULL,
    "account_name"    VARCHAR(160)   NOT NULL,
    "label"           VARCHAR(60),
    "is_default"      BOOLEAN        NOT NULL DEFAULT false,
    "status"          VARCHAR(20)    NOT NULL DEFAULT 'active',
    "verified_at"     TIMESTAMPTZ(3),
    "verified_by"     CHAR(26),
    "changed_at"      TIMESTAMPTZ(3),
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_owner_type_check"
    CHECK ("owner_type" IN ('user', 'tenant'));

ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_status_check"
    CHECK ("status" IN ('active', 'archived'));

-- Đúng một chủ, và chủ đó khớp với `owner_type`.
ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_owner_xor_check"
    CHECK (
        ("owner_type" = 'user'   AND "owner_user_id" IS NOT NULL AND "owner_tenant_id" IS NULL)
     OR ("owner_type" = 'tenant' AND "owner_tenant_id" IS NOT NULL AND "owner_user_id" IS NULL)
    );

-- Số tài khoản phải là chữ số: VietQR dựng link từ chính chuỗi này, và một ký tự lạ biến thành
-- một mã QR quét ra tài khoản không tồn tại.
ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_account_number_check"
    CHECK ("account_number" ~ '^[0-9]{4,40}$');

ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_owner_user_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_owner_tenant_fkey"
    FOREIGN KEY ("owner_tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Không trùng số tài khoản trong danh sách đang dùng của một chủ. Bản `archived` được phép
-- trùng: người dùng bỏ một tài khoản rồi khai lại chính nó là chuyện thường.
CREATE UNIQUE INDEX "bank_accounts_user_number_key"
    ON "public"."bank_accounts" ("owner_user_id", "bank_code", "account_number")
    WHERE "owner_type" = 'user' AND "status" = 'active';

CREATE UNIQUE INDEX "bank_accounts_tenant_number_key"
    ON "public"."bank_accounts" ("owner_tenant_id", "bank_code", "account_number")
    WHERE "owner_type" = 'tenant' AND "status" = 'active';

-- Đúng một tài khoản mặc định mỗi chủ.
CREATE UNIQUE INDEX "bank_accounts_user_default_key"
    ON "public"."bank_accounts" ("owner_user_id")
    WHERE "owner_type" = 'user' AND "is_default" AND "status" = 'active';

CREATE UNIQUE INDEX "bank_accounts_tenant_default_key"
    ON "public"."bank_accounts" ("owner_tenant_id")
    WHERE "owner_type" = 'tenant' AND "is_default" AND "status" = 'active';

CREATE INDEX "bank_accounts_user_status_idx"
    ON "public"."bank_accounts" ("owner_user_id", "status");

CREATE INDEX "bank_accounts_tenant_status_idx"
    ON "public"."bank_accounts" ("owner_tenant_id", "status");
