import { toLocalVnPhone as toLocalPhone } from '@xeprime/types';

/**
 * Che bớt SĐT khi hiển thị lại cho khách ("Mã đã gửi đến 09•• ••• 567"). Nhận cả dạng nhập
 * `0xxxxxxxxx` / `+84xxxxxxxxx` — quy về `0xxxxxxxxx` trước khi che. Không dùng cho logic, chỉ hiển thị.
 */
export function maskPhone(raw: string): string {
  const local = toLocalPhone(raw);
  if (local.length < 10) return local;
  return `${local.slice(0, 2)}•• ••• ${local.slice(-3)}`;
}

/**
 * Kiểu che của hộp tài khoản design v2 ("037 *** *789"): ba số đầu (nhà mạng) và ba số cuối — đủ để
 * khách nhận ra mình gõ đúng số chưa, không đủ để người đứng sau đọc được cả số.
 */
export function maskPhoneStars(raw: string): string {
  const local = toLocalPhone(raw);
  if (local.length < 10) return local;
  return `${local.slice(0, 3)} *** *${local.slice(-3)}`;
}

/**
 * Kiểu che của hộp đổi SĐT site partner (design `24131:72204`, "***688"): chỉ ba số cuối - đủ để
 * người vừa gõ nhận ra mã đi đúng số, và để câu "Số cũ ***123" nói số nào sắp hết hiệu lực.
 */
export function maskPhoneTail(raw: string): string {
  const local = toLocalPhone(raw);
  return local.length < 4 ? local : `***${local.slice(-3)}`;
}

/**
 * Cùng hộp, kênh email ("***688me.1@gmail.com"): ba ký tự đầu của phần tên thay bằng `***`, tên
 * miền giữ nguyên. Phần tên ngắn hơn bốn ký tự thì che hết phần tên.
 */
export function maskEmailHead(raw: string): string {
  const at = raw.lastIndexOf('@');
  if (at <= 0) return raw;
  const local = raw.slice(0, at);
  return `***${local.length > 3 ? local.slice(3) : ''}${raw.slice(at)}`;
}
