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
