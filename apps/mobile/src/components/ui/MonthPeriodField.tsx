import { useMemo } from 'react';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { dayjs, nowInAppTz, type Dayjs } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { iconSize, space } from '@/theme/tokens';
import { IconButton } from './IconButton';
import { SelectControl } from './SelectControl';

/** Kỳ là `YYYY-MM` — cùng định dạng server nhận và web dùng cho `DatePicker picker="month"`. */
export const MONTH_PERIOD_FORMAT = 'YYYY-MM';

/**
 * Số kỳ GẦN NHẤT bày sẵn trong tấm chọn — chỉ là lối tắt. Kỳ cũ hơn tới được bằng nút ‹.
 */
const RECENT_CHOICES = 12;

/**
 * Các kỳ bày trong tấm chọn: 12 tháng gần nhất (tính theo giờ VN, không theo giờ máy) + kỳ đang
 * chọn nếu nó nằm ngoài khoảng đó — một ô nói "chưa chọn gì" trong khi bảng bên dưới đang hiện
 * đúng kỳ đó là hai câu mâu thuẫn trên cùng một màn.
 *
 * Hàm THUẦN để test được mà không dựng component.
 */
export function monthPeriodOptions(
  value: string,
  now: Dayjs,
  label: (month: Dayjs) => string,
): { value: string; label: string }[] {
  const recent = Array.from({ length: RECENT_CHOICES }, (_, index) => {
    const month = now.subtract(index, 'month');
    return { value: month.format(MONTH_PERIOD_FORMAT), label: label(month) };
  });
  if (recent.some((option) => option.value === value)) return recent;
  return [{ value, label: label(parsePeriod(value)) }, ...recent];
}

/** `YYYY-MM` → ngày đầu tháng. Ghép `-01` để parse theo ISO, không cần plugin định dạng. */
function parsePeriod(value: string): Dayjs {
  return dayjs(`${value}-01`);
}

/** Kỳ liền trước / liền sau của một kỳ `YYYY-MM`. */
export function shiftMonthPeriod(value: string, delta: number): string {
  return parsePeriod(value).add(delta, 'month').format(MONTH_PERIOD_FORMAT);
}

/**
 * Ô chọn KỲ (tháng) — bản native của `DatePicker picker="month"` bên web.
 *
 * Web chọn được MỌI tháng (lịch tháng vô hạn). Bản native trước chỉ có 12 tháng gần nhất, nên kỳ
 * cũ hơn không mở được. Nay: tấm chọn giữ 12 kỳ gần nhất làm lối tắt, và hai nút ‹ › đi tiếp tới
 * bất kỳ tháng nào — không kéo thêm một thư viện lịch thứ hai cho đúng một ô chọn.
 *
 * `maxPeriod` là trần (bao gồm) — đúng `maxDate` của web ở nơi web có đặt (sổ ví: "tháng sau chưa
 * xảy ra"). Nơi web không đặt trần (thẻ thuế) thì không truyền.
 */
export function MonthPeriodField({
  label,
  value,
  onChange,
  maxPeriod,
}: {
  label: string;
  /** `YYYY-MM`. */
  value: string;
  onChange: (period: string) => void;
  maxPeriod?: string;
}) {
  const t = useTranslations('Common');
  const fmt = useAppFormat();

  const options = useMemo(
    () => monthPeriodOptions(value, nowInAppTz(), (month) => fmt.monthYear(month.toDate())),
    [value, fmt],
  );
  // So chuỗi `YYYY-MM` là so thứ tự thời gian — cùng độ dài, số đứng đầu.
  const atMax = maxPeriod != null && value >= maxPeriod;

  return (
    <XStack ai="flex-end" gap={space.xs}>
      <IconButton
        icon="chevron-back"
        label={`${t('actions.previous')} · ${label}`}
        onPress={() => onChange(shiftMonthPeriod(value, -1))}
        size={iconSize.md}
      />
      <YStack f={1} minWidth={0}>
        <SelectControl label={label} value={value} options={options} onChange={onChange} />
      </YStack>
      <IconButton
        icon="chevron-forward"
        label={`${t('actions.next')} · ${label}`}
        onPress={() => onChange(shiftMonthPeriod(value, 1))}
        disabled={atMax}
        size={iconSize.md}
      />
    </XStack>
  );
}
