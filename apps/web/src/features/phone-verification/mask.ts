/** `0xxxxxxxxx` / `+84xxxxxxxxx` / `84xxxxxxxxx` → `0xxxxxxxxx`. */
function toLocalPhone(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('+84')
    ? `0${trimmed.slice(3)}`
    : trimmed.startsWith('84')
      ? `0${trimmed.slice(2)}`
      : trimmed;
}

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
