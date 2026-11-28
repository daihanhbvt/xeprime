import { useEffect, useRef } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_LICENCE_STATE, PERMISSION, driverResponseWindowMinutes } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoHint } from '@/components/ui/InfoHint';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useUpdateDriverWageSettings } from '@/features/drivers/hooks/use-drivers';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { useAssignDriver, useDriverWageQuote } from '../hooks/use-bookings';
import type { DriverWageQuote } from '../api';
import {
  DriverDailyWageFields,
  WAGE_SCOPE,
  useDailyWageSchema,
  type DailyWageValues,
} from './DriverDailyWageFields';

/**
 * Gán một tài xế vào đơn KÈM tiền công (ADR 0075) — bản native của web `AssignDriverDialog`.
 * Người dùng nhập MỨC/NGÀY (tự điền mức chung), thấy tổng `× N ngày` (số ngày, khoảng hợp lệ từ
 * `GET /bookings/:id/driver-wage-quote`; server kiểm lại khi ghi). Số khác mức chung thì chọn
 * chỉ chuyến này hay cả các lượt gán sau.
 *
 * Nơi gọi mount CÓ ĐIỀU KIỆN: mỗi lần mở là một form mới.
 */
export function AssignDriverWageSheet({
  bookingId,
  driver,
  pickupAt,
  onClose,
  onAssigned,
}: {
  bookingId: string;
  /** Người vừa chọn ở bộ chọn — `licenceState` để cảnh báo bằng chưa xác thực (web `ChangeDriverDialog`). */
  driver: { id: string; name: string; licenceState?: string | null };
  /** Giờ nhận của đơn — tính hạn tài xế nhận chuyến (`driverResponseWindowMinutes`, ADR 0066). */
  pickupAt: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const t = useTranslations('Drivers.wage.assign');
  const quote = useDriverWageQuote(bookingId, true);

  if (quote.data) {
    return (
      <AssignDriverWageForm
        bookingId={bookingId}
        driver={driver}
        licenceUnverified={
          driver.licenceState != null && driver.licenceState !== DRIVER_LICENCE_STATE.VERIFIED
        }
        pickupAt={pickupAt}
        quote={quote.data}
        onClose={onClose}
        onAssigned={onAssigned}
      />
    );
  }
  return (
    <BottomSheet open onClose={onClose} title={t('title', { name: driver.name })} chrome="v2" headerDivider>
      {quote.isError ? (
        <YStack gap={space.sm}>
          <Callout tone="danger" title={t('loadError')} />
          <Button
            label={t('retry')}
            variant="secondary"
            size="sm"
            block={false}
            onPress={() => void quote.refetch()}
          />
        </YStack>
      ) : (
        <SkeletonText lines={3} />
      )}
    </BottomSheet>
  );
}

interface AssignWageInput {
  bookingId: string;
  driver: { id: string; name: string; phone?: string | null };
  licenceUnverified: boolean;
  pickupAt: string;
  quote: DriverWageQuote;
  onAssigned: () => void;
}

/** Trạng thái chung của form gán kèm tiền công - dùng cho tấm riêng lẫn BƯỚC 2 của tấm Đổi tài xế. */
function useAssignWage({ bookingId, driver, licenceUnverified, pickupAt, quote, onAssigned }: AssignWageInput) {
  const t = useTranslations('Drivers.wage.assign');
  const tForm = useTranslations('Drivers.wage.form');
  const tAssign = useTranslations('Drivers.booking');
  const tPicker = useTranslations('Drivers.booking.picker');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const assign = useAssignDriver(bookingId);
  const saveDefault = useUpdateDriverWageSettings();
  const canSetDefault = permissions.has(PERMISSION.DRIVER_MANAGE);

  const schema = useDailyWageSchema(quote);
  const { control, handleSubmit } = useForm<DailyWageValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      // Chỉ mức chung được tự điền — mức gợi ý của nền tảng chỉ là lời nhắc.
      daily: quote.dailyWage === null ? undefined : Number(quote.dailyWage),
      scope: WAGE_SCOPE.TRIP,
      reason: '',
    },
  });
  const busy = assign.isPending || saveDefault.isPending;

  const submit = handleSubmit(async (values) => {
    if (busy) return;
    const daily = values.daily;
    const asDefault =
      canSetDefault && values.scope === WAGE_SCOPE.DEFAULT && String(daily) !== quote.dailyWage;
    try {
      // Mức chung TRƯỚC: lượt gán vẫn gửi đúng tổng đã thấy, không phụ thuộc mức chung.
      if (asDefault) await saveDefault.mutateAsync({ dailyWage: String(daily) });
      await assign.mutateAsync({ driverId: driver.id, wageAmount: String(daily * quote.days) });
      toast.showSuccess(asDefault ? tForm('savedWithDefault') : tAssign('assigned'));
      onAssigned();
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  });

  // Mọi ghi chú gom vào dấu ⓘ cạnh tiêu đề (người dùng 28/11/2026): cảnh báo bằng lái, tiền công
  // cao hơn tiền thuê, hạn tài xế nhận chuyến, chủ xe trả trực tiếp.
  const notes = [
    licenceUnverified ? tPicker('unverifiedWarning') : null,
    tPicker('respondWindow', {
      duration: fmt.minutesDuration(driverResponseWindowMinutes(new Date(), new Date(pickupAt))),
    }),
    t('paidDirect'),
  ]
    .filter((x): x is string => Boolean(x))
    .join(String.fromCharCode(10));

  const fields = (
    <DriverDailyWageFields
      control={control}
      quote={quote}
      canSetDefault={canSetDefault}
      label={tPicker('wageField')}
    />
  );
  return { notes, busy, submit: () => void submit(), fields };
}

/** Điều khiển BƯỚC 2 do tấm cha giữ: nút Gán ở chân tấm cha gọi `submit`. */
export interface AssignWageStepState {
  notes: string;
  busy: boolean;
  submit: () => void;
}

/**
 * BƯỚC 2 nằm TRONG tấm Đổi tài xế (28/11/2026): không đóng tấm này mở tấm khác (hai lượt trượt +
 * khung chờ làm màn giật) - chỉ đổi nội dung; tiêu đề ⓘ và chân tấm của tấm cha đọc `onState`.
 */
export function AssignDriverWageStep({
  onState,
  ...input
}: AssignWageInput & { onState: (state: AssignWageStepState) => void }) {
  const { notes, busy, submit, fields } = useAssignWage(input);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    onState({ notes, busy, submit: () => submitRef.current() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, busy]);
  return fields;
}

function AssignDriverWageForm({
  onClose,
  ...input
}: AssignWageInput & { onClose: () => void }) {
  const t = useTranslations('Drivers.wage.assign');
  const tAssign = useTranslations('Drivers.booking');
  const { notes, busy, submit, fields } = useAssignWage(input);
  const title = t('title', { name: input.driver.name });

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      titleAdornment={<InfoHint content={notes} label={title} />}
      chrome="v2"
      headerDivider
      footer={
        <XStack gap={space.md}>
          <YStack f={1}>
            <Button label={tAssign('close')} variant="outline" disabled={busy} onPress={onClose} />
          </YStack>
          <YStack f={1}>
            <Button label={t('submit')} variant="gradient" loading={busy} onPress={submit} />
          </YStack>
        </XStack>
      }
    >
      {fields}
    </BottomSheet>
  );
}
