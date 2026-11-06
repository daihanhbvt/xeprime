/**
 * Số điện thoại Việt Nam — dùng CHUNG giữa `apps/api`, `apps/web` và app native (ADR 0082).
 *
 * Đây là logic cross-tuyến thật sự: backend quyết định "SĐT gửi lên có trùng SĐT tài khoản
 * không" để cho phép bỏ qua OTP, còn frontend phải trả lời đúng CÙNG câu hỏi đó để biết có hiện
 * bước OTP hay không. Hai bản cài đặt lệch nhau một dấu `+` là frontend hứa bỏ qua OTP còn
 * backend chặn — người dùng bấm gửi rồi ăn lỗi.
 *
 * Ba luật:
 *  1. NHẬP: chỉ chữ số và MỘT dấu `+` ở đầu — không dấu cách/chấm/gạch/ngoặc. Ô nhập tự lọc
 *     (`sanitizePhoneInput`), schema và DTO chặn phần còn lọt (gọi API trực tiếp, app cũ).
 *  2. HAI LOẠI Ô: SĐT TÀI KHOẢN (đăng nhập, đăng ký, OTP, mời thành viên/tài xế) chỉ nhận di động
 *     10 số — số bàn không nhận được SMS; SĐT LIÊN HỆ nhận thêm số bàn `02` + 9 số.
 *  3. LƯU: một dạng duy nhất `0…`. `84…` / `+84…` được server quy về `0…`; `+840…` bị chặn. Dạng quốc tế chỉ sinh ra ở mép gửi SMS (`toIntlVnPhone`).
 */

/**
 * Tiền tố: `0`, `84`, `+84`. KHÔNG nhận `+840…` / `840…` (số 0 thừa sau mã quốc gia) — sau `+84`
 * không bao giờ có số 0; báo lỗi rõ hơn là đoán ý người gõ.
 */
const PREFIX = String.raw`(?:0|\+?84)`;
/** Di động: đầu số `3/5/7/8/9` + 8 số (mọi số di động VN từ 2018 đều 10 số). */
const MOBILE_BODY = String.raw`[35789]\d{8}`;
/** Số bàn: `2` + 9 số (`024…`, `028…`, `0236…` — 11 số kể cả số 0). */
const LANDLINE_BODY = String.raw`2\d{9}`;

/** SĐT TÀI KHOẢN — chỉ di động. Dùng cho đăng nhập, đăng ký, OTP, mời thành viên / tài xế. */
export const VN_MOBILE_PHONE_PATTERN = new RegExp(`^${PREFIX}${MOBILE_BODY}$`);

/** SĐT LIÊN HỆ — di động HOẶC số bàn. Dùng cho đơn, sổ khách, chi nhánh, hồ sơ gian hàng. */
export const VN_PHONE_PATTERN = new RegExp(`^${PREFIX}(?:${MOBILE_BODY}|${LANDLINE_BODY})$`);

/** Chỉ chữ số, có thể mở đầu bằng MỘT dấu `+`. */
const DIGITS_ONLY = /^\+?\d+$/;

/** Ký tự phân tách người ta hay gõ — chỉ bỏ khi TRA CỨU / SO SÁNH, không bao giờ khi kiểm hợp lệ. */
const PHONE_SEPARATORS = /[\s.\-()]/g;

/**
 * Lọc chuỗi ô nhập: giữ chữ số và MỘT dấu `+` ở đầu, bỏ mọi ký tự khác.
 *
 * Ô SĐT gọi hàm này mỗi lần gõ / dán — `099 222 2222` dán vào thành `0992222222` ngay, thay vì
 * để người dùng tự xoá từng dấu cách sau một câu báo lỗi.
 */
export function sanitizePhoneInput(raw: string): string {
  const plus = raw.trimStart().startsWith('+') ? '+' : '';
  return plus + raw.replace(/\D/g, '');
}

/** Quy tiền tố về `0…` cho một chuỗi CHỈ gồm chữ số (+ `+` đầu). Chuỗi khác trả nguyên. */
function localize(value: string): string {
  if (/^\+84[1-9]\d*$/.test(value)) return `0${value.slice(3)}`;
  if (/^84[1-9]\d{8,9}$/.test(value)) return `0${value.slice(2)}`;
  return value;
}

/**
 * Dạng LƯU / HIỂN THỊ `0…`, dùng để TRA CỨU và SO SÁNH: bỏ dấu phân tách rồi quy tiền tố.
 *
 * KHÔNG dùng làm bước trước phép kiểm hợp lệ — nó cố ý tha dấu cách (ô tìm kiếm, dữ liệu cũ),
 * còn luật nhập thì không. Mép DTO dùng `normalizeVnPhoneInput`.
 *
 * Tiền tố `84` chỉ bị bóc khi theo sau là 9–10 chữ số (đầu khác 0) — `84` ở đầu một chuỗi ngắn
 * hơn là mảnh số người dùng đang gõ dở / tra cứu, không phải mã quốc gia.
 */
export function normalizeVnPhone(raw: string): string {
  return localize(raw.trim().replace(PHONE_SEPARATORS, ''));
}

/**
 * Quy một ĐẦU VÀO về `0…` mà KHÔNG tha ký tự lạ: chuỗi chỉ gồm chữ số (+ `+` đầu) thì quy tiền
 * tố, chuỗi có dấu cách/chấm/chữ thì trả nguyên (đã trim) để phép kiểm mẫu phía sau chặn nó.
 */
export function normalizeVnPhoneInput(raw: string): string {
  const value = raw.trim();
  return DIGITS_ONLY.test(value) ? localize(value) : value;
}

/** Ô SĐT LIÊN HỆ có hợp lệ không. Chuỗi rỗng ⇒ `true` (bắt buộc hay không là việc của `required`). */
export function isVnPhoneInput(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  return VN_PHONE_PATTERN.test(value.trim());
}

/** Ô SĐT TÀI KHOẢN có hợp lệ không — chỉ di động. Chuỗi rỗng ⇒ `true`. */
export function isVnMobilePhoneInput(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return true;
  return VN_MOBILE_PHONE_PATTERN.test(value.trim());
}

/** Bí danh lịch sử — từ ADR 0082 dạng hiển thị và dạng lưu là MỘT. */
export const toLocalVnPhone = normalizeVnPhone;

/** `0xxxxxxxxx` (hoặc dạng bất kỳ ở trên) → `84xxxxxxxxx`. CHỈ dùng ở mép gửi SMS. */
export function toIntlVnPhone(raw: string): string {
  const local = normalizeVnPhone(raw);
  return local.startsWith('0') ? `84${local.slice(1)}` : local;
}

/** Hai chuỗi có phải cùng một số hay không — bỏ qua khác biệt `0` / `84` / `+84` / dấu cách. */
export function isSameVnPhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeVnPhone(a) === normalizeVnPhone(b);
}
