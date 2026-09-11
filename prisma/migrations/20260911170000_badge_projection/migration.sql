-- ═══════════════════════════════════════════════════════════════════════════
-- Huy hiệu (chuông + chat) — chiếu sang Firestore, và làm phép đếm rẻ đi (11/09/2026)
--
-- Bài toán: badge được HỎI liên tục (mỗi tab, mỗi vài chục giây) nhưng chỉ ĐỔI khi có sự
-- kiện thật. Chi phí đang bám theo số tab đang mở thay vì số việc đang xảy ra. Migration này
-- sửa cả hai đầu:
--
--   1. `user_badge_signals` — hàng đợi "huy hiệu của người này vừa đổi". API ghi một dòng
--      trong cùng transaction với sự kiện gốc; worker chiếu sang `user_badges/{uid}` trên
--      Firestore để client NGHE thay vì HỎI. Writer Firestore vẫn duy nhất là worker (ADR 0009).
--
--   2. Ba index MỘT PHẦN cho chính ba phép đếm đó. Trước migration này, đếm tin chưa đọc của
--      một gian hàng là `SUM(unread_tenant_count)` trên MỌI hội thoại của gian hàng — cột cần
--      cộng không nằm trong index nào nên Postgres phải đọc heap từng dòng. Một gian hàng chạy
--      hai năm có hàng chục nghìn hội thoại, và câu trả lời gần như luôn là 0.
--
-- ⚠ Ba index dưới đây `schema.prisma` KHÔNG diễn đạt được (mệnh đề `WHERE` và `INCLUDE`), nên
--   migration Prisma tự sinh lần sau sẽ có lệnh DROP chúng — giống các khoá ngoại tổ hợp mà
--   header của migration init đã cảnh báo. Đọc kỹ SQL Prisma sinh ra và giữ lại phần viết tay.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Hàng đợi chiếu huy hiệu ─────────────────────────────────────────────
-- Một dòng / người (user_id LÀ khoá chính): mười sự kiện trong một giây gộp thành đúng một
-- lượt chiếu. Không có cột "đã xử lý" — worker XOÁ dòng sau khi chiếu xong, nên bảng này luôn
-- chỉ to bằng số người đang có việc dở, không phải số sự kiện đã từng xảy ra.
CREATE TABLE "public"."user_badge_signals" (
    "user_id"  CHAR(26)       NOT NULL,
    "dirty_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badge_signals_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX "user_badge_signals_dirty_at_idx" ON "public"."user_badge_signals" USING btree ("dirty_at");

ALTER TABLE "public"."user_badge_signals"
    ADD CONSTRAINT "user_badge_signals_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. Index cho phép đếm chưa đọc ─────────────────────────────────────────
-- `INCLUDE` mang theo đúng những cột mà phép đếm cần đọc, nên Postgres trả lời bằng
-- index-only scan, không chạm heap. `WHERE … > 0` giữ index chỉ chứa dòng CÒN chưa đọc —
-- trạng thái bình thường của một hộp thư là rỗng, và index rỗng thì quét gần như miễn phí.
--
-- Phía gian hàng có thêm `customer_user_id` trong INCLUDE vì hộp thư công việc loại các hội
-- thoại mà chính người đó là khách (ChatService.inboxWhere) — thiếu cột đó là scan lại rơi
-- xuống heap đúng ở bước cuối.
CREATE INDEX "conversations_tenant_unread_idx"
    ON "public"."conversations" USING btree ("tenant_id")
    INCLUDE ("unread_tenant_count", "customer_user_id")
    WHERE ("unread_tenant_count" > 0);

CREATE INDEX "conversations_customer_unread_idx"
    ON "public"."conversations" USING btree ("customer_user_id")
    INCLUDE ("unread_customer_count")
    WHERE ("unread_customer_count" > 0);

-- Chuông: `COUNT(*) WHERE user_id = ? AND read_at IS NULL`. Index `(user_id, read_at,
-- created_at)` có sẵn vẫn phải đi qua mọi thông báo ĐÃ đọc của người đó — và tỷ lệ đã/chưa đọc
-- chỉ có một chiều theo thời gian.
CREATE INDEX "notifications_user_unread_idx"
    ON "public"."notifications" USING btree ("user_id")
    WHERE ("read_at" IS NULL);
