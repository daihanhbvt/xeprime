# Đặt xe không mật khẩu (guest passwordless) + đăng nhập bằng SĐT

> Mở rộng Phase 4. Khách vãng lai đặt xe và đăng nhập chỉ bằng **SĐT + OTP** (passwordless),
> không nhập mật khẩu, không bị ép sang màn đăng nhập giữa chừng. Bám ADR 0002 (session cookie),
> ADR 0006 (mô hình yêu cầu → chủ xe duyệt), ADR 0007 (type FE sinh từ OpenAPI).

## 1. Nguyên tắc mô hình (đã chốt với chủ dự án)

XePrime là **marketplace: hai bên tự thương lượng**, không trung gian thu tiền. Vì vậy OTP thành
công **KHÔNG** tạo thẳng đơn giữ lịch — nó:

1. Xác thực SĐT của khách.
2. **Tạo/đăng nhập tài khoản theo SĐT** (passwordless) + cấp session cookie httpOnly.
3. Lưu **yêu cầu thuê** (`booking_requests`, trạng thái `pending_host_approval`) gắn vào tài khoản.
4. Chủ xe **duyệt** yêu cầu → mới tạo `bookings` + giữ lịch (ADR 0006).

⇒ Không tạo đơn rác, không bỏ bước duyệt, không chiếm lịch trước khi chủ xe đồng ý.

## 2. Luồng đặt xe của khách (mobile-first, từng bước)

Chọn xe → “Yêu cầu thuê” → **bottom-sheet (mobile) / modal (desktop)** (padding + cuộn mặc định
của AntD, nút hành động căn phải trong luồng — theo chuẩn form của app):

- **Bước 1 — Ngày giờ:** prefill từ bộ lọc **“Tìm xe khả dụng”** (URL `pickupAt`/`returnAt` mang
  sang qua link thẻ xe + trang chi tiết). Bấm **Tiếp tục** → gọi **check-availability công khai**;
  xe bận → báo + chặn, xe trống → mở tiếp bước 2.
- **Bước 2 — Liên hệ:** họ tên + SĐT (**không** email, **không** ghi chú — tránh rắc rối). Có tóm
  tắt ngày đã chọn + “Đổi ngày”. Bấm **Tiếp tục** → gửi OTP (purpose `booking`).
- **Bước 3 — Xác minh:** nhập mã 6 số (tự submit khi đủ số, hỗ trợ dán, `autocomplete=one-time-code`,
  đếm ngược gửi lại, “Sửa số điện thoại”). Bấm **Gửi yêu cầu thuê** → `verify-otp` →
  `POST /public/booking-requests` (BE tạo/đăng nhập tài khoản + cấp session + lưu yêu cầu) → **màn
  thành công** → “Xem chuyến của tôi” (`/trips`, đã đăng nhập, chat được).

Không mất dữ liệu khi OTP sai/gửi lại (form giữ nguyên; verify và submit tách nhau nên submit lỗi
không phải verify lại). **Luồng đặt xe KHÔNG hỏi mật khẩu** (giữ nhanh gọn).

## 3. Đăng nhập ở trang `/login`

Tab **Email / SĐT** (mặc định): một ô định danh nhận **email HOẶC số điện thoại** + mật khẩu
(+ Google/Facebook). Tab **Đăng nhập OTP**: SĐT → **Gửi mã** (purpose `login`) → nhập mã →
`POST /auth/phone/login` (BE tạo tài khoản nếu chưa có + cấp session).

**Sau khi đăng nhập OTP**, nếu tài khoản **chưa có mật khẩu** (`hasPassword=false`) → hiện màn
**gợi ý đặt mật khẩu có nút “Bỏ qua”** (`POST /auth/password/set`). Đặt rồi thì lần sau không hỏi
lại. Đặt mật khẩu là tuỳ chọn để lần sau đăng nhập nhanh bằng mật khẩu; luồng đặt xe không có bước này.

## 4. Đăng xuất ở marketplace

Avatar ở `MarketHeader` là menu (Dropdown): **Chuyến của tôi / Tin nhắn / Đăng xuất**. Đăng xuất =
`DELETE /auth/session` + xoá cache React Query + về Home (dữ liệu người vừa thoát không lộ cho
người kế tiếp trên cùng máy).

## 5. Endpoint

| Method + path | Public? | Vào/ra |
| --- | --- | --- |
| `POST /auth/phone/send-otp` | ✅ | `{ phone, purpose }` → `{ expiresAt, devCode }` (devCode chỉ ở dev/mock) |
| `POST /auth/phone/verify-otp` | ✅ | `{ phone, purpose, code }` → `{ verified }` (best-effort stamp nếu đang đăng nhập) |
| **`POST /auth/phone/login`** | ✅ | `{ phone, code }` → `MeDto` + Set-Cookie `xp_session`. purpose `login` |
| `POST /auth/login` (nâng) | ✅ | `{ identifier, password }` — `identifier` là email HOẶC SĐT |
| **`POST /auth/password/set`** (mới) | 🔒 auth | `{ password }` → 204. Chỉ đặt được khi tài khoản CHƯA có mật khẩu (đã có → `CONFLICT`) |
| **`POST /public/booking-requests/check-availability`** (mới) | ✅ | `{ vehicleId, pickupAt, returnAt }` → `{ available }` (preview — ADR 0006) |
| `POST /public/booking-requests` | ✅ | như cũ + **cấp session** cho khách vãng lai; trả thêm `authenticated: true` |
| `GET /auth/me` (nâng) | 🔒 auth | thêm `hasPassword` (đã có mật khẩu chưa) |

- OTP `purpose` mới: **`login`**. Mã của mục đích này KHÔNG dùng chéo cho mục đích khác (verify lọc theo `purpose`).
- BE luôn tự truy vấn xe/chủ/tenant/khoảng ngày — **không tin giá/owner/tenant từ client**.
- `check-availability` chỉ là **preview** (có thể cũ ngay khi trả về); bảo vệ thật là exclusion
  constraint lúc chủ xe duyệt (ADR 0006).

## 6. Tài khoản tạo bằng SĐT

`AuthService.resolveOrCreateUserByPhone(phone, displayNameFallback?)`:

- Tìm theo `users.phone` (**@unique**). Có rồi → dùng lại (không tạo trùng), cập nhật
  `last_login_at`/`phone_verified_at`. Khoá (`status != active`) → `ACCOUNT_LOCKED`.
- Chưa có → tạo user `passwordHash = null` (như tài khoản Google/FB), `phone_verified_at` set,
  `display_name` = tên khách nhập hoặc `"Khách <4 số cuối>"`, thêm `user_identities` provider
  `phone_otp`. Đua unique(phone) khi nhiều request đồng thời → bắt `P2002` rồi đọc lại (idempotent).
- Sau này user có thể tự đặt mật khẩu / liên kết Google — không chặn luồng đặt xe.

## 7. Chống spam / bảo mật

- OTP 6 số, TTL 5 phút, cooldown 60s, ≤5 lần gửi/giờ (theo SĐT) + `@Throttle` theo IP ở controller.
- **Đếm số lần nhập sai** (`phone_verifications.attempt_count`): chạm `OTP_MAX_ATTEMPTS` (mặc định 5)
  → khoá mã (`status = failed`, `OTP_LOCKED`), phải gửi mã mới.
- Mã hash SHA-256 + pepper (không lưu plaintext). devCode chỉ trả ở dev/mock, không ở production.
- **Chống double-submit ở tầng DB:** partial unique index `booking_requests(vehicle_id,
  customer_phone, pickup_at, return_at) WHERE status='pending_host_approval'` → yêu cầu trùng
  ném `CONFLICT`, không tạo 2 dòng.
- Không gọi eSMS từ FE; chỉ BE gọi nhà cung cấp SMS. SĐT chỉ để hiển thị được che (`09•• ••• 567`).

## 8. Database (migration `20260729160000_add_phone_login`)

- `phone_verifications.attempt_count INTEGER NOT NULL DEFAULT 0`.
- Partial unique index chống trùng yêu cầu pending (SQL tay — Prisma không mô tả `WHERE`, giữ ở SQL
  như exclusion constraint occupancy).
- Không bảng mới. `users`/`booking_requests` đã sẵn cột cần (`phone @unique`, `customer_user_id`).

## 9. Biến môi trường

Chỉ thêm **`OTP_MAX_ATTEMPTS`** (mặc định 5). Các biến OTP còn lại giữ nguyên (`OTP_MODE`,
`ESMS_*`, `OTP_TTL_MINUTES`, `OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_SENDS_PER_HOUR`, `OTP_PEPPER`).
Dev: `OTP_MODE=mock` (log mã + devCode). Thật: `OTP_MODE=esms` + 3 `ESMS_*`.

## 10. Kiểm thử local

```
pnpm db:up
# BE (Postgres thật, tự skip nếu không có DB):
pnpm --filter @xeprime/api test -- phone-verification phone-login
```
- `phone-verification.spec.ts`: happy path · sai mã · **khoá sau 5 lần sai (OTP_LOCKED)** · hết hạn
  · cooldown · gate booking · purpose không dùng chéo.
- `phone-login.spec.ts`: tạo user passwordless + identity `phone_otp` · **không tạo trùng theo SĐT**
  · tên mặc định · **đặt mật khẩu (chỉ khi chưa có, lần 2 → CONFLICT)** · **đăng nhập SĐT + mật khẩu**
  · tài khoản khoá → `ACCOUNT_LOCKED`.

Thử tay: (1) trên marketplace bấm **“Tìm xe khả dụng”** (chọn ngày) → mở 1 xe → **Yêu cầu thuê**:
ngày đã prefill → **Tiếp tục** kiểm tra khung giờ → nhập tên/SĐT → OTP (dùng “Mã dev”) → thành công →
`/trips`. (2) `/login` mặc định tab **Email/SĐT + mật khẩu**; tab **OTP** đăng nhập → hiện màn đặt
mật khẩu **có Bỏ qua**. (3) đăng nhập bằng SĐT + mật khẩu (sau khi đã đặt). (4) menu avatar ở
marketplace có **Đăng xuất** → về Home.
