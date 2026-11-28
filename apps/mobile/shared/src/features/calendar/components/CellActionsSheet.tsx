import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { LineIconName } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';
import { startOfAppDay } from '@xeprime/domain';
import { SheetActionRow } from './SheetActionRow';

export type CellActionKey = 'booking' | 'block' | 'price';

/** Ô lịch được chạm - xe + ngày ĐẦU khoảng (web `CellActionTarget`). */
export interface CellActionTarget {
  vehicleId: string;
  vehicleName: string;
  date: string;
}

/** Icon Figma "Thao tác" (`24729:82791`): Calender 2 · Lock 2 · Dollar Square. */
const ACTION_ICON: Readonly<Record<CellActionKey, LineIconName>> = {
  booking: 'calendar',
  block: 'lock-2',
  price: 'dollar-square',
};

/** Thân tấm: các khối cách nhau 12, các dòng thao tác cách nhau 8 (Figma "Filter Form"). */
const BODY_GAP = 12;
const ROW_GAP = 8;

/**
 * Bảng thao tác cho một ô / một KHOẢNG ngày của một xe - native port of web `CalendarCellActions`,
 * khoác Figma Lịch thuê xe "Thao tác" (`24729:82777`): tiêu đề "Thao tác", dòng phụ là tên xe ·
 * biển số, ba dòng thẻ - "Đặt xe" là dòng NỔI.
 *
 * Figma không vẽ dòng "ngày · Ngày trống/Đã có lịch" và ô "Đến ngày" - người dùng chốt GIỮ cả hai
 * (27/11/2026): trên điện thoại kéo ngang đã là cuộn lịch, nên ô "Đến ngày" là đường duy nhất để
 * khoá / đặt giá / đặt xe nhiều ngày.
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
  /** Khoảng [ngày đầu, ngày cuối] (tính cả) của xe có trống không - chỉ để hiển thị trạng thái. */
  isFree: (vehicleId: string, fromKey: string, toKey: string) => boolean;
  onSelect: (action: CellActionKey, endDate: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  return (
    <BottomSheet
      open={target !== null && actions.length > 0}
      onClose={onClose}
      title={t('cellActions.title')}
      subtitle={target?.vehicleName ?? ''}
      chrome="v2"
      headerDivider
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
    <YStack gap={BODY_GAP}>
      <Text
        col={free ? colors.textMuted : colors.warning}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.medium}
      >
        {t('cellActions.dateStatus', { date: dateLabel, status })}
      </Text>
      <FieldBox
        label={tCommon('components.dateRange.toDate')}
        placeholder={tCommon('components.dateRange.toDate')}
        icon="calendar-outline"
        value={fmt.dateKey(endDate)}
        onPress={() => setPicking(true)}
      />
      <YStack gap={ROW_GAP} accessibilityLabel={t('cellActions.menuAriaLabel')}>
        {actions.map((key) => (
          <SheetActionRow
            key={key}
            label={t(`cellActions.${key}.label`)}
            hint={hintFor(key)}
            icon={ACTION_ICON[key]}
            /* Figma tô NỔI dòng "Đặt xe" - lối đi chính của một ô trống. */
            highlighted={key === 'booking'}
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
