import { MEMBER_ONLINE_WINDOW_MS } from '@xeprime/types';

/**
 * Cách đọc mốc "Hoạt động gần nhất" của một thành viên (ADR 0086 điều 6) — hàm thuần, để nhãn
 * ("5 phút trước", "Đang trực tuyến") test được mà không cần đồng hồ thật. Dùng chung web + app.
 *
 * Quá 7 ngày thì hiện NGÀY: "23 ngày trước" bắt người đọc tự trừ lịch, còn một ngày cụ thể thì không.
 */
export type LastActive =
  | { kind: 'never' }
  | { kind: 'online' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'days'; count: number }
  | { kind: 'date'; iso: string };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const RELATIVE_DAYS_MAX = 7;

export function describeLastActive(iso: string | null | undefined, now: number): LastActive {
  if (!iso) return { kind: 'never' };
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return { kind: 'never' };
  // Đồng hồ máy khách chạy chậm hơn server vài giây là chuyện thường — coi như vừa xong.
  const ago = Math.max(0, now - at);
  if (ago <= MEMBER_ONLINE_WINDOW_MS) return { kind: 'online' };
  if (ago < HOUR) return { kind: 'minutes', count: Math.floor(ago / MINUTE) };
  if (ago < DAY) return { kind: 'hours', count: Math.floor(ago / HOUR) };
  const days = Math.floor(ago / DAY);
  return days <= RELATIVE_DAYS_MAX ? { kind: 'days', count: days } : { kind: 'date', iso };
}
