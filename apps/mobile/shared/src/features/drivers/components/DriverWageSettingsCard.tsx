import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { MONEY_STEP_VND, PERMISSION } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { InlineAction } from '@/components/ui/InlineAction';
import { MoneyField } from '@/components/ui/MoneyField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { DriverWageSettings } from '../api';
import { useDriverWageSettings, useUpdateDriverWageSettings } from '../hooks/use-drivers';

/**
 * Tiền công tài xế/ngày — MỨC CHUNG của bên thuê (ADR 0075) — bản native của web
 * `DriverWageSettingsCard`: một số cho mọi xe, tự điền khi gán tài xế (× số ngày của chuyến) và sửa
 * được cho từng chuyến. XePrime chỉ ghi nhận; đổi số này không viết lại các chuyến đã gán. Chưa đặt
 * thì mức gợi ý của nền tảng chỉ hiện làm lời nhắc (và nút điền nhanh trong tấm nhập).
 */
export function DriverWageSettingsCard() {
  const colors = useColors();
  const t = useTranslations('Drivers.wage.settings');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const settings = useDriverWageSettings();
  const [editing, setEditing] = useState(false);
  const canManage = permissions.has(PERMISSION.DRIVER_MANAGE);

  if (settings.isLoading) {
    return (
      <Card>
        <SkeletonText lines={2} />
      </Card>
    );
  }
  if (settings.isError || !settings.data) {
    return (
      <Callout tone="danger" title={t('loadError')}>
        <InlineAction label={tCommon('retry')} onPress={() => void settings.refetch()} />
      </Callout>
    );
  }

  const data = settings.data;
  return (
    <Card>
      <XStack gap={space.sm} ai="flex-start">
        <Ionicons name="wallet-outline" size={iconSize.md} color={colors.warning} />
        <YStack f={1} gap={2} minWidth={0}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('title')}
          </Text>
          <Text
            col={data.dailyWage ? colors.text : colors.warning}
            fos={fontSize.body}
            fow={fontWeight.semibold}
          >
            {data.dailyWage ? t('perDay', { amount: fmt.money(data.dailyWage) }) : t('unset')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {data.dailyWage
              ? t('hint')
              : t('unsetHint', { suggested: fmt.money(data.suggestedDaily) })}
          </Text>
        </YStack>
        {canManage ? (
          <Button
            label={data.dailyWage ? t('edit') : t('set')}
            icon="create-outline"
            variant={data.dailyWage ? 'secondary' : 'primary'}
            size="sm"
            block={false}
            onPress={() => setEditing(true)}
          />
        ) : null}
      </XStack>
      {/* Dựng có điều kiện: mỗi lần mở là một form mới với số đang lưu. */}
      {editing ? <DriverWageSettingsSheet settings={data} onClose={() => setEditing(false)} /> : null}
    </Card>
  );
}

function DriverWageSettingsSheet({
  settings,
  onClose,
}: {
  settings: DriverWageSettings;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.settings');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const save = useUpdateDriverWageSettings();
  const min = Number(settings.wageDaily.min);
  const max = Number(settings.wageDaily.max);

  const schema = useMemo(() => {
    const range = { min: fmt.money(String(min)), max: fmt.money(String(max)) };
    return yup.object({
      dailyWage: yup
        .number()
        .typeError(t('errors.required'))
        .required(t('errors.required'))
        .min(min, t('errors.range', range))
        .max(max, t('errors.range', range))
        .test('step', t('errors.step'), (v) => v == null || v % MONEY_STEP_VND === 0),
    });
  }, [t, fmt, min, max]);
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit, setValue } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { dailyWage: settings.dailyWage ? Number(settings.dailyWage) : undefined },
  });

  const submit = handleSubmit((values) => {
    if (save.isPending) return;
    save.mutate(
      { dailyWage: String(values.dailyWage) },
      {
        onSuccess: () => {
          toast.showSuccess(t('saved'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  function clear() {
    if (save.isPending) return;
    save.mutate(
      { dailyWage: null },
      {
        onSuccess: () => {
          toast.showSuccess(t('cleared'));
          onClose();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('dialogTitle')}
      footer={
        <Button label={tCommon('save')} loading={save.isPending} onPress={() => void submit()} />
      }
    >
      <MoneyField
        control={control}
        name="dailyWage"
        label={t('field')}
        required
        placeholder={t('placeholder', { amount: fmt.count(Number(settings.suggestedDaily)) })}
        hint={t('range', {
          min: fmt.money(settings.wageDaily.min),
          max: fmt.money(settings.wageDaily.max),
        })}
      />
      {settings.dailyWage ? null : (
        <InlineAction
          label={t('useSuggested', { amount: fmt.money(settings.suggestedDaily) })}
          onPress={() =>
            setValue('dailyWage', Number(settings.suggestedDaily), {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
      )}
      <Callout tone="info" title={t('appliesNext')} />
      {settings.dailyWage ? (
        <Button
          label={t('clear')}
          variant="ghostDanger"
          disabled={save.isPending}
          onPress={clear}
        />
      ) : null}
    </BottomSheet>
  );
}
