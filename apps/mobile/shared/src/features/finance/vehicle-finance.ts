import { BOOKING_SOURCE_FILTER_DIRECT, isMarketplaceBooking, BOOKING_SOURCE } from '@xeprime/types';
import { DAY_PARAM_FORMAT, dayjs, toAppTz, type Dayjs } from '@xeprime/domain';
import type { FinanceSourceBreakdown } from './api';
// Kiểu của `dayjs.utc` - plugin đã được `@xeprime/domain` extend lúc nạp.
import type {} from 'dayjs/plugin/utc';

/**
 * Logic thuần của doanh thu theo nguồn + màn Tài chính xe — native port of web
 * `features/finance/vehicle-finance.ts` (giữ y phép tính). Tách khỏi component để test được.
 */

/**
 * Góc nhìn theo NGUỒN DOANH THU (ADR 0110) - nằm trên URL (`?revenueSource=`), vắng = tất cả.
 *
 * Dùng lại hai mã mà danh sách đơn đã dùng để lọc nguồn (`xeprime` · `direct`), để một đường dẫn
 * "doanh thu qua sàn" đọc giống nhau ở mọi màn. KHÔNG có giá trị `all`: `useUrlFilters` xoá `all`.
 */
export const REVENUE_SOURCE_VIEW = {
  MARKETPLACE: BOOKING_SOURCE.XEPRIME,
  DIRECT: BOOKING_SOURCE_FILTER_DIRECT,
} as const;

export type RevenueSourceView = (typeof REVENUE_SOURCE_VIEW)[keyof typeof REVENUE_SOURCE_VIEW];

export const REVENUE_SOURCE_VIEW_VALUES: readonly RevenueSourceView[] = [
  REVENUE_SOURCE_VIEW.MARKETPLACE,
  REVENUE_SOURCE_VIEW.DIRECT,
];

export const REVENUE_SOURCE_PARAM = 'revenueSource';

export function parseRevenueSourceView(value: string | null | undefined): RevenueSourceView | null {
  return REVENUE_SOURCE_VIEW_VALUES.find((view) => view === value) ?? null;
}

type SourceItem = FinanceSourceBreakdown['items'][number];

/** Dòng nguồn thuộc nhóm nào: sàn · tự khai thác · không gắn đơn. */
export type SourceGroup = 'marketplace' | 'direct' | 'unlinked';

export function sourceGroupOf(item: Pick<SourceItem, 'source'>): SourceGroup {
  if (item.source == null) return 'unlinked';
  return isMarketplaceBooking(item.source) ? 'marketplace' : 'direct';
}

/** Dòng nào hiện dưới một góc nhìn: "tất cả" hiện mọi dòng, kể cả khoản không gắn đơn. */
export function itemMatchesView(item: Pick<SourceItem, 'source'>, view: RevenueSourceView | null) {
  if (view === null) return true;
  const group = sourceGroupOf(item);
  return view === REVENUE_SOURCE_VIEW.MARKETPLACE ? group === 'marketplace' : group === 'direct';
}

/** Số chuyến của một nhóm - cộng từ chính các dòng, nên luôn khớp danh sách bên dưới. */
export function tripsOf(items: readonly SourceItem[], view: RevenueSourceView | null): number {
  return items.filter((item) => itemMatchesView(item, view)).reduce((sum, i) => sum + i.trips, 0);
}

/** Doanh thu của một góc nhìn, đọc thẳng các tổng server đã tách. */
export function revenueOf(data: FinanceSourceBreakdown, view: RevenueSourceView | null): string {
  if (view === REVENUE_SOURCE_VIEW.MARKETPLACE) return data.marketplaceAmount;
  if (view === REVENUE_SOURCE_VIEW.DIRECT) return data.directAmount;
  return data.total;
}

/**
 * Tỷ trọng % của một phần trên tổng - chỉ để vẽ thanh và in "x%". Một chữ số lẻ, như server làm
 * với `sharePercent`. Tổng bằng 0 ⇒ 0 (không có gì để chia).
 */
export function sharePercent(part: string, total: string): number {
  const whole = Number(total);
  if (!Number.isFinite(whole) || whole <= 0) return 0;
  const value = (Number(part) / whole) * 100;
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → mốc ngày (UTC, chỉ dùng để làm phép tính ngày lịch - không mang giờ). */
function day(key: string): Dayjs {
  return dayjs.utc(key, DAY_PARAM_FORMAT);
}

/** Ngày lịch VN của một giá trị server trả (`YYYY-MM-DD` hoặc ISO đầy đủ). */
function dayKeyOf(value: string): string {
  return DATE_KEY.test(value) ? value : toAppTz(value).format(DAY_PARAM_FORMAT);
}

const isMonthStart = (d: Dayjs) => d.date() === 1;
const isMonthEnd = (d: Dayjs) => d.add(1, 'day').date() === 1;
const minDay = (a: Dayjs, b: Dayjs) => (a.isBefore(b) ? a : b);

/**
 * Kỳ để SO SÁNH với kỳ đang xem - "cùng kỳ trước", tính tới đúng mốc tương ứng với hôm nay.
 *
 * So tháng này (mới qua 26 ngày) với CẢ tháng trước là so nửa cái bánh với cả cái bánh: con số
 * luôn "giảm" cho tới ngày cuối tháng. Nên phần kỳ trước cũng chỉ lấy tới mốc tương ứng:
 *  - kỳ trọn THÁNG (tháng, quý, năm): lùi đúng số tháng đó, mốc cuối là "cùng ngày" của kỳ trước
 *    (31/03 lùi một tháng là 28/02 - dayjs tự kẹp về cuối tháng);
 *  - kỳ khác (hôm nay, tuần, khoảng ngày tuỳ ý): lùi đúng số ngày của kỳ.
 *
 * `null` khi kỳ đang xem chưa bắt đầu (không có gì để so) hoặc tham số hỏng.
 */
export function comparablePreviousRange(
  from: string | undefined,
  to: string | undefined,
  today: string,
): { from: string; to: string } | null {
  if (!from || !to || !DATE_KEY.test(from) || !DATE_KEY.test(to) || !DATE_KEY.test(today)) {
    return null;
  }
  const start = day(from);
  const end = day(to);
  const now = day(today);
  if (end.isBefore(start) || now.isBefore(start)) return null;
  const reached = minDay(end, now);

  if (isMonthStart(start) && isMonthEnd(end)) {
    const months = (end.year() - start.year()) * 12 + (end.month() - start.month()) + 1;
    const prevFrom = start.subtract(months, 'month');
    const prevTo = minDay(reached.subtract(months, 'month'), start.subtract(1, 'day'));
    return { from: prevFrom.format(DAY_PARAM_FORMAT), to: prevTo.format(DAY_PARAM_FORMAT) };
  }

  const length = end.diff(start, 'day') + 1;
  const prevFrom = start.subtract(length, 'day');
  const prevTo = prevFrom.add(reached.diff(start, 'day'), 'day');
  return { from: prevFrom.format(DAY_PARAM_FORMAT), to: prevTo.format(DAY_PARAM_FORMAT) };
}

/**
 * Số kỳ ĐÓNG TIỀN (trả góp, thuê lại) rơi vào kỳ đang xem.
 *
 * Đếm đúng các NGÀY ĐÓNG TIỀN (`paymentDay`, kẹp về cuối tháng với tháng ngắn) nằm trong kỳ và
 * trong hiệu lực hợp đồng - không quy đổi theo số ngày: "tuần này phải đóng bao nhiêu" là 0 hoặc
 * một kỳ trọn, không bao giờ là 7/30 của nó.
 *
 * `null` khi chưa khai ngày đóng tiền: khi đó không có cách trung thực nào nói kỳ này rơi vào
 * bao nhiêu lần đóng - giao diện mời khai, không đoán.
 */
export function countDueDates(input: {
  from: string | undefined;
  to: string | undefined;
  paymentDay: number | null | undefined;
  startDate?: string | null;
  endDate?: string | null;
  termMonths?: number | null;
}): number | null {
  const { from, to, paymentDay } = input;
  if (!from || !to || !DATE_KEY.test(from) || !DATE_KEY.test(to)) return null;
  if (!paymentDay || paymentDay < 1 || paymentDay > 31) return null;

  const contractStart = input.startDate ? day(dayKeyOf(input.startDate)) : null;
  const contractEnd = input.endDate
    ? day(dayKeyOf(input.endDate))
    : contractStart && input.termMonths
      ? contractStart.add(input.termMonths, 'month')
      : null;

  const start = day(from);
  const end = day(to);
  if (end.isBefore(start)) return 0;

  let count = 0;
  for (let month = start.startOf('month'); !month.isAfter(end); month = month.add(1, 'month')) {
    const due = month.date(Math.min(paymentDay, month.daysInMonth()));
    if (due.isBefore(start) || due.isAfter(end)) continue;
    if (contractStart && due.isBefore(contractStart)) continue;
    if (contractEnd && due.isAfter(contractEnd)) continue;
    count += 1;
  }
  return count;
}
