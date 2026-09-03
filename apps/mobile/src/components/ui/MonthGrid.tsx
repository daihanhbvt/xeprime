import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@xeprime/domain';
import { IconButton } from './IconButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** `day()` của Day.js: 0 = Chủ nhật, khớp thứ tự nhãn `Common.weekdayShort.0…6`. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const WEEKS_SHOWN = 6;

/** Thư viện dựng header riêng (tiêu đề + mũi tên + hàng thứ); ở đây cả ba là của mình. */
const NoHeader = () => null;

/**
 * Nền lịch mặc định là TRẮNG ĐẶC và mỗi hàng tuần có `weekVerticalMargin` 7px.
 *
 * Nền đặc phủ mất nền tấm trượt, còn khoảng cách giữa các hàng cắt dải ngày đang chọn thành
 * từng khúc rời thay vì một thanh liền.
 */
const CALENDAR_THEME: CalendarProps['theme'] = {
  calendarBackground: 'transparent',
  weekVerticalMargin: 0,
};

const styles = StyleSheet.create({
  /** Thư viện đệm sẵn 5px hai bên; bỏ đi để cột ngày thẳng hàng với hàng thứ ở trên. */
  calendar: { paddingLeft: 0, paddingRight: 0 },
});

/** Kiểu `marking` của thư viện — `markedDates` ở đây chở dữ liệu của MÌNH nên phải ép kiểu. */
type LibraryMarking = NonNullable<CalendarProps['markedDates']>[string];

export interface MonthGridProps<TMark> {
  month: Dayjs;
  onMonthChange: (next: Dayjs) => void;
  /** Tháng sớm nhất lùi được. Bỏ trống = tháng hiện tại. */
  minMonth?: Dayjs;
  /** Trạng thái từng ngày, khoá là `YYYY-MM-DD` — xem ghi chú về `marks` ở docblock. */
  marks?: Readonly<Record<string, TMark>>;
  onDayPress: (day: Dayjs) => void;
  renderDay: (cell: {
    day: Dayjs;
    mark: TMark | undefined;
    onPress: () => void;
  }) => React.ReactElement;
  /** Chèn giữa hàng thứ và lưới ngày — chú giải màu phải nằm sát thứ nó chú giải. */
  legend?: React.ReactNode;
}

/**
 * Những ngày lịch VẼ cho `month`, tính cả ngày của tháng kề ở hai đầu tuần.
 *
 * Là BỘ BAO của `page()` bên trong thư viện: thư viện có thể vẽ 5 tuần ở vài tháng ngắn, còn
 * đây luôn trả 6 tuần. Thừa vài ngày không hại gì — nó chỉ dùng để dựng `marks`, và thiếu một
 * ngày thì ô đó vẽ ra như ngày rảnh dù thực tế đang bận.
 */
export function visibleDays(month: Dayjs): Dayjs[] {
  const first = month.startOf('month');
  const start = first.subtract(first.day(), 'day');
  return Array.from({ length: WEEKS_SHOWN * 7 }, (_, i) => start.add(i, 'day'));
}

/**
 * Khung lịch tháng dùng chung — thanh điều hướng tháng + hàng thứ + lưới ô.
 *
 * Cơ học lịch do `react-native-calendars` lo; cách VẼ một ô ngày do nơi gọi quyết định qua
 * `renderDay`. Header của thư viện bị thay bằng `NoHeader` vì bảng `LocaleConfig` của nó là biến
 * TOÀN TIẾN TRÌNH và sẽ là bản dịch thứ hai cho cùng những chữ đã có ở `Common.weekdayShort.*`.
 *
 * **`marks` phải chở TOÀN BỘ thứ quyết định hình hài một ô.** `Day` của thư viện là `React.memo`
 * so mọi prop bằng `!==` và riêng `marking` so SÂU — thứ gì không nằm trong `marks` thì ô sẽ
 * không bao giờ vẽ lại vì nó. Kéo theo hai ràng buộc cho nơi gọi: `renderDay` phải `useCallback`
 * deps rỗng (đổi tham chiếu là 42 ô vẽ lại), và mọi thứ nó vẽ phải lấy từ đối số, không từ closure.
 */
export function MonthGrid<TMark>({
  month,
  onMonthChange,
  minMonth,
  marks,
  onDayPress,
  renderDay,
  legend,
}: MonthGridProps<TMark>) {
  const t = useTranslations('Common');
  const fmt = useAppFormat();

  const floor = (minMonth ?? dayjs()).startOf('month');
  const canGoBack = month.isAfter(floor);

  const onDayPressRef = useRef(onDayPress);
  useEffect(() => {
    onDayPressRef.current = onDayPress;
  }, [onDayPress]);
  const pressDay = useCallback((day: Dayjs) => onDayPressRef.current(day), []);

  const DayComponent = useMemo(
    () =>
      function CalendarDay({ date, marking }: { date?: DateData; marking?: LibraryMarking }) {
        if (!date) return null;
        const day = dayjs(date.dateString);
        return renderDay({
          day,
          mark: marking as TMark | undefined,
          onPress: () => pressDay(day),
        });
      },
    [renderDay, pressDay],
  );

  const handleMonthChange = useCallback(
    (next: DateData) => {
      const nextMonth = dayjs(next.dateString).startOf('month');
      if (!nextMonth.isSame(month, 'month')) onMonthChange(nextMonth);
    },
    [month, onMonthChange],
  );

  return (
    <YStack gap={space.md}>
      <XStack ai="center" jc="space-between">
        <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
          {fmt.monthYear(month.toDate())}
        </Text>
        <XStack gap={space.xs}>
          <IconButton
            icon="chevron-back"
            label={t('actions.previous')}
            onPress={() => onMonthChange(month.subtract(1, 'month'))}
            disabled={!canGoBack}
            size={iconSize.md}
          />
          <IconButton
            icon="chevron-forward"
            label={t('actions.next')}
            onPress={() => onMonthChange(month.add(1, 'month'))}
            size={iconSize.md}
          />
        </XStack>
      </XStack>

      <XStack>
        {WEEKDAYS.map((weekday) => (
          <YStack key={weekday} f={1} ai="center">
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t(`weekdayShort.${weekday}` as never)}
            </Text>
          </YStack>
        ))}
      </XStack>

      {legend}

      <Calendar
        initialDate={month.format(DAY_PARAM_FORMAT)}
        onMonthChange={handleMonthChange}
        markedDates={marks as CalendarProps['markedDates']}
        dayComponent={DayComponent}
        theme={CALENDAR_THEME}
        style={styles.calendar}
        customHeader={NoHeader}
        hideExtraDays={false}
        showSixWeeks
        firstDay={0}
      />
    </YStack>
  );
}

/**
 * Nhãn đầy đủ của một ô ngày cho trình đọc màn hình.
 *
 * Ô chỉ hiện con số, nên nếu không có nhãn này thì VoiceOver/TalkBack đọc đúng chữ "28" — không
 * tháng, không năm, không biết ngày đó bận hay đang được chọn. Trạng thái đi qua
 * `accessibilityState`; phần CHỮ ở đây gánh những gì state không diễn đạt được.
 */
export function useDayAccessibilityLabel(): (day: Dayjs, note?: string) => string {
  const fmt = useAppFormat();
  return (day, note) => [fmt.fullDate(day), note].filter(Boolean).join(', ');
}
