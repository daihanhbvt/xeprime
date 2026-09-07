import { useCallback, useMemo, useState } from 'react';
import { dayjs, DAY_PARAM_FORMAT, type Dayjs } from '@xeprime/domain';
import { BottomSheet } from './BottomSheet';
import { DayCell, MonthGrid, type DayMark, visibleDays } from './MonthGrid';

export function DatePickerSheet({
  open,
  onClose,
  value,
  onChange,
  title,
  minDate,
}: {
  open: boolean;
  onClose: () => void;
  /** `YYYY-MM-DD` hoặc chuỗi rỗng. */
  value: string;
  onChange: (next: string) => void;
  title: string;
  minDate?: Dayjs;
}) {
  const floor = (minDate ?? dayjs().add(1, 'day')).startOf('day');
  const selected = value ? dayjs(value) : null;

  /*
   * Tháng mở ra khi CHƯA chọn gì là tháng HIỆN TẠI, không phải tháng của `minDate`.
   *
   * Lịch đặt xe có sàn = ngày mai nên hai thứ đó trùng nhau và khác biệt không lộ ra. Hồ sơ nguồn
   * xe thì sàn là 01/1980 (ngày mua nằm ở quá khứ): mở ra giữa năm 1980 và bắt người dùng bấm
   * mũi tên hơn năm trăm lần mới tới hôm nay.
   */
  const initialMonth = (selected ?? dayjs()).startOf('month');
  const [month, setMonth] = useState<Dayjs>(initialMonth);

  /*
   * Sheet không unmount khi đóng, nên tháng đang xem sống qua cả những lần mở sau. Đưa nó về mốc
   * đầu ở MỖI lần mở: cuộn về 2019 để tìm ngày mua rồi mở lại ô khác và thấy 2019 là một thứ
   * không ai đoán được.
   */
  const initialMonthKey = initialMonth.valueOf();
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  /*
   * Đặt lại tháng NGAY TRONG RENDER, không qua `useEffect`.
   *
   * Đây là mẫu "chỉnh state khi prop đổi" mà React khuyến nghị: đặt state trong effect làm màn
   * vẽ MỘT LẦN với tháng cũ rồi vẽ lại — người dùng thấy tháng nhấp nháy đúng lúc tấm trượt mở
   * ra. Đặt trong render thì React huỷ luôn lượt vẽ dở và vẽ lại trước khi có gì lên màn hình.
   *
   * `openedAt` là mốc so sánh, không phải cờ bật/tắt: cùng một lần mở, mọi render sau đều thấy
   * `openedAt === initialMonthKey` nên không đặt lại nữa — nút chuyển tháng vẫn bấm được.
   */
  if (open && openedAt !== initialMonthKey) {
    setOpenedAt(initialMonthKey);
    setMonth(dayjs(initialMonthKey));
  }
  if (!open && openedAt !== null) setOpenedAt(null);

  const floorAt = floor.valueOf();
  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const day of visibleDays(month)) {
      const key = day.format(DAY_PARAM_FORMAT);
      out[key] = { selected: key === value, disabled: day.isBefore(floorAt, 'day') };
    }
    return out;
  }, [month, value, floorAt]);

  /** Tham chiếu phải ĐỨNG YÊN, và ô chỉ được vẽ từ đối số — xem docblock `MonthGrid`. */
  const renderDay = useCallback(
    ({ day, mark, onPress }: { day: Dayjs; mark: DayMark | undefined; onPress: () => void }) => (
      <DayCell day={day} mark={mark} onPress={onPress} />
    ),
    [],
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <MonthGrid
        month={month}
        onMonthChange={setMonth}
        minMonth={floor}
        marks={marks}
        onDayPress={(day) => {
          onChange(day.format(DAY_PARAM_FORMAT));
          onClose();
        }}
        renderDay={renderDay}
      />
    </BottomSheet>
  );
}
