-- ═══════════════════════════════════════════════════════════════════════════
-- Chat — MỘT hội thoại cho mỗi cặp (khách, GIAN HÀNG) (08/09/2026 — ADR 0009)
--
-- VIẾT TAY vì bước 2 phải HỢP NHẤT dữ liệu trước khi ràng buộc mới tồn tại được.
--
-- Đổi danh tính hội thoại: (khách, XE) → (khách, GIAN HÀNG).
--
-- Khách hỏi ba chiếc xe của cùng một salon vẫn đang nói chuyện với đúng một người bán. Tách theo
-- xe cắt vụn cuộc trò chuyện đó thành ba hộp thư, và cả hai bên phải tự nhớ mình đã nói gì ở đâu
-- — đúng thứ người dùng báo lỗi: cùng một shop mà hiện thành nhiều dòng trong danh sách.
--
-- Ngữ cảnh xe KHÔNG mất đi, nó chuyển xuống từng tin nhắn (`messages.vehicle_id`) dưới dạng thẻ
-- đính kèm: câu đầu tiên gửi từ một tin đăng mang theo id xe đó, giao diện vẽ thẻ, bấm vào mở
-- tin đăng. Nhờ vậy một thread nói về nhiều xe mà vẫn rõ từng câu đang hỏi chiếc nào.
--
-- KHÔNG XOÁ MÙ: mọi tin nhắn được giữ nguyên và được GẮN NHÃN xe của hội thoại cũ trước khi hợp
-- nhất, nên lịch sử sau khi gộp vẫn đọc được đúng ngữ cảnh từng câu.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Ngữ cảnh xe theo TỪNG TIN NHẮN ──────────────────────────────────────

ALTER TABLE "public"."messages"
    ADD COLUMN "vehicle_id" CHAR(26);

ALTER TABLE "public"."messages"
    ADD CONSTRAINT "messages_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "messages_vehicle_id_idx" ON "public"."messages" ("vehicle_id");

-- Backfill TRƯỚC khi gộp — đây là lần cuối còn biết tin nào thuộc xe nào.
UPDATE "public"."messages" m
SET "vehicle_id" = c."vehicle_id"
FROM "public"."conversations" c
WHERE m."conversation_id" = c."id"
  AND c."vehicle_id" IS NOT NULL;

-- ── 2. Hợp nhất hội thoại trùng cặp (khách, gian hàng) ─────────────────────

-- Canonical = hội thoại CŨ NHẤT của mỗi cặp: nó là cái mà mọi liên kết đã phát tán ra ngoài
-- (`?c=` trong email/thông báo) đang trỏ tới.
CREATE TEMP TABLE chat_shop_merge AS
SELECT
    c."id"                AS dup_id,
    first_value(c."id") OVER (
        PARTITION BY c."customer_user_id", c."tenant_id"
        ORDER BY c."created_at", c."id"
    )                     AS canonical_id
FROM "public"."conversations" c
WHERE c."customer_user_id" IS NOT NULL;

DELETE FROM chat_shop_merge WHERE dup_id = canonical_id;

UPDATE "public"."messages" m
SET "conversation_id" = t.canonical_id
FROM chat_shop_merge t
WHERE m."conversation_id" = t.dup_id;

-- Người tham gia: giữ mốc đã đọc MỚI hơn — gộp không được biến tin đã đọc thành chưa đọc.
UPDATE "public"."conversation_participants" p
SET "last_read_at" = GREATEST(
        COALESCE(p."last_read_at", to_timestamp(0)),
        COALESCE(dup."last_read_at", to_timestamp(0))
    )
FROM chat_shop_merge t
JOIN "public"."conversation_participants" dup ON dup."conversation_id" = t.dup_id
WHERE p."conversation_id" = t.canonical_id
  AND p."user_id" IS NOT DISTINCT FROM dup."user_id";

UPDATE "public"."conversation_participants" p
SET "conversation_id" = t.canonical_id
FROM chat_shop_merge t
WHERE p."conversation_id" = t.dup_id
  AND NOT EXISTS (
      SELECT 1 FROM "public"."conversation_participants" keep
      WHERE keep."conversation_id" = t.canonical_id
        AND keep."user_id" IS NOT DISTINCT FROM p."user_id"
  );

UPDATE "public"."conversations" c
SET "unread_customer_count" = c."unread_customer_count" + dup_sum.customer_unread,
    "unread_tenant_count"   = c."unread_tenant_count" + dup_sum.tenant_unread
FROM (
    SELECT t.canonical_id,
           SUM(d."unread_customer_count") AS customer_unread,
           SUM(d."unread_tenant_count")   AS tenant_unread
    FROM chat_shop_merge t
    JOIN "public"."conversations" d ON d."id" = t.dup_id
    GROUP BY t.canonical_id
) dup_sum
WHERE c."id" = dup_sum.canonical_id;

DELETE FROM "public"."conversations" WHERE "id" IN (SELECT dup_id FROM chat_shop_merge);

DROP TABLE chat_shop_merge;

-- ── 3. Denorm dựng LẠI từ tin nhắn thật ────────────────────────────────────
--
-- Chạy cho MỌI hội thoại, không riêng bản vừa gộp: `conversations.vehicle_id` vừa đổi nghĩa từ
-- "xe của hội thoại" thành "xe được nhắc tới gần nhất", nên giá trị cũ chỉ đúng một cách tình cờ.
UPDATE "public"."conversations" c
SET "last_message_text" = last_msg."text",
    "last_message_at"   = last_msg."sent_at",
    "last_sender_type"  = last_msg."sender_type",
    "vehicle_id"        = COALESCE(last_ctx."vehicle_id", c."vehicle_id")
FROM (
    SELECT DISTINCT ON (m."conversation_id")
           m."conversation_id", m."text", m."sent_at", m."sender_type"
    FROM "public"."messages" m
    ORDER BY m."conversation_id", m."sent_at" DESC, m."id" DESC
) last_msg
LEFT JOIN LATERAL (
    SELECT m2."vehicle_id"
    FROM "public"."messages" m2
    WHERE m2."conversation_id" = last_msg."conversation_id"
      AND m2."vehicle_id" IS NOT NULL
    ORDER BY m2."sent_at" DESC, m2."id" DESC
    LIMIT 1
) last_ctx ON true
WHERE c."id" = last_msg."conversation_id";

-- ── 4. Đổi ràng buộc danh tính ─────────────────────────────────────────────

DROP INDEX IF EXISTS "public"."conversations_customer_vehicle_key";

CREATE UNIQUE INDEX "conversations_customer_tenant_key"
    ON "public"."conversations" ("customer_user_id", "tenant_id");
