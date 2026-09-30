import { useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { buildPeriodRange, dayjs, type PeriodKey } from '@xeprime/domain';
import { Chip } from '@/components/ui/Chip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { useAppFormat } from '@/i18n/use-app-format';
import { space } from '@/theme/tokens';

/**
 * Sàn của lịch chọn kỳ — thứ người ta lọc thường đã xảy ra rồi, nên KHÔNG dùng sàn "ngày mai"
 * mặc định của `DatePickerSheet` (nó sinh ra cho lịch đặt xe). Cùng mốc với bộ lọc danh sách.
 */
const PERIOD_FLOOR = dayjs('1980-01-01');

/**
 * KỲ đang xem: dải kỳ dựng sẵn + khoảng ngày tự chọn — bản native của `Segmented` + `FilterBar`
 * dateRange mà cả ba bề mặt tiền của web đều dùng.
 *
 * Một component cho CẢ BA (Tổng quan doanh thu · sổ Thu-Chi · khối tiền trong hồ sơ xe/khách):
 * ba bản chép tay sẽ lệch nhau ở lần đổi đầu tiên, và ở đây "lệch" nghĩa là ba màn hiểu "tháng
 * này" theo ba cách.
 *
 * Kỳ dựng sẵn ghi thẳng `from`/`to` — cùng hai tham số với ô chọn ngày, không đẻ tham số thứ hai.
 * Không kỳ nào khớp (người dùng tự chọn hai đầu) thì KHÔNG viên nào sáng, đúng như web.
 *
 * Dải viên CUỘN NGANG: sáu kỳ tiếng Việt không vừa một hàng 390dp, và bóp lại thì "Tháng trước"
 * bị cắt. Đây là ngoại lệ được phép — thân màn hình vẫn không tràn ngang.
 */
export function FinancePeriodBar({
  periods,
  from,
  to,
  onChange,
  customRange = true,
}: {
  readonly periods: readonly PeriodKey[];
  from: string | undefined;
  to: string | undefined;
  onChange: (range: { from: string; to: string }) => void;
  /**
   * Hai ô ngày tự chọn. Bật ở màn Tổng quan và sổ Thu-Chi (web có ô chọn khoảng ngày ở cả hai);
   * TẮT ở khối tiền nhúng trong hồ sơ xe/khách — ở đó web chỉ có dải kỳ dựng sẵn, và thêm hai ô
   * ngày vào một khối phụ là app đi trước web ở một bề mặt vốn để liếc.
   */
  customRange?: boolean;
}) {
  const t = useTranslations('Finance.entity.periods');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const active = periods.find((period) => {
    const range = buildPeriodRange(period);
    return from === range.from && to === range.to;
  });

  const editingTo = picking === 'to';

  return (
    <YStack gap={space.sm}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.xs }}
      >
        {periods.map((period) => (
          <Chip
            key={period}
            label={t(period)}
            selected={active === period}
            onPress={() => onChange(buildPeriodRange(period))}
          />
        ))}
      </ScrollView>

      {customRange ? (
        <>
          {/*
          Hai ô ngày ĐỘC LẬP, không phải một vùng chạm chung: một kỳ báo cáo luôn có đủ hai đầu
          (server cần chúng để dựng `generate_series`), nhưng người dùng đổi từng đầu một.

          Đầu "Đến" lấy SÀN là ngày đã chọn ở đầu "Từ" — một khoảng ngược đầu chỉ trả về rỗng mà
          không nói vì sao.
        */}
          <XStack gap={space.sm}>
            <YStack f={1}>
              <FieldBox
                label={tLabels('from')}
                value={from ? fmt.dateKey(from) : ''}
                placeholder={tLabels('selectDate')}
                icon="calendar-outline"
                onPress={() => setPicking('from')}
              />
            </YStack>
            <YStack f={1}>
              <FieldBox
                label={tLabels('to')}
                value={to ? fmt.dateKey(to) : ''}
                placeholder={tLabels('selectDate')}
                icon="calendar-outline"
                onPress={() => setPicking('to')}
              />
            </YStack>
          </XStack>
        </>
      ) : null}

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        value={(editingTo ? to : from) ?? ''}
        title={editingTo ? tLabels('to') : tLabels('from')}
        minDate={editingTo && from ? dayjs(from) : PERIOD_FLOOR}
        onChange={(next) => {
          onChange(
            editingTo
              ? { from: from ?? next, to: next }
              : { from: next, to: to && to >= next ? to : next },
          );
          setPicking(null);
        }}
      />
    </YStack>
  );
}
