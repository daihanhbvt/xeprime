import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_LICENCE_STATE, PERMISSION, driverResponseWindowMinutes } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useUpdateDriverWageSettings } from '@/features/drivers/hooks/use-drivers';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
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

  return (
    <BottomSheet open onClose={onClose} title={t('title', { name: driver.name })}>
      {quote.isLoading ? (
        <SkeletonText lines={3} />
      ) : quote.isError || !quote.data ? (
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
        <AssignDriverWageForm
          bookingId={bookingId}
          driverId={driver.id}
          licenceUnverified={
            driver.licenceState != null && driver.licenceState !== DRIVER_LICENCE_STATE.VERIFIED
          }
          pickupAt={pickupAt}
          quote={quote.data}
          onClose={onClose}
          onAssigned={onAssigned}
        />
      )}
    </BottomSheet>
  );
}

function AssignDriverWageForm({
  bookingId,
  driverId,
  licenceUnverified,
  pickupAt,
  quote,
  onClose,
  onAssigned,
}: {
  bookingId: string;
  driverId: string;
  licenceUnverified: boolean;
  pickupAt: string;
  quote: DriverWageQuote;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const colors = useColors();
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
      await assign.mutateAsync({ driverId, wageAmount: String(daily * quote.days) });
      toast.showSuccess(asDefault ? tForm('savedWithDefault') : tAssign('assigned'));
      onAssigned();
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  });

  return (
    <YStack gap={space.md}>
      {licenceUnverified ? <Callout tone="warning" title={tPicker('unverifiedWarning')} /> : null}
      <DriverDailyWageFields
        control={control}
        quote={quote}
        canSetDefault={canSetDefault}
        label={tPicker('wageField')}
      />
      {/* Hạn tài xế nhận chuyến (ADR 0066) — web `LinkedWageForm.respondWindow`. */}
      <Text col={colors.textMuted} fos={fontSize.label}>
        {tPicker('respondWindow', {
          duration: fmt.minutesDuration(driverResponseWindowMinutes(new Date(), new Date(pickupAt))),
        })}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('paidDirect')}
      </Text>
      <YStack gap={space.sm}>
        <Button label={t('submit')} loading={busy} onPress={() => void submit()} />
        <Button label={tAssign('close')} variant="secondary" disabled={busy} onPress={onClose} />
      </YStack>
    </YStack>
  );
}
