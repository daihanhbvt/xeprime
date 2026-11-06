/**
 * Trần theo IP của các cửa xác thực — MỘT chỗ cho cả web (`AuthController`,
 * `PhoneVerificationController`) lẫn app (`MobileAuthController`). Hai controller gọi CÙNG
 * `AuthService`, nên để một bên rộng hơn nghĩa là cửa chặt nhất chính là cửa lỏng nhất — kẻ dò chỉ
 * việc đổi URL. Dùng chung hằng số thì hai bên không thể lệch nhau.
 *
 * Throttler đếm theo `req.ip`, mà nhiều người dùng thật chung MỘT IP: cả văn phòng sau một NAT,
 * khách 4G sau CGNAT của nhà mạng, cả máy dev sau proxy của Next. Trần ở đây vì thế chỉ là lớp
 * chống SPAM theo máy, đặt đủ rộng để những người dùng chung mạng không chặn lẫn nhau. Lớp chặn dò
 * THEO TÀI KHOẢN nằm ở DB, không phụ thuộc IP:
 *  - mật khẩu: `LoginThrottleService` khoá định danh sau `LOGIN_LOCKOUT_POLICY.MAX_FAILURES` lần
 *    sai, bất kể IP nào (ADR 0076 điều 3) — chỉ lượt SAI bị đếm;
 *  - mã OTP: mỗi mã chịu `OTP_POLICY.MAX_ATTEMPTS` lần sai rồi bị huỷ, mỗi số chịu cooldown gửi lại
 *    và trần `OTP_POLICY.MAX_SENDS_PER_HOUR` (`PhoneVerificationService`).
 */
const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } }) as const;

export const AUTH_THROTTLE = {
  /** Đăng nhập bằng mật khẩu (web + app). Dò một tài khoản đã bị khoá theo định danh ở DB. */
  LOGIN: perMinute(20),
  /** Đăng ký (web + app) — mỗi lượt cần mã OTP còn hiệu lực và băm mật khẩu tốn ~250ms. */
  REGISTER: perMinute(10),
  /**
   * Cửa trả lời "số này đã có tài khoản" và cửa TỐN TIN NHẮN: `send-otp`, `register/check`. Chặt
   * hơn các cửa còn lại vì một IP rải nhiều số khác nhau là dò danh bạ / bơm SMS — trần theo số
   * không chặn được kiểu đó.
   */
  PHONE_PROBE: perMinute(10),
  /** Đối chiếu mã OTP: `verify-otp`, `password/reset-otp`. Lần sai đếm trên chính hàng mã. */
  OTP_CODE: perMinute(20),
} as const;
