import { useMemo } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/TextField';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingRequestItem } from '../api';

const PRESET_KEYS = [
  'vehicleUnavailable',
  'scheduleUnavailable',
  'requirementsUnsuitable',
  'other',
] as const;

// Không dùng schema của `@xeprime/validators`: nó mang sẵn câu tiếng Việt, còn câu lỗi ở đây
// phải đổi theo ngôn ngữ đang chọn.
function useRejectSchema() {
  const t = useTranslations('BookingRequests.reject');
  return useMemo(
    () =>
      yup.object({
        reason: yup.string().trim().required(t('reasonRequired')).max(REASON_MAX, t('reasonHint')),
      }),
    [t],
  );
}

type RejectValues = { reason: string };

/** Lý do BẮT BUỘC: khác với lý do huỷ đơn (chỉ vào nhật ký nội bộ), lý do từ chối đi thẳng tới khách. */
export function RejectRequestSheet({
  open,
  onClose,
  request,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  request: BookingRequestItem;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const t = useTranslations('BookingRequests.reject');

  const schema = useRejectSchema();
  const { control, handleSubmit, setValue } = useForm<RejectValues>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = handleSubmit((values) => onConfirm(values.reason));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      subtitle={t('context', { customer: request.customerName, vehicle: request.vehicleName })}
      footer={
        <Button
          label={t('confirm')}
          variant="danger"
          loading={loading}
          onPress={() => void submit()}
        />
      }
    >
      <YStack gap={space.sm} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {t('presetLabel')}
        </Text>
        <XStack gap={space.xs} flexWrap="wrap">
          {PRESET_KEYS.map((key) => (
            <Chip
              key={key}
              label={t(`presets.${key}` as 'presets.other')}
              size="sm"
              onPress={() =>
                setValue('reason', t(`presets.${key}` as 'presets.other'), {
                  shouldValidate: true,
                })
              }
            />
          ))}
        </XStack>
      </YStack>

      <TextField
        control={control}
        name="reason"
        label={t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={t('reasonHint')}
        multiline
        rows={4}
        maxLength={REASON_MAX}
        required
      />
    </BottomSheet>
  );
}
