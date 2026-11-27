import { toLocalVnPhone } from '@xeprime/types';

/**
 * Che bớt SĐT khi hiển thị lại cho khách ("Mã đã gửi đến 09•• ••• 567"). Nhận cả `0xxxxxxxxx`
 * lẫn `+84xxxxxxxxx` — quy về dạng nội địa trước khi che. Chỉ để hiển thị, không dùng cho logic.
 */
export function maskPhone(raw: string): string {
  const local = toLocalVnPhone(raw);
  if (local.length < 10) return local;
  return `${local.slice(0, 2)}•• ••• ${local.slice(-3)}`;
}

/**
 * Kiểu che của màn tài khoản design v2 ("037 *** *789") - bản native của web `maskPhoneStars`: ba số
 * đầu (nhà mạng) và ba số cuối, đủ để nhận ra mình gõ đúng số chưa.
 */
export function maskPhoneStars(raw: string): string {
  const local = toLocalVnPhone(raw);
  if (local.length < 10) return local;
  return `${local.slice(0, 3)} *** *${local.slice(-3)}`;
}

/**
 * Kiểu che của tấm đổi SĐT Partner (Figma `24231:109668`, "***688") - bản native của web
 * `maskPhoneTail`: chỉ ba số cuối, đủ để nhận ra mã đi đúng số và câu "Số cũ ***123" nói số nào hết hiệu lực.
 */
export function maskPhoneTail(raw: string): string {
  const local = toLocalVnPhone(raw);
  return local.length < 4 ? local : `***${local.slice(-3)}`;
}

/** Cùng tấm, kênh email ("***688me.1@gmail.com") - bản native của web `maskEmailHead`. */
export function maskEmailHead(raw: string): string {
  const at = raw.lastIndexOf('@');
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  return `***${local.length > 3 ? local.slice(3) : ''}${raw.slice(at)}`;
}
