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
import { VN_MOBILE_PHONE_PATTERN } from './phone';

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

/**
 * Tên đăng nhập của TÀI KHOẢN NHÂN VIÊN do chủ gian hàng cấp (ADR 0087): chữ thường, BẮT ĐẦU bằng
 * chữ cái, 4–32 ký tự `a-z 0-9 . _`, không kết thúc bằng `.`/`_`. Khớp CHECK
 * `users_username_format_check` của DB.
 *
 * Bắt đầu bằng chữ cái để không chuỗi nào vừa là tên đăng nhập vừa "trông như SĐT" — ô đăng nhập
 * phân nhánh theo hình dạng, nên hai tập phải rời nhau.
 */
export const STAFF_USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,30}[a-z0-9]$/;
export const STAFF_USERNAME_MIN = 4;
export const STAFF_USERNAME_MAX = 32;

/** Dạng lưu của tên đăng nhập: bỏ khoảng trắng hai đầu, chữ thường. */
export function normalizeStaffUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export const LOGIN_IDENTIFIER_KIND = {
  EMAIL: 'email',
  PHONE: 'phone',
  /** Tên đăng nhập của tài khoản nhân viên (ADR 0087) — chỉ site partner nhận. */
  USERNAME: 'username',
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
  if (STAFF_USERNAME_PATTERN.test(normalizeStaffUsername(trimmed))) {
    return LOGIN_IDENTIFIER_KIND.USERNAME;
  }
  return LOGIN_IDENTIFIER_KIND.UNKNOWN;
}

/** Bỏ dấu phân tách (`090 123 4567` → `0901234567`) — chỉ cho TRA CỨU, không cho phép kiểm hợp lệ (ADR 0082). */
export function compactPhoneInput(raw: string): string {
  return raw.trim().replace(PHONE_SEPARATORS, '');
}

/**
 * Chuỗi này có dùng để đăng nhập được không.
 *
 * SĐT phải đúng `VN_MOBILE_PHONE_PATTERN` — cùng luật với ô SĐT lúc đăng ký (ADR 0082): di động
 * 10 số, `0…` / `84…` / `+84…`, CHỈ chữ số và `+` đầu. Ô nhập đã tự lọc dấu cách lúc gõ/dán
 * (`sanitizePhoneInput`), nên chuỗi còn dấu cách tới đây là chuỗi không đi qua ô nhập — chặn.
 */
export function isValidLoginIdentifier(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > LOGIN_IDENTIFIER_MAX) return false;

  switch (detectLoginIdentifierKind(trimmed)) {
    case LOGIN_IDENTIFIER_KIND.EMAIL:
      return EMAIL_PATTERN.test(trimmed);
    case LOGIN_IDENTIFIER_KIND.PHONE:
      return VN_MOBILE_PHONE_PATTERN.test(trimmed);
    case LOGIN_IDENTIFIER_KIND.USERNAME:
      // Hình dạng đã khớp ở bước phân loại; site nào nhận tên đăng nhập là việc của backend.
      return true;
    default:
      return false;
  }
}
