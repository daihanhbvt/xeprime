# ADR 0019 — Đăng nhập Google/Facebook do backend chủ trì; Firebase rút về đúng vai chat

Ngày: 26/08/2026 · Trạng thái: Accepted

Liên quan: [ADR 0002](0002-auth-session-cookie.md) (session cookie httpOnly — **ADR này ghi đè
phần "Firebase là provider"**), [ADR 0009](0009-chat-firestore-projection.md) (Firestore là
projection của chat), [ADR 0012](0012-i18n-shared-url-cookie-locale.md) (giao diện đọc MÃ lỗi,
không đọc câu chữ của backend), [ADR 0017](0017-native-bearer-auth.md) (phiên app native). Hồ sơ
phân tích triển khai đã nghỉ hưu ngày 03/09/2026 và còn trong lịch sử Git.

## Bối cảnh

XePrime có bốn đường đăng nhập. Ba đường đã tự chủ hoàn toàn: **mật khẩu** (bcrypt, `AuthService`),
**OTP qua SĐT** (eSMS.vn, không dùng Firebase Phone Auth), và **đăng ký**. Đường thứ tư —
**Google/Facebook** — chạy `signInWithPopup` của Firebase JS SDK ngay trong tab của người dùng, đổi
lấy Firebase ID token, rồi gửi lên `POST /auth/session`.

Đường thứ tư đó chặn kế hoạch app native, và nó chặn theo bốn cách khác nhau:

1. **`signInWithPopup` không tồn tại trên React Native.** Firebase JS SDK trên RN chỉ hỗ trợ
   email/password, custom token và anonymous — OAuth provider thì không. Không tái dụng được một
   dòng nào của `firebase-social-auth.ts` cho app.
2. **Persistence của Firebase trên RN dùng AsyncStorage**, mà CLAUDE.md mục 5 cấm tuyệt đối:
   token native chỉ được nằm ở Keychain/Keystore (ADR 0017).
3. **Nguy cơ tách đôi tài khoản.** Identity khoá theo `(provider, provider_user_id)`. Web ghi
   Firebase uid; nếu app đi đường native SDK nó sẽ ghi Google `sub` — cùng một người thành hai
   hàng `users`.
4. **Account linking bị Firebase quyết thay.** `auth/account-exists-with-different-credential`
   chỉ được map thành một câu báo lỗi rồi bỏ mặc người dùng. Ca này rất phổ biến ở XePrime, vì
   luồng chính là đăng ký bằng SĐT/OTP rồi sau đó bấm Google với cùng email.

Cùng lúc, Firebase vẫn cần thiết cho **chat realtime** (ADR 0009) — và chat mint custom token bằng
**Postgres user id**, tức nó không quan tâm người dùng đăng nhập bằng cách nào.

## Quyết định

### 1. Vòng OAuth chạy ở SERVER, không ở trình duyệt

Hai route công khai, cả hai đều trả `302` chứ không trả JSON:

```
GET /auth/social/:provider           → 302 sang màn đồng ý của provider
GET /auth/social/:provider/callback  → 302 về APP_WEB_URL, kèm Set-Cookie khi thành công
```

Client — web hôm nay, app native mai sau — chỉ điều hướng tới URL đầu tiên. Nó **không** cầm
client secret, **không** cầm access token của provider, **không** chạy SDK nào.

Đây là điều ADR 0002 đã dự trù: "Firebase chỉ xuất hiện sau interface này. Đổi sang
Auth0/Cognito/tự làm chỉ cần viết một implementation mới." Bản mới là `SocialProvider`, và
`AuthService.upsertUserFromIdentity` không đổi một dòng.

> **Bẫy đã sập một lần, ghi lại để không sập nữa.** Query của chặng callback do PROVIDER soạn:
> Google tự gắn `iss`, `scope`, `authuser`, `prompt`; Facebook gắn `error_reason`,
> `error_description`. `bootstrap.ts` cài `ValidationPipe({ forbidNonWhitelisted: true })` ở phạm
> vi **toàn cục**, mà pipe toàn cục của NestJS **luôn chạy** — `@UsePipes` ở method chỉ THÊM pipe
> chứ không thay thế. Nên gắn một DTO vào `@Query()` của hai route này là 400 ngay lần đăng nhập
> Google thật đầu tiên, và người dùng thấy một trang JSON.
>
> Cách đúng: đọc từng tham số bằng `@Query('ten')`. Metatype là `String` nên `ValidationPipe` bỏ
> qua, và tham số lạ đơn giản là không được đọc tới. `test/social-auth-callback.spec.ts` khoá
> điều này bằng chính `createValidationPipe()` của production, không phải một bản sao cấu hình.

### 2. Web chuyển trang cả tab, không popup

Popup bị chặn mặc định ở nhiều trình duyệt và **hoàn toàn không dùng được** trong webview
trong-ứng-dụng của Facebook/Zalo — nguồn truy cập lớn của khách thuê xe. Đổi lại: hộp đăng nhập
đóng lại khi rời trang, nên `?next=` (cơ chế đã có sẵn ở `proxy.ts` và `post-auth-destination.ts`)
là thứ đưa người dùng về đúng chỗ.

`next` gửi đi phải **bỏ** `auth`/`next`/`authError` của URL hiện tại; giữ nguyên chúng thì đăng
nhập xong hộp đăng nhập mở lại ngay trước mặt người vừa đăng nhập thành công.

### 3. `state` + PKCE nằm ở bảng `oauth_states`, dùng đúng một lần

Cookie không dùng được: chặng callback là điều hướng từ `google.com` sang `api.xeprime.vn`, nên
`SameSite` chặn. Bộ nhớ tiến trình cũng không: API chạy nhiều instance.

`consume()` là **một câu `UPDATE` có điều kiện** rồi kiểm số hàng đúng bằng 1 — không phải
đọc-rồi-ghi. Hai callback song song cùng một `state` (người dùng F5, hoặc kẻ tấn công phát lại
URL) đều thấy `consumed_at IS NULL` nếu ta đọc trước. `UNIQUE(state)` là điều kiện để câu update
đó atomic, không phải để tra cứu cho nhanh.

`code_verifier` không bao giờ rời server; chỉ `code_challenge` (bản băm) đi ra internet.

Bảng này chỉ có ghi và xoá, và phần lớn hàng **không bao giờ được tiêu thụ** (người dùng bỏ giữa
chừng, bot quét endpoint công khai). `apps/worker` dọn hàng hết hạn mỗi giờ
(`jobs/oauth-state-cleanup.ts`), chạy ở **mọi** cấu hình — không gắn với `FIRESTORE_ENABLED`.

### 4. Verify danh tính: khác nhau giữa hai provider, và khác nhau vì lý do

**Google** là OIDC. `id_token` đến thẳng từ `https://oauth2.googleapis.com/token` trong một lời
gọi server↔server, nên theo OIDC Core §3.1.3.7 việc kiểm chữ ký **được thay** bằng TLS của
endpoint đó. Ta kiểm `iss`, `aud`, `exp`, `sub` và `nonce`. `nonce` mới là chốt chặn mạnh nhất
cho kịch bản đáng lo (token injection): nó là 16 byte ngẫu nhiên nằm trong `oauth_states`, và
không token nào lấy từ nơi khác chứa được nó.

> Lập luận trên chỉ đúng vì token do CHÍNH hàm đó vừa lấy về. Chỗ nào nhận `id_token` từ client
> (app native gửi lên) thì **phải** kiểm chữ ký bằng JWKS của Google.

**Facebook không phải OIDC** — không có `id_token`, không có chữ ký nào để kiểm. Bắt buộc gọi
`GET /debug_token` bằng app token và **đối chiếu `app_id` khớp app của mình**. Bỏ bước đó là lỗ
hổng token substitution: access token của Facebook trông giống nhau ở mọi app, nên một token do
app của kẻ tấn công phát ra sẽ đổi được phiên XePrime của nạn nhân.

### 5. Luật nối tài khoản KHÔNG đổi

Provider đã xác minh email (Google) → nối identity mới vào user sẵn có cùng email. Provider chưa
xác minh (**Facebook luôn**, vì Graph API không cam kết gì về việc email đã xác minh) → trả
`CONFLICT` và bảo người dùng đăng nhập bằng cách cũ.

Đây là hành vi đã chạy từ trước; ADR này đổi NGUỒN của danh tính, không đổi luật. 5 test trong
`auth-social.spec.ts` giữ nguyên kịch bản chính vì lý do đó.

### 6. `provider` dùng dạng NGẮN

`google` / `facebook`, không phải `google.com` / `facebook.com`. Hằng số ở
`@xeprime/types/auth-provider.ts` — giá trị này vừa đi vào `user_identities.provider` vừa là đoạn
đường dẫn `GET /auth/social/{provider}`, nên web và api không được mô tả nó bằng hai chuỗi khác nhau.

### 7. Firebase rút về đúng một vai: chat

`firebase-admin` ở lại repo, nhưng chỉ `FirebaseAppService` (mint custom token cho Firestore) và
`apps/worker` (đẩy projection) còn đụng tới nó. `AUTH_MODE` bị xoá; `FIREBASE_*` chỉ bắt buộc khi
`FIRESTORE_ENABLED=true`.

Đã gỡ: `token-verifier.ts`, `POST /auth/session`, `POST /auth/mobile/session`,
`firebase-social-auth.ts` của web, `authApi.createSession`.

## Hệ quả

- **Không có tài khoản social thật nào phải backfill** — dự án chưa lên production, và seed chỉ
  tạo identity `provider: 'password'`. Đây chính là lý do làm ngay thay vì sau Phase 8: càng để
  lâu, việc đổi `provider_user_id` từ Firebase uid sang Google `sub` càng đắt.
- **Không provider nào bắt buộc.** Thiếu cấu hình thì nút trả `SOCIAL_NOT_CONFIGURED` và ba đường
  đăng nhập còn lại chạy bình thường. Nhưng khai NỬA cặp id/secret thì API từ chối boot.
- **Production phải có `SESSION_COOKIE_DOMAIN=".xeprime.vn"`.** Không phải ràng buộc mới —
  `proxy.ts` vốn đã đọc cookie ở origin web — nhưng luồng redirect phụ thuộc vào nó.
- **`API_PUBLIC_URL` là hằng số, không suy từ header.** `Host`/`X-Forwarded-Host` do client gửi,
  và một `redirect_uri` dựng từ dữ liệu client là cách `code` bị gửi tới máy người khác.
- **Bốn mã lỗi mới** (`SOCIAL_NOT_CONFIGURED`, `SOCIAL_STATE_INVALID`, `SOCIAL_CANCELLED`,
  `SOCIAL_EXCHANGE_FAILED`) về web qua `?authError=` và được dịch từ MÃ như mọi lỗi API khác
  (ADR 0012). Chúng không bao giờ đi trong một body JSON.

## 8. App native: cả ba đường đăng nhập đều trả TOKEN, không trả cookie

Bổ sung 26/08/2026, cùng ngày. Guard toàn cục (`auth.guard.ts`) vốn đã nhận cả cookie lẫn
`Authorization: Bearer`, nên **toàn bộ API nghiệp vụ đã dùng được với Bearer từ trước**. Chỗ
thiếu chỉ là các endpoint **phát phiên** — chúng trả cookie, thứ app native không có chỗ chứa.

| Đường | Web | Native |
| --- | --- | --- |
| Mật khẩu | `POST /auth/login` | `POST /auth/mobile/login` |
| Đăng ký | `POST /auth/register` | **`POST /auth/mobile/register`** |
| SĐT + OTP | `POST /auth/phone/login` | **`POST /auth/mobile/phone/login`** |
| Google/Facebook | `GET /auth/social/:provider` → cookie | **`…?client=native` → one-time code → `POST /auth/mobile/social/exchange`** |
| Khách vãng lai đặt xe | `POST /public/booking-requests` → cookie | **cùng route + `client: "native"` → `receipt.session`** |

Hai bước OTP trước đó (`send-otp`, `verify-otp`) dùng chung: chúng trả JSON thuần, không đụng cookie.

Hai dòng cuối là chỗ dễ sót nhất khi rà, vì cả hai **cấp phiên kèm theo một hành động khác** —
đăng ký, và gửi yêu cầu thuê. Bỏ sót nghĩa là app gọi thành công, nhận `201`, mà người dùng vẫn
chưa đăng nhập: hỏng im lặng, không lỗi nào để lần.
`test/mobile-register-and-guest-session.spec.ts` khoá lại bằng khẳng định `set-cookie` phải VẮNG
MẶT — một cookie gửi cho app native là một phiên rơi vào hư không.

Ở `/public/booking-requests` **không có nhánh đoán từ header**: đúng lời gọi đó khách chưa có
credential nào để mà đoán, nên client phải tự khai `client: "native"`. Giá trị lạ bị từ chối chứ
không âm thầm rơi về web — rơi về web ở đây nghĩa là phát một cookie mà app không đọc được.

### Vì sao deep link mang MÃ chứ không mang token

Deep link đi qua hệ điều hành và **nằm lại trong log của nó**. Một refresh token 60 ngày ở đó là
một bí mật dài hạn bị ghi ra đĩa. Thứ đi qua deep link vì thế là một mã trong `native_auth_codes`:
sống **60 giây**, dùng **một lần**, và chỉ đổi được khi kèm `code_verifier` mà app giữ trong bộ
nhớ tiến trình.

Luồng đầy đủ:

1. App sinh PKCE, GIỮ `codeVerifier`, mở
   `WebBrowser.openAuthSessionAsync(.../auth/social/google?client=native&code_challenge=…&redirect_uri=…)`.
   `expo-web-browser` dùng `ASWebAuthenticationSession` (iOS) / Custom Tabs (Android) — **không
   cần native module cho phần auth**.
2. Callback thấy `client=native` → thay vì `Set-Cookie`, phát one-time code rồi redirect về deep link.
3. `POST /auth/mobile/social/exchange { code, codeVerifier, device? }` → `MobileSessionDto`, dùng
   lại `NativeSessionService.issueSession` không sửa một dòng.

### Ba lớp bảo vệ, và tại sao cần cả ba

- **PKCE app ↔ backend** (`oauth_states.app_code_challenge`), tách hẳn PKCE backend ↔ provider.
  Trên Android custom scheme không độc quyền: app khác đăng ký `xeprime://` nhận được cùng deep
  link. Nó có `code`, nhưng không có `code_verifier`. Đoán sai verifier **đốt luôn mã** — không
  cho thử lần hai.
- **Allowlist `MOBILE_AUTH_REDIRECT_URIS`.** `redirect_uri` do client gửi, nên nó là dữ liệu của
  kẻ tấn công cho tới khi khớp danh sách trong env. Thiếu bước này thì
  `…?client=native&redirect_uri=evil://x` giao one-time code thẳng cho app của kẻ tấn công — cùng
  loại lỗ hổng mà `isSafeNextPath` chặn ở phía web. Là danh sách vì Expo dev build trả
  `exp://192.168.x.x:8081/--/…` chứ không phải scheme của app đã cài.
- **CHECK ở DB** buộc `client='native'` phải có đủ cả hai cột, và `web` thì phải không có cái nào.
  Một hàng `native` thiếu `app_redirect_uri` là một luồng đăng nhập không có đường về: app treo ở
  trình duyệt, không lỗi nào để đọc.

Lỗi ở chặng **bắt đầu** luôn về web, kể cả khi app gọi — nhánh lỗi phổ biến nhất ở đó chính là
`redirect_uri` không qua allowlist, và redirect về một deep link chưa kiểm để "báo lỗi cho tử tế"
là tự mở đúng lỗ hổng vừa chặn. Từ chặng **callback** trở đi thì lỗi về deep link, vì lúc đó
`redirect_uri` đã được kiểm và app cần biết luồng đã hỏng.

### Còn lại cho app (chưa làm)

- **Android App Links / iOS Universal Links** thay custom scheme — hệ điều hành xác minh quyền sở
  hữu domain. Backend không phải đổi gì: chỉ thêm URL `https://…` vào `MOBILE_AUTH_REDIRECT_URIS`.
- **Sign in with Apple**: App Store từ chối duyệt app iOS có Google/Facebook mà không có Apple. Là
  OIDC chuẩn nên chỉ thêm một `SocialProvider`. Lưu ý Apple chỉ trả tên/email ở **lần đăng nhập
  đầu tiên** — không lưu ngay là mất vĩnh viễn.

## Phương án đã cân nhắc và bỏ

| Phương án | Vì sao bỏ |
| --- | --- |
| Giữ Firebase, app dùng `@react-native-firebase/auth` | Vẫn phải prebuild + cấu hình native, mà vẫn nuôi một vendor chỉ để hỏi "người này là ai". Account linking vẫn không nắm được. |
| Native SDK trực tiếp (`@react-native-google-signin` + `react-native-fbsdk-next`), backend verify token client gửi lên | Client ID rải trên ba nền tảng, backend phải chấp nhận một danh sách audience, và Facebook thì backend buộc phải tin một token không có chữ ký. UX nhỉnh hơn không bù được. |
| Giữ song song `/auth/session` cũ để rollback | Hai định dạng `provider_user_id` cùng ghi vào một bảng — đúng cái nguy cơ tách đôi tài khoản mà ADR này sinh ra để tránh. |
| Dùng `jose` verify chữ ký `id_token` | `jose` v6 chỉ có ESM; repo là CommonJS (NestJS + Jest) nên nó gãy ngay ở Jest và là ma sát lâu dài. Với luồng authorization code, OIDC cho phép TLS thay chữ ký — xem §4. |
