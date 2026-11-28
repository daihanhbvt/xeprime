import { memo } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { LineIconName } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SheetActionRow } from './SheetActionRow';

export type CellActionKey = 'booking' | 'block' | 'price';

/** Ô lịch được chạm - xe + ngày (web `CellActionTarget`). */
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

/** Các dòng thao tác cách nhau 8 (Figma "Filter Form" `24729:82779`). */
const ROW_GAP = 8;

/**
 * Bảng thao tác cho MỘT ô lịch của một xe - native port of web `CalendarCellActions`, đúng Figma
 * Lịch thuê xe "Thao tác" (`24729:82777`): tiêu đề "Thao tác", dòng phụ là tên xe · biển số, ba
 * dòng thẻ - "Đặt xe" là dòng NỔI.
 *
 * Người dùng chốt bỏ dòng "ngày - trạng thái" và ô "Đến ngày" cho đúng Figma (28/11/2026): thao
 * tác luôn cho đúng NGÀY vừa chạm; nhiều ngày thì làm trong chính form khoá xe / đặt giá / tạo đơn
 * (ô ngày kết thúc của chúng).
 */
export const CellActionsSheet = memo(function CellActionsSheet({
  target,
  actions,
  onSelect,
  onClose,
}: {
  target: CellActionTarget | null;
  actions: readonly CellActionKey[];
  /** `endDate` = chính ngày của ô (một ngày). */
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
      {target ? (
        <YStack gap={ROW_GAP} accessibilityLabel={t('cellActions.menuAriaLabel')}>
          {actions.map((key) => (
            <SheetActionRow
              key={key}
              label={t(`cellActions.${key}.label`)}
              hint={key === 'booking' ? t('cellActions.booking.hintApp') : t(`cellActions.${key}.hint`)}
              icon={ACTION_ICON[key]}
              /* Figma tô NỔI dòng "Đặt xe" - lối đi chính của một ô trống. */
              highlighted={key === 'booking'}
              onPress={() => onSelect(key, target.date)}
            />
          ))}
        </YStack>
      ) : null}
    </BottomSheet>
  );
});
