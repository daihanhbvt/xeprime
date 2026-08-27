# ADR 0009 — Chat: Firestore là projection realtime, PostgreSQL là nguồn sự thật

Ngày: 27/07/2026 · Trạng thái: Accepted (thiết kế; hiện thực ở Phase 5 đợt Chat) · Áp dụng ở Phase 5

## Bối cảnh

Chat cần realtime (khách ↔ shop ↔ support), nhưng chi phí Firestore tính theo lượt đọc: một client "listen toàn bộ tin nhắn" là hoá đơn tăng tuyến tính theo lưu lượng. CLAUDE.md và `xeprime_build_plan_nextjs_nestjs_prod.md` §9.3 đã ghi nguyên tắc "Firestore giữ 30–100 tin gần nhất, Postgres giữ metadata + archive", nhưng chưa chốt thành ADR: ai được ghi, đồng bộ hai kho thế nào khi một bên lỗi, đặt file ở đâu, và ai là nguồn cho báo cáo.

Bảng chat (`conversations`, `conversation_participants`, `message_archive`) đã thiết kế ở `xeprime_database_design.md` §15 nhưng chưa hiện thực (module `ChatModule` mới là skeleton). ADR này chốt kiến trúc trước khi code, để hiện thực không phải quay lại sửa nền.

## Quyết định

### 1. PostgreSQL là single source of truth

Mọi dữ liệu chat — `conversations`, thành viên hội thoại, **toàn bộ** tin nhắn, đính kèm, trạng thái đã đọc — sống ở PostgreSQL. Firestore là dữ liệu **rebuildable**: mất/dựng lại được từ Postgres, không phải kho báo cáo. Mọi truy vấn nghiệp vụ và báo cáo (admin, thống kê, tra cứu) chạy trên Postgres, **không** trên Firestore.

### 2. Firestore chỉ là projection realtime của tin gần nhất

Client **chỉ** listen ~30–50 tin mới nhất của thread đang mở (`orderBy(sentAt) + limit`) và danh sách hội thoại — không bao giờ listen toàn bộ tin. Lịch sử cũ phân trang bằng **cursor từ Postgres** (`GET /conversations/:id/messages?before=…`), không kéo từ Firestore.

Không xoá ngay tin thứ 31: giữ tin gần nhất theo **retention cấu hình được** (theo thời gian/số lượng) và dọn bằng **job định kỳ**, để cuộn lên một chút vẫn mượt mà không phải chạm Postgres.

### 3. Chỉ backend Node được ghi; đồng bộ bằng outbox/retry

Chỉ backend (Firebase Admin SDK) được tạo hội thoại, đổi thành viên, ghi/archive. Client **không** ghi thẳng Firestore. Đồng bộ Postgres → Firestore qua **outbox + retry**: tin nhắn ghi vào Postgres trong transaction cùng một bản ghi outbox; một worker đẩy outbox sang Firestore và retry tới khi thành công — **không mất tin** khi một trong hai kho lỗi tạm thời.

### 4. Security Rules + emulator test

Mirror thành viên hội thoại sang Firestore để **Firestore Security Rules** chặn đọc/ghi trái phép (chỉ thành viên đọc được thread của mình; client không ghi được). Rules đi kèm **emulator test** cho các case đọc/ghi trái phép — rule không có test là rule chưa tồn tại. Backend vẫn là lớp bảo vệ chính (guard), Rules là lớp thứ hai cho đường realtime trực tiếp.

### 5. Đính kèm ở Cloudflare R2

File chat lưu ở **Cloudflare R2**; Postgres và Firestore chỉ giữ **metadata** (URL, tên, kích thước, loại) — không nhồi nhị phân vào message.

## Hệ quả

- Cần dựng Firebase Admin trên backend cho Firestore (tái dùng credential env `FIREBASE_*` đang có ở `token-verifier.ts`), một `FirestoreService`, worker outbox, và job retention. Đây là phần lớn nhất của Phase 5 — nên tách thành đợt Chat riêng, sau đợt Notification + Review.
- Đổi lại: chi phí Firestore bị chặn trần (chỉ tin gần nhất), realtime vẫn mượt, và mọi báo cáo/khôi phục dựa trên một nguồn Postgres đáng tin.
- `AdminNote.targetType` đã liệt kê `conversation`; module chat khi làm phải tôn trọng nguồn-sự-thật-Postgres này khi admin ghi chú vào hội thoại.

## Test bắt buộc ở đợt Chat

1. Client chỉ đọc được thread mình là thành viên (emulator test Security Rules — case trái phép bị từ chối).
2. Client không ghi được Firestore trực tiếp (chỉ backend ghi).
3. Firestore lỗi tạm thời → tin vẫn nằm ở Postgres + outbox, retry đẩy sang sau, không mất.
4. Cuộn lịch sử cũ phân trang từ Postgres đúng thứ tự, không phụ thuộc Firestore.
