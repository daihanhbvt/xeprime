import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { Controller, useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  ODOMETER_CORRECTION_REASON,
  ODOMETER_CORRECTION_REASON_VALUES,
  ODOMETER_MAX_KM,
  type HandoverType,
} from '@xeprime/types';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useResolveHandoverOdometer } from '../hooks/use-handovers';
import type { Handover } from '../api';

/** Suy từ CHÍNH schema — `yup.oneOf` thu hẹp kiểu, interface viết tay sẽ lệch với resolver. */
type ResolveFormValues = yup.InferType<ReturnType<typeof buildSchema>>;

function buildSchema(labels: { km: string; reason: string }) {
  return yup.object({
    odometerKm: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
      .typeError(labels.km)
      .integer(labels.km)
      .min(0, labels.km)
      .max(ODOMETER_MAX_KM, labels.km)
      .required(labels.km),
    reasonCode: yup
      .string()
      .oneOf(ODOMETER_CORRECTION_REASON_VALUES)
      .default(ODOMETER_CORRECTION_REASON.HANDOVER_ERROR)
      .required(),
    reason: yup.string().trim().required(labels.reason).max(REASON_MAX, labels.reason),
  });
}

/**
 * Sửa chỉ số KM của một biên bản **ĐÃ XÁC NHẬN**.
 *
 * `confirmed` là điểm không quay lại, nên đây là đường DUY NHẤT đổi được số KM — và nó đắt hơn
 * hẳn một lần lưu nháp: bắt buộc mã lý do + diễn giải chi tiết, cả hai vào `audit_logs`.
 *
 * **Giảm** số KM cần quyền riêng `vehicles.odometer.decrease`: KM là số có thẩm quyền dùng để
 * tính bảo dưỡng và đối soát bàn giao, hạ nó xuống có thể che giấu quãng đường đã chạy. Server
 * trả `ODOMETER_DECREASE_FORBIDDEN`, và tấm này hiện đúng câu giải thích đó chứ không phải một
 * lỗi chung — người dùng cần biết phải đi xin quyền, không phải nghĩ là hệ thống hỏng.
 */
export function ResolveOdometerSheet({
  bookingId,
  type,
  handover,
  onClose,
}: {
  bookingId: string;
  type: HandoverType;
  handover: Handover;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.handover.odometerFix');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const resolve = useResolveHandoverOdometer(bookingId, type);

  const [decreaseBlocked, setDecreaseBlocked] = useState(false);

  const schema = useMemo(() => buildSchema({ km: t('kmLabel'), reason: t('reasonHint') }), [t]);

  const { control, handleSubmit } = useForm<ResolveFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      odometerKm: handover.odometerKm ?? 0,
      reasonCode: ODOMETER_CORRECTION_REASON.HANDOVER_ERROR,
      reason: '',
    },
  });

  const submit = handleSubmit((values) => {
    setDecreaseBlocked(false);
    resolve.mutate(
      {
        odometerKm: values.odometerKm,
        reasonCode: values.reasonCode,
        reason: values.reason,
        expectedRowVersion: handover.rowVersion,
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('success'));
          onClose();
        },
        onError: (error) => {
          const code = getErrorCode(error);
          if (code === API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN) {
            setDecreaseBlocked(true);
            return;
          }
          toast.showError(errorMessage(error));
        },
      },
    );
  });

  return (
    <BottomSheet
      open
      onClose={onClose}
      /* Tiêu đề theo VIỆC, như web: bổ sung một số còn thiếu khác với sửa một số đã ghi. */
      title={handover.odometerMissing ? t('openMissing') : t('openCorrect')}
      footer={
        <Button label={t('confirm')} loading={resolve.isPending} onPress={() => void submit()} />
      }
    >
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('lead')}
      </Text>

      <TextField
        control={control}
        name="odometerKm"
        label={t('kmLabel')}
        keyboardType="number-pad"
        required
      />

      {decreaseBlocked ? (
        <YStack bg={colors.dangerSurface} p={space.md} br={space.xs}>
          <Text col={colors.danger} fos={fontSize.bodySm}>
            {t('decreaseForbidden')}
          </Text>
        </YStack>
      ) : null}

      <Controller
        control={control}
        name="reasonCode"
        render={({ field }) => (
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('reasonCodeLabel')}
            </Text>
            <XStack gap={space.xs} flexWrap="wrap">
              {ODOMETER_CORRECTION_REASON_VALUES.map((code) => (
                <Chip
                  key={code}
                  label={domainLabel('odometerCorrectionReason', code)}
                  selected={field.value === code}
                  size="sm"
                  onPress={() => field.onChange(code)}
                />
              ))}
            </XStack>
          </YStack>
        )}
      />

      <TextField
        control={control}
        name="reason"
        label={t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={t('reasonHint')}
        multiline
        rows={3}
        maxLength={REASON_MAX}
        required
      />
    </BottomSheet>
  );
}
