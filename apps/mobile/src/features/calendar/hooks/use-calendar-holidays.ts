import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@xeprime/api-client';
import { expandHolidaysByDay } from '@xeprime/domain';
import { calendarApi, type Holiday } from '../api';
import { firstDayOf, lastDayOf, type CalendarRange } from '../utils/calendar-date.util';

/**
 * Ngày lễ đang giao với khoảng lịch, đã mở sẵn theo từng cột ngày.
 *
 * Tách hẳn khỏi `useCalendarData` — đó là điểm chính của file này, không phải một chi tiết tổ
 * chức mã. Ngày lễ là một lớp TRANG TRÍ THÔNG TIN: nó không nói xe nào bận, không đổi giá, không
 * chặn thao tác nào. Gộp vào `useCalendarData` sẽ đưa `isLoading`/`error` của nó vào cùng chỗ với
 * đơn thuê và lịch bận, và hệ quả là một endpoint phụ hỏng sẽ dựng lên một dải lỗi che mất cái
 * lịch mà người dùng đang cần đọc.
 *
 * Vì vậy hook này KHÔNG trả `error` lẫn `isLoading`: hỏng thì bản đồ rỗng, và lưới chạy y hệt như
 * trước khi có tính năng này.
 */
export function useCalendarHolidays(
  range: CalendarRange,
  enabled = true,
): ReadonlyMap<string, Holiday> {
  /*
   * Biên tính theo giờ VN, đúng cách `listDays` sinh cột — hai chỗ lệch nhau thì cột đầu hoặc cột
   * cuối không bao giờ tra trúng ngày lễ của chính nó. `to` là ngày CUỐI CÙNG (inclusive), khớp
   * ngữ nghĩa của endpoint.
   */
  const from = useMemo(() => firstDayOf(range), [range]);
  const to = useMemo(() => lastDayOf(range), [range]);

  const query = useQuery({
    queryKey: queryKeys.holidays.range(from, to),
    queryFn: () => calendarApi.holidays(from, to),
    enabled,
    placeholderData: keepPreviousData,
    /*
     * Ngày lễ gần như bất biến: worker đồng bộ mỗi ngày MỘT lần. 6 giờ đủ để một thay đổi trong
     * ngày vẫn tới nơi, mà không biến việc đổi khoảng xem thành một request lặp lại.
     */
    staleTime: 6 * 60 * 60 * 1000,
    // Không ai đang chờ nó; mỗi lần thử lại là một lần giữ kết nối cho một thứ chỉ để tô màu.
    retry: 1,
  });

  /** `YYYY-MM-DD` → ngày lễ của cột đó. Mở event nhiều ngày (Tết) bằng hàm thuần dùng chung. */
  return useMemo(() => expandHolidaysByDay(query.data?.items ?? []), [query.data]);
}
