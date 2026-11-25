import type { Prisma } from '@xeprime/prisma';
import { vnMonthKey } from '../../common/day-range';

/**
 * Phần truy vấn chung của hai bảng chuyến trên trang chi tiết tài xế — tài xế LIÊN KẾT (lượt gán,
 * ADR 0063) và tài xế NỘI BỘ (đơn gán thẳng, ADR 0108). Hai service cùng đọc ở đây để "tháng" và "tìm
 * kiếm" mang đúng một nghĩa ở hai bảng.
 */

/** Tháng `YYYY-MM` lùi/tiến `delta` tháng — `Date.UTC` tự qua năm khi tháng âm hoặc > 11. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** Khoảng `[đầu tháng; đầu tháng sau)` của tháng `YYYY-MM` theo giờ Việt Nam (UTC+7, không DST). */
export function vnMonthRange(
  month: string | undefined,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const key = month ?? vnMonthKey(now);
  const [y, m] = key.split('-').map(Number) as [number, number];
  const from = new Date(Date.UTC(y, m - 1, 1) - 7 * 3_600_000);
  const to = new Date(Date.UTC(y, m, 1) - 7 * 3_600_000);
  return { from, to };
}

/**
 * Tìm một chuyến theo mã đơn · tên khách · SĐT khách · tên xe · biển số. SĐT so theo chữ số (bỏ số 0
 * đầu) để "0901…" và "901…" cùng khớp; mã đơn và tên dùng `contains` không phân biệt hoa thường —
 * `bookings_search_trgm_idx` phục vụ mã + tên khách.
 */
export function bookingTripSearchOr(q: string): Prisma.BookingWhereInput[] {
  const term = q.trim();
  if (!term) return [];
  const digits = term.replace(/\D/g, '');
  return [
    { code: { contains: term, mode: 'insensitive' } },
    { customerName: { contains: term, mode: 'insensitive' } },
    { vehicle: { name: { contains: term, mode: 'insensitive' } } },
    { vehicle: { plateNumber: { contains: term, mode: 'insensitive' } } },
    ...(digits.length >= 3 ? [{ customerPhone: { contains: digits.replace(/^0/, '') } }] : []),
  ];
}
