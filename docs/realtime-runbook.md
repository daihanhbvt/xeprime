# Realtime (chat + huy hiệu) — kiểm và chẩn đoán

Ngày: 11/09/2026 · Kiến trúc: ADR 0009 (chat) và ADR 0034 (huy hiệu)

Tài liệu này trả lời đúng một câu hỏi: **realtime có đang chạy không, và nếu không thì hỏng ở
chặng nào.** Nó không mô tả thiết kế — phần đó ở hai ADR trên.

## 1. Đường đi, và vì sao hỏng ở đây rất khó thấy

```
gửi tin / phát thông báo / đổi thành viên
  → PostgreSQL (nguồn sự thật) + message_outbox + user_badge_signals   ← cùng một transaction
  → worker: outbox pump (2s) · chiếu huy hiệu (3s)
  → Firestore: conversations/{id}/messages · user_badges/{uid}
  → Security Rules
  → onSnapshot ở client
  → client gọi REST để lấy nội dung thật, rồi vẽ
```

Hỏng ở bất kỳ chặng nào **không** tạo ra lỗi nhìn thấy được. Chat và huy hiệu đều có đường dự
phòng REST, nên triệu chứng duy nhất là **độ trễ**: người gửi thấy tin ngay (bản lạc quan), người
nhận đợi tới nhịp hỏi lại kế tiếp.

Đường dự phòng đó là **graceful degradation, không phải một cấu hình hợp lệ để chạy lâu dài.** Nó
tồn tại để một sự cố Firebase không làm hỏng việc đặt xe. Bỏ qua bước đẩy rules rồi coi "vẫn chạy
mà" là chấp nhận vĩnh viễn cả độ trễ lẫn chi phí mà kiến trúc này sinh ra để loại bỏ.

## 2. Kiểm ở máy dev

Chạy đủ ba tiến trình (`pnpm dev` — turbo chạy cả api, web và worker). Chỉ bật api + web thì
không có gì chiếu bản badge, và badge sẽ chỉ đổi theo nhịp lưới an toàn.

| Kiểm | Kỳ vọng |
| --- | --- |
| Console trình duyệt | **Không** có dòng `[XePrime] …` |
| Network, lọc `/me/badges` | hai request cách nhau **~120s** (không nghe được thì ~30s) |
| Network, lọc `firestore.googleapis.com` | có một request `Listen/channel` treo dài |
| Nhờ người khác nhắn một tin | badge đổi trong khoảng vài giây, không đợi nhịp poll |

Console ở dev in ra đúng chặng đang hỏng:

| Dòng log | Chặng hỏng |
| --- | --- |
| `[XePrime] Chat realtime KHÔNG bật — …` | token / `signInWithCustomToken`. Rules không liên quan |
| `[XePrime] realtime "chat thread" lỗi → …` | listener thread bị từ chối hoặc rớt |
| `[XePrime] realtime "badge" lỗi → …` | listener `user_badges` bị từ chối — hay gặp nhất là rules chưa đẩy |

## 3. Kiểm ở staging / production

**Các dòng `[XePrime]` KHÔNG tồn tại ở đây.** Chúng bị tắt khi `NODE_ENV=production` một cách có
chủ ý: người dùng không cần đọc chẩn đoán nội bộ. Vì vậy quy trình kiểm ở dev **không** áp dụng
nguyên xi — dùng ba nguồn dưới đây.

### 3.1 Sức khoẻ worker (nguồn đáng tin nhất)

```bash
docker compose -p xeprime-<env> -f docker-compose.prod.yml exec worker \
  curl -fsS http://127.0.0.1:4100/health
```

| Trường | Đọc thế nào |
| --- | --- |
| `status` | `ok` hoặc `degraded` (endpoint trả 503 khi degraded) |
| `loops["chiếu huy hiệu"].lastSuccessAgoMs` | vài giây. Lớn hoặc `null` ⇒ vòng lặp không chạy |
| `loops[*].consecutiveFailures` | > 0 kéo dài ⇒ đọc `lastError` rồi xem log |
| `gauges.badgeQueueLagMs` | độ trễ hàng đợi. `null` = rỗng. Vượt 60.000 ⇒ degraded |

`badgeQueueLagMs` là số đo quan trọng nhất và cũng là số đo dễ bị bỏ qua nhất: vòng lặp vẫn báo
thành công đều đặn kể cả khi nó không bao giờ đuổi kịp. "Vòng lặp có chạy không" và "hàng đợi có
vơi không" là hai câu hỏi khác nhau.

### 3.2 Log worker

```bash
docker compose -p xeprime-<env> -f docker-compose.prod.yml logs --tail 200 worker
```

Dòng lúc khởi động nói rõ badge đang ở chế độ nào:

- `… outbox pump + retention + CHIẾU HUY HIỆU đang chạy (FIRESTORE_ENABLED=true).`
- `… FIRESTORE_ENABLED=false → chat chạy Postgres-only và KHÔNG chiếu huy hiệu. Tín hiệu … được GIỮ LẠI …`

Khi có sự cố: `badge: hàng đợi trễ <n>s — huy hiệu đang đứng im với người dùng.` và
`chiếu badge lỗi (user <id>): <thông điệp>`. Log **không bao giờ** chứa token, private key, nội
dung thông báo hay object người dùng — chỉ id và thông điệp lỗi đã cắt.

### 3.3 Network ở trình duyệt

Giống dev: nhịp `/me/badges` (~120s khi nghe được, ~30s khi không) và sự tồn tại của
`firestore.googleapis.com/.../Listen/channel`. Đây là cách duy nhất kiểm phía client ở production.

## 4. Bảng triệu chứng → nguyên nhân

| Triệu chứng | Nguyên nhân thường gặp | Kiểm bằng |
| --- | --- | --- |
| `/me/badges` chạy 30s thay vì 120s | listener badge không sống: rules chưa đẩy cho project đó, hoặc `FIRESTORE_ENABLED=false` | §3.1 log khởi động; Console (dev) |
| Người nhận thấy tin sau ~25s | listener thread bị từ chối (rules) | Console (dev); `Listen/channel` (mọi môi trường) |
| Badge đúng nhưng trễ hàng phút | worker kẹt hoặc hàng đợi dồn | `badgeQueueLagMs` ở §3.1 |
| Badge không bao giờ đổi, `/health` vẫn `ok` | `FIRESTORE_ENABLED=false` — đúng thiết kế, không phải lỗi | log khởi động |
| Badge của một người đứng im, những người khác bình thường | dòng tín hiệu của người đó lỗi bền | `chiếu badge lỗi (user …)` trong log |
| Mọi tầng "chạy" mà không snapshot nào tới | `FIREBASE_PROJECT_ID` ≠ `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | workflow deploy đã chặn từ 11/09/2026 |

## 5. Thứ tự lúc deploy

`deploy/scripts/deploy.sh` chạy theo đúng thứ tự này, và thứ tự là một phần của thiết kế:

1. sao lưu database;
2. pull image;
3. khởi động `db`;
4. **`migrate` (one-shot) — trước mọi tiến trình ứng dụng**;
5. `up -d api web worker caddy`;
6. chờ **api, web và worker** đích danh báo `healthy` (tối đa 150s), thất bại thì dừng.

Firestore rules được đẩy **trước** cả bước 1, từ GitHub Actions — xem `docs/deployment.md` §9.2b.
