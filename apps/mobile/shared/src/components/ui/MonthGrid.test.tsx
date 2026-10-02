import { fireEvent, render, within } from '@testing-library/react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { dayjs, type Dayjs } from '@xeprime/domain';
import { withIntl } from '@/i18n/test-utils';
import { MonthGrid, visibleDays } from './MonthGrid';

/**
 * Lịch tháng chạy trên `react-native-calendars`, nên phần đáng test không phải phép cộng ngày
 * mà là chỗ RÁP NỐI: ô ngày có ra đủ không, `marks` có tới đúng ô không, và cú chạm có gọi
 * đúng hàm mới nhất không.
 */

const AUGUST = dayjs('2026-08-10');

function Harness({
  onDayPress,
  marks,
  minMonth,
}: {
  onDayPress: (day: Dayjs) => void;
  marks?: Record<string, { note: string }>;
  minMonth?: Dayjs;
}) {
  const [month, setMonth] = useState<Dayjs>(AUGUST.startOf('month'));
  /** Ổn định như hợp đồng của `MonthGrid` đòi — nếu không, mọi ô vẽ lại và test ref vô nghĩa. */
  const renderDay = useCallback(
    ({
      day,
      mark,
      onPress,
    }: {
      day: Dayjs;
      mark: { note: string } | undefined;
      onPress: () => void;
    }) => (
      <Pressable onPress={onPress} testID={`day-${day.format('YYYY-MM-DD')}`}>
        <Text>{mark?.note ?? String(day.date())}</Text>
      </Pressable>
    ),
    [],
  );

  return (
    <MonthGrid
      month={month}
      onMonthChange={setMonth}
      {...(minMonth ? { minMonth } : {})}
      {...(marks ? { marks } : {})}
      onDayPress={onDayPress}
      renderDay={renderDay}
    />
  );
}

describe('visibleDays', () => {
  it('bắt đầu từ Chủ nhật của tuần chứa ngày 1 và trải đúng 6 tuần', () => {
    const days = visibleDays(AUGUST);

    expect(days).toHaveLength(42);
    expect(days[0]!.format('YYYY-MM-DD')).toBe('2026-07-26');
    expect(days[0]!.day()).toBe(0);
    expect(days[41]!.format('YYYY-MM-DD')).toBe('2026-09-05');
  });

  it('bao trọn mọi ngày của tháng', () => {
    const keys = visibleDays(AUGUST).map((d) => d.format('YYYY-MM-DD'));

    expect(keys).toContain('2026-08-01');
    expect(keys).toContain('2026-08-31');
  });
});

describe('MonthGrid', () => {
  it('vẽ cả ngày của tháng KỀ và cho bấm — cùng luật `showOutsideDays` của web', async () => {
    const onDayPress = jest.fn();
    const view = await render(withIntl(<Harness onDayPress={onDayPress} />));

    await fireEvent.press(view.getByTestId('day-2026-09-01'));

    expect(onDayPress).toHaveBeenCalledTimes(1);
    expect(onDayPress.mock.calls[0]![0].format('YYYY-MM-DD')).toBe('2026-09-01');
  });

  it('đưa `marks` tới đúng ô của nó', async () => {
    const view = await render(
      withIntl(<Harness onDayPress={jest.fn()} marks={{ '2026-08-14': { note: 'bận' } }} />),
    );

    expect(within(view.getByTestId('day-2026-08-14')).getByText('bận')).toBeTruthy();
    expect(within(view.getByTestId('day-2026-08-15')).getByText('15')).toBeTruthy();
  });

  it('đổi tháng bằng mũi tên, và khoá mũi tên lùi ở tháng sàn', async () => {
    const view = await render(withIntl(<Harness onDayPress={jest.fn()} minMonth={AUGUST} />));

    expect(view.queryByTestId('day-2026-09-15')).toBeNull();
    await fireEvent.press(view.getByLabelText('Tiếp tục'));
    expect(view.getByTestId('day-2026-09-15')).toBeTruthy();

    await fireEvent.press(view.getByLabelText('Trước'));
    await fireEvent.press(view.getByLabelText('Trước'));
    expect(view.getByTestId('day-2026-08-15')).toBeTruthy();
  });

  /*
   * Ô chỉ vẽ lại khi `mark` của CHÍNH nó đổi, nên nếu cú chạm đi thẳng vào ô thì ô có mark không
   * đổi sẽ giữ closure cũ: bấm ngày trả sau khi đã chọn ngày nhận sẽ chạy đúng cái hàm còn
   * tưởng chưa chọn gì.
   */
  it('gọi `onDayPress` MỚI NHẤT dù ô đó không hề vẽ lại', async () => {
    const stale = jest.fn();
    const fresh = jest.fn();
    const marks = { '2026-08-14': { note: 'bận' } };
    const view = await render(withIntl(<Harness onDayPress={stale} marks={marks} />));

    await view.rerender(withIntl(<Harness onDayPress={fresh} marks={marks} />));
    await fireEvent.press(view.getByTestId('day-2026-08-20'));

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });
});
