import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { dayjs, DAY_PARAM_FORMAT, type Dayjs } from '@xeprime/domain';
import { BottomSheet } from './BottomSheet';
import { MonthGrid, useDayAccessibilityLabel, visibleDays } from './MonthGrid';
import { colors, fontSize, fontWeight, radius, sizing } from '@/theme/tokens';

interface DayMark {
  selected: boolean;
  disabled: boolean;
}

const styles = StyleSheet.create({
  /** `dayContainer` của thư viện canh giữa theo chiều ngang — ô phải TRÀN cột mới bấm trúng. */
  cell: { alignSelf: 'stretch' },
});

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

  const [month, setMonth] = useState<Dayjs>(() => (selected ?? floor).startOf('month'));

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

function DayCell({
  day,
  mark,
  onPress,
}: {
  day: Dayjs;
  mark: DayMark | undefined;
  onPress: () => void;
}) {
  const label = useDayAccessibilityLabel();
  const selected = mark?.selected ?? false;
  const disabled = mark?.disabled ?? false;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={styles.cell}
      accessibilityRole="button"
      accessibilityLabel={label(day)}
      accessibilityState={{ selected, disabled }}
    >
      <YStack
        h={sizing.touchTarget}
        ai="center"
        jc="center"
        br={radius.md}
        bg={selected ? colors.primary : 'transparent'}
      >
        {/* Chỉ ĐANG CHỌN và KHOÁ đổi màu chữ — "ngoài tháng" thì không, vì ô đó vẫn chọn được. */}
        <Text
          col={selected ? colors.onPrimary : disabled ? colors.textDisabled : colors.text}
          fos={fontSize.bodySm}
          fow={selected ? fontWeight.bold : fontWeight.regular}
        >
          {day.date()}
        </Text>
      </YStack>
    </Pressable>
  );
}
