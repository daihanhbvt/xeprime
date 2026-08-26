# ADR 0017 — Xác thực app native bằng Bearer access token + refresh token xoay vòng

Ngày: 24/08/2026 · Trạng thái: Accepted

Liên quan: [ADR 0002](0002-auth-session-cookie.md) (session cookie của web — **không bị thay đổi**),
[docs/mobile-readiness-audit.md](../mobile-readiness-audit.md) §7 P0-1, P0-2, P1-1.

> **Cập nhật 26/08/2026 — [ADR 0019](0019-backend-led-social-oauth.md).** `POST /auth/mobile/session`
> (đổi Firebase ID token lấy cặp token) **đã bị gỡ** cùng với toàn bộ đường Firebase Auth; chưa
> client nào từng gọi nó. Cơ chế phiên native mô tả dưới đây — access token 15′, refresh token
> opaque xoay vòng, thu hồi theo thiết bị — **không đổi một chữ**; chỉ cửa vào là khác:
> `POST /auth/mobile/login` (mật khẩu) là cửa duy nhất hôm nay, và đăng nhập mạng xã hội cho native
> sẽ vào qua `/auth/social/*` + one-time code (ADR 0019 mục "Chỗ cắm cho app native").

## Bối cảnh

ADR 0002 chốt web dùng httpOnly session cookie, và đã dự phòng đúng hình cho native:

> *"App native sau này: cho `AuthGuard` chấp nhận thêm nguồn `Authorization: Bearer <session jwt>`.
> Cùng một session, khác cách vận chuyển."*

Nhưng "cùng một session JWT" không dùng được nguyên văn, vì session JWT của web sống **7 ngày** và
**không có bảng phiên** (audit §6: *không refresh, không sliding renewal, không revoke thiết bị*).
Chuyển nguyên nó sang native tạo ba vấn đề mà web không có:

1. **Không thu hồi được.** Cookie mất theo trình duyệt; một chiếc điện thoại bị mất thì token
   7 ngày nằm trong Keychain của người khác và không có cách nào giết nó.
2. **Không có `httpOnly` để dựa vào.** Trên native, token là một chuỗi app tự giữ. Token càng
   sống lâu thì cửa sổ thiệt hại càng rộng.
3. **Không có nơi nào chịu trách nhiệm gia hạn.** Web có sliding renewal qua `Set-Cookie` ở mỗi
   response; native không có cơ chế tương đương nếu không có endpoint refresh tường minh.

Đây cũng là dịp duy nhất rẻ để làm đúng: chưa có `apps/mobile`, nên chưa có client nào phải sửa.

## Quyết định

Hai đường vận chuyển, **một nguồn sự thật về quyền**.

| | Web | Native |
| --- | --- | --- |
| Vận chuyển | Cookie `httpOnly; Secure; SameSite=Lax` | Header `Authorization: Bearer <accessToken>` |
| Vòng đời credential | Session JWT 7 ngày (ADR 0002, giữ nguyên) | Access token **15 phút** |
| Gia hạn | Cookie mới ở response | `POST /auth/mobile/refresh` |
| Thu hồi | Xoá cookie | Thu hồi **hàng** refresh token trong DB |
| Nơi lưu ở client | Trình duyệt, JS không đọc được | **Chỉ** Keychain (iOS) / Keystore (Android) |

```text
App native lần đầu:
  Firebase signIn → idToken            hoặc   email/SĐT + mật khẩu
        ↓ POST /auth/mobile/session              ↓ POST /auth/mobile/login
  { accessToken (15'), refreshToken (60d), user }
        ↓ accessToken → memory · refreshToken → Keychain/Keystore
  Mọi request: Authorization: Bearer <accessToken>
        ↓ 401 UNAUTHENTICATED / SESSION_EXPIRED
  POST /auth/mobile/refresh { refreshToken }
        → cặp MỚI; refresh token cũ chết ngay (rotation)
        ↓
  POST /auth/mobile/logout { refreshToken } → thu hồi phiên của thiết bị này
```

### 1. Access token: JWT ngắn hạn, claim tối thiểu

TTL **15 phút** (cấu hình `MOBILE_ACCESS_TTL_MINUTES`, chặn trong khoảng 10–15).

Claim **đúng sáu trường**, không hơn:

```json
{ "sub": "<userId>", "sid": "<nativeSessionId>", "typ": "access", "aud": "xeprime-mobile", "iat": 0, "exp": 0 }
```

- `typ=access` — phân biệt với mọi loại token khác của hệ thống. Guard **từ chối** token thiếu
  hoặc sai `typ`; nếu không, một session JWT của web (cùng secret, cùng issuer) sẽ đi được qua
  đường Bearer và mang theo tuổi 7 ngày vào một nơi thiết kế cho 15 phút.
- `aud=xeprime-mobile` — cùng lý do, ở tầng `jsonwebtoken` xác minh giúp.
- **KHÔNG có** `role`, `permissions`, `tenantId`, `tenantRole`, `email`, `phone`, `displayName`,
  hay bất kỳ trạng thái nghiệp vụ nào. Lý do là chính lý do của ADR 0002 ràng buộc 1: quyền nằm
  trong token thì thu hồi quyền không có hiệu lực cho tới khi token hết hạn. `GET /auth/me` là
  chỗ duy nhất trả quyền, và nó đọc DB mỗi lần gọi.
- PII cũng không vào token: JWT không mã hoá, chỉ ký. Bất cứ ai có token đọc được payload.

### 2. Refresh token: **chuỗi random đối xứng, không phải JWT**

- 32 byte từ CSPRNG, encode base64url → 43 ký tự.
- **Không có cấu trúc, không có claim, không tự chứng minh gì.** Nó chỉ là một khoá tra bảng.
- TTL 60 ngày (`MOBILE_REFRESH_TTL_DAYS`).

Vì sao không dùng JWT dài hạn cho refresh: một JWT tự xác minh được bằng chữ ký, nên nó **vẫn hợp
lệ sau khi bị thu hồi** — trừ khi vẫn phải tra DB, lúc đó phần "tự xác minh" chỉ còn là chi phí và
một cửa để quên tra. Chuỗi opaque bắt buộc mọi lời gọi refresh phải đi qua DB, tức là bắt buộc đi
qua chỗ có cột `revoked_at`.

### 3. Trong DB chỉ có **hash**, không bao giờ có token

Bảng `native_auth_sessions` (một hàng = một thiết bị) và `native_refresh_tokens` (một hàng = một
lần xoay). Cột `token_hash` là SHA-256 của refresh token.

Vì sao SHA-256 mà không bcrypt/argon2: refresh token là 256 bit entropy từ CSPRNG, không phải mật
khẩu người chọn — không có gì để dò từ điển, và hàm chậm ở đây chỉ làm mỗi lần refresh chậm thêm
mà không thêm một chút an toàn nào. (Mật khẩu người dùng vẫn bcrypt, không đổi.)

### 4. Rotation + phát hiện dùng lại

Mỗi lần refresh thành công: token cũ được đánh `used_at` và **cấp token mới**. Token cũ dùng lần
thứ hai ⇒ **thu hồi cả hàng token** (`token family`) và cả phiên.

Lý do là mô hình đe doạ thật: nếu một refresh token bị đánh cắp, kẻ tấn công và người dùng thật sẽ
lần lượt dùng cùng một token — người đến sau nhận lỗi. Không có phát hiện dùng lại thì hai bên cứ
thế xoay song song và không ai biết. Có phát hiện thì lần trùng đầu tiên giết cả phiên: người dùng
thật phải đăng nhập lại (bất tiện), kẻ tấn công mất quyền (mục đích).

**Refresh SONG SONG không phải replay.** Hai lời gọi chạm nhau trong vài mili giây được xử bằng
`UPDATE … WHERE used_at IS NULL` trong transaction: đúng một cái thắng, cái thua nhận 401 và phiên
**không** bị thu hồi. Đó là app gửi song song hoặc mạng chập chờn retry, không phải hai bên giữ
cùng một token qua thời gian; giết phiên ở đây sẽ đá người dùng ra ngoài mỗi lần app mở nhiều màn
cùng lúc. Đổi lại, client **phải single-flight** lời gọi refresh — mẫu ở
`packages/api-client/README.md`.

### 5. `AuthGuard` — hai nguồn, không nhập nhằng

Thứ tự và luật từ chối:

1. Có **cả** cookie hợp lệ **và** header `Authorization` ⇒ **401**. Không đoán bên nào thắng: một
   guard mà thứ tự ưu tiên quyết định danh tính là một guard sẽ bị lợi dụng đúng chỗ đó.
2. Có `Authorization` ⇒ **bắt buộc** đúng dạng `Bearer <token>` (đúng một khoảng trắng, scheme so
   không phân biệt hoa thường, token không rỗng). Sai dạng ⇒ 401, **không** rơi về cookie.
3. Không có `Authorization` ⇒ đường cookie như cũ (ADR 0002). Web không thấy gì thay đổi.

Với Bearer, sau khi chữ ký hợp lệ, guard còn kiểm **trong cùng một request**:
`sid` tồn tại · phiên chưa `revoked_at` · phiên chưa hết hạn · user tồn tại và `status=active`.
Bốn kiểm tra này là lý do access token dám sống 15 phút mà vẫn thu hồi được gần như tức thì.

**Và chiều ngược lại cũng bị chặn:** access token native **không** dùng được làm session cookie.
Hai họ token cùng secret và cùng issuer nên chữ ký của nó hợp lệ ở `SessionService.verify`, nhưng
đường cookie KHÔNG tra `native_auth_sessions.revoked_at` — nhận nó nghĩa là một access token của
thiết bị **đã đăng xuất** vẫn gọi được API tới khi hết hạn, chỉ cần chuyển từ header sang cookie.
`SessionService.verify` vì thế từ chối mọi token mang `typ` hoặc `aud`; session cookie của web
không có cả hai claim nên luật này không đụng token nào đang lưu hành.

### 6. Không ghi log token

Access token và refresh token không bao giờ đi vào log, message lỗi, hay `details` của lỗi. Endpoint
refresh nhận token trong **body**, không phải query string — query string nằm trong access log của
mọi proxy trên đường đi.

## Hệ quả

- `apps/api`: `NativeSessionService` mới; `AuthGuard` và `resolveOptionalUserId` nhận thêm nguồn
  Bearer; 4 endpoint `/auth/mobile/*`; 2 bảng mới; env `MOBILE_ACCESS_TTL_MINUTES`,
  `MOBILE_REFRESH_TTL_DAYS`, `MOBILE_JWT_AUDIENCE`. `SessionService.verify` thêm ĐÚNG MỘT luật từ
  chối (token mang `typ`/`aud`) — xem §5; không token web nào đang lưu hành bị ảnh hưởng.
- `apps/web`: **hành vi đăng nhập không đổi.** Không endpoint web nào đổi response, không cookie
  nào đổi thuộc tính, không màn hình nào phải sửa.
- `@xeprime/api-client`: `AuthTransport` — web trả `credentials: 'include'`, native trả header
  Bearer từ một callback. Một client, hai adapter.
- Web **vẫn** không có refresh/sliding renewal/revoke thiết bị (audit §7 P1-1). ADR này CỐ Ý không
  giải nó: đó là việc của web, làm chung sẽ biến một thay đổi cộng thêm thành một thay đổi phá vỡ.
  Bảng phiên ở đây được đặt tên `native_*` chính vì thế — khi web cần phiên revoke được, nó là một
  quyết định riêng, có thể dùng lại đúng hình này.
- Đăng nhập Apple (audit §7 P1-7) vẫn chặn **phát hành** iOS. ADR này không giải; nó chỉ làm cho
  việc thêm một provider vào `POST /auth/mobile/session` là thêm một verifier, không phải sửa auth.

## Cân nhắc đã bị loại

| Phương án | Vì sao loại |
| --- | --- |
| Dùng lại session JWT 7 ngày cho Bearer | Không thu hồi được, cửa sổ thiệt hại 7 ngày trên thiết bị mất — ba vấn đề ở phần Bối cảnh |
| Cookie cho cả native | RN không có cookie jar đáng tin trên cả hai nền tảng; `httpOnly` cũng không có nghĩa gì khi không có DOM |
| Refresh token là JWT dài hạn | Vẫn phải tra DB để biết đã thu hồi ⇒ phần tự xác minh chỉ là chi phí và là một cửa để quên tra |
| Nhét `permissions` vào access token để đỡ một lần gọi `/auth/me` | Đúng thứ ADR 0002 ràng buộc 1 cấm. Tiết kiệm một request, đổi bằng việc thu hồi quyền không có hiệu lực trong 15 phút |
| Refresh token dùng lại được (không rotation) | Đánh cắp một lần = truy cập vĩnh viễn tới khi hết hạn, và không có tín hiệu nào để phát hiện |
