import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { useController, useForm, useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, MAINTENANCE_TYPE, MAINTENANCE_TYPE_VALUES } from '@xeprime/types';
import { dayjs, type Dayjs } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { FieldLabel, FieldMessage, FieldShell } from '@/components/ui/Field';
import { MomentPickerSheet } from '@/components/ui/MomentPickerSheet';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorCode } from '@/lib/api-client';
import { colors, fieldFontSize, iconSize, space } from '@/theme/tokens';
import { maintenanceRecordFormSchema, type MaintenanceRecordFormValues } from '../schema';
import { useSaveMaintenanceRecord, useTransitionMaintenanceRecord } from '../hooks/use-maintenance';
import type { MaintenanceRecord } from '../api';

/** Ba việc, một tấm trượt: tạo mới · sửa phiếu đang có · hoàn tất phiếu. */
export type RecordSheetMode =
  | { mode: 'create' }
  | { mode: 'edit'; record: MaintenanceRecord }
  | { mode: 'complete'; record: MaintenanceRecord };

/** Khoảng đã bị chiếm mà server trả kèm 409 — đúng hình dạng `details.conflicts` bên web. */
interface ScheduleConflict {
  sourceType: string;
  startAt: string;
  endAt: string;
  label: string;
}

/**
 * Tấm trượt phiếu bảo dưỡng — bản native của `MaintenanceRecordDialog` bên web, cùng nhãn và
 * cùng thứ tự ô.
 *
 * **Hoàn tất chỉ hỏi bốn ô** (KM, chi phí, mã chứng từ, ghi chú) — loại hạng mục và khoảng thời
 * gian đã chốt lúc tạo, hỏi lại là mời người dùng sửa một thứ họ không định sửa.
 *
 * Thời gian đi lên API dạng **ISO UTC** (CLAUDE.md §9: lưu UTC, hiển thị `Asia/Ho_Chi_Minh`), và
 * phải đủ CẶP thì phiếu mới giữ chỗ trên lịch xe (ADR 0006) — schema chặn trước, backend chặn thật.
 *
 * Trùng lịch KHÔNG đẩy ra toast: server trả về chính khoảng bị đụng, nên tấm trượt hiện nguyên
 * khoảng đó và GIỮ dữ liệu đã nhập — lối ra là đổi giờ ngay tại đây, không phải gõ lại từ đầu.
 * Các mã lỗi còn lại đi qua `useErrorMessage()` (ánh xạ từ MÃ — ADR 0012), không gõ câu lỗi tay.
 */
export function MaintenanceRecordSheet({
  vehicleId,
  state,
  onClose,
}: {
  vehicleId: string;
  state: RecordSheetMode;
  onClose: () => void;
}) {
  const t = useTranslations('Vehicles.maintenance.records');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const save = useSaveMaintenanceRecord(vehicleId);
  const transition = useTransitionMaintenanceRecord(vehicleId);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);

  const record = state.mode === 'create' ? null : state.record;
  const completing = state.mode === 'complete';

  const defaults = useMemo<MaintenanceRecordFormValues>(
    () => ({
      type: (record?.type ?? MAINTENANCE_TYPE.OIL_CHANGE) as MaintenanceRecordFormValues['type'],
      customTypeName: record?.customTypeName ?? '',
      title: record?.title ?? '',
      // ISO từ API → Dayjs cho bộ chọn; chiều ngược lại serialize lúc gửi.
      plannedStartAt: record?.plannedStartAt ? dayjs(record.plannedStartAt) : null,
      plannedEndAt: record?.plannedEndAt ? dayjs(record.plannedEndAt) : null,
      odometerKm: record?.odometerKm ?? null,
      providerName: record?.providerName ?? '',
      // `cost` VẮNG MẶT khi thiếu quyền xem tiền — không dựng số 0 giả vào form.
      cost: record?.cost != null ? Number(record.cost) : null,
      receiptCode: record?.receiptCode ?? '',
      notes: record?.notes ?? '',
    }),
    [record],
  );

  const resolver = useValidationResolver<MaintenanceRecordFormValues>(
    maintenanceRecordFormSchema,
    'Vehicles.maintenance.validation',
  );
  const { control, handleSubmit } = useForm<MaintenanceRecordFormValues>({
    resolver,
    defaultValues: defaults,
    // `values` để RHF tự đồng bộ khi đổi phiếu — không cần effect reset thủ công.
    values: defaults,
  });
  const type = useWatch({ control, name: 'type' });

  const pending = save.isPending || transition.isPending;

  function fail(error: unknown) {
    if (getErrorCode(error) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
      const details = (error as { details?: { conflicts?: ScheduleConflict[] } }).details;
      setConflicts(details?.conflicts ?? []);
      return;
    }
    toast.showError(errorMessage(error));
  }

  function submit() {
    void handleSubmit((values) => {
      setConflicts([]);
      const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

      if (completing && record) {
        transition.mutate(
          {
            action: 'complete',
            recordId: record.id,
            body: {
              odometerKm: values.odometerKm,
              cost: values.cost != null ? String(values.cost) : null,
              receiptCode: text(values.receiptCode),
              notes: text(values.notes),
              expectedRowVersion: record.rowVersion,
            },
          },
          {
            onSuccess: () => {
              toast.showSuccess(t('completed'));
              onClose();
            },
            onError: fail,
          },
        );
        return;
      }

      const body = {
        type: values.type,
        customTypeName:
          values.type === MAINTENANCE_TYPE.OTHER ? text(values.customTypeName) : null,
        title: text(values.title),
        plannedStartAt: values.plannedStartAt?.toISOString() ?? null,
        plannedEndAt: values.plannedEndAt?.toISOString() ?? null,
        odometerKm: values.odometerKm,
        providerName: text(values.providerName),
        cost: values.cost != null ? String(values.cost) : null,
        receiptCode: text(values.receiptCode),
        notes: text(values.notes),
      };

      save.mutate(
        record
          ? { recordId: record.id, body: { ...body, expectedRowVersion: record.rowVersion } }
          : { body },
        {
          onSuccess: () => {
            toast.showSuccess(record ? t('updated') : t('created'));
            onClose();
          },
          onError: fail,
        },
      );
    })();
  }

  const title = completing ? t('form.complete') : record ? t('form.edit') : t('form.create');
  const submitLabel = completing
    ? t('form.submitComplete')
    : record
      ? t('form.submitEdit')
      : t('form.submitCreate');

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      footer={<Button label={submitLabel} loading={pending} onPress={submit} />}
    >
      <YStack gap={space.sm}>
        {conflicts.length > 0 ? (
          <Callout tone="danger" title={t('form.conflictTitle')}>
            <YStack gap={2}>
              {conflicts.map((conflict) => (
                <CalloutBody key={`${conflict.sourceType}-${conflict.startAt}`}>
                  {t('form.conflictRow', {
                    label: conflict.label,
                    range: fmt.dateTimeRange(conflict.startAt, conflict.endAt),
                  })}
                </CalloutBody>
              ))}
            </YStack>
          </Callout>
        ) : null}

        {completing ? null : (
          <>
            <SelectField
              control={control}
              name="type"
              label={t('form.type')}
              options={MAINTENANCE_TYPE_VALUES.map((value) => ({
                value,
                label: domainLabel('maintenanceType', value),
              }))}
              required
            />
            {type === MAINTENANCE_TYPE.OTHER ? (
              <TextField
                control={control}
                name="customTypeName"
                label={t('form.customTypeName')}
                placeholder={t('form.customTypeNamePlaceholder')}
                required
              />
            ) : null}
            <TextField
              control={control}
              name="title"
              label={t('form.titleField')}
              placeholder={t('form.titlePlaceholder')}
            />

            {/* Đủ CẶP thì phiếu giữ chỗ trên lịch xe; để trống cả hai nếu chưa xếp lịch. */}
            <MomentField control={control} name="plannedStartAt" label={t('form.plannedStartAt')} />
            <MomentField
              control={control}
              name="plannedEndAt"
              label={t('form.plannedEndAt')}
              hint={t('form.scheduleHint')}
            />

            <TextField
              control={control}
              name="providerName"
              label={t('form.providerName')}
              placeholder={t('form.providerPlaceholder')}
            />
          </>
        )}

        <NumberField
          control={control}
          name="odometerKm"
          label={t('form.odometerKm')}
          suffix="km"
          min={0}
          integer
          {...(completing ? { hint: t('form.odometerCompleteHint') } : {})}
        />
        <MoneyField control={control} name="cost" label={t('form.cost')} />
        <TextField
          control={control}
          name="receiptCode"
          label={t('form.receiptCode')}
          placeholder={t('form.receiptPlaceholder')}
        />
        <TextField
          control={control}
          name="notes"
          label={t('form.notes')}
          multiline
          rows={3}
          maxLength={2000}
        />

        {completing ? <Callout tone="info" title={t('form.completeHint')} /> : null}
      </YStack>
    </BottomSheet>
  );
}

/**
 * Ô chọn MỘT THỜI ĐIỂM (ngày + giờ) cho React Hook Form — giá trị giữ nguyên `Dayjs`.
 *
 * Vỏ ô dựng y hệt [`DateField`](../../vehicles/components/DateField.tsx) của các tab hồ sơ xe —
 * nhãn, `FieldShell`, biểu tượng lịch, dấu × xoá NẰM TRONG ô. Trước đó ô này tự vẽ một kiểu
 * riêng và treo nút "Bỏ chọn thời điểm" thành một nút ghost bên dưới, nên hai ô thời gian đọc
 * ra khác hẳn mọi ô còn lại của cùng màn.
 *
 * Vẫn là ngày + GIỜ chứ không phải ngày trần: đủ cặp thì phiếu chiếm một khoảng thật trên
 * `vehicle_occupancies` (ADR 0006), mà hai mốc cùng rơi về 00:00 của một ngày là khoảng RỖNG.
 * Web cũng dùng `DateTimeField` không `dateOnly` ở đúng hai ô này.
 *
 * Không serialize ở đây: hai mốc phải so được với nhau trong schema (`isAfter`), và hoá chuỗi
 * sớm là ép schema phải parse ngược.
 */
function MomentField({
  control,
  name,
  label,
  hint,
}: {
  control: Control<MaintenanceRecordFormValues>;
  name: 'plannedStartAt' | 'plannedEndAt';
  label: string;
  hint?: string;
}) {
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { field, fieldState } = useController({ control, name });
  const [open, setOpen] = useState(false);

  const value = field.value as Dayjs | null;
  const error = fieldState.error?.message;

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={label} />

      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
        <FieldShell focused={open} invalid={Boolean(error)} align="center">
          <Text f={1} col={value ? colors.text : colors.placeholder} fos={fieldFontSize.value}>
            {value ? fmt.rentalPoint(value, { withTime: true }) : tCommon('labels.selectDate')}
          </Text>

          {/* `Pressable` RIÊNG: lồng trong `Pressable` mở lịch thì chạm × cũng bung bảng chọn. */}
          {value ? (
            <Pressable
              onPress={() => field.onChange(null)}
              accessibilityRole="button"
              accessibilityLabel={tCommon('actions.clearValue')}
              hitSlop={space.sm}
            >
              <XStack ai="center" jc="center">
                <Ionicons name="close-circle" size={iconSize.sm} color={colors.textMuted} />
              </XStack>
            </Pressable>
          ) : (
            <Ionicons name="calendar-outline" size={iconSize.sm} color={colors.textMuted} />
          )}
        </FieldShell>
      </Pressable>

      <FieldMessage error={error} hint={hint} />

      {open ? (
        <MomentPickerSheet
          open
          onClose={() => setOpen(false)}
          value={value ?? dayjs()}
          title={label}
          onChange={(next) => {
            field.onChange(next);
            setOpen(false);
          }}
        />
      ) : null}
    </YStack>
  );
}
