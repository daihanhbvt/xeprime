# Đăng nhập bằng SĐT, đăng ký có OTP và đặt xe cần tài khoản

> Cập nhật: 16/10/2026 (hộp tài khoản site khách theo design v2) · Quyết định: [ADR 0060](decisions/0060-phone-login-and-account-required-booking.md)
> (thay bản "đặt xe không mật khẩu" 06/10/2026 — trước đây file này tên
> `guest-booking-passwordless.md`).
>
> Bám ADR 0002 · 0053 (cookie host-only theo realm), ADR 0017 (Bearer native), ADR 0019 (OAuth do
> backend chủ trì), ADR 0044 (gửi yêu cầu → duyệt → thu tiền giữ chỗ → đơn thuê), ADR 0006 (chống
> trùng lịch bằng constraint), ADR 0007 (type FE sinh từ OpenAPI).

Tài liệu vận hành cho người làm web/API/mobile: luồng màn hình, endpoint, mã lỗi, cách thử. Lý do
của từng luật nằm ở ADR 0060.

## 1. Ai đăng nhập bằng gì

| Site | Realm | Đăng nhập | Đăng ký | Quên mật khẩu |
| --- | --- | --- | --- | --- |
| Khách `xeprime.vn` | `customer` | **SĐT + mật khẩu** · Google · Facebook — modal `?auth=login` | SĐT · tên hiển thị · mật khẩu · xác nhận → **mã OTP** (popup) → đã đăng nhập | SĐT → mã OTP → mật khẩu mới — ba bước ngay trong hộp `?auth=forgot` |
| Partner `partner.xeprime.vn` | `partner` | như trên — trang `/login` của site partner | như trên (rồi onboarding chọn tuyến — ADR 0040) | như trên |
| Quản trị `admin.xeprime.vn` | `platform` | email (hoặc SĐT) + mật khẩu, `passwordOnly` | không tự đăng ký | qua email |

- Site khách/partner gõ email vào ô SĐT ⇒ form báo sai định dạng; gọi thẳng API ⇒
  **400 `PHONE_LOGIN_REQUIRED`**. SĐT nhận cả dấu cách/chấm/gạch.
- Cùng một SĐT ở site khách và site partner là HAI tài khoản, mật khẩu riêng (ADR 0053).
- "Ghi nhớ tài khoản" (hộp site khách): đăng nhập THÀNH CÔNG với ô được tick thì nhớ SĐT ở
  `localStorage` (`xp.auth.rememberedPhone`) để lần sau điền sẵn; bỏ tick rồi đăng nhập thì quên.
  Không bao giờ lưu mật khẩu/token, không đổi thời hạn phiên.
- **Không còn đăng nhập bằng OTP.** OTP chỉ xác minh SĐT: lúc đăng ký, lúc quên mật khẩu, và ở cổng
  xác minh (§4).
- Đăng nhập/đăng ký KHÔNG tạo gian hàng; site partner đi tiếp qua onboarding như cũ.

## 2. Đăng ký

Logic đăng nhập/đăng ký là MỘT hook `useAuthFlow` (`features/auth/hooks/use-auth-flow.ts`); hai bề mặt
chỉ khác phần nhìn:

- **Site khách** — hộp tài khoản design v2 (`AuthModal` → `MarketAuthForms`): bấm "Đăng ký" mở popup
  **"Xác minh tài khoản"** (`VerifyAccountDialog`, sáu ô mã, "Gửi lại mã (00:58)"). Mã đúng ⇒ tài khoản
  ra đời VÀ đã đăng nhập: hộp đóng thẳng, chạy tiếp hành động bị chặn hoặc đi tới `next` — không có
  màn "Tạo tài khoản thành công". Đóng popup ⇒ về form, thứ đã điền còn nguyên.
- **Site partner** — `AuthPanel` → `RegisterForm` + bước mã `OtpCodeStep` như dưới đây.

Các bước (chung):

1. Nhập SĐT (gợi ý: dùng để đăng nhập), tên hiển thị, mật khẩu, nhập lại.
2. "Đăng ký" → `POST /auth/phone/send-otp { phone, purpose: "register" }`. SĐT đã có tài khoản trong
   realm ⇒ `PHONE_TAKEN` ngay, không gửi SMS (màn hình mời đăng nhập).
3. Bước mã (`OtpCodeStep`): nhập 6 số, gửi lại có đếm ngược, "Sửa thông tin" quay lại form (giữ
   nguyên dữ liệu).
4. `POST /auth/register { phone, displayName, password, code }` → server đối chiếu mã, tạo tài khoản
   với `phone_verified_at`, phát cookie phiên của site.

Môi trường có **mã test** (dev/staging — §8) thì bỏ qua bước gửi SMS, nhập thẳng mã test.

## 3. Quên mật khẩu

**Site khách** — ba bước ngay trong hộp (`?auth=forgot`, `MarketForgotPassword`; `/forgot-password` cũ
chuyển về đây):

1. SĐT → `send-otp { purpose: "password_reset" }` (như bước 1 dưới đây).
2. "Nhập mã OTP": sáu ô → `POST /auth/phone/verify-otp { purpose: "password_reset" }` — mã sai báo NGAY
   ở bước này. Vạch tiến trình của bước đã qua bấm được để quay lại sửa số.
3. "Đặt lại mật khẩu": mật khẩu mới + xác nhận → `reset-otp { phone, code, password }` với mã đã xác
   minh (server nhận trong 10 phút, vẫn đếm lần đoán sai, rồi TIÊU nó — ADR 0060 §4 bổ sung 16/10). Mã chết giữa chừng ⇒ về
   bước 2 kèm câu lỗi.
4. Popup "Thành công!" → "Đăng nhập" về form đăng nhập, số vừa đặt lại điền sẵn. **Không tự đăng nhập.**

**Site partner** — `ForgotPasswordView` → `ForgotPasswordByPhone` (một màn + popup mã; site quản trị
giữ `ForgotPasswordByEmail`):

1. Nhập SĐT → `send-otp { purpose: "password_reset" }`. Phản hồi **giống hệt** dù số có tài khoản
   hay không; số không có tài khoản thì không có SMS nào đi (`deliver: false`) nhưng cooldown vẫn
   đếm.
2. Nhập mã + mật khẩu mới + nhập lại → `POST /auth/password/reset-otp { phone, code, password }` →
   204. Số không có tài khoản ⇒ `OTP_INVALID`, y như sai mã.
3. Màn "Đã đặt lại mật khẩu" → nút đăng nhập. **Không tự đăng nhập.**

Đây cũng là đường cho tài khoản cũ tạo bằng OTP chưa từng có mật khẩu (§9).

## 4. Cổng xác minh SĐT

`AccountPhoneGate` (mount ở `app/(public)/layout.tsx` và `app/(manage)/layout.tsx`): tài khoản
`customer`/`partner` đang đăng nhập mà `phoneVerified = false` (vào bằng Google/Facebook, hoặc đăng ký
trước ADR 0060) thấy `ContactVerifyModal` ở chế độ bắt buộc — không đóng được, lối ra duy nhất ngoài
xác minh là **Đăng xuất**. Xác minh đi qua endpoint SĐT của tài khoản (purpose `profile`). Số đã
thuộc tài khoản khác cùng realm ⇒ `PHONE_TAKEN`.

Cổng chỉ là UX — server tự chặn: gửi yêu cầu thuê ⇒ `PHONE_NOT_VERIFIED`; nhận lời mời ⇒
`INVITE_PHONE_MISMATCH`.

## 5. Đặt xe (khách)

Chọn xe → "Yêu cầu thuê" → bottom-sheet (mobile) / modal (desktop):

- **Chuyến đi:** thời gian (prefill từ bộ lọc "Tìm xe khả dụng"), dịch vụ, địa chỉ giao/đón, gói dài
  hạn. "Tiếp tục" → kiểm dữ liệu + `POST /public/booking-requests/check-availability` (preview — chốt
  thật là constraint lúc duyệt, ADR 0006).
- **Chưa đăng nhập:** lưu **bản nháp** rồi mở hộp đăng nhập ngữ cảnh đặt xe (có link "Đăng ký ngay";
  đăng ký xong không hiện màn chào mừng mà quay lại chuyến).
- **[Bằng lái]** nếu thuê tự lái/dài hạn và bằng chưa hợp lệ cho chuyến (ADR 0057).
- **Xác nhận:** dòng "Người thuê" lấy từ tài khoản (tên + SĐT đã xác minh), chỉ đọc. Khách bấm "Gửi
  yêu cầu thuê" → `POST /public/booking-requests` (cần phiên) → màn thành công → "Chuyến của tôi".

**Bản nháp** (`features/booking-requests/booking-draft.ts`):

| | |
| --- | --- |
| Nơi giữ | `sessionStorage` khoá `xp.bookingDraft.v1` — KHÔNG URL, KHÔNG `localStorage` |
| Nội dung | giá trị form chuyến (ngày giờ dạng ISO giờ VN), chế độ thuê, mã khuyến mãi. Không danh tính, không ô đồng ý điều khoản |
| Phạm vi | một bản cho một xe, sống 30 phút |
| Mật khẩu | đăng nhập ngay trên trang, hộp yêu cầu vẫn mở và đi tiếp tại chỗ |
| Google/Facebook | rời trang, quay về đúng trang xe cùng tab → `RequestBookingButton` thấy bản nháp + phiên → mở lại hộp, khôi phục dữ liệu |
| Đi tiếp khi | đang chờ đăng nhập + `me.phoneVerified` + `/auth/me` nạp SAU lúc mời đăng nhập (dựng lại từ bản nháp: SAU lúc ghi bản nháp) |
| Đi tiếp = | kiểm lại dữ liệu + khung giờ → bằng lái → Xác nhận; mã khuyến mãi đánh giá lại một lần cho tài khoản vừa vào; ô điều khoản bỏ tick. **Không tự gửi** |
| Xoá khi | gửi thành công · khách đóng hộp · luồng đã đi tiếp |

Lỗi lúc gửi: 401 (phiên vừa hết) ⇒ về bước Chuyến đi + mời đăng nhập lại; `PHONE_NOT_VERIFIED` ⇒ làm
mới `/auth/me` (cổng §4 hiện ra) + báo lỗi; mã lỗi bằng lái ⇒ bước bằng lái.

Server (`BookingRequestsService.submitPublic(dto, customerUserId)`): tên/SĐT/email đọc từ tài khoản;
`customerName`/`customerPhone`/`customerEmail`/`client`/`device` trong body bị bỏ qua (giữ cho app
cũ). Tài khoản không phải `customer` ⇒ `SHOP_ACCOUNT_CANNOT_BOOK`.

## 6. Mời thành viên gian hàng (site partner)

- "Mời thành viên" (`InviteMemberModal`): SĐT + vai trò (+ chi nhánh phụ trách — ADR 0052) → "Tạo lời
  mời". Thành công thì hộp **không đóng**: hiện liên kết mời + nút "Sao chép liên kết"; liên kết chỉ
  có ở phản hồi này. Chủ gian hàng tự gửi qua Zalo/tin nhắn rồi bấm "Xong".
- Người được mời mở liên kết trên site partner → đăng nhập hoặc đăng ký tài khoản đối tác bằng ĐÚNG số
  đó (đăng ký đã xác minh số) → "Đồng ý". Số khác ⇒ `INVITE_PHONE_MISMATCH`.
- Bảng "Lời mời đang chờ" hiện số (hoặc email với lời mời cũ); "Thu hồi" làm liên kết hết giá trị ngay.

## 7. Endpoint

| Method + path | Phiên | Vào → ra |
| --- | --- | --- |
| `POST /auth/login` | công khai | `{ identifier, password }` — `customer`/`partner`: `identifier` phải là SĐT, email ⇒ `PHONE_LOGIN_REQUIRED` |
| `POST /auth/register` | công khai | `{ phone, displayName, password, code }` → `MeDto` + cookie |
| `POST /auth/phone/send-otp` | công khai | `{ phone, purpose }` → `{ expiresAt, devCode }`. `register`: số đã có ⇒ `PHONE_TAKEN`. `password_reset`: luôn cùng một hình. `login` ⇒ **410 `OTP_LOGIN_RETIRED`** |
| `POST /auth/phone/verify-otp` | công khai | `{ phone, purpose, code }` → `{ verified }`. Không cấp phiên; đang đăng nhập thì gắn số vào chính tài khoản |
| `POST /auth/phone/login` | — | **410 `OTP_LOGIN_RETIRED`** (đã gỡ) |
| `POST /auth/password/reset-otp` | công khai | `{ phone, code, password }` → 204. Chỉ `customer`/`partner`. Không cấp phiên |
| `POST /auth/password/forgot` · `reset` | công khai | qua email — site quản trị và app cũ |
| `POST /auth/password/set` | 🔒 | `{ password }` → 204, chỉ khi tài khoản chưa có mật khẩu |
| `POST /public/booking-requests/check-availability` · `GET …/busy-days` | công khai | preview lịch |
| `POST /public/booking-requests` | 🔒 `customer` | chưa đăng nhập ⇒ 401. Danh tính từ phiên |
| `POST /auth/mobile/login` · `register` · `social/exchange` | công khai | như web, trả `MobileSessionDto`; `register` cần `code` |
| `POST /auth/mobile/phone/login` | — | **410 `OTP_LOGIN_RETIRED`** (đã gỡ) |

## 8. Chống spam / bảo mật

- OTP 6 số, sống `OTP_POLICY.TTL_MINUTES` (5) phút, cooldown 60 giây, ≤ 5 lần gửi/giờ theo SĐT, nhập sai
  5 lần ⇒ khoá mã (`OTP_LOCKED`); `@Throttle` theo IP ở controller. Mã băm SHA-256 + pepper.
- Mã của một purpose không dùng cho purpose khác; mã của realm này không dùng ở realm kia.
- **Mã test** (`OTP_BYPASS_CODE`, hoặc mã dev mặc định khi `NODE_ENV=development`) — KHÔNG BAO GIỜ ở
  production. `devCode` chỉ trả ở provider mock ngoài production.
- Chống gửi trùng yêu cầu thuê: khoá đồng bộ ở nút gửi + partial unique index ở DB
  (`booking_requests_pending_dedupe_idx`, `booking_requests_pending_long_term_dedupe_idx`) ⇒ `CONFLICT`.
- FE không bao giờ gọi nhà cung cấp SMS; SĐT ở màn xác minh và trang lời mời hiển thị dạng che.

## 9. Tài khoản cũ

| Loại | Vào bằng cách nào |
| --- | --- |
| Tạo bằng OTP, chưa có mật khẩu | "Quên mật khẩu" (§3) để đặt mật khẩu, hoặc Google/Facebook nếu đã nối |
| SĐT chưa xác minh | Đăng nhập bằng SĐT + mật khẩu, qua cổng §4 |
| Chỉ email, không SĐT | Không vào được site khách/partner bằng mật khẩu; chưa có đường tự nâng cấp (ADR 0060 — câu hỏi mở) |
| Google/Facebook không SĐT | Như cũ, rồi qua cổng §4 |

`users.phone` chuẩn hoá về `84xxxxxxxxx` bằng migration `20261014180000_normalize_user_phones`; hàng
đụng số được để nguyên — truy vấn kiểm tra ở cuối file migration.

## 10. Kiểm thử

```bash
pnpm db:up
# API — Postgres thật (REQUIRE_DB=1 để đỏ khi thiếu DB)
cd apps/api && REQUIRE_DB=1 pnpm test -- phone-login phone-verification phone-auth-http member-invites
# Web — chạy theo đường dẫn
cd apps/web && npx vitest run src/features/auth src/features/booking-requests src/features/members
```

- `phone-login.spec.ts`: đăng ký cần mã `register` · đăng nhập chỉ bằng SĐT (email ⇒
  `PHONE_LOGIN_REQUIRED`) · quên mật khẩu bằng OTP không cấp phiên · OTP đăng nhập ⇒ 410 · tách realm.
- `phone-verification.spec.ts`: sai mã/khoá/hết hạn/cooldown · `deliver: false` không gửi SMS.
- `phone-auth-http.spec.ts`: guard thật — đặt xe chưa đăng nhập 401, phiên partner 403
  `REALM_NOT_ALLOWED`, trường liên hệ của app cũ bị bỏ qua chứ không 400.
- `RequestBookingModal.test.tsx`: bản nháp, quay lại sau đăng nhập, vòng 401 với cache cũ, không tự gửi.

Thử tay (dev): (1) mở một xe → "Yêu cầu thuê" → chọn ngày → "Tiếp tục" khi chưa đăng nhập → đăng ký
trong hộp (mã test) → quay lại đúng chuyến, sang Xác nhận, tự bấm gửi. (2) Làm lại với Google → quay
về trang xe, hộp tự mở lại với dữ liệu cũ → cổng xác minh SĐT → đi tiếp. (3) Site partner: mời một
SĐT → sao chép liên kết → đăng ký tài khoản đối tác bằng đúng số đó ở cửa sổ ẩn danh → đồng ý. Tài
khoản demo và SĐT đăng nhập: [`qa-accounts.md`](qa-accounts.md).
