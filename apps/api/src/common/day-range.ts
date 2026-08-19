import { parseCalendarDate } from './calendar-date';

/**
 * Biên của một NGÀY LỊCH VIỆT NAM cho bộ lọc "từ ngày / đến ngày".
 *
 * Vì sao cần: hai màn cùng hỏi *"từ ngày 19/08"* nhưng gửi hai dạng khác nhau — `FilterBar` ghi
 * `YYYY-MM-DD` lên URL (`DAY_PARAM_FORMAT`), còn `/manage/finance` gửi ISO đầy đủ. Service làm
 * `new Date(value)` thì `new Date('2026-08-19')` = `00:00Z` = **07:00 giờ Việt Nam**, tức mất bảy
 * tiếng đầu ngày, và hai màn ra hai kết quả khác nhau cho cùng một câu hỏi.
 *
 * Quy về một chỗ ở backend chứ không sửa từng caller: mọi client hiện tại và mai sau đều được
 * cùng một ngữ nghĩa, và không client nào phải biết múi giờ nghiệp vụ là gì.
 *
 * `Asia/Ho_Chi_Minh` cố định UTC+7, không DST (CLAUDE.md §9) — nên lệch múi giờ là một hằng số,
 * không cần thư viện timezone.
 */

/** UTC+7 tính bằng mili giây. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Một ngày trừ 1ms — dùng làm biên `lte` của ngày cuối (bao trọn 23:59:59.999). */
const DAY_MINUS_1MS = 24 * 60 * 60 * 1000 - 1;

/**
 * Đầu ngày (00:00:00.000 giờ VN) khi nhận `YYYY-MM-DD`; ISO đầy đủ thì đi thẳng, vì caller đã tự
 * chọn thời điểm chính xác. Chuỗi vô nghĩa → `undefined` để lọc coi như không truyền, thay vì
 * `Invalid Date` chui xuống Prisma.
 */
export function dayStartUtc(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const calendar = parseCalendarDate(value);
  if (calendar) return new Date(calendar.getTime() - VN_OFFSET_MS);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Cuối ngày (23:59:59.999 giờ VN) khi nhận `YYYY-MM-DD`; ISO đầy đủ thì đi thẳng.
 *
 * Lấy biên đóng `lte` chứ không phải `lt` ngày kế tiếp vì mọi lời gọi hiện có đều dùng `lte` —
 * đổi ngữ nghĩa so sánh ở đây sẽ âm thầm cắt mất bản ghi đúng nửa đêm.
 */
export function dayEndUtc(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const calendar = parseCalendarDate(value);
  if (calendar) return new Date(calendar.getTime() - VN_OFFSET_MS + DAY_MINUS_1MS);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Mệnh đề `{ gte?, lte? }` cho Prisma, hoặc `undefined` khi không có biên nào. */
export function dayRangeFilter(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lte?: Date } | undefined {
  const gte = dayStartUtc(from);
  const lte = dayEndUtc(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}
