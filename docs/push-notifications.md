# Thông báo đẩy (Firebase Cloud Messaging)

> Ngày viết: 10/09/2026 · Cập nhật: 06/10/2026 (hai app mobile, realm, ma trận theo ADR 0044) · Phạm vi: hạ tầng backend đầy đủ + app native ở mức nhận được thông báo
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

### 2.2 Hai app = hai cặp app Firebase

Từ 25/09/2026 mobile là **hai Expo project mỏng** dùng chung `apps/mobile/shared` (ADR 0051 §5).
Mỗi app có `app.json`, `app.config.ts`, thư mục `credentials/` và `.env` RIÊNG, nên trong MỖI
Firebase project phải đăng ký **2 app Android + 2 app iOS**:

| App | Thư mục | Android `package` / iOS `bundleIdentifier` | Scheme |
| --- | --- | --- | --- |
| XePrime (khách, realm `customer`) | `apps/mobile/customer` | `vn.xeprime.mobile` | `xeprime` |
| XePrime Partner (realm `partner`) | `apps/mobile/manage` | `vn.xeprime.partner` | `xeprimepartner` |

Package name / Bundle ID phải TRÙNG TỪNG KÝ TỰ với `android.package` / `ios.bundleIdentifier` trong
`app.json` của đúng app. Sai một ký tự thì app đăng ký token thành công nhưng không nhận được gì.

### 2.3 Android — `google-services.json`

Firebase Console → **Project settings** → **Your apps** → Add app → Android, làm HAI lần
(`vn.xeprime.mobile` và `vn.xeprime.partner`). Mỗi lần tải một `google-services.json` và đặt vào
thư mục của đúng app:

- `apps/mobile/customer/credentials/google-services.json`
- `apps/mobile/manage/credentials/google-services.json`

(Một file `google-services.json` tải sau khi đã thêm cả hai app chứa cả hai client — dùng chung
được, nhưng vẫn phải chép vào CẢ HAI thư mục.)

### 2.4 iOS — `GoogleService-Info.plist` + khoá APNs

1. Add app → iOS, HAI lần: **Bundle ID** = `vn.xeprime.mobile` và `vn.xeprime.partner`.
2. Tải `GoogleService-Info.plist` của TỪNG app (file này là theo app, không gộp được) →
   `apps/mobile/customer/credentials/GoogleService-Info.plist` và
   `apps/mobile/manage/credentials/GoogleService-Info.plist`.
3. Apple Developer → **Keys** → tạo key có bật **Apple Push Notifications service (APNs)** →
   tải file `.p8` (**chỉ tải được MỘT lần**). Một key APNs dùng được cho mọi app của cùng team.
4. Firebase Console → Project settings → **Cloud Messaging** → mục **Apple app configuration** →
   upload `.p8`, kèm **Key ID** và **Team ID** — cho **từng** app iOS.
   Thiếu bước này thì iOS không nhận thông báo nào, và không có lỗi nào hiện ra ở app.

> ⚠️ Các file trên **KHÔNG được commit** (`/credentials/` nằm trong `.gitignore` của từng app:
> `apps/mobile/customer/.gitignore`, `apps/mobile/manage/.gitignore`). Chúng khai project Firebase
> nào; một bản trong repo nghĩa là mọi bản build của mọi môi trường đều bắn thông báo vào cùng
> một nơi. Giao chúng qua kênh bí mật của môi trường (EAS secret file, artifact CI đã mã hoá).

### 2.5 Tách môi trường

Mỗi môi trường (dev · staging · production) là **một Firebase project riêng**, nên cũng là một bộ
file credential riêng (cho cả hai app) và một `FIREBASE_*` riêng. `app.config.ts` của MỖI app
(`apps/mobile/customer/app.config.ts`, `apps/mobile/manage/app.config.ts`) đọc đường dẫn từ
`GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICES_PLIST` (mặc định `./credentials/...`) để CI trỏ tới file
vừa giải mã ra, thay vì phải sửa code.

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
  "deviceName": "Pixel 8",
  "clientApp": "partner"      // customer | partner — app đã cài token này; bỏ trống = app hợp nhất cũ (nhận mọi loại)
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
client đăng ký được thiết bị đứng tên người khác rồi nhận mọi thông báo của họ. `clientApp` thì
tự khai và điều đó ổn: nó chỉ LỌC thông báo thiết bị nhận (§5), không mở quyền gì — app gửi
`APP_PROFILE.clientApp` (`apps/mobile/shared/src/api/notifications/api.ts`).

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

Nguồn: enum `NOTIFICATION_TYPE` ở `packages/types/src/notifications.ts`; đích (`data.url`) do
`notificationDeepLink` ở `packages/domain/src/notification-delivery.ts` giải lúc phát, theo
`audience` của người nhận (`emitToUser` → `customer`, `emitToTenantMembers` → `manage`, trừ khi nơi
phát truyền `audience` tường minh). Đối chiếu lại ngày 06/10/2026 với mọi nơi gọi trong
`apps/api/src` và `apps/worker/src`.

Đường dẫn trong bảng là đường dẫn của **APP NATIVE**. Web có bảng riêng
(`apps/web/src/features/notifications/lib/notification-display.tsx`) vì vài route khác thật —
hộp yêu cầu là `/manage/booking-requests` ở web, `/manage/requests` ở app; hội thoại mở bằng `?c=`.
Trên web, mọi đích `/manage/...` nằm ở **site partner** (`partner.xeprime.vn`, URL hiển thị không
mang tiền tố `/manage` — ADR 0051), còn `/trips`, `/chat`, `/listings` ở site khách.

**Thông báo đi theo REALM của người nhận (ADR 0053).** Một thông báo thuộc về một tài khoản, tài
khoản thuộc đúng một realm, và realm thuộc đúng một app: tài khoản `customer` rung trên app
XePrime, tài khoản `partner` (gian hàng tuyến gói lẫn chủ xe tuyến hoa hồng) rung trên app XePrime
Partner. `enqueuePushDeliveries` (`prisma/src/push-outbox.ts`) bỏ qua thiết bị đã đăng ký
`clientApp` của app kia; thiết bị `client_app` NULL (bản cài app hợp nhất cũ) vẫn nhận mọi loại.
Cùng một người có tài khoản khách và tài khoản đối tác thì nhận thông báo của MỖI tài khoản trên
ĐÚNG app của nó.

Luồng đặt xe theo ADR 0044: **gửi yêu cầu → duyệt → thu tiền giữ chỗ → đơn thuê**. Duyệt không còn
sinh đơn ngay (trừ khi không có gì để thu) — nó chuyển yêu cầu sang `awaiting_hold` và phát
`hold_requested`.

| Loại (`type`) | Khi nào | Người nhận | `targetType` | Đích app khách | Đích app partner |
| --- | --- | --- | --- | --- | --- |
| `booking_request_submitted` | khách gửi yêu cầu (không được tự nhận) | thành viên gian hàng | `booking_request` | — | `/manage/requests` |
| `booking_request_expiring` | yêu cầu sắp hết hạn phản hồi (mốc 20′ và 45′) | thành viên gian hàng | `booking_request` | — | `/manage/requests` |
| `booking_request_expired` | hết hạn phản hồi | **cả hai bên** (hai câu khác nhau) | `booking_request` | `/trips/:requestId` | `/manage/requests` |
| `booking_request_cancelled` | khách rút yêu cầu; hoặc một thành viên huỷ chuyến đã nhận (báo các thành viên còn lại) | thành viên gian hàng | `booking_request` | — | `/manage/requests` |
| `booking_request_rejected` | gian hàng từ chối yêu cầu đang chờ | khách | `booking_request` | `/trips/:requestId` | — |
| `hold_requested` | gian hàng nhận chuyến (tay hoặc "Đặt ngay") và có tiền giữ chỗ phải thu ⇒ `awaiting_hold` + QR | khách | `booking_request` | `/trips/:requestId` | — |
| `booking_auto_accepted` | hệ thống tự nhận theo thiết lập "Đặt ngay" | thành viên gian hàng | `booking_request` (chờ tiền) · `booking` (đơn tạo ngay) | — | `/manage/requests` · `/manage/bookings/:id` |
| `booking_request_approved` | duyệt mà KHÔNG có gì để thu ⇒ đơn tạo ngay lúc duyệt | khách | `booking` | `/trips/:bookingId` | — |
| `booking_request_slot_taken` | khung giờ đã được nhận cho khách khác — yêu cầu đóng bằng `slot_taken` | khách thua | `booking_request` | `/trips/:requestId` | — |
| `promo_code_dropped` | mã khuyến mãi không còn áp được lúc chốt giá (ADR 0046 điều 7) | khách | `booking_request` | `/trips/:requestId` | — |
| `hold_expiring` | còn 60′ và 15′ trong cửa sổ thanh toán (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`) | khách | `booking_request` | `/trips/:requestId` | — |
| `hold_paid` | đối soát SePay xác nhận ĐỦ tiền ⇒ đơn thuê ra đời | khách + gian hàng | `booking` | `/trips/:bookingId` | `/manage/bookings/:id` |
| `hold_expired` | quá hạn thanh toán, chỗ đã nhả | khách + gian hàng | `booking_request` | `/trips/:requestId` | `/manage/requests` |
| `booking_request_slot_reopened` | hold của người thắng hết hạn — mời khách từng thua đặt lại (chống trùng bằng `slot_reopened_notified_at`) | khách từng `slot_taken` | `vehicle` | `/listings/:vehicleId` | — |
| `booking_cancelled_by_host` | gian hàng huỷ một chuyến đã nhận (ADR 0045) | khách | `booking_request` | `/trips/:requestId` | — |
| `hold_refunded` | chuyến không thành sau khi khách đã trả — nghĩa vụ hoàn đã ghi vào ví | khách | `booking_request` | `/trips/:requestId` | — |
| `hold_refund_paid` | admin đã chuyển trả khoản giữ chỗ; **cũng dùng** cho lệnh rút ví đã chuyển / chuyển hỏng (tiền về lại ví) | khách · chủ ví | `booking` (nếu có đơn) · `tenant` (lệnh rút) | `/trips/:bookingId` hoặc không đích | (không đích) |
| `booking_created` | gian hàng tạo đơn tay | thành viên gian hàng (trừ người tạo) | `booking` | — | `/manage/bookings/:id` |
| `booking_status_changed` | đơn đổi trạng thái (kể cả huỷ, quyết toán) | gian hàng + khách | `booking` | `/trips/:id` | `/manage/bookings/:id` |
| `vehicle_approved` · `vehicle_rejected` · `vehicle_needs_revision` | nền tảng duyệt / từ chối / yêu cầu bổ sung hồ sơ xe | chủ gian hàng (`audience: manage`) | `vehicle` | — | `/manage/vehicles/:id` |
| `shop_approved` · `shop_rejected` · `shop_needs_revision` | nền tảng duyệt / từ chối / yêu cầu bổ sung hồ sơ gian hàng | chủ gian hàng (`audience: manage`) | `tenant` | — | `/manage/shop` |
| `seller_profile_verified` · `seller_profile_changes_requested` · `seller_profile_rejected` | nền tảng xử lý hồ sơ người bán | thành viên gian hàng | — | — | (không đích) |
| `subscription_expiring` · `subscription_expired` · `subscription_lapsed` · `free_trips_exhausted` | vòng đời gói (job `subscription-lifecycle`) | thành viên gian hàng | — | — | (không đích) |
| `subscription_activated` | tiền hoá đơn gói về đủ, gói đã mở (webhook SePay) | thành viên gian hàng | — | — | (không đích) |
| `support_case_updated` | mở / cập nhật yêu cầu hỗ trợ | gian hàng (khi phía khác thao tác) · người mở case | `support_case` | (không đích) | (không đích) |
| `review_received` | khách đánh giá chuyến | thành viên gian hàng | `review` | — | (không đích) |
| **`chat_message_received`** | tin nhắn mới | phía đối diện (không bao giờ người gửi) | `conversation` | `/chat/:id` | `/manage/chat/:id` |

"(không đích)" = bấm vào chỉ đánh dấu đã đọc và mở hộp thư — `notificationDeepLink` trả `null`, và
nơi gọi không được tự bịa một đường dẫn thay thế. Bản cài app hợp nhất cũ còn một bề mặt `owner`
(chủ xe tuyến hoa hồng) chọn đích ở client — xem `NOTIFICATION_AUDIENCE.OWNER`.

`hold_paid` còn một nhánh **LEGACY** (luồng thu-trước-duyệt cũ, `decided_at IS NULL`): tiền về mà
chưa ai nhận chuyến ⇒ cả hai bên nhận tin trỏ `booking_request` ("chờ chủ xe xác nhận"). Đường hiện
hành (ADR 0044) luôn tạo đơn trong cùng transaction và trỏ `booking`.

Sự kiện nào cũng chỉ đi qua `NotificationService` / `apps/worker/src/lib/notify.ts` — **không có
API riêng cho từng loại thông báo**.

Hội thoại là loại DUY NHẤT có đích khác nhau ở hai bề mặt mà vẫn cùng một `targetId`, và điều
đó là bắt buộc chứ không phải trang trí: `ChatService.resolveAccess(userId, id, 'customer')`
từ chối thẳng một nhân viên gian hàng (nhánh membership bị bỏ qua khi `expected === customer`),
nên một đích dùng chung sẽ mở ra "Bạn không có quyền truy cập hội thoại này" cho đúng nửa số
người nhận. `audience` đã đúng theo từng người (`emitToTenantMembers` → MANAGE, `emitToUser` →
CUSTOMER), nên `notificationDeepLink` chỉ việc đọc nó.

Chat có ba luật riêng vì nội dung là riêng tư:
- không bao giờ báo cho người gửi;
- không báo cho thành viên gian hàng đang là KHÁCH của chính thread đó (hộp thư gian hàng không
  liệt kê thread ấy, nên thông báo dẫn tới nó là một ngõ cụt);
- tiêu đề là **tên phía gửi** (tên gian hàng với khách, tên khách với gian hàng — không phải tên
  nhân viên trực chat), nội dung là **chính câu tin**, cắt ở 140 ký tự; tin chỉ có đính kèm hiện
  "Đã gửi một ảnh"/"Đã gửi N ảnh". Một bản dựng duy nhất: `chatNotificationCopy` ở `@xeprime/domain`.

> **Đổi ngày 14/09/2026.** Trước đó câu chữ dừng ở "Bạn có tin nhắn mới" / "Mở XePrime để xem tin
> nhắn" để nội dung chat không hiện ở màn khoá. Quyết định sản phẩm đã đổi: thông báo phải đọc
> được như Messenger/Zalo, và **đánh đổi được chấp nhận có chủ đích** — nội dung tin hiện trên màn
> khoá và đi qua log của hệ điều hành. Hai giới hạn cũ vẫn giữ nguyên: không bao giờ báo cho người
> gửi, và khối `data` của FCM tuyệt đối không mang nội dung (chỉ `notificationId`/`type`/`url`),
> vì `data` là thứ Ở LẠI trên máy và trong bản sao lưu.

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

- **xin quyền ở MÀN CHÍNH, không phải lúc đăng nhập** (Android 13+ `POST_NOTIFICATIONS`, iOS
  APNs). Đăng ký thiết bị và xin quyền là hai việc tách rời
  (`apps/mobile/shared/src/features/notifications/push-permission-gate.ts`): có phiên mà quyền đã cấp sẵn thì đăng ký
  ngay và im lặng; chưa có quyền thì ĐỢI tới khi người dùng đã vào trang chủ marketplace hoặc bảng
  điều khiển gian hàng (+1,5s) mới hiện hộp thoại. Gộp hai việc làm một là lý do hộp thoại từng
  nhảy lên giữa màn nhập mã OTP — nơi câu hỏi chưa có nghĩa và câu trả lời "Không" là vĩnh viễn.
  Hộp thoại đi qua `apps/mobile/shared/src/lib/permission-queue.ts` vì trang chủ cũng xin quyền VỊ TRÍ, và hai hộp
  thoại cùng lúc thì cái sau bị hệ điều hành từ chối thẳng;
- đăng ký token **sau khi đã đăng nhập**, đăng ký lại khi FCM xoay token;
- app đang mở → toast; app ở nền/đã tắt → hệ điều hành hiện thông báo;
- bấm thông báo → điều hướng theo `data.url`, qua allowlist
  (`apps/mobile/shared/src/features/notifications/deep-link.ts`). Chưa đăng nhập thì URL được cất vào
  `pendingDeepLink` và tiêu thụ sau khi đăng nhập;
- **nhận push khi app đang mở ⇒ làm mới hộp thư và badge** (`notifications` + `chat`). Không có
  bước này thì chuông vẫn hiện số cũ tới nhịp poll kế tiếp — app tự mâu thuẫn với chính thông
  báo nó vừa bắn.

### Log trạng thái khi gỡ lỗi

Bật `EXPO_PUBLIC_CHAT_DEBUG=true` trong `.env` của app đang chạy — `apps/mobile/customer/.env` hoặc `apps/mobile/manage/.env`, mẫu ở `.env.example` cùng thư mục (chỉ có tác dụng ở bản dev). Toàn bộ
vòng đời đi qua `apps/mobile/shared/src/lib/chat-debug.ts` và in ra với tiền tố `[comm] push.*`:

| Dòng | Nghĩa khi nó KHÔNG xuất hiện |
| --- | --- |
| `push.available {flag:true}` | bản build không có module FCM native — Expo Go, hoặc thiếu credential |
| `push.permission {flag:true}` | người dùng từ chối, hoặc Android đã tự chặn sau hai lần từ chối |
| `push.token.missing` | *(là cảnh báo)* FCM không cấp token — sai project trong credential, Play Services lỗi |
| `push.register.ok {durationMs}` | API từ chối đăng ký; xem `push.register.failed {code}` |
| `push.token.refreshed` | (chỉ khi FCM xoay token — không phải mỗi phiên) |
| `push.received {trigger}` | thông báo không tới: `foreground` · `background` · `coldStart` là ba đường khác nhau, hỏng riêng lẻ được |
| `push.routed {route}` | bấm vào không mở đúng màn; xem `push.route.rejected` (đích ngoài allowlist) hoặc `push.route.pending` (chưa đăng nhập) |
| `push.inbox.refreshed` | chuông không cập nhật sau khi nhận |

Log **không** mang registration token, tiêu đề/thân thông báo, hay `data.url` thô: đích chỉ lộ
KHUNG route (`/manage/chat/:id`), không lộ id. Có test khoá lại điều đó
(`apps/mobile/shared/src/lib/chat-debug.push.test.ts`).

**Thông báo đẩy thật KHÔNG chạy trong Expo Go.** Phải là development build:

```bash
pnpm --filter @xeprime/mobile-customer run android   # app khách (Metro :8081) — expo run:android
pnpm --filter @xeprime/mobile-manage run android     # app Partner (Metro :8082); đổi android → ios cho iOS
```

Thiếu file credential thì `app.config.ts` của app đó bỏ hẳn plugin Firebase và in một dòng cảnh báo — app
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
| `provider_auth` | **chỉ iOS** ⇒ khoá APNs `.p8` thiếu/bị thu hồi ở Firebase (§2.4); **mọi nền tảng** ⇒ service account thiếu quyền / FCM API chưa bật (§2.1) | không thử lại — tin đã mất; sửa cấu hình rồi kiểm lại bằng §8 |
| `provider_unavailable` | Google 5xx hoặc quota | tự thử lại, backoff mũ, tối đa 8 lần |
| `expired` | quá `expires_at` trước khi tới lượt | đúng thiết kế — tin có đồng hồ đếm ngược không gửi muộn |

Không cần đợi người dùng báo: lỗi `provider_auth` làm worker `/health` chuyển `degraded` trong một
giờ (số đo `gauges.pushConfigFailures1h`, xem `docs/realtime-runbook.md` §3.1) và in một dòng
`push: … thông báo MẤT vì nhà cung cấp từ chối xác thực` ở log. Tách theo nền tảng:

```sql
SELECT d.platform, pd.status, pd.last_error_code, count(*), max(pd.last_error_at)
  FROM push_deliveries pd JOIN push_devices d ON d.id = pd.push_device_id
 WHERE pd.created_at > now() - interval '1 day'
 GROUP BY 1, 2, 3;
```

---

## 9. Còn lại cho đợt sau (app native)

Trung tâm thông báo, badge chưa đọc và refetch hộp thư khi nhận push **đã có** — chúng là COM-04,
làm trong cùng ngày (`docs/mobile-module-status.md` §2.9). Còn lại, cố ý chưa làm:

- màn cài đặt bật/tắt từng loại thông báo;
- UX xin quyền (màn GIẢI THÍCH trước khi hiện hộp thoại hệ thống — thời điểm hỏi thì đã sửa, xem §7);
- đo đếm tỉ lệ nhận/mở;
- tạo kênh Android thật (§6);
- **gộp thông báo chat trong HỘP THƯ.** `pushCollapseKey` đã gộp trên khay, nhưng
  `GET /notifications` vẫn là một dòng mỗi tin nhắn: một hội thoại 30 tin là 30 dòng "Bạn có tin
  nhắn mới" giống hệt nhau cho mỗi thành viên gian hàng. Cố ý chưa xử lý ở đợt này vì cách sửa
  rẻ nhất — tái dùng một hàng `notifications` chưa đọc — lại đụng unique
  `(notification_id, push_device_id)` và làm tắt luôn push cho các tin sau. COM-04 nay đã có UI
  hộp thư để quyết định đúng, nhưng phần gộp thì vẫn còn nguyên — hộp thư hiện mỗi tin một dòng.

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
- `docs/decisions/0034-badge-delivery-by-projection.md` — huy hiệu chưa đọc (`GET /me/badges` + bản
  chiếu `user_badges/{uid}`) mà trung tâm thông báo trên app native (COM-04) dựa vào.
- `docs/realtime-runbook.md` — vận hành chat/badge realtime khi có sự cố.
- `docs/decisions/0053-separate-account-realms.md` — realm của người nhận quyết app nào rung (§5).
