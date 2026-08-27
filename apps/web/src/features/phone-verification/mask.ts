/**
 * Che bớt SĐT khi hiển thị lại cho khách ("Mã đã gửi đến 09•• ••• 567"). Nhận cả dạng nhập
 * `0xxxxxxxxx` / `+84xxxxxxxxx` — quy về `0xxxxxxxxx` trước khi che. Không dùng cho logic, chỉ hiển thị.
 */
export function maskPhone(raw: string): string {
  const trimmed = raw.trim();
  const local = trimmed.startsWith('+84')
    ? `0${trimmed.slice(3)}`
    : trimmed.startsWith('84')
      ? `0${trimmed.slice(2)}`
      : trimmed;
  if (local.length < 10) return local;
  return `${local.slice(0, 2)}•• ••• ${local.slice(-3)}`;
}
