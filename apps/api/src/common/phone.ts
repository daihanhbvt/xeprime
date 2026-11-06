import { Transform } from 'class-transformer';
import {
  isSameVnPhone,
  normalizeVnPhone,
  normalizeVnPhoneInput,
  toIntlVnPhone,
  toLocalVnPhone,
} from '@xeprime/types';

/**
 * Chuẩn hoá và hiển thị số điện thoại Việt Nam.
 *
 * Từ ADR 0082 MỌI cột SĐT lưu MỘT dạng: nội địa `0xxxxxxxxx`. Client gửi `0…`, `84…`, `+84…`
 * (kể cả dấu cách/chấm/gạch) đều được — `@PhoneInput()` quy về `0…` ngay ở mép DTO, trước cả
 * phép kiểm `VN_PHONE_PATTERN`, nên service không bao giờ thấy dạng khác.
 *
 * `phoneLookupVariants` vẫn giữ để tra cứu khớp cả dữ liệu cũ còn sót (hàng đụng số mà migration
 * 20261106090000 để nguyên cho người vận hành xử lý).
 */

/**
 * Cài đặt thật nằm ở `@xeprime/types/phone` — frontend cần ĐÚNG phép chuẩn hoá này để biết SĐT
 * đang nhập có trùng SĐT tài khoản hay không (quyết định hiện bước OTP). Hai bản riêng sẽ trôi
 * khỏi nhau. Ở đây chỉ tái xuất dưới tên cũ để không phải sửa hàng chục chỗ import.
 */
export const normalizePhone = normalizeVnPhone;
export const toLocalPhone = toLocalVnPhone;

/**
 * Transform DTO: `0…` / `84…` / `+84…` (CHỈ chữ số + `+` đầu) → `0…`. Chuỗi có dấu cách / chấm /
 * chữ đi nguyên tới `@Matches` để bị chặn (ADR 0082). Giá trị không phải chuỗi giữ nguyên.
 */
export const phoneInputTransform = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeVnPhoneInput(value) : value;

/** Như `phoneInputTransform`, nhưng ô TUỲ CHỌN: chuỗi rỗng ⇒ `null` để `@IsOptional` bỏ qua. */
export const optionalPhoneInputTransform = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : phoneInputTransform({ value });

/**
 * Đặt TRƯỚC `@Matches(VN_PHONE_PATTERN)` ở mọi ô SĐT của DTO — nhận `0…`/`84…`/`+84…`, ghi
 * xuống luôn là `0…` (ADR 0082).
 */
export const PhoneInput = (): PropertyDecorator => Transform(phoneInputTransform);

/** `@PhoneInput()` cho ô tuỳ chọn — `''` thành `null`. */
export const OptionalPhoneInput = (): PropertyDecorator => Transform(optionalPhoneInputTransform);

/**
 * Mọi dạng lưu có thể có của một SĐT người dùng gõ vào ô tra cứu, để dùng với `{ in: [...] }`.
 *
 * Vẫn là so khớp CHÍNH XÁC (không `contains`): nhân viên hỗ trợ có sẵn số khách đọc cho, còn
 * cho tìm gần đúng thì ô tra cứu thành công cụ quét danh bạ khách hàng.
 */
export function phoneLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  // Dạng `84…` chỉ để khớp hàng cũ migration chưa đổi được (đụng số) — dạng lưu là `0…`.
  return [...new Set([trimmed, normalizePhone(trimmed), toIntlVnPhone(trimmed)])];
}

/**
 * SĐT TÀI KHOẢN của khách để hiện CẠNH SĐT liên hệ của một chuyến — `null` khi hai số là một.
 *
 * Từ ADR 0063 khách để lại được một SĐT liên hệ khác số tài khoản mà không qua OTP; chủ xe phải
 * thấy cả số đã xác minh. So bằng `isSameVnPhone` để dữ liệu cũ viết hai kiểu không bị hiện
 * thành hai số. Trả về dạng hiển thị `0xxxxxxxxx`.
 *
 * Gác quyền xem KHÔNG nằm ở đây: nơi gọi chỉ gọi khi chủ xe đã được thấy liên hệ (ADR 0056).
 */
export function accountPhoneIfDifferent(
  accountPhone: string | null | undefined,
  contactPhone: string | null | undefined,
): string | null {
  if (!accountPhone || isSameVnPhone(accountPhone, contactPhone)) return null;
  return toLocalPhone(accountPhone);
}
