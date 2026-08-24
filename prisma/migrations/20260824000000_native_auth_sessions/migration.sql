-- ═══════════════════════════════════════════════════════════════════════════
-- Phiên đăng nhập native + refresh token xoay vòng — ADR 0017
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev`. Lý do nằm ở header của
-- `20260821000000_init/migration.sql`: baseline chứa 25 thứ mà `schema.prisma` không diễn đạt
-- được (rõ nhất là các khoá ngoại tổ hợp `(id, tenant_id)`), nên migration Prisma tự sinh sẽ
-- kèm lệnh DROP các khoá đó. Migration này chỉ THÊM hai bảng và không chạm gì đang có, nên viết
-- tay là cách duy nhất giữ nguyên phần baseline viết tay.
--
-- Đối chiếu với datamodel sau khi áp:
--   prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
--   → vẫn đúng 25 câu chênh lệch cố ý như trước, không thêm câu nào.
--
-- Hai bảng, hai vai:
--   native_auth_sessions   — MỘT hàng cho MỘT thiết bị. Thu hồi ở đây là thu hồi cả thiết bị.
--   native_refresh_tokens  — MỘT hàng cho MỘT lần xoay. Cả bảng là lịch sử của một hàng token,
--                            và `used_at` là thứ làm cho phát hiện replay chỉ là một phép đọc.
--
-- Không có cột nào chứa token thô: `token_hash` là SHA-256 hex (ADR 0017 §3).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Phiên của một thiết bị ────────────────────────────────────────────────
CREATE TABLE "public"."native_auth_sessions" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "client_type" VARCHAR(30) NOT NULL DEFAULT 'mobile',
    "device_name" VARCHAR(120),
    "device_platform" VARCHAR(30),
    "app_version" VARCHAR(30),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(50),

    CONSTRAINT "native_auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "native_auth_sessions_user_id_idx" ON "public"."native_auth_sessions"("user_id");

-- Tra phiên CÒN SỐNG của một user, và dọn phiên hết hạn theo lô.
CREATE INDEX "native_auth_sessions_revoked_at_expires_at_idx"
    ON "public"."native_auth_sessions"("revoked_at", "expires_at");

ALTER TABLE "public"."native_auth_sessions"
    ADD CONSTRAINT "native_auth_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Từ vựng đóng, do BACKEND ghi (ADR 0017 §4/§5). CHECK ở đây bắt lỗi chính tả trong chính mã
-- của mình — thứ mà `String` ở tầng Prisma không chặn được (ADR 0005).
ALTER TABLE "public"."native_auth_sessions"
    ADD CONSTRAINT "native_auth_sessions_revoked_reason_check"
    CHECK (("revoked_reason" IS NULL)
        OR ("revoked_reason" IN ('logout', 'refresh_reuse', 'user_disabled')));

-- Thu hồi và lý do đi cùng nhau: một phiên bị thu hồi mà không nói vì sao thì lịch sử vô dụng.
ALTER TABLE "public"."native_auth_sessions"
    ADD CONSTRAINT "native_auth_sessions_revoked_pair_check"
    CHECK ((("revoked_at" IS NULL) AND ("revoked_reason" IS NULL))
        OR (("revoked_at" IS NOT NULL) AND ("revoked_reason" IS NOT NULL)));

ALTER TABLE "public"."native_auth_sessions"
    ADD CONSTRAINT "native_auth_sessions_expiry_check"
    CHECK ((expires_at > created_at));

-- ── Một lần xoay refresh token ────────────────────────────────────────────
CREATE TABLE "public"."native_refresh_tokens" (
    "id" CHAR(26) NOT NULL,
    "session_id" CHAR(26) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "native_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- UNIQUE là một phần của cơ chế, không chỉ là chống trùng: nó biến "tra token" thành một phép
-- tìm khoá duy nhất, nên không có đường nào trả về hai hàng cho cùng một token.
CREATE UNIQUE INDEX "native_refresh_tokens_token_hash_key"
    ON "public"."native_refresh_tokens"("token_hash");

CREATE INDEX "native_refresh_tokens_session_id_idx"
    ON "public"."native_refresh_tokens"("session_id");

ALTER TABLE "public"."native_refresh_tokens"
    ADD CONSTRAINT "native_refresh_tokens_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "public"."native_auth_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."native_refresh_tokens"
    ADD CONSTRAINT "native_refresh_tokens_expiry_check"
    CHECK ((expires_at > created_at));
