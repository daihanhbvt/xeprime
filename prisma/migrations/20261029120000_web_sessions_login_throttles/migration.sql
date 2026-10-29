-- ═══════════════════════════════════════════════════════════════════════════
-- Phiên web thu hồi được + khoá đăng nhập theo định danh — ADR 0076
--
-- VIẾT TAY (cùng lý do với `20260824000000_native_auth_sessions`): migration Prisma tự sinh sẽ kèm
-- lệnh DROP các khoá ngoại tổ hợp của baseline. Migration này chỉ THÊM hai bảng và NỚI một CHECK.
--
--   web_sessions     — MỘT hàng cho MỘT lần đăng nhập trên trình duyệt; `id` = claim `sid` của
--                      cookie. Cookie mà `sid` không trỏ vào hàng còn sống bị AuthGuard từ chối.
--   login_throttles  — bộ đếm đăng nhập sai theo (realm, SHA-256 của định danh đã chuẩn hoá).
--
-- ⚠ Cookie phát TRƯỚC migration này không có hàng nào ⇒ mọi người dùng web đăng nhập lại MỘT lần
--   sau lần deploy đầu tiên. Cố ý: không có cách nào thu hồi một cookie cũ ngoài việc ngừng tin nó.
--
-- ⚠ Prisma KHÔNG diễn đạt được (giữ khi `migrate dev` sinh lệnh DROP): mọi CHECK dưới đây.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Phiên của một trình duyệt ─────────────────────────────────────────────
CREATE TABLE "public"."web_sessions" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_reason" VARCHAR(50),

    CONSTRAINT "web_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "web_sessions_user_id_idx" ON "public"."web_sessions"("user_id");
CREATE INDEX "web_sessions_expires_at_idx" ON "public"."web_sessions"("expires_at");

ALTER TABLE "public"."web_sessions"
    ADD CONSTRAINT "web_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."web_sessions"
    ADD CONSTRAINT "web_sessions_revoked_reason_check"
    CHECK (("revoked_reason" IS NULL)
        OR ("revoked_reason" IN ('logout', 'password_changed', 'password_reset', 'user_disabled')));

-- Thu hồi và lý do đi cùng nhau.
ALTER TABLE "public"."web_sessions"
    ADD CONSTRAINT "web_sessions_revoked_pair_check"
    CHECK ((("revoked_at" IS NULL) AND ("revoked_reason" IS NULL))
        OR (("revoked_at" IS NOT NULL) AND ("revoked_reason" IS NOT NULL)));

-- ── Bộ đếm đăng nhập sai ──────────────────────────────────────────────────
CREATE TABLE "public"."login_throttles" (
    "id" CHAR(26) NOT NULL,
    "realm" VARCHAR(20) NOT NULL,
    "identifier_hash" CHAR(64) NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL,
    "locked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("id")
);

-- Khoá của phép upsert nguyên tử (`ON CONFLICT`) ở `LoginThrottleService`.
CREATE UNIQUE INDEX "login_throttles_realm_identifier_hash_key"
    ON "public"."login_throttles"("realm", "identifier_hash");
CREATE INDEX "login_throttles_updated_at_idx" ON "public"."login_throttles"("updated_at");

ALTER TABLE "public"."login_throttles"
    ADD CONSTRAINT "login_throttles_realm_check"
    CHECK ("realm" IN ('customer', 'partner', 'platform'));

ALTER TABLE "public"."login_throttles"
    ADD CONSTRAINT "login_throttles_failed_count_check"
    CHECK ("failed_count" >= 0);

-- ── Phiên native: thêm hai lý do thu hồi ──────────────────────────────────
-- Đổi/đặt lại mật khẩu giờ giết mọi phiên app của tài khoản (ADR 0076 điều 2).
ALTER TABLE "public"."native_auth_sessions" DROP CONSTRAINT "native_auth_sessions_revoked_reason_check";
ALTER TABLE "public"."native_auth_sessions" ADD CONSTRAINT "native_auth_sessions_revoked_reason_check"
    CHECK ("revoked_reason" IS NULL
        OR "revoked_reason" IN (
            'logout', 'refresh_reuse', 'user_disabled', 'realm_split',
            'password_changed', 'password_reset'
        ));
