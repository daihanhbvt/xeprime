/**
 * "Username" ở màn đăng nhập — email HOẶC số điện thoại Việt Nam.
 *
 * Đây là logic cross-tuyến thật sự, cùng lý do như `phone.ts`: backend PHÂN NHÁNH theo chính
 * chuỗi người dùng gõ (`identifier.includes('@')` → tra `users.email`, ngược lại → tra
 * `users.phone` sau `normalizeVnPhone`), nên client phải trả lời đúng CÙNG câu hỏi "chuỗi này
 * là email hay SĐT, và có hợp lệ không" trước khi gửi. Hai bản cài đặt lệch nhau là web chặn
 * thứ app cho qua (hoặc ngược lại), và người dùng ăn 401 mơ hồ thay vì một câu chỉ đúng ô sai.
 *
 * Ở đây chỉ có LUẬT và PHÂN LOẠI — không có câu chữ hiển thị: `@xeprime/validators` (yup, cho
 * web + app native) và `apps/api` (class-validator) đều nhận cùng bộ hàm này rồi tự gắn câu lỗi
 * theo ngôn ngữ của mình.
 */
import { VN_PHONE_PATTERN } from './phone';

/**
 * Email hợp lệ ở mức hình dạng: có local part, có domain, có TLD ≥ 2 ký tự, không khoảng trắng
 * và đúng MỘT dấu `@`.
 *
 * Cố tình KHÔNG chạy theo RFC 5322: một regex đầy đủ vừa không đọc được vừa vẫn không chứng minh
 * được hộp thư có thật. Mục tiêu của lớp này là bắt lỗi gõ nhầm ngay tại ô nhập (`a@b`,
 * `a @b.vn`, `a@@b.vn`) — thứ chứng minh email tồn tại là email đặt lại mật khẩu gửi tới nó.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Chặn trên độ dài định danh — 254 là giới hạn địa chỉ email của RFC 5321.
 *
 * Ô này đi thẳng vào một câu `WHERE email = ...`; không có lý do gì để nhận một chuỗi dài hơn
 * mọi email tồn tại được.
 */
export const LOGIN_IDENTIFIER_MAX = 254;

/** Ký tự phân tách người ta hay gõ trong SĐT (`090 123 4567`, `090-123-4567`). */
const PHONE_SEPARATORS = /[\s.\-()]/g;

/** "Trông như một lần gõ SĐT": chỉ chữ số và dấu phân tách, mở đầu bằng `0`, `+` hoặc chữ số. */
const PHONE_SHAPE = /^\+?[\d\s.\-()]+$/;

export const LOGIN_IDENTIFIER_KIND = {
  EMAIL: 'email',
  PHONE: 'phone',
  /** Không đoán được người dùng định nhập gì (vd `nguyenvana`). */
  UNKNOWN: 'unknown',
} as const;

export type LoginIdentifierKind =
  (typeof LOGIN_IDENTIFIER_KIND)[keyof typeof LOGIN_IDENTIFIER_KIND];

/**
 * Người dùng ĐỊNH nhập gì — không phải nhập có đúng hay không.
 *
 * Tách ý định khỏi tính hợp lệ để câu báo lỗi chỉ được vào đúng thứ họ đang gõ dở: `abc@` là
 * một email sai ("Email không hợp lệ"), `0901` là một SĐT sai ("Số điện thoại không hợp lệ"),
 * chỉ khi không đoán được mới rơi về câu chung. Không làm vậy thì mọi lỗi đều là một câu
 * "Định danh không hợp lệ" — đúng nghĩa lời than "Invalid username" không giúp được ai.
 *
 * Nhánh `@` khớp ĐÚNG cách backend phân nhánh (`auth.service.ts`): thấy `@` là đi đường email.
 */
export function detectLoginIdentifierKind(raw: string): LoginIdentifierKind {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) return LOGIN_IDENTIFIER_KIND.EMAIL;
  if (PHONE_SHAPE.test(trimmed)) return LOGIN_IDENTIFIER_KIND.PHONE;
  return LOGIN_IDENTIFIER_KIND.UNKNOWN;
}

/** `090 123 4567` → `0901234567`. Bỏ dấu phân tách trước khi đối chiếu `VN_PHONE_PATTERN`. */
export function compactPhoneInput(raw: string): string {
  return raw.trim().replace(PHONE_SEPARATORS, '');
}

/**
 * Chuỗi này có dùng để đăng nhập được không.
 *
 * SĐT vẫn phải đúng `VN_PHONE_PATTERN` (`0xxxxxxxxx` / `+84xxxxxxxxx`) — cùng một luật với ô SĐT
 * lúc đăng ký, để không có chuyện đăng ký một dạng rồi đăng nhập lại phải gõ dạng khác. Dấu
 * cách/chấm/gạch được bỏ qua vì đó là cách người ta chép số từ danh bạ, không phải một số khác.
 */
export function isValidLoginIdentifier(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > LOGIN_IDENTIFIER_MAX) return false;

  switch (detectLoginIdentifierKind(trimmed)) {
    case LOGIN_IDENTIFIER_KIND.EMAIL:
      return EMAIL_PATTERN.test(trimmed);
    case LOGIN_IDENTIFIER_KIND.PHONE:
      return VN_PHONE_PATTERN.test(compactPhoneInput(trimmed));
    default:
      return false;
  }
}
