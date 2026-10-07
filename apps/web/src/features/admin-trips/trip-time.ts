/**
 * Khoảng cách từ BÂY GIỜ tới một mốc — đã quy về đơn vị người đọc được, cả hai chiều:
 * "còn 3 giờ" (tương lai) · "quá 2 giờ" (quá khứ). Đơn vị lớn nhất mà con số vẫn ≥ 1 thắng;
 * dưới một phút quy về 1 phút (không có "còn 0 phút").
 *
 * Chỉ là PHÉP TÍNH; câu chữ ở `AdminTrips.time` để đổi được theo ngôn ngữ.
 */
export interface TimeDistance {
  direction: 'future' | 'past';
  unit: 'minutes' | 'hours' | 'days';
  count: number;
  /** Mili-giây còn lại tới mốc — âm khi đã qua. Để so ngưỡng, không để hiển thị. */
  remainingMs: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function timeDistance(iso: string, now: number = Date.now()): TimeDistance {
  const remainingMs = Date.parse(iso) - now;
  const abs = Math.abs(remainingMs);
  const direction = remainingMs >= 0 ? 'future' : 'past';
  if (abs >= DAY_MS) return { direction, unit: 'days', count: Math.floor(abs / DAY_MS), remainingMs };
  if (abs >= HOUR_MS) {
    return { direction, unit: 'hours', count: Math.floor(abs / HOUR_MS), remainingMs };
  }
  return {
    direction,
    unit: 'minutes',
    count: Math.max(1, Math.floor(abs / MINUTE_MS)),
    remainingMs,
  };
}
