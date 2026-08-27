/**
 * Masking PII cho các màn giám sát của admin nền tảng (build plan §11.1 — "Tra cứu có
 * masking PII").
 *
 * Quy tắc chung của hệ: endpoint giám sát LUÔN trả bản đã che. Xem đầy đủ là một hành động
 * riêng, có permission riêng (`platform.customers.view_pii`) và ghi `audit_logs` từng lần —
 * xem `PlatformCustomersService.revealContact`. Che ở tầng service (nơi dựng DTO), KHÔNG ở
 * frontend: dữ liệu đã ra khỏi API là đã lộ.
 *
 * Che nhưng vẫn đối chiếu được: giữ đủ đầu/đuôi để nhân viên hỗ trợ xác nhận "đúng số khách
 * đọc cho tôi" mà không đọc được toàn bộ danh bạ khách hàng.
 */

import { toLocalPhone } from './phone';

const MASK_CHAR = '*';

/**
 * SĐT: giữ 3 số đầu + 3 số cuối, phần giữa thành `*`.
 * `0912345678` → `091****678`. Số quá ngắn (≤6) chỉ giữ 2 số cuối.
 *
 * Che trên dạng NỘI ĐỊA (`toLocalPhone`) chứ không trên giá trị thô, vì hai lý do:
 *  - `users.phone` lưu `84…` — che thẳng sẽ ra `849****678`, tức 3 ký tự lộ ra đúng bằng mã
 *    quốc gia, giống hệt nhau ở mọi số, và nhân viên hỗ trợ không đối chiếu được gì.
 *  - `bookings.customer_phone` lưu thô `0…` — không quy về một dạng thì cùng một người hiện
 *    khác nhau ở màn Đơn thuê và màn Khách thuê.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const value = toLocalPhone(phone).trim();
  if (!value) return null;
  if (value.length <= 6) {
    const tail = value.slice(-2);
    return MASK_CHAR.repeat(Math.max(0, value.length - tail.length)) + tail;
  }
  return `${value.slice(0, 3)}${MASK_CHAR.repeat(value.length - 6)}${value.slice(-3)}`;
}

/**
 * Email: giữ 2 ký tự đầu của phần tên + nguyên tên miền (tên miền không phải PII và giúp
 * nhận diện nhà cung cấp). `nguyenvana@gmail.com` → `ng********@gmail.com`.
 * Chuỗi không có `@` được che như một chuỗi thường.
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const value = email.trim();
  if (!value) return null;

  const at = value.lastIndexOf('@');
  if (at <= 0) return maskTail(value);

  const local = value.slice(0, at);
  const domain = value.slice(at);
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}${MASK_CHAR.repeat(Math.max(1, local.length - keep.length))}${domain}`;
}

/** Che mọi thứ trừ 2 ký tự cuối — dùng cho chuỗi không rõ định dạng. */
function maskTail(value: string): string {
  const tail = value.slice(-2);
  return MASK_CHAR.repeat(Math.max(1, value.length - tail.length)) + tail;
}
