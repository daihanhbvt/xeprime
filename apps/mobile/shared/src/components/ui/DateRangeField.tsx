import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { dayjs, DAY_PARAM_FORMAT, startOfAppDay } from '@xeprime/domain';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fieldFontSize, iconSize, radius, sizing, space } from '@/theme/tokens';

/** Sàn tấm lịch của bộ lọc quá khứ — đủ xa để chạm mọi bản ghi cũ. */
const HISTORY_YEARS_BACK = 10;

export interface DateRangeValue {
  /** `YYYY-MM-DD` giờ VN, hoặc không đặt. */
  from?: string;
  to?: string;
}

/**
 * Ô "Từ ngày → Đến ngày" của các bộ lọc LỊCH SỬ (Chuyến đi, Lịch sử giao dịch — người dùng chốt
 * 29/10/2026 dùng chung một ô). Hai nửa bấm được, mỗi nửa mở tấm lịch; có giá trị thì có nút xoá.
 *
 * Kiểm cơ bản ngay trong tấm lịch, không để khoảng ngược lọt ra danh sách rỗng:
 * - không chọn ngày trong tương lai (lịch sử nằm ở quá khứ);
 * - "Đến ngày" không sớm hơn "Từ ngày" (ngày trước đó bị khoá);
 * - "Từ ngày" không muộn hơn "Đến ngày" (ngày sau đó bị khoá).
 */
export function DateRangeField({
  value,
  onChange,
  labels,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  labels: { field: string; from: string; to: string; clear: string };
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const dayLabel = (day: string | undefined) =>
    day ? fmt.date(startOfAppDay(day).toISOString()) : null;
  const fromLabel = dayLabel(value.from);
  const toLabel = dayLabel(value.to);
  const hasRange = Boolean(value.from || value.to);
  const today = dayjs().startOf('day');

  return (
    <>
      <XStack
        minHeight={sizing.touchTarget}
        ai="center"
        gap={space.sm}
        px={space.sm}
        bw={1}
        bc={colors.border}
        br={radius.md}
        bg={colors.surface}
        accessibilityLabel={labels.field}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPicking('from')}
          accessibilityRole="button"
          accessibilityLabel={`${labels.from}: ${fromLabel ?? ''}`}
        >
          <Text col={fromLabel ? colors.text : colors.textPlaceholder} fos={fieldFontSize.value} numberOfLines={1}>
            {fromLabel ?? labels.from}
          </Text>
        </Pressable>
        <Ionicons name="arrow-forward" size={iconSize.sm} color={colors.textPlaceholder} />
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPicking('to')}
          accessibilityRole="button"
          accessibilityLabel={`${labels.to}: ${toLabel ?? ''}`}
        >
          <Text col={toLabel ? colors.text : colors.textPlaceholder} fos={fieldFontSize.value} numberOfLines={1}>
            {toLabel ?? labels.to}
          </Text>
        </Pressable>
        {hasRange ? (
          <Pressable
            onPress={() => onChange({ from: undefined, to: undefined })}
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel={labels.clear}
          >
            <Ionicons name="close-circle" size={iconSize.sm} color={colors.textPlaceholder} />
          </Pressable>
        ) : (
          <Ionicons name="calendar-outline" size={iconSize.sm} color={colors.textMuted} />
        )}
      </XStack>

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'to' ? labels.to : labels.from}
        value={(picking === 'to' ? value.to : value.from) ?? ''}
        minDate={
          picking === 'to' && value.from
            ? dayjs(value.from, DAY_PARAM_FORMAT)
            : today.subtract(HISTORY_YEARS_BACK, 'year')
        }
        maxDate={picking === 'from' && value.to ? dayjs(value.to, DAY_PARAM_FORMAT) : today}
        onChange={(day) => {
          setPicking(null);
          onChange(picking === 'to' ? { ...value, to: day } : { ...value, from: day });
        }}
      />
    </>
  );
}
