import { useCallback, useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { SelectControl, type SelectControlOption } from '@/components/ui/SelectControl';
import { TextField } from '@/components/ui/TextField';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';
import type { BookingRequestDecisionTarget } from '../api';
import { DecisionFooter, richBold } from './DecisionSheetParts';

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
 *
 * Hình theo Figma v2 (`24145:97092`): thẻ tóm tắt nền xám (ảnh xe · tên khách · tên xe), lý do
 * chọn trong Ô CHỌN (`SelectControl` - cùng bốn lý do, cùng luật bắt buộc), "Ghi chú cho khách";
 * chân tấm "Quay lại" viền xám + "Từ chối yêu cầu" nền đỏ.
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

  const presetText = useCallback((key: PresetKey) => t(`presets.${key}` as 'presets.other'), [t]);
  const presetOptions = useMemo<SelectControlOption[]>(
    () => PRESET_KEYS.map((key) => ({ value: key, label: presetText(key) })),
    [presetText],
  );

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
      chrome="v2"
      headerDivider
      title={t('title')}
      subtitle={t.rich('subtitle', { b: richBold })}
      footer={
        <DecisionFooter
          leading={
            <Button
              label={t('back')}
              variant="secondary"
              block={false}
              disabled={loading}
              onPress={onClose}
            />
          }
          confirm={
            <Button
              label={t('confirm')}
              variant="dangerSolid"
              loading={loading}
              onPress={() => void submit()}
            />
          }
        />
      }
    >
      {/* Figma "Vehicle Summary" `24145:97095`: nền `bg/gray-50`, đệm 12, bo 16. */}
      <XStack
        ai="center"
        gap={SUMMARY_GAP}
        p={SUMMARY_PAD}
        br={radius.card}
        bg={colors.background}
        accessibilityLabel={t('context', { customer: request.customerName, vehicle: request.vehicleName })}
      >
        <VehicleThumb uri={request.vehicleImageUrl ?? null} recyclingKey={request.vehicleId} />
        <YStack f={1} minWidth={0} gap={4}>
          <Text
            col={colors.text}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {request.customerName}
          </Text>
          <Text
            col={colors.textBody}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {request.vehicleName}
          </Text>
        </YStack>
      </XStack>

      <SelectControl
        label={t('presetLabel')}
        required
        value={preset}
        options={presetOptions}
        placeholder={t('presetPlaceholder')}
        onChange={(next) => choosePreset(next as PresetKey)}
        {...(touched && preset === null ? { error: t('presetRequired') } : {})}
      />

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

/** Figma thẻ tóm tắt: đệm 12, ảnh ↔ chữ 12. */
const SUMMARY_PAD = 12;
const SUMMARY_GAP = 12;
