import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { IconName } from '@/components/ui/Chip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { startOfAppDay } from '@xeprime/domain';
import { SheetActionRow } from './SheetActionRow';

export type CellActionKey = 'booking' | 'block' | 'price';

/** Ô lịch được chạm — xe + ngày ĐẦU khoảng (web `CellActionTarget`). */
export interface CellActionTarget {
  vehicleId: string;
  vehicleName: string;
  date: string;
}

const ACTION_ICON: Readonly<Record<CellActionKey, IconName>> = {
  booking: 'calendar-outline',
  block: 'lock-closed-outline',
  price: 'pricetag-outline',
};

/**
 * Bảng thao tác cho một ô / một KHOẢNG ngày của một xe — native port of web `CalendarCellActions`
 * (lịch v2, 25/11/2026). Web kéo chuột qua nhiều ô để chọn khoảng; trên điện thoại kéo ngang đã là
 * cuộn lịch, nên khoảng chọn bằng ô "Đến ngày" ngay trong tấm (mặc định = ngày được chạm).
 *
 * Đầu tấm nói ngày (hoặc "từ - đến · N ngày") và trạng thái "Ngày trống / Đã có lịch" của khoảng —
 * cùng phép kiểm `isRangeFree` (chỉ event CHIẾM lịch). Gợi ý từng dòng đổi theo một / nhiều ngày;
 * "Đặt xe" nói rõ khoảng thuê (nhận ngày đầu, trả sáng hôm sau ngày cuối).
 */
export function CellActionsSheet({
  target,
  actions,
  isFree,
  onSelect,
  onClose,
}: {
  target: CellActionTarget | null;
  actions: readonly CellActionKey[];
  /** Khoảng [ngày đầu, ngày cuối] (tính cả) của xe có trống không — chỉ để hiển thị trạng thái. */
  isFree: (vehicleId: string, fromKey: string, toKey: string) => boolean;
  onSelect: (action: CellActionKey, endDate: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={target !== null && actions.length > 0}
      onClose={onClose}
      title={target?.vehicleName ?? ''}
    >
      {/* Mỗi lần mở là một khoảng mới, bắt đầu từ ô vừa chạm. */}
      {target ? (
        <CellActionsBody
          key={`${target.vehicleId}-${target.date}`}
          target={target}
          actions={actions}
          isFree={isFree}
          onSelect={onSelect}
        />
      ) : null}
    </BottomSheet>
  );
}

function CellActionsBody({
  target,
  actions,
  isFree,
  onSelect,
}: {
  target: CellActionTarget;
  actions: readonly CellActionKey[];
  isFree: (vehicleId: string, fromKey: string, toKey: string) => boolean;
  onSelect: (action: CellActionKey, endDate: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const [endDate, setEndDate] = useState(target.date);
  const [picking, setPicking] = useState(false);

  const from = startOfAppDay(target.date);
  const to = startOfAppDay(endDate);
  const dayCount = to.diff(from, 'day') + 1;
  const multi = dayCount > 1;
  const fromLabel = fmt.dayMonth(from.toISOString());
  const toLabel = fmt.dayMonth(to.toISOString());
  const dateLabel = multi
    ? t('cellActions.rangeLabel', { from: fromLabel, to: toLabel, count: dayCount })
    : t('cellActions.singleDate', { weekday: fmt.weekdayShort(from), date: fmt.dateKey(target.date) });
  const free = isFree(target.vehicleId, target.date, endDate);
  const status = t(free ? 'cellActions.free' : 'cellActions.busy');

  const hintFor = (key: CellActionKey) =>
    key === 'booking'
      ? t('cellActions.bookingFrom', {
          from: fromLabel,
          to: fmt.dayMonth(to.add(1, 'day').toISOString()),
        })
      : t(`cellActions.${key}.${multi ? 'hintRange' : 'hint'}`);

  return (
    <YStack gap={space.sm}>
      <Text col={free ? colors.textMuted : colors.warning} fos={fontSize.bodySm}>
        {t('cellActions.dateStatus', { date: dateLabel, status })}
      </Text>
      <FieldBox
        label={tCommon('components.dateRange.toDate')}
        placeholder={tCommon('components.dateRange.toDate')}
        icon="calendar-outline"
        value={fmt.dateKey(endDate)}
        onPress={() => setPicking(true)}
      />
      <YStack accessibilityLabel={t('cellActions.menuAriaLabel')}>
        {actions.map((key) => (
          <SheetActionRow
            key={key}
            label={t(`cellActions.${key}.label`)}
            hint={hintFor(key)}
            /*
              CÙNG một tông cho cả ba — web tô cả ba đĩa icon bằng một class duy nhất: ba LỐI ĐI
              ngang hàng, không có cái nào là hành động chính.
            */
            icon={ACTION_ICON[key]}
            tone="primary"
            onPress={() => onSelect(key, endDate)}
          />
        ))}
      </YStack>
      <DatePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        value={endDate}
        minDate={from}
        onChange={(next) => {
          setEndDate(next < target.date ? target.date : next);
          setPicking(false);
        }}
        title={tCommon('components.dateRange.toDate')}
      />
    </YStack>
  );
}
