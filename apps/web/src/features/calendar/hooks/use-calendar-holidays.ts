'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { expandHolidaysByDay } from '@xeprime/domain';
import { APP_TIME_ZONE, DAY_PARAM_FORMAT, dayjs } from '@/lib/datetime';
import { queryKeys } from '@/services/query-keys';
import { fetchHolidays } from '../api';
import type { CalendarRange, Holiday } from '../types/calendar.types';

/**
 * Ngày lễ đang giao với khoảng lịch, đã mở sẵn theo từng cột ngày.
 *
 * Tách hẳn khỏi `useCalendarData` — đó là điểm chính của file này, không phải một chi tiết tổ
 * chức mã. Ngày lễ là một lớp TRANG TRÍ THÔNG TIN: nó không nói xe nào bận, không đổi giá,
 * không chặn thao tác nào. Gộp nó vào `useCalendarData` sẽ đưa `isLoading`/`error` của nó vào
 * cùng một chỗ với đơn thuê và lịch bận, và hệ quả là một endpoint phụ hỏng sẽ dựng lên một
 * Alert đỏ che mất cái lịch mà người dùng đang cần đọc.
 *
 * Vì vậy hook này KHÔNG trả `error` lẫn `isLoading`: hỏng thì bản đồ rỗng, và lưới lịch chạy y
 * hệt như trước khi có tính năng này. Không có trạng thái nào của nó được phép hiện ra màn hình.
 */
export function useCalendarHolidays(range: CalendarRange): ReadonlyMap<string, Holiday> {
  /*
   * Biên tính theo giờ VN, đúng cách `listDays` sinh cột — nếu hai chỗ lệch nhau thì cột đầu
   * hoặc cột cuối sẽ không bao giờ tra trúng ngày lễ của chính nó. `to` là ngày CUỐI CÙNG
   * (inclusive), khớp ngữ nghĩa của endpoint.
   */
  const { from, to } = useMemo(() => {
    const start = dayjs(range.startAt).tz(APP_TIME_ZONE);
    return {
      from: start.format(DAY_PARAM_FORMAT),
      to: start.add(Math.max(0, range.dayCount - 1), 'day').format(DAY_PARAM_FORMAT),
    };
  }, [range.startAt, range.dayCount]);

  const query = useQuery({
    queryKey: queryKeys.holidays.range(from, to),
    queryFn: () => fetchHolidays(from, to),
    placeholderData: keepPreviousData,
    /*
     * Ngày lễ gần như bất biến: worker đồng bộ mỗi ngày MỘT lần, và một quyết định nghỉ lễ mới
     * của Chính phủ không xuất hiện giữa hai lần người dùng cuộn lịch. 6 giờ đủ để một thay đổi
     * trong ngày vẫn tới nơi, mà không biến việc đổi khoảng xem thành một request lặp lại.
     */
    staleTime: 6 * 60 * 60 * 1000,
    // Lỗi ở đây không đáng thử lại nhiều lần: không ai đang chờ nó, và mỗi lần thử là một lần
    // giữ kết nối cho một thứ chỉ để tô màu.
    retry: 1,
  });

  /** `YYYY-MM-DD` → ngày lễ của cột đó. Mở event nhiều ngày (Tết) bằng hàm thuần dùng chung. */
  return useMemo(() => expandHolidaysByDay(query.data?.items ?? []), [query.data]);
}
