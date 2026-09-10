import { useMemo, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_BLOCK_REASON,
  VEHICLE_BLOCK_REASON_VALUES,
  type VehicleBlockReason,
} from '@xeprime/types';
import { DAY_PARAM_FORMAT, dayjs, nowInAppTz } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { FieldBox } from '@/components/ui/FieldBox';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { TextControl } from '@/components/ui/TextControl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { CalendarFilters } from '../api';
import { useBulkBlockDay, useBulkDayPreview } from '../hooks/use-bulk-day';

const NOTE_MAX = 2000;

/** Mở từ thẻ ngày: biết ngày được chạm và cụm ngày lễ chứa nó (nếu có). */
export interface BulkDayBlockState {
  date: string;
  /** Cụm ngày lễ liền kề chứa `date` — khoảng gợi ý cho chế độ nhiều ngày. */
  suggestedRange: { from: string; to: string };
}

type RangeMode = 'single' | 'range';

/**
 * Khoá TOÀN BỘ xe trong một khoảng — hộp ĐẦY ĐỦ, mở từ thẻ ngày. Thao tác một-chạm cho đúng một
 * ngày nằm ở công tắc và không đi qua đây.
 *
 * Hai điều hộp này tồn tại để nói thẳng trước khi người dùng bấm, y như web:
 *
 *  1. **"Toàn bộ" nghĩa là tập xe đang hiển thị trên lưới**, sau bộ lọc loại xe / chi nhánh / từ
 *     khoá — không phải cả gian hàng.
 *  2. **Xe đang có đơn sẽ KHÔNG khoá được** (`EXCLUDE USING gist`, ADR 0006). Bảng tóm tắt nói ra
 *     con số. Một nút hứa "khoá hết" rồi âm thầm bỏ sót 8 xe là cách chắc chắn nhất để ai đó nhận
 *     một đơn vào đúng ngày họ tưởng đã đóng.
 */
export function BulkDayBlockSheet({
  state,
  filters,
  onClose,
}: {
  state: BulkDayBlockState | null;
  filters: CalendarFilters;
  onClose: () => void;
}) {
  // Đóng thì không dựng — hộp này đọc `state.date` ngay từ bộ khởi tạo; xem `VehicleBlockSheet`.
  if (state === null) return null;
  return <BlockSheetInner key={state.date} state={state} filters={filters} onClose={onClose} />;
}

function BlockSheetInner({
  state,
  filters,
  onClose,
}: {
  state: BulkDayBlockState;
  filters: CalendarFilters;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const suggested = state.suggestedRange;
  /** Cụm ngày lễ dài hơn một ngày ⇒ mở thẳng ở chế độ khoảng, đúng thứ người dùng đang định làm. */
  const suggestsRange = suggested.to !== suggested.from;

  const [mode, setMode] = useState<RangeMode>(suggestsRange ? 'range' : 'single');
  const fallbackDay = nowInAppTz().format(DAY_PARAM_FORMAT);
  const [rangeFrom, setRangeFrom] = useState(suggested.from || fallbackDay);
  const [rangeTo, setRangeTo] = useState(suggested.to || fallbackDay);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [reason, setReason] = useState<VehicleBlockReason>(VEHICLE_BLOCK_REASON.NOT_FOR_RENT);
  const [note, setNote] = useState('');

  const from = mode === 'single' ? state.date : rangeFrom;
  const to = mode === 'single' ? state.date : rangeTo;

  const preview = useBulkDayPreview(filters, from, to, true);
  const block = useBulkBlockDay();

  const vehicles = preview.data?.vehicles ?? [];
  const dayCount = preview.data?.dayCount ?? 1;
  /** Xe khoá được ít nhất một ngày — chỉ những chiếc này mới đáng gửi lên. */
  const blockable = vehicles.filter((v) => v.busyDates.length < dayCount);
  const fullyBusy = vehicles.length - blockable.length;

  const reasonOptions = useMemo(
    () =>
      VEHICLE_BLOCK_REASON_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleBlockReason', value),
      })),
    [domainLabel],
  );

  function submit() {
    if (blockable.length === 0) return;
    block.mutate(
      {
        from,
        to,
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        vehicleIds: blockable.map((v) => v.vehicleId),
      },
      {
        onSuccess: (result) => {
          toast.showSuccess(
            t('bulkBlock.done', {
              days: result.blockedDays,
              vehicles: result.fullyBlockedVehicles + result.partiallyBlockedVehicles,
            }),
          );
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={t('bulkBlock.title')}
        footer={
          <>
            <Button
              label={t('bulkBlock.submit', { count: blockable.length })}
              icon="lock-closed-outline"
              onPress={submit}
              loading={block.isPending}
              disabled={preview.isPending || blockable.length === 0}
            />
            <Button
              label={tCommon('cancel')}
              icon="close-outline"
              variant="secondary"
              onPress={onClose}
              disabled={block.isPending}
            />
          </>
        }
      >
        <YStack gap={space.md}>
          {/*
            Nhóm viên PHẢI có tiêu đề — web đặt nó làm `Form.Item label` của `Segmented`.

            Không có tiêu đề thì hai viên đứng trần giữa form: mắt đọc ra hai cái nút, không đọc
            ra "đây là một lựa chọn giữa hai thứ", và trình đọc màn hình thì đọc hai nhãn rời
            không có gì nói chúng thuộc cùng một câu hỏi.
          */}
          <YStack gap={space.xs}>
            <FieldLabel label={t('bulkBlock.scope')} />
            <XStack gap={space.xs}>
              <Chip
                label={t('bulkBlock.modeSingle', { date: fmt.dateKey(state.date) })}
                selected={mode === 'single'}
                grow
                onPress={() => setMode('single')}
              />
              <Chip
                label={t('bulkBlock.modeRange')}
                selected={mode === 'range'}
                grow
                onPress={() => setMode('range')}
              />
            </XStack>
          </YStack>

          {mode === 'range' ? (
            <>
              <FieldBox
                label={t('bulkBlock.range')}
                required
                value={fmt.dateKey(rangeFrom)}
                placeholder={t('bulkBlock.range')}
                icon="calendar-outline"
                {...(suggestsRange
                  ? {
                      hint: t('bulkBlock.holidayRangeHint', {
                        from: fmt.dateKey(suggested.from),
                        to: fmt.dateKey(suggested.to),
                      }),
                    }
                  : {})}
                onPress={() => setPicking('from')}
              />
              <FieldBox
                label={t('block.periodEnd')}
                required
                value={fmt.dateKey(rangeTo)}
                placeholder={t('block.periodEnd')}
                icon="calendar-outline"
                onPress={() => setPicking('to')}
              />
            </>
          ) : null}

          <SelectControl
            label={t('bulkBlock.reason')}
            required
            value={reason}
            options={reasonOptions}
            onChange={(next) => setReason(next as VehicleBlockReason)}
          />

          <TextControl
            label={t('bulkBlock.note')}
            value={note}
            onChangeText={setNote}
            placeholder={t('bulkBlock.notePlaceholder')}
            maxLength={NOTE_MAX}
          />

          {preview.isPending ? (
            <SkeletonText lines={2} />
          ) : preview.isError ? (
            <Callout tone="danger">{errorMessage(preview.error)}</Callout>
          ) : (
            <Callout
              tone={blockable.length === 0 ? 'warning' : 'info'}
              title={t('bulkBlock.summary', {
                blockable: blockable.length,
                total: vehicles.length,
                days: dayCount,
              })}
            >
              {fullyBusy > 0 ? t('bulkBlock.summarySkipped', { count: fullyBusy }) : undefined}
            </Callout>
          )}
        </YStack>
      </BottomSheet>

      <DatePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        value={picking === 'to' ? rangeTo : rangeFrom}
        onChange={(next) => {
          if (picking === 'to') setRangeTo(next);
          else {
            setRangeFrom(next);
            if (next > rangeTo) setRangeTo(next);
          }
        }}
        title={t('bulkBlock.range')}
        /*
         * Sàn NỚI RỘNG có chủ đích: web không chặn ngày nào ở hộp này, còn `DatePickerSheet` mặc
         * định lấy sàn là NGÀY MAI (luật của luồng đặt xe). Để mặc định thì app chặn một khoảng
         * mà web cho phép — thêm một luật nghiệp vụ mà không ai quyết định.
         *
         * Khi đang chọn "to" thì sàn là `rangeFrom` — `DatePicker.RangePicker` của web CẤU TRÚC
         * không cho chọn ngày kết thúc trước ngày bắt đầu; hai ô tách rời của app phải giả lập
         * đúng ràng buộc đó, không thì `to < from` lọt xuống tận backend rồi mới bị từ chối.
         */
        minDate={picking === 'to' ? dayjs(rangeFrom) : nowInAppTz().subtract(2, 'year')}
      />
    </>
  );
}
