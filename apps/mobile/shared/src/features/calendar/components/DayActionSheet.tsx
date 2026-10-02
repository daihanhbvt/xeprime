import { Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HOLIDAY_EVENT_TYPE_META, STATUS_COLOR, type HolidayEventType } from '@xeprime/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { Holiday } from '../api';
import type { DayCell } from '../utils/calendar-date.util';
import { SheetActionRow } from './SheetActionRow';

/** Hai thao tác cả-đội-xe mở từ thẻ ngày. Mã, không phải chữ. */
export type DayActionKey = 'block' | 'price';

export interface DayPanelState {
  day: DayCell;
  holiday: Holiday | undefined;
}

/**
 * Bảng của một ngày: nhận diện ngày + các thao tác cả-đội-xe — bản native của `DayActionPanel`.
 *
 * Hàng "Khoá xe nhanh" có HAI đích chạm, và đó là chủ đích, y như web:
 *  - **Công tắc** = khoá NGAY mọi xe rảnh trong đúng ngày này, lý do mặc định. Một chạm cho việc
 *    hay làm nhất; gạt ngược lại gỡ đúng lô vừa tạo.
 *  - **Phần chữ của hàng** = mở hộp đầy đủ (nhiều ngày, đổi lý do, ghi chú, xem trước).
 *
 * Ở web hai đích đó chồng nhau bằng mẫu "stretched link"; trên cảm ứng thì chúng phải TÁCH thành
 * hai hàng — hai vùng chạm chồng nhau trên một dải cao 48dp là cách chắc chắn nhất để người dùng
 * khoá cả đội xe khi họ chỉ định mở hộp xem trước.
 */
export function DayActionSheet({
  state,
  actions,
  blockState,
  onClose,
  onQuickBlock,
  onRelease,
  onOpenBlockDialog,
  onPrice,
}: {
  state: DayPanelState | null;
  actions: readonly DayActionKey[];
  /** Lô khoá hàng loạt đang phủ ngày này — quyết định công tắc bật hay tắt. */
  blockState: { batchId: string | null; loading: boolean; busy: boolean };
  onClose: () => void;
  onQuickBlock: (dateKey: string) => void;
  onRelease: (batchId: string) => void;
  onOpenBlockDialog: () => void;
  onPrice: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const holiday = state?.holiday;
  const typeMeta = holiday
    ? HOLIDAY_EVENT_TYPE_META[holiday.eventType as HolidayEventType]
    : undefined;

  return (
    <BottomSheet
      open={state !== null}
      onClose={onClose}
      title={
        state
          ? t('dayPanel.heading', {
              // Thứ ĐẦY ĐỦ như web — đây là tiêu đề, không phải nhãn cột chật chỗ.
              weekday: fmt.weekdayLong(state.day.at),
              date: fmt.dateKey(state.day.key),
            })
          : ''
      }
    >
      {holiday ? (
        <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.dangerSurface}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {holiday.name}
            </Text>
            <StatusBadge
              label={t('dayPanel.holidayBadge')}
              color={typeMeta?.color ?? STATUS_COLOR.NEUTRAL}
              size="sm"
            />
          </XStack>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {domainLabel('holidayEventType', holiday.eventType, typeMeta?.label)}
          </Text>
        </YStack>
      ) : null}

      <YStack>
        {actions.includes('block') ? (
          <>
            {/*
              Cả ba dòng CÙNG tông gold — giống bộ chọn hành động của ô, và cùng lý do: đây là ba
              lối đi ngang hàng, không có cái nào phụ. Để hai dòng khoá xám còn dòng đặt giá gold
              thì hai cái kia đọc ra như đang bị vô hiệu.
            */}
            <SheetActionRow
              label={t('dayPanel.blockAll')}
              icon="lock-closed-outline"
              tone="primary"
              trailing={
                <Switch
                  value={blockState.batchId !== null}
                  disabled={blockState.loading || blockState.busy || !state}
                  accessibilityLabel={t('dayPanel.blockAll')}
                  onValueChange={(next) => {
                    if (next && state) onQuickBlock(state.day.key);
                    else if (!next && blockState.batchId) onRelease(blockState.batchId);
                  }}
                  trackColor={{ true: colors.primary, false: colors.borderInput }}
                />
              }
            />
            <SheetActionRow
              label={t('dayPanel.blockMultiDay')}
              icon="calendar-number-outline"
              tone="primary"
              onPress={onOpenBlockDialog}
            />
          </>
        ) : null}

        {actions.includes('price') ? (
          <SheetActionRow
            label={t('dayPanel.priceAll')}
            hint={t('dayPanel.priceAllHint')}
            icon="pricetag-outline"
            tone="primary"
            onPress={onPrice}
          />
        ) : null}
      </YStack>
    </BottomSheet>
  );
}
