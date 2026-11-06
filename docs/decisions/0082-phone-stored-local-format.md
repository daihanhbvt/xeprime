# ADR 0082 — Mọi SĐT lưu dạng nội địa `0xxxxxxxxx`

Ngày: 06/11/2026 · Trạng thái: **Accepted** (06/11/2026 — người dùng chốt khi thấy cùng một người hiện
`84855553344` ở màn này, `0842223311` ở màn kia) · Liên quan: [0060](0060-phone-login-and-account-required-booking.md)
(chuẩn hoá `users.phone` về `84…`), [0053](0053-separate-account-realms.md) (unique `(realm, phone)`)

## Bối cảnh

ADR 0060 chuẩn hoá `users.phone` về dạng `84xxxxxxxxx` (khớp eSMS). Các cột SĐT khác (booking, yêu cầu
thuê, sổ khách, chi nhánh, lời mời…) lưu nguyên như người dùng gõ. Kết quả: dữ liệu trộn `0…`, `84…`,
`+84…`, và màn nào quên `toLocalVnPhone` thì hiện `84…`.

## Quyết định

1. **Dạng lưu duy nhất là `0xxxxxxxxx`** — ở MỌI cột SĐT, không chỉ `users.phone`. `normalizeVnPhone`
   (`@xeprime/types`) trả dạng này; `toLocalVnPhone` thành bí danh của nó.
2. **Nhập: chỉ chữ số và MỘT dấu `+` ở đầu.** Không dấu cách/chấm/gạch/ngoặc. Ô nhập SĐT tự lọc
   lúc gõ và lúc dán (`sanitizePhoneInput` — gắn sẵn trong `TextField` web khi `type="tel"`, và
   `TextField` mobile khi `keyboardType="phone-pad"`), nên `099 222 2222` dán vào thành `0992222222`.
   Schema FE và DTO backend vẫn CHẶN chuỗi có ký tự lạ (gọi API trực tiếp, app cũ).
3. **Hai loại ô**, tiền tố `0` / `84` / `+84` (`+840…` — số 0 thừa sau mã quốc gia — bị CHẶN):
   - **SĐT tài khoản** — đăng nhập, đăng ký, OTP, quên mật khẩu, đổi SĐT, đăng ký đối tác, mời thành
     viên / tài xế: chỉ di động 10 số, `VN_MOBILE_PHONE_PATTERN` (đầu `3/5/7/8/9` + 8 số). Số bàn
     không nhận được SMS; cho 11 số ở đây là để lọt số di động gõ thừa.
   - **SĐT liên hệ** — đơn, yêu cầu thuê, sổ khách, chi nhánh, hồ sơ gian hàng, chủ xe gốc:
     `VN_PHONE_PATTERN` = di động 10 số HOẶC số bàn `02` + 9 số.
   Server quy về `0…` ở mép DTO bằng `@PhoneInput()` / `@OptionalPhoneInput()`
   (`normalizeVnPhoneInput` — KHÔNG tha ký tự lạ), đặt trước `@Matches(...)`. `normalizeVnPhone`
   (tha dấu cách) chỉ dùng để TRA CỨU / SO SÁNH.
4. **Dạng quốc tế `84…` chỉ sinh ở mép gửi SMS** (`toIntlVnPhone` trong `EsmsOtpProvider`). Không lưu.
5. **Migration `20261106090000_normalize_phones_local`** (+ `20261106100000_normalize_phones_11_digits` cho dạng 11 số) đưa dữ liệu cũ về `0…`. Hàng mà chuẩn hoá xong
   đụng một ràng buộc unique (`users (realm, phone)`, `tenant_customers (tenant_id, normalized_phone)`,
   dedupe yêu cầu đang chờ) thì để nguyên cho người vận hành gộp; `phoneLookupVariants` vẫn tra thêm
   dạng `84…` để những hàng đó còn tìm thấy.

## Hệ quả

- Ghi đè phần "dạng lưu `84xxxxxxxxx`" của ADR 0060 và migration 20261014180000.
- Màn hiển thị không cần quy đổi nữa; `toLocalVnPhone` còn giữ ở các chỗ cũ là vô hại.
- Lớp service gọi trực tiếp (seed, test, worker) phải tự gọi `normalizeVnPhone` — `@PhoneInput()` chỉ
  phủ request HTTP.
