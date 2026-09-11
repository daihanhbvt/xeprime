# Thông báo đẩy (Firebase Cloud Messaging)

> Ngày viết: 10/09/2026 · Phạm vi: hạ tầng backend đầy đủ + app native ở mức nhận được thông báo
> và bấm vào mở đúng màn. **Chưa** có trung tâm thông báo trên app (xem §9).

---

## 1. Kiến trúc — vì sao không gọi FCM trong request

```
Sự kiện nghiệp vụ  (đặt xe, duyệt yêu cầu, tin nhắn, tiền về…)
   │
   ├─ ghi `notifications`      ← MỘT dòng cho MỖI người nhận, có `read_at` riêng
   └─ ghi `push_deliveries`    ← MỘT dòng cho MỖI thiết bị đang bật của những người đó
   │      (cả hai trong CÙNG transaction nghiệp vụ)
   ▼
 COMMIT
   ▼
apps/worker  ─ mỗi 5 giây ─►  chiếm dòng tới hạn (FOR UPDATE SKIP LOCKED)
   │                          ─► Firebase Admin Messaging ─► FCM ─► máy người dùng
   └─ cập nhật sent / retry / failed, và TẮT thiết bị khi token chết
```

Ba quyết định, và mỗi cái trả lời một câu hỏi cụ thể:

**Vì sao có bảng giao vận thay vì gọi FCM ngay?** Vì đặt xe và gửi tin nhắn không được hỏng khi
Firebase đang lỗi. Một lời gọi mạng tới Google bên trong transaction đặt xe biến sự cố của
Firebase thành sự cố đặt xe. Đây đúng khuôn `message_outbox` của chat (ADR 0009 §3).

**Vì sao không tạo `Notification` thứ hai với `channel: 'push'`?** Vì hộp thư của người dùng sẽ
hiện mọi thứ hai lần. Một sự kiện = một dòng hộp thư cho mỗi người; `push_deliveries` chỉ trả lời
"dòng đó đã tới máy nào, lần thứ mấy, hỏng vì gì".

**Vì sao `PUSH_ENABLED=false` không ghi gì cả?** Vì nếu vẫn ghi, ngày bật cờ lên sẽ là ngày người
dùng nhận một trận thông báo tồn đọng của mấy tuần trước. Đăng ký thiết bị thì VẪN chạy khi cờ
tắt — thiết bị đăng ký trước, bật sau.

Đích của thông báo (`data.url`) được giải **lúc phát** và đóng băng vào `notifications.data_json`.
Nó phải như vậy vì cùng một `targetType: booking` dẫn tới `/trips/:id` khi người nhận là khách và
`/manage/bookings/:id` khi là nhân viên gian hàng — chỉ nơi phát mới biết điều đó. Luật ở
`packages/domain/src/notification-delivery.ts`, dùng chung với app native.

---

## 2. Việc người vận hành phải làm trong Firebase Console

Dùng lại **đúng project Firebase đang phục vụ chat** (ADR 0009) — cùng service account, cùng
credential. Không tạo bộ mới.

### 2.1 Bật FCM và cấp quyền cho service account

1. Google Cloud Console → **APIs & Services** → bật **Firebase Cloud Messaging API**
   (tên đầy đủ: `fcm.googleapis.com`). Nếu chưa bật, mọi lần gửi trả `messaging/authentication-error`.
2. IAM → service account đang dùng cho `FIREBASE_CLIENT_EMAIL` → thêm vai trò
   **Firebase Cloud Messaging API Admin** (hoặc `Firebase Admin SDK Administrator Service Agent`
   nếu tài khoản đã có sẵn).
3. Private key (`FIREBASE_PRIVATE_KEY`) **chỉ nằm ở backend và worker**. Không bao giờ đưa vào app
   native, web, hay bất kỳ bundle nào tới tay người dùng.

### 2.2 Android — `google-services.json`

Firebase Console → **Project settings** → **Your apps** → Add app → Android:

- **Package name** phải TRÙNG TỪNG KÝ TỰ với `android.package` trong `apps/mobile/app.json`:
  `vn.xeprime.mobile`. Sai một ký tự thì app đăng ký token thành công nhưng không nhận được gì.
- Tải `google-services.json` → đặt vào `apps/mobile/credentials/google-services.json`.

### 2.3 iOS — `GoogleService-Info.plist` + khoá APNs

1. Add app → iOS, **Bundle ID** = `vn.xeprime.mobile` (khớp `ios.bundleIdentifier`).
2. Tải `GoogleService-Info.plist` → `apps/mobile/credentials/GoogleService-Info.plist`.
3. Apple Developer → **Keys** → tạo key có bật **Apple Push Notifications service (APNs)** →
   tải file `.p8` (**chỉ tải được MỘT lần**).
4. Firebase Console → Project settings → **Cloud Messaging** → mục **Apple app configuration** →
   upload `.p8`, kèm **Key ID** và **Team ID**.
   Thiếu bước này thì iOS không nhận thông báo nào, và không có lỗi nào hiện ra ở app.

> ⚠️ Hai file trên **KHÔNG được commit** (`apps/mobile/.gitignore`). Chúng khai project Firebase
> nào; một bản trong repo nghĩa là mọi bản build của mọi môi trường đều bắn thông báo vào cùng
> một nơi. Giao chúng qua kênh bí mật của môi trường (EAS secret file, artifact CI đã mã hoá).

### 2.4 Tách môi trường

Mỗi môi trường (dev · staging · production) là **một Firebase project riêng**, nên cũng là một cặp
file credential riêng và một `FIREBASE_*` riêng. `apps/mobile/app.config.ts` đọc đường dẫn từ
`GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICES_PLIST` để CI trỏ tới file vừa giải mã ra, thay vì phải
sửa code.

Tối thiểu cần cho giai đoạn này: **staging chạy được mà không phá local**. Ai làm local thì trỏ
vào project dev của mình; không dùng chung token/project giữa các môi trường.

---

## 3. Cấu hình backend

| Biến | Ở đâu | Ý nghĩa |
| --- | --- | --- |
| `PUSH_ENABLED` | API + worker | `false` (mặc định): vẫn nhận đăng ký thiết bị, KHÔNG tạo `push_deliveries`, worker không đăng ký vòng lặp gửi. `true`: bật cả hai. |
| `FIREBASE_PROJECT_ID` · `FIREBASE_CLIENT_EMAIL` | API + worker | Định danh, không phải bí mật → GitHub **Variable**. |
| `FIREBASE_PRIVATE_KEY` | API + worker | **Secret**. Một dòng, xuống dòng viết `\n`. |

Bắt buộc lúc boot khi `FIRESTORE_ENABLED=true` **hoặc** `PUSH_ENABLED=true` — hai cờ độc lập, một
bộ credential. Bật push mà tắt chat realtime là cấu hình hợp lệ.

Trên môi trường đã triển khai, đặt giá trị ở **GitHub Environment**, không sửa tay trên VPS
(`docs/deployment.md` §9.2 — file env bị workflow ghi đè ở lần deploy kế tiếp).

---

## 4. API

### `POST /notifications/device-token`

Đăng ký (hoặc cập nhật) thiết bị. **Idempotent** — app gọi sau mỗi lần đăng nhập và mỗi lần FCM
xoay token.

```jsonc
// Request
{
  "provider": "fcm",          // bỏ trống = "fcm"
  "token": "<registration token>",
  "platform": "android",      // android | ios
  "appVersion": "0.1.0",
  "deviceName": "Pixel 8"
}

// Response — CỐ Ý không có `token`
{
  "data": {
    "id": "01J8XK2M5N7P9Q1R3S5T7V9W1X",
    "provider": "fcm",
    "platform": "android",
    "enabled": true,
    "deviceName": "Pixel 8",
    "lastSeenAt": "2026-09-10T08:00:00.000Z",
    "pushEnabled": false        // cờ PUSH_ENABLED của server
  }
}
```

`userId` và `sessionId` **lấy từ phiên**, không nhận từ body: một client gửi được `userId` là một
client đăng ký được thiết bị đứng tên người khác rồi nhận mọi thông báo của họ.

### `DELETE /notifications/device-token`

```jsonc
{ "token": "<registration token>" }   // bỏ trống body = tắt mọi thiết bị của PHIÊN hiện tại
// Response: { "data": { "deleted": 1 } }
```

Chỉ tắt được thiết bị **của chính mình** (`userId` nằm trong mệnh đề WHERE).

App native **không cần gọi endpoint này khi đăng xuất**: `/auth/mobile/logout` thu hồi phiên, và
`NativeSessionService.revokeSession` tắt mọi thiết bị của phiên đó trong cùng transaction.

---

## 5. Ma trận sự kiện → người nhận → đích

| Sự kiện | Người nhận | `targetType` | Đích (khách) | Đích (quản lý) |
| --- | --- | --- | --- | --- |
| Yêu cầu thuê mới | thành viên gian hàng | `booking_request` | — | `/manage/requests` |
| Yêu cầu sắp hết hạn (20'/45') | thành viên gian hàng | `booking_request` | — | `/manage/requests` |
| Yêu cầu được duyệt | khách | `booking` | `/trips/:bookingId` | — |
| Yêu cầu bị từ chối | khách | `booking_request` | `/trips/:requestId` | — |
| Khách rút yêu cầu | thành viên gian hàng | `booking_request` | — | `/manage/requests` |
| Yêu cầu hết hạn phản hồi | **cả hai bên** (hai câu khác nhau) | `booking_request` | `/trips/:requestId` | `/manage/requests` |
| Tự động nhận chuyến | khách + gian hàng | `booking` / `booking_request` | `/trips/:id` | `/manage/bookings/:id` |
| Đơn thuê được tạo | thành viên gian hàng (trừ người tạo) | `booking` | — | `/manage/bookings/:id` |
| Đơn đổi trạng thái (kể cả huỷ) | gian hàng + khách | `booking` | `/trips/:id` | `/manage/bookings/:id` |
| Cần chuyển giữ chỗ | khách | `booking_request` | `/trips/:requestId` | — |
| Đã giữ chỗ (tiền về) | khách + gian hàng | `booking` | `/trips/:bookingId` | `/manage/bookings/:id` |
| Hết hạn giữ chỗ | khách + gian hàng | `booking_request` | `/trips/:requestId` | `/manage/requests` |
| Đã hoàn giữ chỗ | khách | `booking` | `/trips/:id` | — |
| Xe được duyệt / từ chối | chủ gian hàng | `vehicle` | — | `/manage/vehicles/:id` |
| Gian hàng được duyệt / từ chối | chủ gian hàng | `tenant` | — | `/manage/shop` |
| Vòng đời gói (sắp hết hạn, hết hạn, chuyển tuyến…) | thành viên gian hàng | — | — | (không có đích) |
| Đánh giá mới | thành viên gian hàng | `review` | `/trips` | — |
| **Tin nhắn mới** | phía đối diện (không bao giờ người gửi) | `conversation` | `/chat/:id` | `/chat/:id` |

Sự kiện nào cũng chỉ đi qua `NotificationService` / `apps/worker/src/lib/notify.ts` — **không có
API riêng cho từng loại thông báo**.

Chat có ba luật riêng vì nội dung là riêng tư:
- không bao giờ báo cho người gửi;
- không báo cho thành viên gian hàng đang là KHÁCH của chính thread đó (hộp thư gian hàng không
  liệt kê thread ấy, nên thông báo dẫn tới nó là một ngõ cụt);
- tiêu đề/nội dung dừng ở "Bạn có tin nhắn mới" / "Mở XePrime để xem tin nhắn" — thông báo hiện ở
  màn khoá và đi qua log của hệ điều hành.

---

## 6. Payload gửi đi

`notification`: `title` + `body` (đã địa phương hoá lúc phát).
`data` — **chỉ ba trường, toàn bộ là string**, không PII, không số tiền:

| Khoá | Ví dụ |
| --- | --- |
| `notificationId` | `01J8XK…` |
| `type` | `booking_request_submitted` |
| `url` | `/manage/requests` |

Ngoài ra: `android.priority` / `apns-priority` theo `pushPriority()`, `collapseKey` /
`apns-collapse-id` / `thread-id` theo `pushCollapseKey()` (gộp theo hội thoại với chat, theo đơn
với cập nhật trạng thái), và `android.notification.channelId` theo `androidChannelFor()`.

> **Hạn chế đã biết:** app native chưa TẠO hai kênh Android (`xeprime-operations`,
> `xeprime-messages`). SDK của Firebase rơi về kênh dự phòng của nó, nên thông báo vẫn hiện —
> chỉ là chưa tách được âm báo giữa chat và tin về đơn. Tạo kênh thật cần
> `@notifee/react-native`; **không** dùng `expo-notifications` cho việc này vì nó giành
> `FirebaseMessagingService` trên Android với `@react-native-firebase/messaging`. Thuộc đợt sau,
> cùng trung tâm thông báo (§9).

---

## 7. App native

Đã có (đợt này):

- xin quyền (Android 13+ `POST_NOTIFICATIONS`, iOS APNs) đúng một lần mỗi phiên chạy;
- đăng ký token **sau khi đã đăng nhập**, đăng ký lại khi FCM xoay token;
- app đang mở → toast; app ở nền/đã tắt → hệ điều hành hiện thông báo;
- bấm thông báo → điều hướng theo `data.url`, qua allowlist
  (`src/features/notifications/deep-link.ts`). Chưa đăng nhập thì URL được cất vào
  `pendingDeepLink` và tiêu thụ sau khi đăng nhập.

**Thông báo đẩy thật KHÔNG chạy trong Expo Go.** Phải là development build:

```bash
pnpm --filter @xeprime/mobile run android      # expo run:android
pnpm --filter @xeprime/mobile run ios          # expo run:ios
```

Thiếu file credential thì `app.config.ts` bỏ hẳn plugin Firebase và in một dòng cảnh báo — app
vẫn build, vẫn chạy, chỉ là không có thông báo đẩy.

---

## 8. Thử thật (smoke test)

```bash
pnpm push:smoke -- --user-email khach.an@xeprime.test
```

Script gửi tới **thiết bị đang bật gần nhất** của người đó, bằng **đúng sender của production**:

- title `XePrime`, body `Thông báo thử nghiệm đã hoạt động`, `data.url = /trips`;
- **từ chối chạy khi `APP_ENV=production`** (mặc định của biến này là `production`, nên một máy
  không khai gì cũng bị chặn). Ép chạy: `--allow-production`;
- KHÔNG ghi `notifications`, KHÔNG tạo `push_deliveries` — đây là phép thử hạ tầng, không phải
  một sự kiện nghiệp vụ, và nó không để lại rác trong hộp thư của ai;
- KHÔNG in token (chỉ 6 ký tự đuôi), KHÔNG in lỗi gốc của FCM (message của FCM có nhánh chứa
  nguyên registration token) — chỉ in mã lỗi đã phân loại.

Trình tự kiểm trên máy thật:

1. build dev app, đăng nhập, cho phép thông báo;
2. kiểm tra backend đã nhận token — **không cần và không được in token**:
   ```sql
   SELECT p.platform, p.device_name, p.enabled, p.last_seen_at
     FROM push_devices p JOIN users u ON u.id = p.user_id
    WHERE u.email = 'khach.an@xeprime.test';
   ```
3. chạy lệnh trên;
4. xác nhận thông báo hiện khi app **đang mở** (toast), **ở nền** (khay), và **đã tắt hẳn**;
5. bấm vào thông báo → app mở `/trips`.

### Kiểm tra hàng đợi khi có nghi ngờ

```sql
SELECT status, last_error_code, count(*)
  FROM push_deliveries
 WHERE created_at > now() - interval '1 hour'
 GROUP BY 1, 2;
```

| `last_error_code` | Nghĩa | Xử lý |
| --- | --- | --- |
| `token_unregistered` | người dùng gỡ app / khôi phục máy | bình thường; thiết bị đã tự tắt |
| `token_invalid` | token sai định dạng hoặc **sai project** | kiểm `google-services.json` có đúng project không |
| `provider_auth` | service account thiếu quyền / FCM API chưa bật | §2.1 |
| `provider_unavailable` | Google 5xx hoặc quota | tự thử lại, backoff mũ, tối đa 8 lần |
| `expired` | quá `expires_at` trước khi tới lượt | đúng thiết kế — tin có đồng hồ đếm ngược không gửi muộn |

---

## 9. Còn lại cho đợt sau (app native)

Cố ý **không** làm trong đợt này:

- trung tâm thông báo (danh sách, đánh dấu đã đọc, lọc) — COM-04;
- badge số chưa đọc;
- màn cài đặt bật/tắt từng loại thông báo;
- refetch hộp thư khi nhận push;
- UX xin quyền (màn giải thích trước khi hiện hộp thoại hệ thống);
- đo đếm tỉ lệ nhận/mở;
- tạo kênh Android thật (§6);
- **gộp thông báo chat trong HỘP THƯ.** `pushCollapseKey` đã gộp trên khay, nhưng
  `GET /notifications` vẫn là một dòng mỗi tin nhắn: một hội thoại 30 tin là 30 dòng "Bạn có tin
  nhắn mới" giống hệt nhau cho mỗi thành viên gian hàng. Cố ý chưa xử lý ở đợt này vì cách sửa
  rẻ nhất — tái dùng một hàng `notifications` chưa đọc — lại đụng unique
  `(notification_id, push_device_id)` và làm tắt luôn push cho các tin sau. Việc này thuộc về
  COM-04, nơi có UI hộp thư để quyết định đúng.

Phía backend còn **một** việc chưa làm, và nó là việc của thời gian chứ không của tính năng:
`push_deliveries` sinh một dòng cho mỗi (thông báo × thiết bị) và **không có job dọn**. Bảng sẽ
phình theo lượng thông báo đã gửi. Chưa cấp bách ở quy mô hiện tại (index hàng đợi là index MỘT
PHẦN nên truy vấn nóng không chậm đi), nhưng cần một lượt dọn `sent`/`failed` cũ hơn N ngày —
đặt cùng chỗ với `apps/worker/src/jobs/retention.ts`.

---

## Liên quan

- `docs/decisions/0009-chat-firestore-projection.md` — Firebase trong XePrime, và vì sao ghi đi
  qua outbox chứ không thẳng.
- `docs/third-party-keys.md` §6 — lấy credential Firebase.
- `docs/deployment.md` §9.2 — khai biến ở GitHub Environment.
- `docs/mobile-module-status.md` — COM-07 và phần còn lại của module Communication.
- `docs/mobile-badges-notifications-migration.md` — **COM-04**: hợp đồng API và kiến trúc đích
  cho trung tâm thông báo + huy hiệu trên app native (viết 11/09/2026 sau khi web chuyển sang
  `GET /me/badges` và bản chiếu `user_badges/{uid}`).
