-- ═══════════════════════════════════════════════════════════════════════════
-- Đăng nhập mạng xã hội do backend chủ trì — bảng `oauth_states` (26/08/2026, ADR 0019)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`: baseline chứa 25 thứ mà `schema.prisma` không diễn đạt
-- được (rõ nhất là các khoá ngoại tổ hợp `(id, tenant_id)`), nên migration Prisma tự sinh sẽ
-- kèm lệnh DROP các khoá đó. Migration này chỉ THÊM một bảng và không chạm gì đang có.
--
-- Đối chiếu với datamodel sau khi áp:
--   prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
--   → vẫn đúng 25 câu chênh lệch cố ý như trước, không thêm câu nào.
--
-- Bảng này lưu MỘT LẦN BẤM NÚT đang dở dang, sống tối đa 10 phút.
--
-- Vì sao phải là bảng chứ không phải cookie hay bộ nhớ tiến trình: giữa lúc phát `state` và lúc
-- provider gọi callback, người dùng đi qua một trang của bên thứ ba. Cookie bị `SameSite` chặn ở
-- chặng quay về (callback là điều hướng từ google.com sang api.xeprime.vn), còn bộ nhớ tiến
-- trình thì chết khi API chạy nhiều instance. Bảng là chỗ duy nhất cả hai chặng cùng nhìn thấy.
--
-- Không có `tenant_id`, không có `user_id`: lúc phát `state` chưa biết người bấm là ai — đó
-- chính là thứ luồng này sắp đi tìm.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."oauth_states" (
    "id" CHAR(26) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,

    -- Tham số `state` gửi cho provider (32 byte CSPRNG → base64url).
    "state" VARCHAR(64) NOT NULL,
    -- PKCE. KHÔNG BAO GIỜ rời server — đây là thứ chứng minh callback thuộc đúng lần bấm nút.
    "code_verifier" VARCHAR(128) NOT NULL,
    -- Chống replay `id_token` (OIDC). Facebook không dùng, vẫn sinh để một đường code chạy chung.
    "nonce" VARCHAR(64) NOT NULL,

    -- `?next=` ĐÃ qua `isSafeNextPath` trước khi ghi. Lưu bản đã kiểm, không phải bản thô: một
    -- giá trị chưa kiểm nằm trong DB là một open redirect đang chờ ai đó tin nó.
    "redirect_next" VARCHAR(512),

    -- `web` | `native`. Đợt này luôn `web`; cột có sẵn để app native (ADR 0017) chỉ là thêm
    -- nhánh phát one-time code, không phải một migration nữa.
    "client" VARCHAR(10) NOT NULL DEFAULT 'web',

    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    -- Khác NULL = đã đổi lấy phiên. Gửi lại cùng `state` ⇒ SOCIAL_STATE_INVALID.
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- UNIQUE là ĐIỀU KIỆN để "dùng một lần" đúng, không phải để tra cứu cho nhanh.
--
-- `consume()` chạy `UPDATE … WHERE state = $1 AND consumed_at IS NULL` rồi kiểm số hàng đúng
-- bằng 1. Phép đó chỉ là atomic khi `state` xác định nhiều nhất MỘT hàng: thiếu unique thì hai
-- callback gửi song song cùng một `state` có thể cùng thấy `consumed_at IS NULL` và cùng đi
-- tiếp — tức một mã đánh cắp vẫn đổi được phiên.
CREATE UNIQUE INDEX "oauth_states_state_key" ON "public"."oauth_states"("state");

-- Dọn hàng hết hạn theo lô. Không màn hình nào đọc bảng này, nên đây là index duy nhất cần.
CREATE INDEX "oauth_states_expires_at_idx" ON "public"."oauth_states"("expires_at");

-- Hai cột chỉ nhận tập giá trị đóng. CHECK ở DB vì bảng này được ghi bởi đúng một service
-- nhưng được ĐỌC bởi nhánh quyết định "phát cookie hay phát one-time code" — một giá trị lạ ở
-- cột `client` là một nhánh không ai viết.
ALTER TABLE "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_provider_check"
    CHECK ("provider" IN ('google', 'facebook'));

ALTER TABLE "public"."oauth_states"
    ADD CONSTRAINT "oauth_states_client_check"
    CHECK ("client" IN ('web', 'native'));
