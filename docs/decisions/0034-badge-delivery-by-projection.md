# ADR 0034 — Huy hiệu đi bằng bản chiếu, không bằng nhịp hỏi lại

Ngày: 11/09/2026 · Trạng thái: Accepted · Mở rộng ADR 0009 sang một projection thứ hai

> **Sửa đổi cùng ngày (bản làm chặt để đưa lên production).** Bản đầu tiên của ADR này mô tả một
> thiết kế đúng hướng nhưng có bốn chỗ không chịu được tải và một chỗ nói sai hành vi thật. Các
> điều 3, 7, 8, 9, 10 dưới đây là bản đã sửa; phần bị thay thế được ghi rõ tại chỗ.

## Bối cảnh

Khung ứng dụng có bốn con số "đang đợi tôi": thông báo chưa đọc (chuông), tin chưa đọc ở hộp thư
khách, tin chưa đọc ở hộp thư gian hàng, và yêu cầu đặt xe chờ duyệt. Chúng hiện ở **mọi trang**,
nên cách lấy chúng quyết định một phần đáng kể tải nền của cả hệ thống.

Bản trước lấy bằng nhịp hỏi lại, mỗi con số một endpoint riêng:

| Endpoint | Nhịp |
| --- | --- |
| `GET /conversations/unread-summary` | 30s có realtime · **8s** không |
| `GET /conversations/unread-count?side=…` | 30s · **8s** |
| `GET /notifications/unread-count` | 60s |

Ba vấn đề, và chỉ vấn đề thứ ba là thứ nhìn thấy được trên màn hình:

1. **Trùng dữ liệu.** `unread-summary` đã trả cả `customer` lẫn `shop`; `unread-count?side=…`
   chạy song song để hỏi lại đúng một trong hai con số đó.
2. **Chi phí bám theo SỐ TAB, không theo số việc.** Một vòng badge ở cổng quản lý là ~7 câu truy
   vấn: mỗi request qua guard một lần (tra `users`), mỗi request tự giải lại danh sách gian hàng
   của người đó, rồi mới cộng. Nhân với số tab đang mở, không nhân với số tin nhắn thật sự tới.
3. **Phép đếm không có index phục vụ nó.** `SUM(unread_tenant_count)` của một gian hàng phải đọc
   heap từng hội thoại vì cột cần cộng không nằm trong index nào. Một gian hàng chạy hai năm có
   hàng chục nghìn hội thoại, và câu trả lời gần như luôn là `0`. Đây là thứ không "chậm dần" —
   nó vẫn nhanh cho tới khi bảng vượt khỏi cache của Postgres, rồi hỏng đột ngột.

## Quyết định

### 1. Một endpoint gộp cho toàn bộ huy hiệu của khung ứng dụng

`GET /me/badges` trả `{ chatCustomer, chatShop, notificationsUnread }` — một lần qua guard, một
lần giải membership, các phép đếm chạy song song. Không có tham số nào: phạm vi suy từ phiên và
membership, người không thuộc gian hàng nào luôn nhận `0`.

Ba endpoint cũ **giữ nguyên** cho app native (ADR 0031: hai app hai tầng gọi API riêng). Web
không còn dùng chúng.

### 2. Số yêu cầu đặt xe chờ duyệt KHÔNG vào endpoint này

Nó bị thu hẹp theo chi nhánh đang chọn — một lựa chọn chỉ tồn tại ở client (Redux `scope.branchId`).
Một con số toàn tài khoản sẽ nói khác danh sách mà người dùng mở ra ("huy hiệu báo 5, inbox có 2"),
và đó là lỗi tệ hơn hẳn một request mỗi phút. Nó giữ query riêng, đúng scope của màn hình nó dẫn tới.

### 3. Đường CHÍNH là bản chiếu Firestore; hỏi lại tụt xuống vai lưới an toàn

Mở rộng đúng khuôn ADR 0009 sang một projection thứ hai:

- API ghi `user_badge_signals` (một dòng / người, khoá chính là `user_id`) trong **cùng transaction**
  với sự kiện gốc — gửi tin, đánh dấu đã đọc, phát thông báo;
- worker đọc hàng đợi đó, tính lại và ghi `user_badges/{uid}` trên Firestore;
- client `onSnapshot` document của chính mình và ghi thẳng vào cache TanStack Query.

Postgres vẫn là nguồn sự thật; Firestore vẫn chỉ là dữ liệu dựng lại được; writer vẫn duy nhất là
worker. Cái đổi là **chi phí bám vào đâu**: mười nghìn tab mở mà không ai nhắn gì thì không phát
sinh gì cả.

Nhịp hỏi lại còn **120s khi đang nghe được** và **30s khi không** (trước là 8s). Không bỏ hẳn lưới
an toàn: "đăng nhập được Firebase" và "đường ống projection còn sống" là hai điều khác nhau — đúng
bài học đã ghi trong `use-thread.ts`.

### 4. Phép đếm có đúng MỘT bản hiện thực

`computeUserBadges` ở `@xeprime/prisma` (cùng lý do với `enqueuePushDeliveries` — API và worker là
hai tiến trình, worker cố ý không kéo runtime Nest vào). `ChatService` gọi lại chính nó cho
`unread-count`/`unread-summary`, và dùng chung `chatInboxScope` cho định nghĩa "hội thoại nào là
của tôi". Hai bản sao của một phép đếm là hai con số sẽ lệch nhau — và triệu chứng là badge nhấp
nháy giữa hai giá trị mỗi lần đổi nguồn, thứ gần như không ai truy ra được.

### 5. Index một phần cho đúng ba phép đếm đó

`conversations_tenant_unread_idx`, `conversations_customer_unread_idx`,
`notifications_user_unread_idx` — có `WHERE` (chỉ chứa dòng CÒN chưa đọc) và `INCLUDE` (mang theo
cột cần cộng), nên Postgres trả lời bằng index-only scan. Trạng thái bình thường của một hộp thư là
rỗng, và index rỗng thì quét gần như miễn phí.

`schema.prisma` không diễn đạt được cả hai mệnh đề này, nên chúng là SQL viết tay và migration
Prisma sinh ra lần sau sẽ có lệnh DROP chúng — cùng loại bẫy mà header của migration init đã cảnh báo.

### 6. ~~Tắt Firestore thì DỌN tín hiệu~~ → thay bằng điều 8

Bản đầu cho worker chạy với writer `null` và **xoá** tín hiệu khi `FIRESTORE_ENABLED=false`. Điều
đó sai theo một hướng không nhìn thấy được: document Firestore cũ vẫn nằm nguyên trên cloud, và
lúc bật cờ lại nó sẽ thắng lượt đọc REST đầu tiên của client — badge hiện con số của tuần trước
cho tới nhịp lưới an toàn kế tiếp. Xem điều 8.

### 7. Tín hiệu có SỐ HIỆU, không so bằng mốc thời gian

Bản đầu cho worker xoá tín hiệu bằng cách so `dirty_at` với mốc nó đã đọc, và đánh dấu bằng
`updateMany` rồi `createMany(skipDuplicates)`. Hai chỗ hỏng dưới tải:

- `timestamptz(3)` chỉ mịn tới mili-giây. Hai sự kiện trùng mili-giây nằm hai bên lượt `SELECT`
  của worker trông y hệt nhau ⇒ câu xoá khớp và sự kiện thứ hai **biến mất** — badge của người đó
  đứng im cho tới sự kiện kế tiếp.
- Hai transaction cùng tạo tín hiệu ĐẦU TIÊN cho một người: cả hai `updateMany` trúng 0 dòng, rồi
  bên thua bị `skipDuplicates` nuốt trong im lặng.

Thay bằng **một** câu `INSERT … ON CONFLICT DO UPDATE` tăng `revision` ngay trong SQL, và worker
chỉ xoá khi `revision` còn đúng bản đã lấy. Danh sách id được `sort()` trước khi ghi: Postgres khoá
theo thứ tự xuất hiện trong `VALUES`, nên hai tin nhắn đồng thời chạm cùng tập người theo hai thứ
tự khác nhau là một deadlock có thật. `dirty_at` được giữ nhưng đổi vai — chỉ để xếp thứ tự và đo
độ trễ hàng đợi.

### 8. Tắt Firestore thì GIỮ tín hiệu; bật lại thì drain, kèm backfill lúc boot

Khi `FIRESTORE_ENABLED=false`, vòng lặp chiếu **không được đăng ký** và tín hiệu ở lại hàng đợi.
Nó không phình theo sự kiện vì khoá chính là `user_id`: trần của bảng là số người đang có việc dở.
Bật lại ⇒ worker chiếu đúng những gì đã đổi trong quãng tắt.

Phần mà hàng đợi không phủ được — thay đổi xảy ra TRƯỚC khi tính năng tồn tại, hoặc trước lần
rollout đầu — do `backfillBadgeSignals` lo, chạy MỘT lượt lúc worker khởi động khi Firestore bật.
Nó chỉ xếp hàng người đang có con số khác 0, nên chi phí bám theo số người có việc chứ không theo
tổng tài khoản, và nó idempotent nên chạy lại mỗi lần khởi động là chấp nhận được. Đây là điều
thay cho một bước deploy bằng tay — thứ sẽ bị quên.

### 9. Client tin LISTENER, không tin tầng xác thực

Bản đầu (và cả `use-thread` từ trước đó) chọn nhịp "có realtime" dựa trên `ChatRealtimeContext.ready`,
mà `ready` chỉ chứng minh `signInWithCustomToken` thành công. Rules chưa đẩy thì listener bị từ chối
ngay từ đầu, client vẫn tin mình đang realtime, và **người nhận đợi trọn nhịp thưa** (25 giây ở
thread, 120 giây ở badge). Đó chính là triệu chứng "chat không realtime" đã gặp.

`useRealtimeSubscription` phân biệt bốn trạng thái — `disabled` / `connecting` / `live` / `error` —
và nhịp thưa CHỈ được dùng ở `live`, tức là listener của chính bề mặt đó đã nhận một snapshot **từ
server**. Snapshot `fromCache` không tính: nó chứng minh trình duyệt còn nhớ, không chứng minh
đường ống còn sống. Lỗi ⇒ rơi về đường dự phòng ngay, log nguyên nhân ở development, rồi thử lại
với backoff mũ + jitter.

### 10. `asOf` quyết định ai thắng khi hai nguồn nói khác nhau

`GET /me/badges` trả thêm `asOf` (mốc máy chủ sau khi đếm), và bản chiếu mang `updatedAt` (mốc
worker). Cả hai là đồng hồ máy chủ nên so được. Bản có mốc lớn hơn thắng, và điều đó đóng cả hai
chiều đua: một document cũ không đè được lượt đọc REST mới, và một response REST khởi hành trước
nhưng về sau không đè được bản chiếu mới. So theo thứ tự đến thì cả hai chiều đều để lọt, và hậu
quả kéo dài tới hai phút.

### 11. Mọi nguồn làm đổi badge đều phải đánh dấu, kể cả nguồn GIÁN TIẾP

Chat và thông báo đổi con số một cách hiển nhiên nên chúng được nhớ tới. Thay đổi **thành viên
gian hàng** thì không: không có tin nhắn mới, không có thông báo mới, chỉ là phạm vi hộp thư công
việc của một người vừa rộng ra hoặc hẹp lại. Ba đường đó — tạo gian hàng, nhận lời mời (gồm cả
kích hoạt lại người từng bị gỡ), gỡ thành viên — đều đánh dấu trong CÙNG transaction.

Không đánh dấu ở hai đường không đổi badge, và đó là quyết định chứ không phải bỏ sót:
`updateRole` (badge không phụ thuộc `roleKey`) và `tenant.status` (`chatInboxScope` chỉ lọc theo
membership, không lọc theo trạng thái gian hàng). Nếu sau này `chatInboxScope` thêm lọc
`tenant.status`, thì khoá/mở gian hàng phải đánh dấu cho toàn bộ thành viên.

### 12. Worker phải CHỨNG MINH được là còn làm việc

Worker không phục vụ request nào, nên `restart: unless-stopped` chỉ bắt được trường hợp tiến trình
chết. Nó có `/health` nội bộ (cổng 4100, chỉ loopback) trả 503 khi một vòng lặp quan trọng im lặng
quá ngưỡng của chính nó, hoặc khi hàng đợi chiếu huy hiệu trễ quá một phút — vòng lặp chạy đều mà
không đuổi kịp thì badge vẫn đứng im, và chỉ nhìn "vòng lặp có chạy không" sẽ không thấy điều đó.
`docker-compose.prod.yml` gắn healthcheck, và `deploy.sh` yêu cầu api/web/worker đích danh báo
`healthy` — trước đây worker không có healthcheck nên cột Health rỗng và nó **không bao giờ** bị
kiểm.

### 13. Advisory lock chạy trên kết nối riêng

`pg_try_advisory_lock` là khoá cấp session. Bản cũ gọi lock và unlock qua hai `prisma.$queryRaw`
riêng, mà Prisma không hứa hai lệnh đi qua cùng một kết nối vật lý — rơi vào hai kết nối thì
`pg_advisory_unlock` trả `false` trong im lặng và job đó **không bao giờ chạy lại** trên tiến trình
này. Worker giờ dùng một pool `pg` riêng: lock, `fn`, unlock đều trên một session, và kết nối hỏng
thì bị huỷ thay vì trả về pool (Postgres nhả khoá khi session đóng).

## Hệ quả

- Ở cổng quản lý, một tab đi từ ~4 request/phút (và ~7 truy vấn mỗi vòng 8 giây) xuống 1 request
  mỗi 2 phút khi bản chiếu sống. Với ~900 tab đồng thời, đó là chênh lệch giữa ~90 req/s và dưới
  10 req/s — cho đúng cùng một trải nghiệm.
- Độ trễ badge **ở tải bình thường**: khoảng 3 giây (nhịp worker 3s + một lượt chiếu). Đây KHÔNG
  phải một SLA: lô chiếu xử lý tối đa 100 người mỗi lượt với 8 luồng song song, nên một trận
  fan-out lớn (tin nhắn vào gian hàng đông người, hoặc một đợt thông báo hàng loạt) sẽ đẩy con số
  đó lên. Ngưỡng "trễ quá một phút là hỏng" ở health check là ranh giới giữa *bận* và *đứng*.
- Thao tác của chính người dùng (đọc thông báo, mở hộp thư) không đợi vòng đó — client invalidate
  ngay tại chỗ, rồi hoà giải với bản chiếu sau.
- Thêm một bảng hàng đợi phải được dọn, và một document Firestore mỗi người. Đổi lại là một bức
  tường scaling bị gỡ trước khi ai đó chạm vào nó lúc 2 giờ sáng.
- Hộp thư gian hàng dùng bộ đếm CHUNG (`unread_tenant_count`), nên một sự kiện đánh dấu bẩn cho
  toàn đội. Đó là chi phí thật của một con số dùng chung, không phải một lỗi cần tối ưu.

## Điều kiện xem lại

- Nếu bỏ Firebase khỏi kiến trúc: đường chiếu chuyển sang SSE (`@Sse` của Nest). Khi đó phải có
  pub/sub (Redis) TRƯỚC khi chạy quá một instance API — một event bus trong tiến trình sẽ chỉ đánh
  thức những tab đang nối vào đúng instance vừa nhận request.
- Nếu số hội thoại của một gian hàng vượt xa dự phòng của index một phần (hàng trăm nghìn dòng
  CÒN chưa đọc), bước tiếp theo là bộ đếm phi chuẩn hoá một dòng/người, cập nhật trong cùng
  transaction + job đối soát hằng đêm. Chưa cần ở quy mô hiện tại.

## Test bắt buộc

1. Phép đếm loại đúng hội thoại mà chính chủ shop đứng vai khách (`badge-projection.test.ts`).
2. Tín hiệu tới TRONG LÚC đang chiếu không bị xoá oan — mất tín hiệu nghĩa là badge đứng im vĩnh viễn.
3. Nhiều lượt đánh dấu ĐỒNG THỜI cho cùng một người: một dòng, và `revision` đếm đủ mọi lượt.
4. Lỗi Firestore của một người không chặn những người còn lại trong lô.
5. Tắt Firestore: tín hiệu tích lại theo NGƯỜI (không theo sự kiện), bật lại là drain hết.
6. Gửi tin / đánh dấu đã đọc thật sự ghi tín hiệu (`chat.spec.ts`) — nếu không, cả đường ống chạy
   đúng trên một hàng đợi vĩnh viễn rỗng mà không test nào đỏ.
7. Vào/rời gian hàng ghi tín hiệu trong cùng transaction, và một `accept` THẤT BẠI không để lại
   tín hiệu nào (`badge-membership.spec.ts`).
8. Hai instance cạnh tranh advisory lock: chỉ một chạy, và `pg_locks` sạch sau cả lượt thành công
   lẫn lượt ném lỗi (`advisory-lock.test.ts`).
9. Ba nơi đọc badge ở web chỉ tạo đúng một request (`use-badges.test.tsx`).
10. `asOf` quyết định cả hai chiều đua REST ↔ snapshot (`use-badges.test.tsx`).
11. Auth Firebase thành công nhưng listener bị từ chối ⇒ rơi về nhịp dày NGAY, không đợi nhịp thưa
    (`use-thread-polling.test.tsx`) — đây là bài test khoá đúng lỗi đã gặp.
12. Rules: chính chủ đọc được `user_badges/{uid}`, người khác và khách vãng lai thì không, và
    client không ghi được kể cả document của chính mình (`firebase/rules.test.mjs`).
