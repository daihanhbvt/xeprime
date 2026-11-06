import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { TextField } from '@/components/ui/TextField';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { BookingRequestDecisionTarget } from '../api';
import { DecisionFooter, DecisionLead, richBold } from './DecisionSheetParts';

const PRESET_KEYS = [
  'vehicleUnavailable',
  'scheduleUnavailable',
  'requirementsUnsuitable',
  'other',
] as const;

type PresetKey = (typeof PRESET_KEYS)[number];

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

/**
 * Từ chối yêu cầu — bản native của web `RejectBookingRequestDialog` (05/11/2026): CHỌN MỘT lý do
 * (bắt buộc) + ghi chú gửi khách (bắt buộc — lý do từ chối đi thẳng tới khách). Chọn lý do điền
 * sẵn câu mẫu nhưng KHÔNG đè chữ người trực đã tự gõ.
 */
export function RejectRequestSheet({
  open,
  onClose,
  request,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  request: BookingRequestDecisionTarget;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.reject');

  const schema = useRejectSchema();
  const { control, handleSubmit, setValue, getValues } = useForm<RejectValues>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });
  const [preset, setPreset] = useState<PresetKey | null>(null);
  const [touched, setTouched] = useState(false);

  const presetText = (key: PresetKey) => t(`presets.${key}` as 'presets.other');

  function choosePreset(key: PresetKey) {
    setPreset(key);
    const current = getValues('reason').trim();
    const presetTexts = PRESET_KEYS.filter((k) => k !== 'other').map((k) => presetText(k).trim());
    if (current === '' || presetTexts.includes(current)) {
      setValue('reason', key === 'other' ? '' : presetText(key), {
        shouldValidate: current !== '',
      });
    }
  }

  const submit = handleSubmit(
    (values) => {
      setTouched(true);
      if (preset === null) return;
      onConfirm(values.reason.trim());
    },
    () => setTouched(true),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      subtitle={t('context', { customer: request.customerName, vehicle: request.vehicleName })}
      footer={
        <DecisionFooter
          backLabel={t('back')}
          onBack={onClose}
          confirm={
            <Button
              label={t('confirm')}
              icon="close-circle-outline"
              variant="danger"
              loading={loading}
              onPress={() => void submit()}
            />
          }
        />
      }
    >
      <DecisionLead>{t.rich('subtitle', { b: richBold })}</DecisionLead>

      <YStack gap={space.sm}>
        <FieldLabel label={t('presetLabel')} required />
        {preset === null ? (
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            {t('presetPlaceholder')}
          </Text>
        ) : null}
        <XStack gap={space.xs} flexWrap="wrap">
          {PRESET_KEYS.map((key) => (
            <Chip
              key={key}
              label={presetText(key)}
              size="sm"
              selected={preset === key}
              onPress={() => choosePreset(key)}
            />
          ))}
        </XStack>
        {touched && preset === null ? (
          <Text col={colors.danger} fos={fontSize.label}>
            {t('presetRequired')}
          </Text>
        ) : null}
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
