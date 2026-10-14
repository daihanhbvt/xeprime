# ADR 0060 — Site khách và site partner đăng nhập bằng SỐ ĐIỆN THOẠI + mật khẩu; OTP chỉ để xác minh; gửi yêu cầu thuê cần tài khoản khách

Ngày: 14/10/2026 · Trạng thái: Accepted · Ghi đè: ADR 0019 §8 (hai dòng "SĐT + OTP" và "Khách vãng
lai đặt xe"), ADR 0053 điều 3 (hai gạch `customer` và `partner`), ADR 0057 điều 4 (câu cuối về khách
chưa đăng nhập) và điều 5 (bước OTP đăng nhập), ADR 0046 điều 5 (cách khách vãng lai có danh tính),
ADR 0033 điều 5 (lý do "luôn tồn tại khách vãng lai") · Giữ nguyên: ADR 0002 · 0017 · 0053 điều 4
(phiên host-only theo realm, Bearer native), ADR 0019 (OAuth do backend chủ trì), ADR 0044 (thứ tự
đặt xe), ADR 0006

## Bối cảnh

Trước bản này site khách và site partner có bốn cửa vào: định danh (email HOẶC SĐT) + mật khẩu, mã
OTP (tìm-hoặc-tạo tài khoản theo SĐT rồi cấp phiên), Google/Facebook, và một cửa thứ tư nằm ngoài nhóm
auth — `POST /public/booking-requests` của khách vãng lai: form nhận họ tên + SĐT, qua OTP, server tự
tạo tài khoản rồi phát cookie (web) hoặc `receipt.session` (native).

Ba vấn đề:

1. **Một mã SMS đúng = một tài khoản + một phiên.** OTP đồng thời là xác minh, đăng ký và đăng nhập.
   Ai đọc được tin nhắn (máy cho mượn, SIM bị chiếm, số tái cấp cho người khác) là vào được tài khoản
   — kể cả tài khoản đã đặt mật khẩu, vì đường OTP không hỏi mật khẩu. Và một khách chỉ định gửi yêu
   cầu thuê thì nhận luôn một tài khoản họ không hề yêu cầu tạo.
2. **Danh tính người thuê đến từ payload.** Tên/SĐT/email trong form đặt xe là thứ client gõ; server
   tin chúng để ghi `booking_requests`, so trùng, so "tự đặt xe của mình" (ADR 0053 điều 7).
3. **Ba đường phát phiên phải rà mỗi lần đổi auth** (đăng nhập, đăng ký, gửi yêu cầu thuê), trong đó
   một đường phát phiên như tác dụng phụ của một hành động khác — đúng chỗ ADR 0019 §8 ghi là "dễ sót
   nhất".

Chủ sản phẩm chốt ngày 14/10/2026:

- Đăng nhập: SĐT, mật khẩu, "Quên mật khẩu", "Đăng ký ngay", Facebook, Google. Không email, không OTP.
- Đăng ký: SĐT, tên hiển thị, mật khẩu, nhập lại mật khẩu, Facebook, Google — **xác minh OTP ngay lúc
  đăng ký**.
- Gửi yêu cầu thuê cần đăng nhập; khách chưa đăng nhập bấm "Tiếp tục" thì hiện hộp đăng nhập (đăng ký
  được ngay trong đó) và sau đó đi tiếp đúng chỗ với dữ liệu đã nhập.
- Tài khoản chỉ có email (không SĐT) **không** có đường tự nâng cấp ở đợt này.
- Thành viên gian hàng được mời bằng SĐT; liên kết mời hiện cho chủ gian hàng tự gửi (miễn phí), SMS
  để sau.

## Quyết định

### 1. Định danh đăng nhập của `customer` và `partner` là SỐ ĐIỆN THOẠI

- `POST /auth/login` và `POST /auth/mobile/login` ở hai realm này chỉ nhận SĐT. Định danh có dạng
  email ⇒ **400 `PHONE_LOGIN_REQUIRED`** — server từ chối, không chỉ ẩn ô nhập. Luật một chỗ:
  `realmRequiresPhoneLogin(realm)` ở `@xeprime/types`.
- SĐT nhận cả dấu cách/chấm/gạch (`compactPhoneInput`), tra theo dạng chuẩn `84xxxxxxxxx`
  (`normalizePhone`) — dạng mọi đường ghi đều dùng (điều 9).
- `platform` **không đổi**: email (hoặc SĐT) + mật khẩu, quên mật khẩu qua email, không tự đăng ký,
  không social, không OTP (ADR 0053 điều 3).
- Google/Facebook giữ nguyên ADR 0019: OAuth ở server, realm ghi trong `oauth_states`, callback về
  đúng site. Đăng nhập social KHÔNG bao giờ dùng email của nhà cung cấp làm SĐT, và không sinh SĐT giả.

### 2. Đăng ký: SĐT + tên hiển thị + mật khẩu, xác minh OTP NGAY

Form (cả hai site): SĐT → tên hiển thị → mật khẩu → nhập lại → bước nhập mã (purpose **`register`**)
→ `POST /auth/register { phone, displayName, password, code }`.

Server, theo thứ tự: `assertSelfRegistration(realm)` → đối chiếu mã `register` (đếm sai, khoá mã như
mọi OTP) → SĐT đã có trong realm ⇒ `PHONE_TAKEN` → tạo tài khoản với `phone_verified_at = now`. Bước
gửi mã cũng kiểm trước: `send-otp` purpose `register` cho một SĐT đã có tài khoản trong realm ⇒
`PHONE_TAKEN`, không tốn SMS. (Đăng ký vốn luôn để lộ "số này đã có tài khoản"; không có cách nào
khác để bảo người dùng đăng nhập thay vì đăng ký.)

Không có đăng ký bằng email. Đăng ký vẫn KHÔNG tạo gian hàng — tuyến và gian hàng đi qua onboarding
của ADR 0040, như cũ. `POST /auth/mobile/register` dùng chung `RegisterDto` nên `code` bắt buộc ở
native.

### 3. OTP chỉ xác minh SĐT — không bao giờ tạo tài khoản hay cấp phiên

- Gỡ `resolveOrCreateUserByPhone`. `POST /auth/phone/login`, `POST /auth/mobile/phone/login` và
  `send-otp` purpose `login` trả **410 `OTP_LOGIN_RETIRED`**: không đọc body, không đối chiếu mã,
  không gửi SMS, không cấp phiên — kể cả khi mã gửi lên là đúng. Giữ route (không gỡ thành 404) để
  bản app cũ nhận một mã đọc được.
- Purpose còn sống: `register` (điều 2), `password_reset` (điều 4), `profile` (xác minh SĐT của tài
  khoản đang đăng nhập — điều 5). `login` còn trong `@xeprime/types` chỉ vì hàng cũ trong
  `phone_verifications` và vì mobile còn biên dịch theo nó.
- `verify-otp` công khai không cấp phiên (như trước). Đang đăng nhập thì nó gắn SĐT vừa chứng minh vào
  CHÍNH tài khoản đó (unique theo realm ⇒ `PHONE_TAKEN`) — chứng minh quyền dùng số là đủ, không phải
  một cửa vào tài khoản người khác.

### 4. Quên mật khẩu bằng SĐT — không lộ số nào có tài khoản, không thành đăng nhập OTP

- Gửi mã: `send-otp` purpose `password_reset`. Phản hồi và cooldown **giống hệt** dù số có tài khoản
  hay không: số không có tài khoản `active` trong realm vẫn ghi một lượt (để cooldown đếm như thật)
  nhưng **không gửi SMS** (`deliver: false`). Không ghi lượt thì cooldown khác nhau là đủ để dò.
- Đặt lại: `POST /auth/password/reset-otp { phone, code, password }` → 204. Đối chiếu mã
  `password_reset`; không có tài khoản ⇒ `OTP_INVALID` (y như sai mã); có ⇒ MỘT transaction: thay
  hash, đóng `phone_verified_at` nếu còn trống (vừa chứng minh xong), vô hiệu mọi token đặt lại qua
  email đang mở. **Không cấp phiên** — người dùng đăng nhập lại bằng mật khẩu mới.
- Route chỉ khai `customer` · `partner`. `POST /auth/password/forgot` (qua email) vẫn sống cho mọi
  realm (site quản trị, app cũ); nó không mở được cửa nào mới vì đăng nhập vẫn đòi SĐT (điều 1).
- Đã biết: đặt lại mật khẩu chưa thu hồi phiên native đang mở (xem Câu hỏi còn mở).

### 5. Tài khoản chưa có SĐT đã xác minh: cổng bắt buộc

Tài khoản tạo bằng Google/Facebook không có SĐT; tài khoản đăng ký trước bản này có thể có SĐT chưa
xác minh. Trên web, `AccountPhoneGate` (mount ở layout site khách và site partner) chặn mọi tài khoản
`customer`/`partner` có `phoneVerified = false` bằng một hộp KHÔNG đóng được: xác minh SĐT (purpose
`profile`, qua `ContactVerifyModal`) hoặc đăng xuất. Số đã thuộc tài khoản khác cùng realm ⇒
`PHONE_TAKEN`; không gộp tài khoản (Câu hỏi còn mở).

Cổng là UX. Chốt chặn thật nằm ở endpoint: gửi yêu cầu thuê đòi SĐT đã xác minh (điều 6), nhận lời
mời đòi SĐT đã xác minh trùng số được mời (điều 8).

### 6. Gửi yêu cầu thuê cần TÀI KHOẢN KHÁCH; danh tính lấy từ tài khoản

- `POST /public/booking-requests` không còn `@Public`: `AuthGuard` + `@Realms(customer)` — chưa đăng
  nhập ⇒ 401. Đường dẫn giữ nguyên để không đổi contract của app. `check-availability` và
  `busy-days` vẫn công khai.
- `submitPublic(dto, customerUserId)` đọc tên/SĐT/email người thuê từ `users`
  (`loadBookingCustomer`): realm khác `customer` ⇒ `SHOP_ACCOUNT_CANNOT_BOOK`; không có SĐT hoặc SĐT
  chưa xác minh ⇒ `PHONE_NOT_VERIFIED`; email chỉ lấy khi đã xác minh.
- `customerName` · `customerPhone` · `customerEmail` · `client` · `device` trong DTO thành tuỳ chọn,
  `deprecated`, và **bị bỏ qua** — giữ khai báo vì `forbidNonWhitelisted` sẽ làm bản app cũ nhận 400
  thay vì một yêu cầu thuê. `receipt.session` `deprecated`, không bao giờ có giá trị.
- Không đổi: thứ tự ADR 0044; cổng bằng lái (ADR 0057 — nay luôn có tài khoản để soát); chặn tự đặt
  xe (ADR 0053 điều 7 — so SĐT ĐÃ XÁC MINH của chính tài khoản); danh sách chặn; trần hold đang mở
  (ADR 0045 điều 6); index chống trùng ở DB; mã khuyến mãi (ADR 0046); cổng liên hệ (ADR 0056).
- Thứ tự kiểm ở `submitPublic`: xe → danh tính → điều kiện dịch vụ → danh sách chặn → tự đặt xe →
  trần hold → bằng lái → trùng yêu cầu → mã khuyến mãi → transaction ghi.

### 7. Bản nháp đặt xe: giữ thứ đã nhập qua lượt đăng nhập — KHÔNG BAO GIỜ tự gửi

Luồng web (`RequestBookingFlow`) bỏ bước liên hệ và bước OTP. "Tiếp tục" ở bước Chuyến đi kiểm dữ
liệu + khung giờ như cũ; chưa đăng nhập thì **lưu bản nháp** rồi mở hộp đăng nhập ngữ cảnh đặt xe
(`AUTH_CONTEXT.BOOKING`, chuyển sang đăng ký được ngay trong hộp).

- **Nơi giữ:** `sessionStorage` khoá `xp.bookingDraft.v1` (`features/booking-requests/booking-draft.ts`),
  một bản cho một xe, sống 30 phút. KHÔNG URL — URL vào lịch sử trình duyệt, log proxy và link chia
  sẻ. KHÔNG `localStorage` — sống qua cả lúc đóng trình duyệt và nằm lại cho người sau trên cùng máy.
  Bản nháp không mang danh tính: ngày giờ (giờ VN dạng ISO), dịch vụ, địa chỉ giao/đón, gói dài hạn,
  chế độ thuê, mã khuyến mãi. Nó KHÔNG mang ô "đồng ý điều khoản" — lời đồng ý của một người, còn
  người đăng nhập xong trên tab đó có thể là người khác; lượt đi tiếp luôn bỏ tick ô này.
- **Quay lại:** đăng nhập/đăng ký bằng mật khẩu diễn ra NGAY TRÊN trang nên hộp yêu cầu vẫn mở;
  Google/Facebook RỜI trang và quay về đúng trang xe trong CÙNG tab — `RequestBookingButton` thấy bản
  nháp + phiên thì mở lại hộp với dữ liệu khôi phục.
- **Điều kiện đi tiếp:** đang chờ đăng nhập, tài khoản có SĐT đã xác minh, và `/auth/me` được nạp
  SAU mốc mời đăng nhập (`dataUpdatedAt > signInRequestedAt`; hộp dựng lại từ bản nháp thì mốc là
  lúc GHI bản nháp — `savedAt` — và nút trang xe chỉ tự mở hộp theo cùng phép so). Thiếu vế cuối thì một người dùng CŨ
  còn trong cache sau khi phiên chết (401) được tính là "vừa đăng nhập" — flow đi tiếp sau lưng hộp
  đăng nhập, ăn 401, mời lại, thành vòng lặp. Tài khoản chưa xác minh SĐT thì ĐỢI cổng của điều 5.
- **Đi tiếp = kiểm lại**: dữ liệu + khung giờ (có thể đã có người giữ trong lúc đăng nhập) → bằng lái
  → Xác nhận. Khách tự bấm "Gửi yêu cầu thuê" — nên vòng OAuth hay đăng nhập lại không bao giờ sinh
  thêm yêu cầu. Nút gửi có khoá đồng bộ; index chống trùng ở DB vẫn là chốt cuối.
- Mã khuyến mãi (của bản nháp, hoặc đang áp lúc mời đăng nhập) được đánh giá lại MỘT lần, SAU khi đã
  có phiên — kết quả phụ thuộc người xem (ADR 0046 điều 5, 7); không đánh giá ẩn danh rồi giữ số đó,
  không chép số giảm cũ.
- Bản nháp bị xoá khi gửi thành công, khi khách tự đóng hộp, và ngay khi luồng đi tiếp.

### 8. Thành viên gian hàng được mời bằng SĐT; liên kết trả cho người mời

Site partner đăng nhập bằng SĐT thì lời mời cũng phải bằng SĐT — mời bằng email là mời một định danh
người được mời không dùng được để vào.

- `POST` tạo lời mời nhận `phone` (thay `email`) và trả `inviteUrl` **đúng một lần**, trong phản hồi
  tạo. Không gửi thư; chủ gian hàng sao chép và tự gửi (Zalo, tin nhắn) — miễn phí. Mời lại cùng số ⇒
  thu hồi lời mời đang chờ cũ của số đó; khoá tư vấn theo (gian hàng, số) trong transaction tạo giữ
  "một số một link sống" kể cả khi hai lượt mời chạy song song. Số đã là thành viên ⇒ từ chối như trước.
- Nhận lời mời: tài khoản `partner` có SĐT ĐÃ XÁC MINH trùng số được mời; lệch ⇒
  `INVITE_PHONE_MISMATCH` (chi tiết chỉ mang số đã che). Liên kết lộ ra cũng vô hại vì điều kiện này.
- Xem trước lời mời: `invitedPhoneMasked` (mới), `invitedEmailMasked` thành nullable.
- Lời mời email còn hạn vẫn trả lời được theo luật email cũ cho tới khi hết hạn; không tạo mới.
- Một tài khoản một gian hàng (ADR 0053 điều 6) không đổi.

### 9. SĐT đã lưu chuẩn hoá về `84xxxxxxxxx`

Đăng nhập tra đúng dạng chuẩn. Migration dữ liệu `20261014180000_normalize_user_phones` (chạy lại
được) đưa `0xxxxxxxxx` / `+84xxxxxxxxx` (kể cả có dấu phân cách) về `84xxxxxxxxx`; hàng nào chuẩn hoá
xong sẽ trùng một hàng khác cùng realm thì ĐỂ NGUYÊN cho người vận hành (truy vấn kiểm tra ở cuối
file migration). Seed ghi dạng chuẩn từ nay.

### 10. Tài khoản đã có trước bản này

Không xoá, không vô hiệu tài khoản nào, không đổi dữ liệu ngoài điều 9.

| Loại | Sau bản này |
| --- | --- |
| Tạo bằng OTP, chưa đặt mật khẩu (`password_hash` null, SĐT đã xác minh) | Đăng nhập được sau khi tự đặt mật khẩu qua **"Quên mật khẩu"** (điều 4); hoặc Google/Facebook nếu đã nối |
| Có SĐT + mật khẩu, SĐT chưa xác minh | Đăng nhập được; web chặn bằng cổng điều 5 cho tới khi xác minh; gửi yêu cầu thuê bị `PHONE_NOT_VERIFIED` ở server |
| Chỉ có email + mật khẩu, không SĐT | **Không đăng nhập được** ở site khách/partner (email ⇒ `PHONE_LOGIN_REQUIRED`). Không có đường tự nâng cấp (chủ sản phẩm chốt 14/10/2026). Vào được nếu đã nối Google/Facebook — rồi qua cổng điều 5 |
| Google/Facebook, không SĐT | Đăng nhập như cũ, rồi qua cổng điều 5 |
| SĐT lưu dạng cũ, đụng số khi chuẩn hoá | Không đăng nhập bằng SĐT cho tới khi người vận hành xử lý (điều 9) |
| Lời mời email đang chờ | Trả lời được tới khi hết hạn (điều 8) |
| Phiên đang mở (cookie web, phiên native) | Không bị thu hồi |

## Hệ quả

- **App native (`apps/mobile`, do dev khác — bản này chỉ sửa backend + web)** sẽ gặp: đăng ký cần
  `code` (gửi `send-otp` purpose `register` trước); đăng nhập OTP và `send-otp` purpose `login` trả
  410; gửi yêu cầu thuê khi chưa đăng nhập trả 401 và không còn `receipt.session`; trường liên hệ
  người thuê bị bỏ qua; đăng nhập bằng email ở app khách/partner trả `PHONE_LOGIN_REQUIRED`; tạo lời
  mời nhận `phone` và trả `inviteUrl` (không còn `emailSent`); `invitedEmailMasked` nullable;
  `PhoneVerificationPurpose` có thêm `register`; có `POST /auth/password/reset-otp`.
- Chỉ còn hai loại đường phát phiên ở site khách/partner: mật khẩu (đăng nhập, đăng ký) và social.
  Gửi yêu cầu thuê không phát phiên nữa.
- `booking_requests.customer_user_id` luôn có giá trị với mọi yêu cầu mới; tên/SĐT trên yêu cầu là
  ảnh chụp từ tài khoản lúc gửi.
- Test khoá luật: `phone-login.spec.ts`, `phone-verification.spec.ts`, `phone-auth-http.spec.ts`
  (guard thật: 401/403 ở đặt xe, 410 ở OTP đăng nhập), `member-invites.spec.ts`; web:
  `AuthModal.test.tsx`, `RequestBookingModal.test.tsx` (bản nháp, vòng 401, không tự gửi),
  `InviteMemberModal.test.tsx`. `mobile-register-and-guest-session.spec.ts` bị gỡ cùng hành vi nó khoá.

## Quan hệ với ADR cũ

- **ADR 0019 §8** — bảng "Đường": dòng "SĐT + OTP" và dòng "Khách vãng lai đặt xe" hết hiệu lực; dòng
  "Đăng ký" cần thêm `code`. Phần còn lại của 0019 giữ nguyên.
- **ADR 0053 điều 3** — `customer`: "mật khẩu, OTP, social như hiện tại" ⇒ SĐT + mật khẩu và social;
  `partner`: nhân viên vào bằng lời mời theo SĐT (điều 8 ở trên). Gạch `platform` giữ nguyên.
- **ADR 0057 điều 4–5** — "khách chưa đăng nhập bị soát trước khi tạo tài khoản theo SĐT" và bước
  "OTP đăng nhập" không còn đối tượng: người gửi yêu cầu luôn đã đăng nhập. Luồng web còn
  `Chuyến đi → [Bằng lái] → Xác nhận`.
- **ADR 0046 điều 5** — danh tính khi giữ lượt mã vẫn là `users.id`, nay luôn từ phiên, không còn quy
  SĐT qua OTP về tài khoản.
- **ADR 0033 điều 5** — `bank_transfer` không mất, nhưng lý do "luôn tồn tại người không có ví" chỉ
  còn đúng với hold cũ không có `customer_user_id`; mọi yêu cầu mới có tài khoản nên hoàn về ví.

## Ràng buộc bắt buộc

- Không cấp phiên, không tạo tài khoản vì một mã OTP đúng — ở bất kỳ endpoint nào.
- Không nhận email làm định danh đăng nhập ở `customer`/`partner` — chặn ở server, không chỉ ở form.
- Không đọc tên/SĐT/email người thuê từ payload đặt xe — đọc từ tài khoản của phiên.
- Không để `password_reset` trả lời hay đếm cooldown khác nhau giữa số có và không có tài khoản.
- Không đặt bản nháp đặt xe vào URL hay `localStorage`, và không bao giờ tự gửi yêu cầu từ bản nháp.
- Không coi `/auth/me` trong cache là "vừa đăng nhập" — so `dataUpdatedAt` với mốc mời đăng nhập.
- Không dùng email của nhà cung cấp social làm SĐT, không sinh SĐT giả cho tài khoản social.
- Không cho tài khoản nhận lời mời khi SĐT chưa xác minh hoặc khác số được mời.

## Câu hỏi còn mở

1. **Tài khoản chỉ có email** — không có đường tự nâng cấp (chốt 14/10/2026). Nếu thực tế có người
   kẹt, cần một đường hỗ trợ có xác minh (admin gắn SĐT sau khi người đó chứng minh quyền dùng email +
   SĐT), không phải mở lại đăng nhập email.
2. **`PHONE_TAKEN` ở cổng điều 5** — một người vào bằng Google trong khi SĐT của họ đã thuộc tài khoản
   mật khẩu cùng realm thì chỉ còn đăng xuất. Gộp tài khoản cần quyết định riêng (tiền trong ví, chuyến,
   membership).
3. **Thu hồi phiên khi đặt lại mật khẩu** — phiên native đang mở chưa bị thu hồi (cần thêm lý do thu
   hồi vào CHECK của `native_auth_sessions`); cookie web là JWT không trạng thái nên cũng chưa thu hồi.
4. **Gửi liên kết mời bằng SMS** — làm sau, khi có ngân sách SMS; hôm nay chủ gian hàng tự gửi.
5. **Vai trò tuỳ biến theo gian hàng** — schema có, chưa có API/UI; lời mời chỉ chọn vai hệ thống.
6. **App native** cập nhật theo mục Hệ quả (dev mobile).

## Cần xem lại khi nào

- Khi tỉ lệ đăng ký bỏ dở ở bước OTP cao rõ rệt so với trước — xem lại thời điểm xác minh (không phải
  bỏ xác minh).
- Khi có nhà cung cấp SMS rẻ/miễn phí cho lời mời, hay có yêu cầu đăng nhập không mật khẩu trở lại —
  phải đi qua một ADR mới, không phải mở lại route 410.
