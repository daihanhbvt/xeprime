-- ═══════════════════════════════════════════════════════════════════════════
-- Chat — bất biến chống trùng ở TẦNG DATABASE (07/09/2026 — ADR 0009 · CLAUDE.md §6)
--
-- VIẾT TAY, không sinh bằng `prisma migrate dev` — cùng lý do đã ghi ở header của
-- `20260821000000_init/migration.sql`, và vì bước 1 phải HỢP NHẤT dữ liệu cũ trước khi
-- ràng buộc mới có thể tồn tại.
--
-- Hai bất biến, cả hai đều là ràng buộc DB chứ không phải check ở tầng app:
--
--   1. `conversations_customer_vehicle_key` — MỘT hội thoại cho mỗi cặp (khách, xe).
--      Trước đây `getOrCreateFor` là find-then-create: hai request song song (double click,
--      retry, khách bấm "Nhắn shop" đúng lúc gian hàng bấm "Nhắn khách") cùng không thấy gì và
--      cùng tạo — hai bên ngồi nhìn hai hộp thư khác nhau. Postgres coi NULL khác NULL, nên
--      hội thoại không gắn xe KHÔNG bị ràng buộc này gom lại: đúng ý, vì "cùng một xe" mới là
--      danh tính nghiệp vụ của một thread.
--
--   2. `messages_conversation_client_key` — một `client_message_id` chỉ đẻ ra một tin.
--      Gửi lại sau timeout mạng là chuyện thường ngày trên 3G; không có khoá này thì mỗi lần
--      thử lại là một tin trùng nằm vĩnh viễn trong lịch sử. Cột nullable nên mọi tin cũ (và
--      client chưa gửi khoá) không bị ảnh hưởng.
--
-- Bước 1 KHÔNG XOÁ MÙ: hội thoại thừa được hợp nhất vào bản CŨ NHẤT (canonical) — tin nhắn,
-- người tham gia và số chưa đọc chuyển sang trước, chỉ vỏ rỗng mới bị xoá.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Hợp nhất hội thoại trùng (khách, xe) trước khi đặt UNIQUE ────────────

-- Canonical = hội thoại CŨ NHẤT của mỗi cặp. Cũ nhất chứ không phải "nhiều tin nhất": nó là
-- cái mà mọi liên kết đã phát tán ra ngoài (`?c=` trong email/thông báo) đang trỏ tới.
CREATE TEMP TABLE chat_conv_merge AS
SELECT
    c."id"                AS dup_id,
    first_value(c."id") OVER (
        PARTITION BY c."customer_user_id", c."vehicle_id"
        ORDER BY c."created_at", c."id"
    )                     AS canonical_id
FROM "public"."conversations" c
WHERE c."customer_user_id" IS NOT NULL
  AND c."vehicle_id" IS NOT NULL;

DELETE FROM chat_conv_merge WHERE dup_id = canonical_id;

-- Tin nhắn về bản canonical. `sent_at` giữ nguyên nên thứ tự thời gian của thread hợp nhất vẫn đúng.
UPDATE "public"."messages" m
SET "conversation_id" = t.canonical_id
FROM chat_conv_merge t
WHERE m."conversation_id" = t.dup_id;

-- Người tham gia: chuyển những ai canonical CHƯA có, phần còn lại bị `ON DELETE CASCADE` dọn.
-- `last_read_at` lấy mốc MỚI hơn — hợp nhất không được biến tin đã đọc thành chưa đọc.
UPDATE "public"."conversation_participants" p
SET "last_read_at" = GREATEST(
        COALESCE(p."last_read_at", to_timestamp(0)),
        COALESCE(dup."last_read_at", to_timestamp(0))
    )
FROM chat_conv_merge t
JOIN "public"."conversation_participants" dup ON dup."conversation_id" = t.dup_id
WHERE p."conversation_id" = t.canonical_id
  AND p."user_id" IS NOT DISTINCT FROM dup."user_id";

UPDATE "public"."conversation_participants" p
SET "conversation_id" = t.canonical_id
FROM chat_conv_merge t
WHERE p."conversation_id" = t.dup_id
  AND NOT EXISTS (
      SELECT 1 FROM "public"."conversation_participants" keep
      WHERE keep."conversation_id" = t.canonical_id
        AND keep."user_id" IS NOT DISTINCT FROM p."user_id"
  );

-- Denorm của canonical dựng LẠI từ tin nhắn thật, không cộng dồn từ hai bản ghi denorm.
UPDATE "public"."conversations" c
SET "last_message_text" = last_msg."text",
    "last_message_at"   = last_msg."sent_at",
    "last_sender_type"  = last_msg."sender_type"
FROM (
    SELECT DISTINCT ON (m."conversation_id")
           m."conversation_id", m."text", m."sent_at", m."sender_type"
    FROM "public"."messages" m
    ORDER BY m."conversation_id", m."sent_at" DESC, m."id" DESC
) last_msg
WHERE c."id" = last_msg."conversation_id"
  AND c."id" IN (SELECT canonical_id FROM chat_conv_merge);

UPDATE "public"."conversations" c
SET "unread_customer_count" = c."unread_customer_count" + dup_sum.customer_unread,
    "unread_tenant_count"   = c."unread_tenant_count" + dup_sum.tenant_unread
FROM (
    SELECT t.canonical_id,
           SUM(d."unread_customer_count") AS customer_unread,
           SUM(d."unread_tenant_count")   AS tenant_unread
    FROM chat_conv_merge t
    JOIN "public"."conversations" d ON d."id" = t.dup_id
    GROUP BY t.canonical_id
) dup_sum
WHERE c."id" = dup_sum.canonical_id;

DELETE FROM "public"."conversations" WHERE "id" IN (SELECT dup_id FROM chat_conv_merge);

DROP TABLE chat_conv_merge;

-- ── 2. Ràng buộc: một cặp (khách, xe) → một hội thoại ──────────────────────

CREATE UNIQUE INDEX "conversations_customer_vehicle_key"
    ON "public"."conversations" ("customer_user_id", "vehicle_id");

-- ── 3. Idempotency key của tin nhắn ────────────────────────────────────────

ALTER TABLE "public"."messages"
    ADD COLUMN "client_message_id" VARCHAR(64);

CREATE UNIQUE INDEX "messages_conversation_client_key"
    ON "public"."messages" ("conversation_id", "client_message_id");

-- ── 4. Index keyset cho phân trang lịch sử ─────────────────────────────────
--
-- Cursor là CẶP (sent_at, id). Index cũ chỉ có `(conversation_id, sent_at)`, nên nhánh
-- "cùng sent_at, id nhỏ hơn" phải sort — và với thread dài đó là lần đọc chậm nhất của màn chat.
CREATE INDEX "messages_conversation_id_sent_at_id_idx"
    ON "public"."messages" ("conversation_id", "sent_at", "id");

DROP INDEX IF EXISTS "public"."messages_conversation_id_sent_at_idx";
