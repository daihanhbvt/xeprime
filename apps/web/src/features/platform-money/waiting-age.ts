import { BANK_IN_URGENT_HOURS } from './finance-queues';

/** Một khoảng chờ đã quy về đơn vị người đọc được: "12 phút", "5 giờ", "2 ngày". */
export interface WaitingAge {
  unit: 'minutes' | 'hours' | 'days';
  count: number;
  /** Tổng số giờ đã chờ (làm tròn xuống) — dùng để so mốc khẩn, không để hiển thị. */
  totalHours: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Đã chờ bao lâu kể từ `sinceIso`. Đơn vị lớn nhất mà con số vẫn ≥ 1 thắng — "26 giờ" khó đọc hơn
 * "1 ngày", còn "0 giờ" là nói dối với một khoản vừa về 40 phút.
 *
 * Mốc tương lai (lệch đồng hồ máy khách) quy về 0, không ra số âm.
 */
export function waitingAge(sinceIso: string, now: number = Date.now()): WaitingAge {
  const elapsed = Math.max(0, now - Date.parse(sinceIso));
  const totalHours = Math.floor(elapsed / HOUR_MS);
  if (totalHours >= 24) return { unit: 'days', count: Math.floor(totalHours / 24), totalHours };
  if (totalHours >= 1) return { unit: 'hours', count: totalHours, totalHours };
  return { unit: 'minutes', count: Math.max(1, Math.floor(elapsed / MINUTE_MS)), totalHours };
}

/** Khoản tiền vào đã chờ quá mốc khẩn chưa. */
export function isUrgentWait(age: WaitingAge): boolean {
  return age.totalHours >= BANK_IN_URGENT_HOURS;
}
