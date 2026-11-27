import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { useTranslations } from 'use-intl';
import { buildPeriodRange, dayjs, type PeriodKey } from '@xeprime/domain';
import { ChipTabs } from '@/components/ui/ChipTabs';
import { UnderlineTabs } from '@/components/ui/UnderlineTabs';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { SelectTrigger } from '@/components/ui/SelectTrigger';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { useAppFormat } from '@/i18n/use-app-format';
import { space, typeScale } from '@/theme/tokens';

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
  compact = false,
  look = 'underline',
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
  /**
   * MỘT ô "01/11 - 30/11" có icon lịch (Figma Tổng quan doanh thu `24228:98933`) thay dải tab +
   * hai ô ngày. Bấm mở tấm chọn chứa CÙNG các kỳ dựng sẵn và hai ô Từ/Đến - không mất lựa chọn nào.
   */
  compact?: boolean;
  /**
   * `chip` = dải viên lọc nhanh của sổ Thu-Chi (Figma "Filter Tabs" `24512:125314`, chuẩn `_Tab MB`):
   * các kỳ là phím tắt thu hẹp CÙNG một danh sách. `underline` giữ cho Tổng quan doanh thu.
   */
  look?: 'underline' | 'chip';
}) {
  const t = useTranslations('Finance.entity.periods');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const colors = useColors();
  const tSheet = useTranslations('Finance.overview.periodSheet');
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const active = periods.find((period) => {
    const range = buildPeriodRange(period);
    return from === range.from && to === range.to;
  });

  const editingTo = picking === 'to';

  const datePicker = (
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
  );

  if (compact) {
    const label = from && to ? `${shortDate(from)} - ${shortDate(to)}` : tLabels('selectDate');
    // Mở lịch SAU khi đóng tấm kỳ: hai tấm chồng nhau thì tấm dưới nuốt cử chỉ của tấm trên.
    const pick = (end: 'from' | 'to') => {
      setSheetOpen(false);
      setPicking(end);
    };
    return (
      <>
        <SelectTrigger
          label={label}
          icon="calendar"
          accessibilityLabel={`${tSheet('title')}: ${label}`}
          onPress={() => setSheetOpen(true)}
        />
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={tSheet('title')}>
          <YStack gap={space.md}>
            <MenuOptionList>
              {periods.map((period) => (
                <MenuOption
                  key={period}
                  label={t(period)}
                  selected={period === active}
                  onPress={() => {
                    onChange(buildPeriodRange(period));
                    setSheetOpen(false);
                  }}
                />
              ))}
            </MenuOptionList>
            {customRange ? (
              <YStack gap={space.sm}>
                <BlockTitle>{tSheet('custom')}</BlockTitle>
                {/* Cùng ô "Input - Select" + icon "Calender 2" của Figma như ô kỳ ngoài màn - không mũi tên Ionicons. */}
                <XStack gap={space.sm}>
                  {(['from', 'to'] as const).map((end) => {
                    const key = end === 'from' ? from : to;
                    const shown = key ? fmt.dateKey(key) : tLabels('selectDate');
                    return (
                      <YStack key={end} f={1} minWidth={0} gap={space.xs}>
                        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                          {tLabels(end)}
                        </Text>
                        <SelectTrigger
                          label={shown}
                          icon="calendar"
                          accessibilityLabel={`${tLabels(end)}: ${shown}`}
                          onPress={() => pick(end)}
                        />
                      </YStack>
                    );
                  })}
                </XStack>
              </YStack>
            ) : null}
          </YStack>
        </BottomSheet>
        {datePicker}
      </>
    );
  }

  return (
    <YStack gap={space.sm}>
      {/* Dải tab viên chung (chuẩn màn Đơn thuê, 16/11/2026); khoảng tự chọn thì không ô nào sáng. */}
      {/* Dải kỳ dạng tab gạch chân vàng như Figma (Tổng quan doanh thu); khoảng tự chọn thì không tab nào sáng. */}
      {look === 'chip' ? (
        <ChipTabs
          label={t('label')}
          items={periods.map((period) => ({ value: period as string, label: t(period) }))}
          value={(active as string | undefined) ?? ''}
          onSelect={(period) => onChange(buildPeriodRange(period as (typeof periods)[number]))}
          gutter={0}
        />
      ) : (
        <UnderlineTabs
          items={periods.map((period) => ({ key: period as string, label: t(period) }))}
          value={(active as string | undefined) ?? ''}
          onChange={(period) => onChange(buildPeriodRange(period as (typeof periods)[number]))}
        />
      )}

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

      {datePicker}
    </YStack>
  );
}

/** "01/11" - năm hiện tại thì bỏ năm như Figma, năm khác thì kèm năm để khỏi đọc nhầm. */
function shortDate(key: string): string {
  const d = dayjs(key);
  return d.format(d.year() === dayjs().year() ? 'DD/MM' : 'DD/MM/YYYY');
}
