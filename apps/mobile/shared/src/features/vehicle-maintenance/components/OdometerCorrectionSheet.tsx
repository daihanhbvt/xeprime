import { useForm, useWatch } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, ODOMETER_CORRECTION_REASON_VALUES, PERMISSION } from '@xeprime/types';
import {
  odometerCorrectionFormSchema,
  type OdometerCorrectionFormValues,
} from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { InfoHint } from '@/components/ui/InfoHint';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { getErrorCode } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/get-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/fonts';
import { FIELD_V2 } from '@/components/ui/Field';
import { useCorrectOdometer } from '../hooks/use-maintenance';

/** Trần độ dài lý do — khớp `odometerCorrectionFormSchema.reason`. */
const REASON_MAX = 1000;

/**
 * Hiệu chỉnh SỐ KM có thẩm quyền của một xe — bản native của `OdometerCorrectionDialog`.
 *
 * Component RIÊNG vì hai bề mặt cùng mở nó: thẻ ODO ở tab bảo dưỡng của một xe, và thao tác
 * "Cập nhật ODO" ở Trung tâm bảo dưỡng. Chép làm hai bản nghĩa là chép cả ba thứ dễ sai bên
 * dưới — cảnh báo giảm KM, khoá lạc quan, và lý do bắt buộc — rồi một hôm sửa một bên.
 *
 * `rowVersion` là KHOÁ LẠC QUAN: hai người cùng mở một xe thì người sau nhận 409 thay vì lặng lẽ
 * ghi đè số của người trước. Truyền `0` khi chưa biết phiên bản (server bỏ qua ràng buộc đó).
 */
export function OdometerCorrectionSheet({
  open,
  vehicleId,
  currentOdometerKm,
  rowVersion,
  onClose,
  onSaved,
}: {
  open: boolean;
  vehicleId: string;
  currentOdometerKm: number | null;
  rowVersion: number;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.maintenance.odometer');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  // Hai câu lỗi có lối đi tiếp — cùng khoá `Maintenance.odometer.*` mà hộp thoại web đọc.
  const tErrors = useTranslations('Maintenance.odometer');
  const { has } = usePermissions();
  const canDecrease = has(PERMISSION.VEHICLE_ODOMETER_DECREASE);

  const correct = useCorrectOdometer(vehicleId);
  const resolver = useValidationResolver<OdometerCorrectionFormValues>(
    odometerCorrectionFormSchema,
    'Vehicles.maintenance.validation',
  );

  const { control, handleSubmit, reset } = useForm<OdometerCorrectionFormValues>({
    resolver,
    defaultValues: { odometerKm: null as never, reasonCode: '' as never, reason: '' },
  });

  /*
   * Giảm KM là hành động KHÁC HẲN một lần đính chính thường: cảnh báo tại chỗ, và người thiếu
   * `vehicles.odometer.decrease` được nói thẳng — thay vì bấm Lưu rồi nhận
   * `ODOMETER_DECREASE_FORBIDDEN` từ server.
   */
  const nextKm = useWatch({ control, name: 'odometerKm' });
  const isDecrease =
    currentOdometerKm != null &&
    typeof nextKm === 'number' &&
    Number.isFinite(nextKm) &&
    nextKm < currentOdometerKm;

  function close() {
    reset();
    onClose();
  }

  function submit() {
    void handleSubmit((values) => {
      correct.mutate(
        {
          odometerKm: values.odometerKm,
          reasonCode: values.reasonCode,
          reason: values.reason,
          // Người dùng đã thấy cảnh báo giảm KM ngay trên tấm trượt này rồi mới bấm gửi.
          ...(isDecrease ? { confirmDecrease: true } : {}),
          ...(rowVersion > 0 ? { expectedRowVersion: rowVersion } : {}),
        },
        {
          onSuccess: () => {
            close();
            onSaved?.();
            toast.showSuccess(t('corrected'));
          },
          onError: (error) => {
            // Đúng ba nhánh của `OdometerCorrectionDialog` bên web: thiếu quyền giảm KM, dữ liệu
            // đã cũ (người khác vừa sửa), còn lại là câu nguyên văn của server.
            const code = getErrorCode(error);
            if (code === API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN)
              toast.showError(tErrors('decreaseForbidden'));
            else if (code === API_ERROR_CODE.CONFLICT) toast.showError(tErrors('stale'));
            else toast.showError(getErrorMessage(error));
          },
        },
      );
    })();
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('correctTitle')}
      // Ghi chú nhật ký vào dấu (!) sát tiêu đề - không kéo dài thân tấm.
      titleAdornment={<InfoHint label={t('correctTitle')} content={t('auditNote')} />}
      footer={
        <Button
          variant="gradient"
          label={isDecrease && !canDecrease ? t('submitApproval') : t('submit')}
          loading={correct.isPending}
          disabled={isDecrease && !canDecrease}
          onPress={submit}
        />
      }
    >
      <YStack gap={space.sm}>
        {/*
          Ô "chỉ số hiện tại" — `currentBox` bên web: nhãn nhỏ ở trên, số lớn ở dưới. Đây là con
          số người dùng phải đối chiếu trước khi gõ số mới, nên nó không được nằm ép vào cột phải
          của một hàng nhãn–giá trị.
        */}
        <YStack gap={2} px={FIELD_V2.padX} py={space.sm} br={radius.control} bg={colors.background}>
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fontFamily={FONT_FAMILY.body}>
            {t('current')}
          </Text>
          <Text
            col={colors.text}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fontFamily={FONT_FAMILY.semibold}
            fow={fontWeight.semibold}
          >
            {currentOdometerKm == null ? tLabels('notAvailable') : fmt.km(currentOdometerKm)}
          </Text>
        </YStack>

        <NumberField
          control={control}
          name="odometerKm"
          label={t('newValue')}
          placeholder={t('newValuePlaceholder')}
          suffix="km"
          min={0}
          integer
          required
        />
        <SelectField
          control={control}
          name="reasonCode"
          label={t('reasonCode')}
          placeholder={t('reasonCodePlaceholder')}
          options={ODOMETER_CORRECTION_REASON_VALUES.map((value) => ({
            value,
            label: domainLabel('odometerCorrectionReason', value),
          }))}
          required
        />
        {/* Lý do BẮT BUỘC ở cả ba lớp — một số KM đổi mà không ai biết vì sao là không được. */}
        <TextField
          control={control}
          name="reason"
          label={t('reason')}
          placeholder={t('reasonPlaceholder')}
          multiline
          rows={3}
          maxLength={REASON_MAX}
          required
        />

        {isDecrease ? (
          <Callout
            tone={canDecrease ? 'warning' : 'danger'}
            title={t('decreaseTitle', { value: fmt.km(currentOdometerKm) })}
          >
            {canDecrease ? t('decreaseAllowed') : t('decreaseForbidden')}
          </Callout>
        ) : null}
      </YStack>
    </BottomSheet>
  );
}
