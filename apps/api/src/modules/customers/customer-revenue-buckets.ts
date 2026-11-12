import type { CustomerRevenuePeriod } from './dto/customer.dto';

/** Việt Nam UTC+7, không có giờ mùa hè — một hằng số là đủ. */
const VN_OFFSET_MS = 7 * 3_600_000;

/** 00:00 giờ Việt Nam của ngày `(y, m, d)` (tháng đếm từ 0; ngày/tháng tràn tự cuộn). */
function vnMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d) - VN_OFFSET_MS);
}

/**
 * Các cột của biểu đồ doanh thu một khách — kỳ HIỆN TẠI theo giờ Việt Nam (Figma `23797:55706`):
 *
 *  - `week`    — 7 cột ngày, thứ Hai → Chủ nhật;
 *  - `month`   — cột 5 ngày (1–5, 6–10, …, 26–cuối tháng), đúng nhịp trục của design;
 *  - `quarter` — 3 cột tháng;
 *  - `year`    — 12 cột tháng.
 *
 * Khoảng nửa mở `[from, to)`; cột cuối của kỳ kết thúc ở đầu kỳ kế tiếp.
 */
export function revenueBuckets(
  period: CustomerRevenuePeriod,
  now: Date,
): { from: Date; to: Date }[] {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();

  switch (period) {
    case 'week': {
      const mondayOffset = (vn.getUTCDay() + 6) % 7;
      return Array.from({ length: 7 }, (_, i) => ({
        from: vnMidnight(y, m, d - mondayOffset + i),
        to: vnMidnight(y, m, d - mondayOffset + i + 1),
      }));
    }
    case 'month': {
      const starts = [1, 6, 11, 16, 21, 26];
      return starts.map((day, i) => ({
        from: vnMidnight(y, m, day),
        to: i === starts.length - 1 ? vnMidnight(y, m + 1, 1) : vnMidnight(y, m, starts[i + 1]!),
      }));
    }
    case 'quarter': {
      const first = Math.floor(m / 3) * 3;
      return [0, 1, 2].map((i) => ({
        from: vnMidnight(y, first + i, 1),
        to: vnMidnight(y, first + i + 1, 1),
      }));
    }
    case 'year':
      return Array.from({ length: 12 }, (_, i) => ({
        from: vnMidnight(y, i, 1),
        to: vnMidnight(y, i + 1, 1),
      }));
  }
}
