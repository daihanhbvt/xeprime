-- ═══════════════════════════════════════════════════════════════════════════
-- Dọn bản chiếu chat trên Firestore mà không ĐỌC Firestore (20/10/2026)
--
-- Bài toán: job retention cũ tìm tin cần xoá bằng `orderBy(sentAt desc).offset(50).get()` trên
-- Firestore. Firestore tính một lượt ĐỌC cho MỖI document bị `offset` bỏ qua, và vì Postgres
-- không biết tin nào đã được dọn, mọi hội thoại từng vượt 50 tin bị quét lại MỖI GIỜ — 50 lượt
-- đọc/hội thoại/giờ để không xoá gì. Kèm `take: 500` không có `orderBy`, nên hội thoại thứ 501
-- trở đi không bao giờ được dọn.
--
-- Cách mới: `messages.firebase_message_id` là dấu "document này ĐANG nằm trên Firestore" —
-- outbox pump đặt nó sau khi ghi, retention xoá nó về NULL sau khi xoá document. Postgres tự
-- trả lời được "tin nào còn trên Firestore", và worker xoá theo đúng id: chỉ tốn lượt XOÁ, không
-- tốn lượt đọc nào.
--
-- Index dưới đây chỉ chứa phần projection CÒN SỐNG (mỗi hội thoại tối đa keep + slack dòng), nên
-- cả hai câu của retention — tìm hội thoại vượt ngưỡng và liệt kê tin cần xoá — đều chạy trên một
-- index có kích thước bám theo số hội thoại, không theo tổng số tin đã từng gửi.
--
-- Lần đầu sau migration: job cũ chưa bao giờ xoá dấu, nên lúc tạo index nó chứa MỌI tin từng
-- được chiếu. Vài lượt retention đầu "xoá lại" phần tràn lịch sử — phần lớn là document đã bị
-- job cũ xoá rồi (no-op, vẫn tính lượt xoá; 20.000 lượt/ngày miễn phí). Xong lượt dọn đó, nếu
-- bảng đã lớn thì `REINDEX INDEX CONCURRENTLY "messages_firestore_projection_idx"` để B-tree co
-- lại. `CREATE INDEX` thường (không CONCURRENTLY) khoá ghi `messages` trong lúc dựng — chấp
-- nhận được ở cỡ bảng hiện tại, như các index một phần khác của repo.
--
-- ⚠ `schema.prisma` KHÔNG diễn đạt được mệnh đề `WHERE`, nên migration Prisma tự sinh lần sau
--   sẽ có lệnh DROP index này — cùng loại bẫy mà header của migration init đã cảnh báo. Đọc kỹ
--   SQL Prisma sinh ra và giữ lại phần viết tay.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX "messages_firestore_projection_idx"
    ON "public"."messages" USING btree ("conversation_id", "sent_at", "id")
    WHERE ("firebase_message_id" IS NOT NULL);
