-- ═══════════════════════════════════════════════════════════════════════════
-- Đăng nhập mạng xã hội cho APP NATIVE — one-time code + PKCE app↔backend
-- (26/08/2026, ADR 0019 mục "Chỗ cắm cho app native" + ADR 0017)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`. Migration này chỉ THÊM một bảng + hai cột, không chạm
-- gì đang có.
--
-- Vấn đề nó giải: web kết thúc luồng OAuth bằng `Set-Cookie`, mà app native không dùng cookie
-- (ADR 0017). Trước migration này callback luôn đặt cookie rồi redirect về `APP_WEB_URL`, nên
-- app mở trình duyệt xong **không nhận được gì**.
--
-- Vì sao KHÔNG trả thẳng cặp token ở deep link: deep link đi qua hệ điều hành và nằm lại trong
-- log của nó. Một refresh token 60 ngày ở đó là bí mật dài hạn bị ghi ra đĩa. One-time code sống
-- 60 giây, dùng một lần, và chỉ đổi được khi kèm `code_verifier` mà app giữ trong bộ nhớ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── `oauth_states`: nhớ thêm ngữ cảnh của app native ──────────────────────
--
-- Hai lớp PKCE, và cần CẢ HAI:
--   `code_verifier`      (đã có) — bảo vệ chặng XePrime ↔ Google/Facebook
--   `app_code_challenge` (mới)   — bảo vệ chặng APP ↔ XePrime
--
-- Lớp thứ hai không thừa: trên Android custom scheme KHÔNG độc quyền, nên một app khác đăng ký
-- `xeprime://` có thể cướp one-time code ở deep link. Cướp được mà không có `code_verifier` của
-- app thật thì mã đó vô dụng.
ALTER TABLE "public"."oauth_states"
    ADD COLUMN "app_code_challenge" VARCHAR(128),
    ADD COLUMN "app_redirect_uri" VARCHAR(512);

-- Bất biến: `native` thì phải có đủ cả hai; `web` thì phải không có cái nào.
--
-- CHECK ở DB chứ không chỉ ở service vì đây là thứ quyết định nhánh "phát cookie hay phát
-- one-time code" ở callback. Một hàng `native` mà thiếu `app_redirect_uri` là một luồng đăng
-- nhập không có đường về — app treo ở trình duyệt, không có lỗi nào để đọc.
ALTER TABLE "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_native_fields_check"
    CHECK (
        ("client" = 'native'
            AND "app_code_challenge" IS NOT NULL
            AND "app_redirect_uri" IS NOT NULL)
        OR ("client" <> 'native'
            AND "app_code_challenge" IS NULL
            AND "app_redirect_uri" IS NULL)
    );

-- ── One-time code: cầu nối giữa deep link và cặp token ────────────────────
CREATE TABLE "public"."native_auth_codes" (
    "id" CHAR(26) NOT NULL,
    "user_id" CHAR(26) NOT NULL,

    -- SHA-256 hex của code. KHÔNG lưu code trần — cùng kỷ luật với `native_refresh_tokens`
    -- (ADR 0017): DB rò rỉ trong 60 giây đó cũng không đổi được phiên của ai.
    "code_hash" CHAR(64) NOT NULL,

    -- PKCE S256 challenge do app gửi lúc bắt đầu luồng.
    "code_challenge" VARCHAR(128) NOT NULL,

    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "native_auth_codes_pkey" PRIMARY KEY ("id")
);

-- UNIQUE là ĐIỀU KIỆN để "dùng một lần" đúng, không phải để tra cứu nhanh — giống
-- `oauth_states.state`: `UPDATE … WHERE code_hash = $1 AND consumed_at IS NULL` chỉ atomic khi
-- khoá xác định nhiều nhất một hàng.
CREATE UNIQUE INDEX "native_auth_codes_code_hash_key" ON "public"."native_auth_codes"("code_hash");

-- Dọn hàng hết hạn theo lô (worker).
CREATE INDEX "native_auth_codes_expires_at_idx" ON "public"."native_auth_codes"("expires_at");

-- Xoá user thì mã chờ của họ đi theo — nó vô nghĩa nếu không còn ai để phát phiên.
ALTER TABLE "public"."native_auth_codes"
    ADD CONSTRAINT "native_auth_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
