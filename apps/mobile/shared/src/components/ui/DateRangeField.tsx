import { Ionicons } from '@/components/icons/Ionicons';
import { LineIcon } from '@/components/icons/LineIcon';
import { FIELD_V2, FieldShell } from '@/components/ui/Field';
import { useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from 'tamagui';
import { dayjs, DAY_PARAM_FORMAT, startOfAppDay } from '@xeprime/domain';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize, space } from '@/theme/tokens';

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
 * - không chọn ngày trong tương lai (lịch sử nằm ở quá khứ) - trừ khi `allowFuture`;
 * - "Đến ngày" không sớm hơn "Từ ngày" (ngày trước đó bị khoá);
 * - "Từ ngày" không muộn hơn "Đến ngày" (ngày sau đó bị khoá).
 */
export function DateRangeField({
  value,
  onChange,
  labels,
  allowFuture = false,
  autoAdvance = false,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  labels: { field: string; from: string; to: string; clear: string };
  /** Cho chọn ngày tương lai - bộ lọc theo NGÀY NHẬN XE (hồ sơ khách, như web); mặc định chặn (lịch sử quá khứ). */
  allowFuture?: boolean;
  /** Chọn "Từ ngày" xong (chưa có "Đến ngày") tự mở lịch "Đến ngày". Mặc định tắt - chỉ Lịch sử hồ sơ khách bật. */
  autoAdvance?: boolean;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const advancing = useRef(false);

  const dayLabel = (day: string | undefined) =>
    day ? fmt.date(startOfAppDay(day).toISOString()) : null;
  const fromLabel = dayLabel(value.from);
  const toLabel = dayLabel(value.to);
  const hasRange = Boolean(value.from || value.to);
  const today = dayjs().startOf('day');

  return (
    <>
      <FieldShell focused={false} invalid={false} disabled={false} align="center">
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPicking('from')}
          accessibilityRole="button"
          accessibilityLabel={`${labels.from}: ${fromLabel ?? ''}`}
        >
          <Text col={fromLabel ? colors.text : colors.textPlaceholder} fos={FIELD_V2.selectFontSize} numberOfLines={1}>
            {fromLabel ?? labels.from}
          </Text>
        </Pressable>
        <LineIcon name="arrow-right" size={FIELD_V2.icon} color={colors.placeholder} />
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setPicking('to')}
          accessibilityRole="button"
          accessibilityLabel={`${labels.to}: ${toLabel ?? ''}`}
        >
          <Text col={toLabel ? colors.text : colors.textPlaceholder} fos={FIELD_V2.selectFontSize} numberOfLines={1}>
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
          <LineIcon name="calendar" size={FIELD_V2.icon} color={colors.placeholder} />
        )}
      </FieldShell>

      <DatePickerSheet
        open={picking !== null}
        onClose={() => {
          // `DatePickerSheet` gọi onClose NGAY SAU onChange - nếu vừa chuyển sang "Đến ngày" thì bỏ lượt đóng đó.
          if (advancing.current) {
            advancing.current = false;
            return;
          }
          setPicking(null);
        }}
        title={picking === 'to' ? labels.to : labels.from}
        value={(picking === 'to' ? value.to : value.from) ?? ''}
        minDate={
          picking === 'to' && value.from
            ? dayjs(value.from, DAY_PARAM_FORMAT)
            : today.subtract(HISTORY_YEARS_BACK, 'year')
        }
        maxDate={picking === 'from' && value.to ? dayjs(value.to, DAY_PARAM_FORMAT) : allowFuture ? undefined : today}
        onChange={(day) => {
          const choosingFrom = picking !== 'to';
          // Chọn "Từ ngày" xong mà chưa có "Đến ngày" ⇒ chuyển thẳng sang chọn "Đến ngày", không bắt người dùng
          // bấm vào ô thứ hai (người dùng 25/11/2026). Đã có sẵn "Đến ngày" (chỉ sửa đầu) thì đóng như cũ.
          const advance = autoAdvance && choosingFrom && !value.to;
          advancing.current = advance;
          setPicking(advance ? 'to' : null);
          onChange(choosingFrom ? { ...value, from: day } : { ...value, to: day });
        }}
      />
    </>
  );
}
