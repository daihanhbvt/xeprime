/**
 * Mốc thời gian dùng chung khi hỏi phí hãng (đối chiếu biểu phí, đồng bộ biểu phí — ADR 0106).
 */

const HOUR_MS = 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * HOUR_MS;

/**
 * 09:00 sáng mai giờ Việt Nam — giờ nhận xe mẫu gửi hãng: luôn ở tương lai (hãng từ chối hợp đồng bắt
 * đầu trong quá khứ) và là một giờ nhận xe bình thường.
 */
export function nextVnMorning(now: Date = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const day = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + 1, 9);
  return new Date(day - VN_OFFSET_MS);
}

/** Năm hiện tại theo giờ Việt Nam. */
export function vnYear(now: Date = new Date()): number {
  return new Date(now.getTime() + VN_OFFSET_MS).getUTCFullYear();
}

/** Thời lượng mẫu của một bậc: trần bậc trừ 1 giờ — chắc chắn rơi đúng bậc (cùng mẫu với "Đối chiếu"). */
export function tierSampleHours(maxDays: number): number {
  return maxDays * 24 - 1;
}
