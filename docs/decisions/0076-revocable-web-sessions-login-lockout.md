# ADR 0076 — Phiên web thu hồi được, khoá đăng nhập theo định danh, OAuth web gắn trình duyệt

Ngày: 29/10/2026 · Trạng thái: **Accepted** · Nguồn: rà soát bảo mật trước production (29/10/2026) ·
Mở rộng: [0002](0002-auth-session-cookie.md) (session cookie), [0017](0017-native-bearer-auth.md)
(phiên native), [0019](0019-backend-led-social-oauth.md) (OAuth do backend chủ trì) · Giữ nguyên:
0053 (realm, cookie host-only theo realm), 0060 (OTP chỉ xác minh SĐT, không cấp phiên)

## Bối cảnh

Rà soát trước production tìm ra bốn lỗ hở ở đường đăng nhập:

1. **Cookie web không thu hồi được.** Session JWT sống 7 ngày, mang `sid` nhưng `sid` không trỏ vào
   đâu — `AuthGuard` chỉ kiểm chữ ký. Đăng xuất chỉ xoá cookie trên trình duyệt đang bấm; bản cookie
   đã bị sao chép (máy công cộng, XSS ở một trang khác cùng site, log proxy) sống đủ 7 ngày.
2. **Đổi / đặt lại mật khẩu không đá ai ra.** Người nghi tài khoản bị chiếm đặt lại mật khẩu, còn kẻ
   chiếm vẫn ở trong cả bằng cookie web lẫn phiên app. `NativeSessionService.revokeAllForUser` có
   sẵn nhưng không chỗ nào gọi.
3. **Không có giới hạn theo tài khoản.** `@Throttle` 5 lần/phút theo IP; dò mật khẩu một tài khoản từ
   nhiều IP không bị hãm. Nặng nhất ở site quản trị (email + mật khẩu, không 2FA).
4. **Login CSRF qua OAuth.** `state` chống giả callback nhưng không gắn với trình duyệt: kẻ xấu dừng
   luồng Google của chính họ ở URL callback, gửi link cho nạn nhân — nạn nhân bấm là đăng nhập vào
   tài khoản kẻ xấu, và bằng lái, chuyến đi nhập sau đó nằm trong tài khoản kẻ xấu.

Kèm một lỗ nhỏ ở luật nối tài khoản: Google (email đã xác minh) tự nối vào tài khoản XePrime cùng email
**kể cả khi email trên tài khoản XePrime chưa xác minh** (tạo bằng Facebook) — kẻ xấu gieo sẵn tài
khoản mang email nạn nhân rồi chờ nạn nhân đăng nhập Google.

## Quyết định

### 1. `web_sessions` — mỗi lần đăng nhập web một hàng

`SessionService.issue` ghi một hàng `web_sessions` (`id` = claim `sid`, `expires_at` = +7 ngày) rồi
mới ký cookie. `AuthGuard` và `resolveOptionalUser` nhận cookie khi chữ ký hợp lệ **và** hàng đó còn
sống (`revoked_at IS NULL`, chưa hết hạn, đúng `user_id`). Phiên bị thu hồi ⇒ 401 `SESSION_EXPIRED`.

Payload cookie KHÔNG đổi (`sub` + `sid`, ADR 0002 ràng buộc 1). Writer duy nhất: `SessionService`;
worker chỉ xoá hàng đã hết hạn.

**Cookie phát trước ADR này không có hàng** ⇒ bị từ chối: mọi người dùng web đăng nhập lại MỘT lần sau
lần deploy đầu tiên. Không có ngoại lệ "cookie cũ thì tin" — đó đúng là loại cookie không ai thu hồi
được.

`DELETE /auth/session` thu hồi hàng của cookie đang gửi (lý do `logout`) rồi mới xoá cookie; cookie
hỏng/hết hạn vẫn trả 204.

### 2. Đổi / đặt lại mật khẩu giết phiên — trong CÙNG transaction

- `POST /auth/password/change`: thu hồi mọi phiên web + app **khác** phiên đang thao tác (lý do
  `password_changed`). Phiên giữ lại theo `transport` của request: cookie thì giữ hàng
  `web_sessions` đó, Bearer thì giữ phiên native đó.
- Đặt lại mật khẩu (link email `POST /auth/password/reset`, OTP `POST /auth/password/reset-otp`): thu
  hồi **mọi** phiên web + app (lý do `password_reset`). Người đặt lại thường là vì nghi bị chiếm.

Phiên native đi kèm refresh token + thiết bị đẩy của nó (`NativeSessionService.revokeAllForUser`).
CHECK `native_auth_sessions_revoked_reason_check` nới thêm hai lý do trên.

### 3. Khoá đăng nhập theo ĐỊNH DANH (`login_throttles`)

`LoginThrottleService` (writer duy nhất) đếm lần sai mật khẩu theo `(realm, sha256(định danh đã
chuẩn hoá))` — SĐT `84…` hoặc email chữ thường; bảng không giữ định danh thô.

- Chính sách ở `LOGIN_LOCKOUT_POLICY` (`@xeprime/types`): cửa sổ 15 phút, khoá 15 phút, trần 10 lần ở
  site khách/partner và **5 lần ở site quản trị**.
- Đang khoá ⇒ mọi lượt đăng nhập định danh đó (kể cả đúng mật khẩu) trả **429
  `LOGIN_TEMPORARILY_LOCKED`** kèm `details.retryAfterSeconds`, kiểm TRƯỚC bcrypt. Lượt sai chạm trần
  trả luôn mã này.
- Định danh **không có tài khoản bị đếm và khoá y hệt** — câu trả lời không tố cáo ai có tài khoản.
- Đếm bằng một câu `INSERT … ON CONFLICT DO UPDATE` nguyên tử; không đọc-rồi-ghi.
- Đăng nhập đúng xoá bộ đếm; đặt lại mật khẩu xoá bộ đếm của SĐT + email của tài khoản (lối mở khoá
  của chủ thật là "Quên mật khẩu").

Đổi chác có chủ đích: biết SĐT của ai đó là làm được người đó bị khoá đăng nhập 15 phút. Cái giá đó nhỏ
hơn để mật khẩu bị dò không giới hạn từ nhiều IP, và "Quên mật khẩu" mở khoá ngay.

`@Throttle` theo IP giữ nguyên — hai lớp độc lập.

### 4. Luồng OAuth WEB gắn với trình duyệt đã mở nó

`GET /auth/social/:provider` (luồng web) đặt cookie httpOnly `xp_oauth_state` = `state`, host-only,
`SameSite=Lax`, sống 10 phút như `state`. Callback xoá cookie đó ở mọi lối ra và chỉ chấp nhận khi
giá trị cookie trùng `state` (so thời gian hằng) — kiểm SAU `consume()`, nên link bị đem đi đâu thì
`state` cũng đã cháy. Luồng native không đổi (PKCE của app đã buộc kết quả vào đúng app).

### 5. Nối tài khoản theo email cần CẢ HAI đầu đã xác minh

`upsertUserFromIdentity` chỉ tự nối vào tài khoản có sẵn cùng email khi provider xác minh email **và**
`users.email_verified_at` của tài khoản đó khác null. Lệch một trong hai ⇒ `CONFLICT`, người dùng đăng
nhập bằng cách đã dùng trước đó.

## Hệ quả

- Mỗi request web có thêm một lượt tra khoá chính `web_sessions` — cùng giá với đường Bearer từ ADR
  0017.
- Deploy đầu tiên sau ADR này đăng xuất mọi người dùng web một lần (ghi vào runbook phát hành).
- Ngày cần màn "thiết bị đang đăng nhập" cho web, bảng đã có; thêm `user_agent`/`last_used_at` là một
  quyết định riêng (PII + một lượt ghi mỗi request).

## Cấm

- ❌ Nhận một cookie web chỉ vì chữ ký hợp lệ — `sid` phải trỏ vào hàng `web_sessions` còn sống.
- ❌ Ghi `web_sessions` ngoài `SessionService`, hay `login_throttles` ngoài `LoginThrottleService`.
- ❌ Đổi / đặt lại mật khẩu mà không thu hồi phiên trong cùng transaction.
- ❌ Trả lời khác nhau (mã, thời gian, cooldown) giữa định danh có và không có tài khoản ở đường
  đăng nhập / khoá đăng nhập.
- ❌ Hoàn tất callback OAuth web khi cookie `xp_oauth_state` vắng hoặc lệch `state`.
- ❌ Tự nối danh tính mạng xã hội vào tài khoản có email CHƯA xác minh.

## Cần xem lại

- 2FA (TOTP) cho tài khoản nền tảng — khi số nhân sự quản trị tăng hoặc có yêu cầu kiểm toán. Hiện
  có: khoá 5 lần, rate limit IP, và tuỳ chọn `ADMIN_ALLOWED_IPS` ở Caddy (`docs/deployment.md` §2.1).
- Ngưỡng khoá nếu có phàn nàn bị khoá oan hàng loạt (dấu hiệu ai đó dò theo danh sách SĐT).
