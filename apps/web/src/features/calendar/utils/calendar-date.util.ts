import {
  APP_TIME_ZONE,
  DAY_PARAM_FORMAT,
  dayjs,
  nowInAppTz,
  toAppTz,
  type Dayjs,
} from '@/lib/datetime';
import type { CalendarRange } from '../types/calendar.types';

/**
 * Múi giờ hiển thị của sản phẩm — CLAUDE.md mục 9.
 *
 * `Asia/Ho_Chi_Minh`, không phải `Asia/Bangkok` như tài liệu cũ ghi. Cùng UTC+7 nên kết
 * quả giống nhau, nhưng dùng đúng tên vùng để sau này không ai phải đoán là cố ý hay nhầm.
 *
 * Là ALIAS của `APP_TIME_ZONE` chứ không phải một chuỗi thứ hai: hai hằng cùng nghĩa là hai
 * chỗ để sửa, và lần quên thứ nhất sẽ làm lưới lịch nói khác phần còn lại của sản phẩm.
 */
export const DISPLAY_TIMEZONE = APP_TIME_ZONE;

/**
 * Dựng khoảng hiển thị từ một ngày local.
 *
 * Ranh giới ngày phải tính theo giờ Việt Nam rồi mới đổi sang UTC: người dùng hiểu "ngày
 * 12/7" là 00:00–24:00 giờ VN, không phải giờ UTC. Lấy `startOf('day')` theo UTC sẽ làm
 * lệch lưới 7 tiếng và event hiện sai cột.
 */
export function buildRange(fromIsoDate: string, days: number): CalendarRange {
  const start = dayjs.tz(fromIsoDate, DISPLAY_TIMEZONE).startOf('day');
  const end = start.add(days, 'day');

  return {
    startAt: start.toDate(),
    endAt: end.toDate(),
    dayCount: days,
  };
}

/**
 * Danh sách cột ngày để render header.
 *
 * Trả `at` (mốc Dayjs của cột) chứ KHÔNG trả nhãn thứ: nhãn thứ đổi theo ngôn ngữ, mà hàm này
 * là hàm thuần không có bộ dịch của request. Component gọi `fmt.weekdayShort(day.at)` —
 * `Common.weekdayShort` đã là từ vựng dùng chung của cả app, không chép lại vào lịch.
 *
 * `dayjs.locale(...)` không phải lựa chọn thay thế: nó đổi trạng thái toàn tiến trình và rò
 * ngôn ngữ giữa các request SSR chạy song song (CLAUDE.md mục 5).
 */
export function listDays(range: CalendarRange): Array<{
  key: string;
  at: Dayjs;
  dayOfMonth: number;
  isToday: boolean;
  isWeekend: boolean;
}> {
  const today = nowInAppTz().startOf('day');
  const start = toAppTz(range.startAt);

  return Array.from({ length: range.dayCount }, (_, i) => {
    const day = start.add(i, 'day');
    const weekday = day.day();
    return {
      key: day.format('YYYY-MM-DD'),
      at: day,
      dayOfMonth: day.date(),
      isToday: day.isSame(today, 'day'),
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
}

/** Hiển thị mốc thời gian UTC theo giờ Việt Nam. */
export function formatDateTime(isoUtc: string): string {
  return toAppTz(isoUtc).format('HH:mm DD/MM/YYYY');
}

export function formatDate(isoUtc: string): string {
  return toAppTz(isoUtc).format('DD/MM/YYYY');
}

/**
 * `YYYY-MM-DD` → `DD/MM/YYYY`. Khác `formatDate` ở ĐẦU VÀO, và khác biệt đó là điểm chính.
 *
 * Khoá ngày trần không mang múi giờ, nên đưa nó qua `dayjs().tz()` là mượn một múi giờ mà dữ
 * liệu không có — `2026-04-30` sẽ được đọc như nửa đêm UTC rồi dịch sang giờ VN và ra ngày
 * 30/04 07:00, đúng lần này nhưng sai ở bất kỳ đầu vào nào lệch biên. Cắt chuỗi là phép đổi
 * TRUNG THỰC với thứ đang có trong tay.
 */
export function formatDateKey(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)}`;
}

/** Số ngày thuê, làm tròn lên — thuê 25 tiếng tính 2 ngày. */
export function rentalDays(startIsoUtc: string, endIsoUtc: string): number {
  const diffHours = dayjs(endIsoUtc).diff(dayjs(startIsoUtc), 'hour', true);
  return Math.max(1, Math.ceil(diffHours / 24));
}

/** Ngày hôm nay dạng `YYYY-MM-DD` theo giờ VN — giá trị mặc định của filter. */
export function todayIsoDate(): string {
  return nowInAppTz().format(DAY_PARAM_FORMAT);
}
