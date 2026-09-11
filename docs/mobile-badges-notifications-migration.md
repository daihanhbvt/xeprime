# Mobile — huy hiệu và trung tâm thông báo: tài liệu chuyển tiếp

Ngày: 11/09/2026 · Kiến trúc nguồn: ADR 0009 (chat realtime) · ADR 0034 (huy hiệu) · ADR 0031
(mỗi app một tầng gọi API) · ADR 0017 (auth native)

Tài liệu này được viết từ **code và OpenAPI hiện tại**, không phải từ dự định. Nó dành cho đợt
mobile sau; đợt hiện tại chỉ sửa backend và web.

**Điều quan trọng nhất trước khi đọc tiếp: không có contract nào bị phá.** Mọi endpoint mobile
đang gọi vẫn còn nguyên và vẫn trả đúng hình dạng cũ. Web ngừng gọi ba endpoint, backend giữ
chúng. Mobile hiện tại chạy được mà không cần sửa gì.

Nhưng **một endpoint đã đổi NỘI DUNG** (không đổi hình dạng): `GET /notifications` không còn liệt
kê tin nhắn chat — xem §A. Nếu bạn đang làm dở phần chat/thông báo thì đọc **§0** trước.

---

## 0. Đang làm dở chat/notification ngay lúc này? Đọc đúng mục này

**Không có gì của app native hỏng sau khi merge.** Tôi không sửa một dòng nào trong `apps/mobile/`,
và mọi endpoint mobile đang gọi vẫn trả đúng hình dạng cũ. Cụ thể, mobile hiện chỉ gọi
`POST /notifications/device-token` (`src/api/notifications/api.ts:23`) và
`GET /conversations/unread-count` (`src/api/chat/api.ts:90`) — cả hai **không đổi**.

Ba thứ cần biết trước khi rebase:

**1. Một giả định có thể vừa hết đúng.** Nếu bạn đang dựng trung tâm thông báo và định cho tin
nhắn chat hiện trong đó thì phần đó không còn đúng — xem cảnh báo ở §A. Push chat thì không đổi.

**2. Xung đột git sẽ nằm ở file SINH RA, không phải code bạn viết.** Ba chỗ hay đụng nhất:

| File | Vì sao đụng | Cách gỡ |
| --- | --- | --- |
| `packages/types/src/api.generated.ts` · `packages/types/openapi.json` | Sinh từ OpenAPI, tôi đã sinh lại vì có endpoint mới | **Đừng merge tay.** Lấy nguyên bản của `develop`, rồi chạy `pnpm contract` |
| `packages/api-client/src/query-keys.ts` | Tôi thêm nhánh `badges` | Giữ CẢ HAI nhánh; chúng độc lập |
| `prisma/schema.prisma` · `prisma/migrations/` | Tôi thêm bảng `user_badge_signals` + cột `revision` | Migration là file mới, không sửa file cũ — giữ cả hai, rồi `pnpm db:deploy` |

Sau khi rebase xong, chạy theo đúng thứ tự này trước khi kết luận có lỗi:

```bash
pnpm install
pnpm --filter @xeprime/prisma --filter "./packages/*" -r build   # dist/ bị gitignore
pnpm db:deploy
```

Rất nhiều lỗi "module not found" / "thiếu export" sau rebase chỉ là do thiếu bước build thứ hai.

**3. Thứ bạn CÓ THỂ dùng ngay, không phải chờ đợt migration.** `queryKeys.badges.me()` đã có ở
`@xeprime/api-client`, và `GET /me/badges` đã chạy trên `develop`. Nếu đang cần một con số chưa
đọc cho app-shell thì gọi thẳng nó thay vì dựng tạm bằng `/conversations/unread-count` rồi phải
gỡ ra sau — nó chính là đích đến ở §C và §D.

Riêng phần realtime (Firestore listener) thì **chưa nên làm trong đợt này**: nó cần
`@react-native-firebase/auth` + `firestore` và một native build, xem §C.

## A. "API đổi" và "web đổi cách dùng" là hai chuyện khác nhau

| Endpoint | Trạng thái | Ảnh hưởng mobile |
| --- | --- | --- |
| `GET /me/badges` | **MỚI** (11/09/2026) | Chưa dùng. Đây là đích đến cho badge của app-shell |
| `GET /conversations/unread-count?side=…` | **Giữ nguyên**, web ngừng gọi | `chatApi.unreadCount` vẫn chạy y như cũ |
| `GET /conversations/unread-summary` | **Giữ nguyên**, web ngừng gọi | `chatApi.unreadSummary` đã khai nhưng chưa có nơi gọi |
| `GET /notifications/unread-count` | **Shape giữ nguyên, NỘI DUNG đổi** ⚠️ | Không còn đếm thông báo tin nhắn chat |
| `GET /notifications` | **Shape giữ nguyên, NỘI DUNG đổi** ⚠️ | Không còn liệt kê thông báo tin nhắn chat |
| `PATCH /notifications/{id}/read` · `POST /notifications/mark-all-read` | **Giữ nguyên** (có từ Phase 5) | Mobile chưa từng gọi |
| `POST` · `DELETE /notifications/device-token` | **Giữ nguyên** | Mobile đang dùng `POST`; chưa dùng `DELETE` |
| `POST /chat/firebase-token` | **Giữ nguyên** | Đã khai ở `src/api/chat/api.ts:139`, **chưa nơi nào gọi** |

**Không DTO nào đổi hình dạng.** Nhưng hai endpoint đổi *nội dung*, và đó là thứ một tài liệu
contract dễ nói thiếu:

### ⚠️ Tin nhắn chat KHÔNG còn xuất hiện ở trung tâm thông báo (11/09/2026)

`GET /notifications` và `GET /notifications/unread-count` giờ **lọc bỏ** loại
`chat_message_received` (danh sách `BELL_HIDDEN_NOTIFICATION_TYPES` ở `@xeprime/types`).

Lý do sản phẩm: biểu tượng chat đã mang số chưa đọc và mở ra là thấy đúng hội thoại; một dòng
"Bạn có tin nhắn mới" trong chuông không thêm thông tin gì, lại đẩy những thứ THẬT SỰ cần xử lý
(yêu cầu thuê sắp hết hạn, giữ chỗ quá hạn) xuống dưới.

Ba hệ quả mobile **phải** biết:

1. **Bản ghi `notifications` vẫn được tạo** cho mỗi tin nhắn — cố ý. `push_deliveries` tham chiếu
   tới nó, nên nếu chặn ở khâu ghi thì **thông báo đẩy của chat trên app native sẽ tắt theo**.
   Việc lọc chỉ xảy ra ở khâu ĐỌC.
2. Vì vậy **push chat vẫn chạy y như cũ**. Người dùng vẫn được rung máy khi có tin, chỉ là mở
   trung tâm thông báo ra thì không thấy một danh sách tin nhắn trùng lặp.
3. Nếu đang dựng trung tâm thông báo và **định hiển thị tin nhắn trong đó** — dừng lại, đó không
   còn là hành vi của backend. Muốn đổi luật này thì sửa ở một chỗ duy nhất
   (`BELL_HIDDEN_NOTIFICATION_TYPES`), đừng lọc/thêm lại ở client.

`notificationsUnread` trong `GET /me/badges` dùng **đúng** bộ lọc đó — bắt buộc phải khớp, vì lệch
một chút là chuông báo 3 mà mở ra thấy 1, và con số đó không bao giờ về 0 được.

### Dự kiến deprecate (KHÔNG phải bây giờ)

`GET /conversations/unread-count` và `GET /conversations/unread-summary` sẽ được cân nhắc gỡ
**chỉ sau khi** mọi phiên bản mobile còn được hỗ trợ đã chuyển sang `/me/badges`. Thứ tự ở §F.
Không gỡ trong đợt này, và không đặt lịch gỡ trước khi có số liệu phiên bản đang dùng.

---

## B. Hai dạng response, và dạng nào app thật sự nhìn thấy

Envelope HTTP thật là `{ "data": … }` (CLAUDE.md §9), nhưng `getApiClient()` của
`@xeprime/api-client` **bóc lớp đó ra**. Mọi ví dụ dưới đây ghi cả hai.

### `GET /me/badges`

```jsonc
// trên dây
{ "data": { "chatCustomer": 2, "chatShop": 5, "notificationsUnread": 3, "asOf": 1757600000000 } }
```

```ts
// sau khi getApiClient() bóc envelope
const badges = await getApiClient().get<UserBadges>('/me/badges');
// { chatCustomer: 2, chatShop: 5, notificationsUnread: 3, asOf: 1757600000000 }
```

Kiểu **không được viết tay** — nó đã có trong contract sinh từ OpenAPI (ADR 0007/0031):

```ts
import type { components } from '@xeprime/types';
type UserBadges = components['schemas']['UserBadgesDto'];
```

Ý nghĩa từng trường:

| Trường | Nghĩa |
| --- | --- |
| `chatCustomer` | Tin chưa đọc ở hộp thư KHÁCH của tôi |
| `chatShop` | Tin chưa đọc ở hộp thư GIAN HÀNG, gộp mọi gian hàng tôi là thành viên active. Đây là bộ đếm DÙNG CHUNG: một nhân viên đọc là cả đội hết chưa đọc |
| `notificationsUnread` | Thông báo in-app chưa đọc |
| `asOf` | Mốc máy chủ (epoch ms) lúc đếm. **Bắt buộc dùng** khi có cả REST lẫn realtime — xem §C.4 |

`GET /me/badges` **không** chứa số yêu cầu đặt xe chờ duyệt: con số đó bị thu hẹp theo chi nhánh
đang chọn, một trạng thái chỉ tồn tại ở client (ADR 0034 điều 2). Mobile giữ nguyên
`bookingRequestsApi.list({ status, limit: 1 }).meta.total` như hiện tại.

### Trung tâm thông báo

| Endpoint | Query / body | Schema trả về |
| --- | --- | --- |
| `GET /notifications` | `unreadOnly?: boolean` · `page?: number` (min 1, mặc định 1) · `limit?: number` (min 1, **max 50**, mặc định 20) | `NotificationPageDto` = `{ data: NotificationDto[], meta: PaginationMetaDto }` |
| `PATCH /notifications/{id}/read` | — | `NotificationReadResultDto` = `{ id, readAt }` |
| `POST /notifications/mark-all-read` | — | `{ updated: number }` |
| `GET /notifications/unread-count` | — | `NotificationUnreadCountDto` = `{ count }` |
| `POST /notifications/device-token` | `RegisterPushDeviceDto` | `PushDeviceDto` |
| `DELETE /notifications/device-token` | — | (mobile chưa dùng; logout native đã tự tắt thiết bị) |

`NotificationDto`: `id`, `type`, `title` bắt buộc; `body`, `targetType`, `targetId`, `readAt`
nullable; `createdAt` bắt buộc.

### Chat (không đổi)

`POST /chat/firebase-token` · `GET /conversations/unread-count?side=…` ·
`GET /conversations/unread-summary` · `GET|POST /conversations/{id}/messages` ·
`POST /conversations/{id}/read`.

`ChatUnreadSummaryDto` = `{ customer, shop, total }` — **khác tên trường** với `UserBadgesDto`
(`chatCustomer`/`chatShop`). Đừng map nhầm khi chuyển.

---

## C. Kiến trúc đích cho mobile

### C.1 Dùng native module, không dùng Firebase JS SDK

Mobile đã có `@react-native-firebase/app` và `@react-native-firebase/messaging` (`^26.4.0`), và
`app.config.ts` chỉ nạp plugin khi có `google-services.json` / `GoogleService-Info.plist`. Cần
thêm **`@react-native-firebase/auth`** và **`@react-native-firebase/firestore`**, dùng chung
default app đang phục vụ Messaging.

**Không** thêm package `firebase` (JS SDK) vào React Native: nó chạy được nhưng đi qua đường
WebChannel thay vì native, và mobile sẽ có hai cấu hình Firebase phải giữ đồng bộ.

### C.2 Luồng realtime

```
POST /chat/firebase-token           →  { enabled, token }
auth().signInWithCustomToken(token) →  uid = user id ở Postgres
firestore().doc(`user_badges/${uid}`).onSnapshot(...)
firestore().collection(`conversations/${id}/messages`)...onSnapshot(...)
```

Security Rules dùng `request.auth.uid`, nên `uid` phải đúng là user id của Postgres — đó chính là
thứ `POST /chat/firebase-token` mint ra.

### C.3 Project phải khớp môi trường

`google-services.json` (Android) và `GoogleService-Info.plist` (iOS) phải trỏ **cùng project** với
`FIREBASE_PROJECT_ID` của backend môi trường đó. Lệch nhau thì mọi tầng đều "chạy" và không
snapshot nào bao giờ tới — workflow deploy đã chặn trường hợp lệch giữa backend và web, nhưng
**không thể** kiểm file native của app.

Expo Go **không đủ** (native module): phải kiểm bằng development build hoặc native build.

### C.4 Luật hoà giải giữa REST và realtime — copy nguyên từ web

Đây là phần dễ làm sai nhất, và web đã trả giá để tìm ra:

1. **Chỉ tin listener, không tin `signInWithCustomToken`.** Đăng nhập Firebase thành công không
   chứng minh listener hoạt động: rules chưa đẩy thì listener bị từ chối ngay mà không có dấu hiệu
   nào. Chỉ hạ nhịp poll khi listener ĐÓ đã nhận một snapshot **từ server**.
2. **Snapshot `fromCache` không tính là "khoẻ"** — nó chứng minh máy còn nhớ, không chứng minh
   backend còn sống. Native SDK có `snapshot.metadata.fromCache` y như web.
3. **Lỗi listener ⇒ rơi về REST NGAY**, rồi thử lại với backoff mũ + jitter.
4. **`asOf` quyết định ai thắng.** Bản chiếu mang `updatedAt` (mốc worker), REST mang `asOf` (mốc
   API) — cả hai là đồng hồ máy chủ. Bản có mốc lớn hơn thắng. So theo thứ tự đến sẽ để lọt cả
   hai chiều: document cũ đè lượt đọc mới, và response cũ đè bản chiếu mới.

Tham chiếu để đọc: `apps/web/src/hooks/use-realtime-subscription.ts` (máy trạng thái) và
`apps/web/src/features/badges/BadgeRealtimeProvider.tsx` (luật `asOf`).

---

## D. Cache và hook cần dựng ở mobile

| Việc | File hiện tại / file mới | Ghi chú |
| --- | --- | --- |
| API client cho badge | **mới** `src/api/badges/api.ts` | Theo khuôn ADR 0031: type alias từ `components['schemas']`, không DTO viết tay |
| Query key | `packages/api-client/src/query-keys.ts` → `queryKeys.badges.me()` | **Đã có**, web đang dùng. Mobile import qua `src/queries/query-keys.ts` |
| `useBadges` | **mới** `src/features/badges/hooks/use-badges.ts` | Một query duy nhất cho cả app-shell |
| Phiên Firebase (auth) | **mới**, singleton | Một lần `signInWithCustomToken` cho cả app, không phải mỗi màn một lần |
| Listener `user_badges/{uid}` | **mới**, MỘT listener toàn app | Không đăng ký trong từng component |
| Danh sách thông báo | **mới** `src/api/notifications/api.ts` (mở rộng file đang có) | Thêm `list`/`markRead`/`markAllRead` cạnh `pushDeviceApi` |
| Badge chuông ở header | **mới** | Đọc từ `useBadges().notificationsUnread` |
| Badge chat phía khách | `src/features/chat/hooks/use-chat.ts:55` (`useChatUnreadCount`) | Hiện là **dead code** — chuyển sang đọc `useBadges().chatCustomer` |
| Badge chat gian hàng | `src/features/shell/use-manage-nav-badges.ts:62` | Đang **hard-code `0`** — thay bằng `useBadges().chatShop` |
| Thread chat realtime | `src/features/chat/hooks/use-thread.ts` (poll 6s, `setInterval`, state cục bộ) | Thay hẳn, không phải thêm một query: messages hiện không nằm trong TanStack cache |
| Dọn cache khi đổi phiên | `src/queries/reset-session-cache.ts` (gọi từ `use-auth.ts:34` và `SessionBoundary.tsx:35`) | **Đã có.** Phải bổ sung: `auth().signOut()` của Firebase + huỷ listener, nếu không badge của tài khoản trước rò sang tài khoản sau |

### AppState

Thread hiện tại đã làm đúng khuôn cần nhân rộng (`use-thread.ts:182-205`): chỉ poll khi
`AppState === 'active'`, và fetch ngay một lượt khi quay lại foreground. Áp đúng luật đó cho
badge; poll chỉ là lưới an toàn, listener là đường chính.

### i18n

`src/i18n/messages.ts` đang gom 28 namespace và **chưa có `Notifications`**. Namespace đó đã tồn
tại ở `packages/domain/messages/{vi,en}/notifications.json` (web thêm 11/09/2026) — mobile chỉ cần
thêm vào bảng gom. Chuỗi riêng của app native vẫn ở `MobileShell`.

---

## E. Trung tâm thông báo trên mobile

Chưa có gì: `src/features/notifications/` chỉ chứa hạ tầng push (`PushBootstrap.tsx`,
`messaging.ts`, `use-push-notifications.ts`, `deep-link.ts`), không có màn hình nào.

Cần dựng:

- danh sách phân trang (`GET /notifications`, `limit` tối đa 50) + bộ lọc "chưa đọc";
- đánh dấu một cái đã đọc / đánh dấu tất cả;
- điều hướng theo `targetType`/`targetId` — **dùng lại** `src/features/notifications/deep-link.ts`
  (`notificationHref`) và luật chung ở `@xeprime/domain/notification-delivery`, không viết bảng map
  thứ hai;
- đồng bộ với push: **push KHÔNG tạo bản ghi thông báo thứ hai**. Dòng `notifications` ở server là
  bản ghi chuẩn; FCM chỉ là một lượt giao tới máy. Nhận push ở foreground có thể hiện toast, còn
  badge và danh sách cập nhật qua bản chiếu (hoặc một lượt refetch);
- **push của tin nhắn chat là ngoại lệ có chủ đích**: nó vẫn rung máy, nhưng bản ghi tương ứng
  KHÔNG nằm trong `GET /notifications` (§A). Bấm vào nó phải mở thẳng hội thoại qua
  `targetType: conversation` — đừng cố tìm nó trong danh sách thông báo rồi kết luận là lỗi.

**Badge của app ≠ badge trên icon của hệ điều hành.** Con số trong header là badge ứng dụng. Badge
trên icon (OS) **không nằm trong phạm vi** tài liệu này và chưa có ở bất kỳ đâu trong repo.

---

## F. Thứ tự rollout và tương thích

1. **Backend** thêm `/me/badges` + bản chiếu, **giữ nguyên** endpoint cũ. ✅ xong 11/09/2026
2. **Web** chuyển sang nguồn mới. ✅ xong 11/09/2026
3. **Mobile** thêm Auth/Firestore native, `/me/badges`, trung tâm thông báo. ⬜
4. **Theo dõi** phiên bản mobile còn gọi `/conversations/unread-*` (log truy cập theo
   `User-Agent`/app version).
5. Chỉ khi không còn phiên bản được hỗ trợ nào gọi chúng ⇒ mới bàn tới việc gỡ.

Trong đợt hiện tại **không gỡ endpoint nào**.

---

## G. Checklist kiểm cho đội mobile

| Tình huống | Kỳ vọng |
| --- | --- |
| Chưa đăng nhập | Không gọi `/me/badges`, không gọi `/chat/firebase-token` |
| Vừa đăng nhập | Bootstrap badge bằng REST trước, listener nối sau |
| Nhận snapshot badge | Header và drawer đổi số, không cần refetch |
| Listener lỗi (rules sai) | Rơi về REST ngay, KHÔNG giữ trạng thái "live", có thử lại |
| App xuống nền | Không poll |
| App trở lại foreground | Refresh ngay một lượt |
| Đăng xuất / đổi tài khoản | Không còn dữ liệu lẫn listener của người trước |
| Web gửi chat → mobile nhận | Trong khoảng vài giây ở đường realtime khoẻ, không phải 6 giây poll |
| Web phát thông báo | `notificationsUnread` tăng, và tin xuất hiện trong danh sách |
| Mark read trên mobile | Web đang mở cũng thấy badge giảm |
| Push deep link | Mở đúng màn ở cả foreground, background và cold start |
| Android và iOS | Dùng đúng Firebase project của môi trường đang build |

---

## H. Bảng thay đổi

| API / tính năng | Trước | Web hiện tại | Mobile hiện tại | Mobile cần sửa ở đâu | Tương thích ngược | Test bắt buộc |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /me/badges` | không có | nguồn duy nhất cho mọi badge | chưa dùng | `src/api/badges/api.ts` (mới), `useBadges` (mới) | — (endpoint mới) | bootstrap khi login; không gọi khi chưa đăng nhập |
| `GET /conversations/unread-count` | badge chat | **ngừng gọi** | `src/api/chat/api.ts:90`, `use-chat.ts:55` (dead code) | chuyển sang `useBadges().chatCustomer` | ✅ backend giữ nguyên | badge khách khớp inbox |
| `GET /conversations/unread-summary` | badge biểu tượng chat | **ngừng gọi** | khai ở `api.ts:101`, chưa dùng | bỏ khi đã dùng `/me/badges` | ✅ | — |
| `GET /notifications/unread-count` | badge chuông, ĐẾM cả tin nhắn | **ngừng gọi** | chưa dùng | không cần dùng | shape ✅, **nội dung đổi** | — |
| `GET /notifications` (+ read, mark-all) | có từ Phase 5, LIỆT KÊ cả tin nhắn | đang dùng (chuông) | **chưa dùng** | trung tâm thông báo (mới) | shape ✅, **nội dung đổi** | phân trang, lọc chưa đọc, mark read |
| Tin nhắn chat trong chuông | có | **đã lọc bỏ** (`BELL_HIDDEN_NOTIFICATION_TYPES`) | chưa dựng chuông | ĐỪNG hiện tin nhắn trong trung tâm thông báo | bản ghi vẫn tạo ⇒ **push chat không đổi** | mở trung tâm thông báo: không có dòng tin nhắn nào |
| Badge chat gian hàng | không có | `useBadges().chatShop` | **hard-code `0`** (`use-manage-nav-badges.ts:62`) | thay bằng `useBadges().chatShop` | không phá gì | số khớp inbox gian hàng |
| Thread chat realtime | poll | listener + REST refetch, nhịp theo trạng thái listener | poll 6s, state cục bộ | thay `use-thread.ts` | không phá gì | người nhận thấy tin trong vài giây |
| `POST /chat/firebase-token` | chỉ web gọi | đang dùng | khai ở `api.ts:139`, chưa gọi | gọi khi khởi tạo phiên Firebase | ✅ | uid khớp user id Postgres |
| Dọn cache khi đổi phiên | — | `resetQueries()` lúc logout | `reset-session-cache.ts` (đã có) | **thêm** `auth().signOut()` + huỷ listener | — | không rò badge giữa hai tài khoản |
| Firestore Rules | chỉ chat | chat + `user_badges/{uid}` | — | không cần sửa (rules ở server) | ✅ | không đọc được badge của người khác |

---

## Tham chiếu

- ADR 0034 — quyết định và các bất biến của huy hiệu.
- `docs/realtime-runbook.md` — cách kiểm realtime còn sống, và bảng triệu chứng → nguyên nhân.
- `docs/push-notifications.md` — vòng đời FCM (phần đã có ở mobile).
- `packages/types/openapi.json` — **nguồn contract chuẩn**. Tài liệu này không chép DTO dài; mọi
  shape lấy từ `components['schemas']`.
